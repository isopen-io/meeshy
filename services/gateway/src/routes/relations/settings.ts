import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  RELATION_RITUAL_SHARES,
  relationPersonSettingsUpdateSchema,
  type RelationPersonSettings,
  type RelationRitualShare,
} from '@meeshy/shared/types/relation-person-settings';
import { appVersionFloorPreHandler } from '../../middleware/app-version-floor';
import { ritualShareWithdrawalOf } from '../../services/relations/ritualShareWithdrawal';
import { stopBringsOnBlock } from '../../services/bring/bringService';
import { cutTalkiesOnBlock, talkieCutDepsOf } from '../../services/talkie/talkieCut';
import { logError } from '../../utils/logger';
import { captureNowPlayingBefore, refreshNowPlayingAfter } from '../../services/nowPlaying/nowPlayingDeps';
import { relationIoOf } from '../../socketio/relationEvents';
import { sendBadRequest, sendInternalError, sendNotFound, sendSuccess } from '../../utils/response';
import { resolveRelationAccess } from '@meeshy/shared/utils/relation-access';
import { declaredAgeClass } from '@meeshy/shared/utils/age';
import { ACCOUNT_STATE_SELECT, lawRoleOf } from '../../services/relations/usableAccount';
import { niveauEffectif } from '../../services/friendship';
import { bringDepsOf, bringQuotaOf } from '../bring';
import { errorResponses, otherUserOf, relationLimiter, userIdParams } from './shared';

/**
 * BLOQUER le Bring, le talkie ou les invitations « ensemble » ne s'écrit que pour une personne qui EXISTE et avec qui un lien
 * existe (Connaissance au moins, jugé par la loi) : aucune ligne pour un identifiant
 * quelconque. Inconnu, désactivé, sans lien ou bloqué : le même 404. Un RETRAIT de
 * partage ou un déblocage ne demandent aucun lien : ils ne touchent que MA ligne
 * existante, et ne la créent jamais (audit #14535 constat 1).
 *
 * La feature jugée est `dm.direct`, un OUTIL au plancher Connaissance : entre deux comptes
 * de l'équipe, qui peuvent se sonner sans lien, bloquer ces Bring doit s'écrire aussi
 * (#16623). Une audience (`audience.acquaintances`) resterait au lien réel. Elle se juge
 * dans les DEUX sens : on bloque ce qui vient de l'autre, et un collègue mineur déclaré
 * qui peut sonner un adulte doit pouvoir être bloqué par lui — un 404 dirait son âge.
 *
 * Accorder sa catégorie d'écoute (#13934) se juge sur `listening.category`, dans le sens
 * de ce qui part : l'autre VOIT, le propriétaire est vu.
 */
async function linkedPerson(
  prisma: FastifyInstance['prisma'],
  ownerId: string,
  otherId: string,
  feature: 'dm.direct' | 'listening.category' = 'dm.direct',
): Promise<boolean> {
  const [other, owner, level] = await Promise.all([
    prisma.user.findUnique({ where: { id: otherId }, select: { id: true, role: true, birthDate: true, ...ACCOUNT_STATE_SELECT } }),
    prisma.user.findUnique({ where: { id: ownerId }, select: { role: true, birthDate: true, ...ACCOUNT_STATE_SELECT } }),
    niveauEffectif(prisma, ownerId, otherId),
  ]);
  if (!other || other.deactivatedAt) return false;
  const now = new Date();
  const ownerSide = { id: ownerId, minor: declaredAgeClass(owner?.birthDate ?? null, now), role: lawRoleOf(owner) };
  const otherSide = { id: otherId, minor: declaredAgeClass(other.birthDate ?? null, now), role: lawRoleOf(other) };
  const opensFrom = (viewer: typeof ownerSide, target: typeof ownerSide): boolean =>
    resolveRelationAccess({
      viewerId: viewer.id,
      targetId: target.id,
      grantedByViewer: level,
      grantedByTarget: level,
      sharesCommunity: false,
      blockedEitherWay: false,
      viewerMinor: viewer.minor,
      targetMinor: target.minor,
      viewerRole: viewer.role,
      targetRole: target.role,
      feature,
      consent: 'granted',
    }).allowed;
  if (feature === 'listening.category') return opensFrom(otherSide, ownerSide);
  return opensFrom(ownerSide, otherSide) || opensFrom(otherSide, ownerSide);
}

const shareFlags = Object.fromEntries(RELATION_RITUAL_SHARES.map((share) => [share, { type: 'boolean' }])) as Record<
  (typeof RELATION_RITUAL_SHARES)[number],
  { type: 'boolean' }
>;

/**
 * Un partage ne se règle qu'à `false` : `enum` SANS `type`, pour qu'AJV ne coerce pas
 * `"false"`, `null` ou `0` en `false` avant zod (audit #14535 constat 4).
 */
const withdrawalFlags = Object.fromEntries(RELATION_RITUAL_SHARES.map((share) => [share, { enum: [false] }]));

const settingsSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: { type: 'object', properties: { userId: { type: 'string' }, bringBlocked: { type: 'boolean' }, talkieBlocked: { type: 'boolean' }, togetherBlocked: { type: 'boolean' }, listeningCategoryShared: { type: 'boolean' }, ...shareFlags } },
  },
} as const;

const SETTINGS_SELECT = {
  bringBlockedAt: true, talkieBlockedAt: true, togetherBlockedAt: true, listeningCategoryShared: true, listeningTitleShared: true, locationShared: true, locationHistoryShared: true, proximityShared: true,
} as const;

type SettingsRow = { readonly bringBlockedAt: Date | null; readonly talkieBlockedAt: Date | null; readonly togetherBlockedAt: Date | null; readonly listeningCategoryShared: boolean | null } & Readonly<Record<(typeof RELATION_RITUAL_SHARES)[number], boolean>>;

/** Ce que JE règle pour l'autre : son Bring, son talkie et ses invitations « ensemble » bloqués ou non, et ce que je lui partage depuis le rituel. */
const servedSettings = (userId: string, row: SettingsRow | null): RelationPersonSettings => ({
  userId,
  bringBlocked: Boolean(row?.bringBlockedAt),
  talkieBlocked: Boolean(row?.talkieBlockedAt),
  togetherBlocked: Boolean(row?.togetherBlockedAt),
  listeningCategoryShared: row?.listeningCategoryShared === true,
  ...(Object.fromEntries(RELATION_RITUAL_SHARES.map((share) => [share, row?.[share] === true])) as Record<(typeof RELATION_RITUAL_SHARES)[number], boolean>),
});

const readSettings = (prisma: FastifyInstance['prisma'], ownerId: string, otherId: string): Promise<SettingsRow | null> =>
  prisma.relationFeatureSetting.findUnique({ where: { ownerId_otherId: { ownerId, otherId } }, select: SETTINGS_SELECT });

/**
 * Les RÉGLAGES PAR PERSONNE (#13936, spec § 4) : ce que JE règle pour quelqu'un —
 * `GET|PUT /relations/:userId/settings`. `bringBlocked` (#13936, D-3) et
 * `talkieBlocked` (#13935) et `togetherBlocked` (#17023, les invitations « ensemble »), trois
 * préférences de RÉCEPTION actives par défaut et
 * bloquables par personne, et le RETRAIT des partages
 * consentis au rituel du Sang (#14401, RGPD art. 7(3)) : chacun se coupe à `false`,
 * un par un, sans quitter le Sang, et ne s'accorde jamais ici. Le retrait vaut tout
 * de suite : la ligne est écrite avant la réponse, datée par partage
 * (`*WithdrawnAt`), et tout relais de partage lit le consentement par
 * `relationConsentOf`, sans cache, à chaque émission. Le retrait et le Bring d'un
 * même corps partent en UNE écriture. Il se fait même quand le lien est tombé (aucun contrôle de lien,
 * aucune ligne créée : seule MA ligne existante change). Un
 * corps qui nomme un réglage inconnu est REFUSÉ (400) plutôt qu'ignoré : un
 * client ne doit jamais croire qu'il a réglé ce que le serveur ne sait pas tenir.
 *
 * Bloquer n'est notifié à personne ; un Bring de cette personne qui sonne, ou sa
 * voix qui passe, à cet instant s'arrête sur mes appareils.
 */
export function registerRelationSettings(fastify: FastifyInstance): void {
  const reads = relationLimiter(fastify, 'rel:settings:read:u', 120);
  const writes = relationLimiter(fastify, 'rel:settings:write:u', 30);

  fastify.get<{ Params: { userId: string } }>('/:userId/settings', {
    onRequest: [fastify.authenticate],
    preHandler: [appVersionFloorPreHandler, reads.middleware()],
    schema: {
      description: 'What I set for this person: bringBlocked, talkieBlocked, togetherBlocked (all open by default) and the shares I consented to at the Blood ritual.',
      tags: ['relations'],
      summary: 'Per-person settings',
      params: userIdParams,
      response: { 200: settingsSchema, ...errorResponses },
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
    try {
      const otherId = otherUserOf(request, reply);
      if (otherId === null) return reply;
      const userId = otherId.toLowerCase();
      return sendSuccess(reply, servedSettings(userId, await readSettings(fastify.prisma, request.user!.userId, userId)));
    } catch (error) {
      logError(fastify.log, 'Read relation settings error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  fastify.put<{ Params: { userId: string } }>('/:userId/settings', {
    onRequest: [fastify.authenticate],
    preHandler: [appVersionFloorPreHandler, writes.middleware()],
    schema: {
      description: 'Set what I allow this person: { bringBlocked?, talkieBlocked?, togetherBlocked?, listeningCategoryShared? (granted from Close), listeningTitleShared?, locationShared?, locationHistoryShared?, proximityShared? }. A ritual share can only be withdrawn (false). Unknown settings are refused (400).',
      tags: ['relations'],
      summary: 'Update per-person settings',
      params: userIdParams,
      body: { type: 'object', minProperties: 1, properties: { bringBlocked: { type: 'boolean' }, talkieBlocked: { type: 'boolean' }, togetherBlocked: { type: 'boolean' }, listeningCategoryShared: { type: 'boolean' }, ...withdrawalFlags } },
      response: { 200: settingsSchema, ...errorResponses },
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
    try {
      const otherId = otherUserOf(request, reply);
      if (otherId === null) return reply;
      const parsed = relationPersonSettingsUpdateSchema.safeParse(request.body);
      if (!parsed.success) return sendBadRequest(reply, 'Donnees invalides');

      const ownerId = request.user!.userId;
      const userId = otherId.toLowerCase();
      const { bringBlocked, talkieBlocked, togetherBlocked, listeningCategoryShared, ...requested } = parsed.data;
      const now = new Date();
      const current = await readSettings(fastify.prisma, ownerId, userId);
      const blocking = bringBlocked === true || talkieBlocked === true || togetherBlocked === true;
      const granting = listeningCategoryShared === true;
      const [linked, close] = await Promise.all([
        blocking ? linkedPerson(fastify.prisma, ownerId, userId) : false,
        granting ? linkedPerson(fastify.prisma, ownerId, userId, 'listening.category') : false,
      ]);
      // Retirer la catégorie retire aussi le titre : on ne garde pas le plus riche des deux partages
      // quand on vient de couper le moindre.
      const withdrawn = [
        ...(Object.keys(requested) as RelationRitualShare[]),
        ...(listeningCategoryShared === false ? (['listeningTitleShared'] as const) : []),
      ];
      const categoryWithdrawn = listeningCategoryShared === false && current?.listeningCategoryShared === true;
      const cutsListening = categoryWithdrawn || (withdrawn.includes('listeningTitleShared') && current?.listeningTitleShared === true);
      const ecoute = { prisma: fastify.prisma, io: relationIoOf(fastify), report: (error: unknown) => logError(fastify.log, 'Now playing not refreshed after settings:', error) };
      const ecouteAvant = cutsListening ? await captureNowPlayingBefore(ecoute, { userA: ownerId, userB: userId }) : new Map();
      const data = {
        ...ritualShareWithdrawalOf(current, withdrawn, now),
        ...(categoryWithdrawn ? { listeningCategoryShared: false, listeningCategoryWithdrawnAt: now } : {}),
        ...(granting && close ? { listeningCategoryShared: true, listeningCategoryWithdrawnAt: null } : {}),
        ...(bringBlocked === false ? { bringBlockedAt: null } : {}),
        ...(talkieBlocked === false ? { talkieBlockedAt: null } : {}),
        ...(togetherBlocked === false ? { togetherBlockedAt: null } : {}),
        ...(bringBlocked === true && linked ? { bringBlockedAt: now } : {}),
        ...(talkieBlocked === true && linked ? { talkieBlockedAt: now } : {}),
        ...(togetherBlocked === true && linked ? { togetherBlockedAt: now } : {}),
      };

      // UNE écriture : le retrait (qui n'exige aucun lien), les blocages et l'accord partent ensemble.
      if ((blocking && linked) || (granting && close)) {
        await fastify.prisma.relationFeatureSetting.upsert({
          where: { ownerId_otherId: { ownerId, otherId: userId } },
          create: { ownerId, otherId: userId, ...data },
          update: data,
        });
        if (bringBlocked === true) {
          await stopBringsOnBlock(bringDepsOf(fastify, bringQuotaOf(fastify)), { blockerId: ownerId, blockedId: userId, scope: 'bring' })
            .catch((error: unknown) => logError(fastify.log, 'Bring not stopped after Bring block:', error));
        }
        if (talkieBlocked === true) {
          await cutTalkiesOnBlock(talkieCutDepsOf(), { blockerId: ownerId, blockedId: userId, scope: 'talkie' })
            .catch((error: unknown) => logError(fastify.log, 'Talkie not cut after talkie block:', error));
        }
      } else if (Object.keys(data).length > 0) {
        await fastify.prisma.relationFeatureSetting.updateMany({ where: { ownerId, otherId: userId }, data });
      }
      // #13934 — un accord fait remonter l'écoute en cours chez l'autre ; un retrait l'efface chez qui la voyait.
      if ((granting && close) || cutsListening) await refreshNowPlayingAfter(ecoute, { userA: ownerId, userB: userId, before: ecouteAvant });
      if ((blocking && !linked) || (granting && !close)) return sendNotFound(reply, 'Personne introuvable');

      return sendSuccess(reply, servedSettings(userId, await readSettings(fastify.prisma, ownerId, userId)));
    } catch (error) {
      logError(fastify.log, 'Update relation settings error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
