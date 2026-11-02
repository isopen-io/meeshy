import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { RELATION_RITUAL_SHARES, relationPersonSettingsUpdateSchema, type RelationPersonSettings } from '@meeshy/shared/types/bring';
import { appVersionFloorPreHandler } from '../../middleware/app-version-floor';
import { stopBringsOnBlock } from '../../services/bring/bringService';
import { logError } from '../../utils/logger';
import { sendBadRequest, sendInternalError, sendNotFound, sendSuccess } from '../../utils/response';
import { resolveRelationAccess } from '@meeshy/shared/utils/relation-access';
import { niveauEffectif } from '../../services/friendship';
import { bringDepsOf, bringQuotaOf } from '../bring';
import { errorResponses, otherUserOf, relationLimiter, userIdParams } from './shared';

/**
 * Un réglage ne s'écrit que pour une personne qui EXISTE et avec qui un lien existe
 * (Connaissance au moins, jugé par la loi) : aucune ligne pour un identifiant
 * quelconque. Inconnu, désactivé, sans lien ou bloqué : le même 404.
 */
async function linkedPerson(prisma: FastifyInstance['prisma'], ownerId: string, otherId: string): Promise<boolean> {
  const [other, level] = await Promise.all([
    prisma.user.findUnique({ where: { id: otherId }, select: { id: true, deactivatedAt: true } }),
    niveauEffectif(prisma, ownerId, otherId),
  ]);
  if (!other || other.deactivatedAt) return false;
  return resolveRelationAccess({
    viewerId: ownerId,
    targetId: otherId,
    grantedByViewer: level,
    grantedByTarget: level,
    sharesCommunity: false,
    blockedEitherWay: false,
    viewerMinor: 'unknown',
    targetMinor: 'unknown',
    feature: 'audience.acquaintances',
  }).allowed;
}

const shareFlags = Object.fromEntries(RELATION_RITUAL_SHARES.map((share) => [share, { type: 'boolean' }])) as Record<
  (typeof RELATION_RITUAL_SHARES)[number],
  { type: 'boolean' }
>;

const settingsSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: { type: 'object', properties: { userId: { type: 'string' }, bringBlocked: { type: 'boolean' }, ...shareFlags } },
  },
} as const;

const SETTINGS_SELECT = {
  bringBlockedAt: true, listeningTitleShared: true, locationShared: true, locationHistoryShared: true, proximityShared: true,
} as const;

type SettingsRow = { readonly bringBlockedAt: Date | null } & Readonly<Record<(typeof RELATION_RITUAL_SHARES)[number], boolean>>;

/** Ce que JE règle pour l'autre : son Bring bloqué ou non, et ce que je lui partage depuis le rituel. */
const servedSettings = (userId: string, row: SettingsRow | null): RelationPersonSettings => ({
  userId,
  bringBlocked: Boolean(row?.bringBlockedAt),
  ...(Object.fromEntries(RELATION_RITUAL_SHARES.map((share) => [share, row?.[share] === true])) as Record<(typeof RELATION_RITUAL_SHARES)[number], boolean>),
});

const readSettings = (prisma: FastifyInstance['prisma'], ownerId: string, otherId: string): Promise<SettingsRow | null> =>
  prisma.relationFeatureSetting.findUnique({ where: { ownerId_otherId: { ownerId, otherId } }, select: SETTINGS_SELECT });

/**
 * Les RÉGLAGES PAR PERSONNE (#13936, spec § 4) : ce que JE règle pour quelqu'un —
 * `GET|PUT /relations/:userId/settings`. `bringBlocked` (D-3 : le Bring est
 * disponible par défaut, bloquable par personne), et le RETRAIT des partages
 * consentis au rituel du Sang (#14401, RGPD art. 7(3)) : chacun se coupe à `false`,
 * un par un, sans quitter le Sang, et ne s'accorde jamais ici. Le retrait vaut tout
 * de suite : la ligne est écrite avant la réponse, et tout relais de partage la relit
 * à chaque émission. Il se fait même quand le lien est tombé (aucun contrôle de lien,
 * aucune ligne créée : seule MA ligne existante change). `talkieDirect` et les
 * suivants s'y ajouteront avec leur lot. Un
 * corps qui nomme un réglage inconnu est REFUSÉ (400) plutôt qu'ignoré : un
 * client ne doit jamais croire qu'il a réglé ce que le serveur ne sait pas tenir.
 *
 * Bloquer n'est notifié à personne ; un Bring de cette personne qui sonne à cet
 * instant s'arrête sur mes appareils.
 */
export function registerRelationSettings(fastify: FastifyInstance): void {
  const reads = relationLimiter(fastify, 'rel:settings:read:u', 120);
  const writes = relationLimiter(fastify, 'rel:settings:write:u', 30);

  fastify.get<{ Params: { userId: string } }>('/:userId/settings', {
    onRequest: [fastify.authenticate],
    preHandler: [appVersionFloorPreHandler, reads.middleware()],
    schema: {
      description: 'What I set for this person: bringBlocked (my Bring is available to them by default) and the shares I consented to at the Blood ritual.',
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
      description: 'Set what I allow this person: { bringBlocked?, listeningTitleShared?, locationShared?, locationHistoryShared?, proximityShared? }. A ritual share can only be withdrawn (false). Unknown settings are refused (400).',
      tags: ['relations'],
      summary: 'Update per-person settings',
      params: userIdParams,
      body: { type: 'object', minProperties: 1, properties: { bringBlocked: { type: 'boolean' }, ...shareFlags } },
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
      const { bringBlocked, ...withdrawn } = parsed.data;
      if (bringBlocked !== undefined) {
        if (!(await linkedPerson(fastify.prisma, ownerId, userId))) return sendNotFound(reply, 'Personne introuvable');
        const bringBlockedAt = bringBlocked ? new Date() : null;
        await fastify.prisma.relationFeatureSetting.upsert({
          where: { ownerId_otherId: { ownerId, otherId: userId } },
          create: { ownerId, otherId: userId, bringBlockedAt },
          update: { bringBlockedAt },
        });
        if (bringBlocked) {
          await stopBringsOnBlock(bringDepsOf(fastify, bringQuotaOf(fastify)), { blockerId: ownerId, blockedId: userId, scope: 'bring' })
            .catch((error: unknown) => logError(fastify.log, 'Bring not stopped after Bring block:', error));
        }
      }
      if (Object.keys(withdrawn).length > 0) {
        await fastify.prisma.relationFeatureSetting.updateMany({ where: { ownerId, otherId: userId }, data: withdrawn });
      }

      return sendSuccess(reply, servedSettings(userId, await readSettings(fastify.prisma, ownerId, userId)));
    } catch (error) {
      logError(fastify.log, 'Update relation settings error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
