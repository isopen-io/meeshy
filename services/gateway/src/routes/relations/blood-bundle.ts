import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { isCurrentBloodBundle } from '@meeshy/shared/utils/blood-bundle';
import { appVersionFloorPreHandler } from '../../middleware/app-version-floor';
import { bloodLockStateBetween } from '../../services/relations/bloodLock';
import { refreshBloodBundleRelays } from '../../services/relations/bloodBundleRefresh';
import { relationIoOf } from '../../socketio/relationEvents';
import { logError } from '../../utils/logger';
import { sendBadRequest, sendConflict, sendInternalError, sendNotFound, sendSuccess } from '../../utils/response';
import { errorResponses, otherUserOf, relationLimiter, userIdParams } from './shared';

const bodySchema = z.object({ version: z.string().min(1).max(32) }).strict();

const responseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: { type: 'object', properties: { userId: { type: 'string' }, bloodBundleAccepted: { type: 'boolean' }, version: { type: 'string' }, lockedByLevel: { type: 'boolean' } } },
  },
} as const;

/**
 * L'ACCORD AU PALIER pour un Sang DÉJÀ scellé (#20367, décision B ; #20362) :
 * `PUT /relations/:userId/blood-bundle { version }`. La carte « Le Sang ouvre désormais tout entre
 * vous » le pose ; dès lors, de Sang à Sang rien ne se coupe (409 RELATION_BLOOD_LOCKED) et les
 * refus déjà donnés ne s'appliquent plus. Seulement envers un Sang RÉEL, non bloqué (404 sinon,
 * sans rien écrire) ; seulement à la version courante de la liste (409 RELATION_BLOOD_BUNDLE_OUTDATED).
 * Revenir en arrière, c'est redescendre la personne à Proche : la baisse efface l'accord des deux côtés.
 * Un blocage reçoit EXACTEMENT la réponse d'un lien absent ou retombé (404, même corps, mêmes lectures) :
 * `GET /relations/:userId` sert déjà PUBLIC à une paire bloquée, et un 200 ici dirait « on t'a bloqué »
 * (ré-audit #20361, constat 1 ; contrat de `level.ts` : un inconnu et un bloqué ne se distinguent pas).
 * La protection d'un mineur (écart d'âge de plus de 5 ans, `minorProtectedBetween`) : 200 neutre
 * `bloodBundleAccepted: false`, rien d'écrit — jamais un accord pris sous protection qui lèverait un refus
 * stocké à la majorité (directive 2026-11-23, constat A). Le GET y montre Sang : rien n'est trahi.
 */
type Standing = 'accepting' | 'neutral' | 'not-blood';

/**
 * Où en est la paire : `not-blood` (404 « personne introuvable » : sous le Sang, sans lien, ou bloquée),
 * `neutral` (la protection d'un mineur : 200 sans rien écrire), `accepting` (l'accord peut s'écrire).
 * Les lectures de `bloodLockStateBetween` sont uniformes : le chemin 404 coûte autant que les autres.
 */
async function standingOf(prisma: FastifyInstance['prisma'], ownerId: string, otherId: string): Promise<Standing> {
  const state = await bloodLockStateBetween(prisma, ownerId, otherId);
  if (state.level !== 'BLOOD' || state.blocked) return 'not-blood';
  return state.minorProtected ? 'neutral' : 'accepting';
}

const neutral = (reply: FastifyReply, userId: string, version: string) =>
  sendSuccess(reply, { userId, bloodBundleAccepted: false, version, lockedByLevel: false });

export function registerBloodBundle(fastify: FastifyInstance): void {
  const writes = relationLimiter(fastify, 'rel:blood-bundle:write:u', 30);

  fastify.put<{ Params: { userId: string } }>('/:userId/blood-bundle', {
    onRequest: [fastify.authenticate],
    preHandler: [appVersionFloorPreHandler, writes.middleware()],
    schema: {
      description: 'Accept, for one Blood, everything the Blood level opens (versioned list). From then on, nothing can be cut between you except lowering the level.',
      tags: ['relations'],
      summary: 'Accept the Blood bundle',
      params: userIdParams,
      response: { 200: responseSchema, ...errorResponses },
      security: [{ bearerAuth: [] }],
    },
  }, async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
    try {
      const otherId = otherUserOf(request, reply);
      if (otherId === null) return reply;
      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) return sendBadRequest(reply, 'Donnees invalides');
      if (!isCurrentBloodBundle(parsed.data.version)) {
        return sendConflict(reply, 'La liste de ce que le Sang ouvre a changé : relis-la', { code: 'RELATION_BLOOD_BUNDLE_OUTDATED' });
      }
      const ownerId = request.user!.userId;
      const userId = otherId.toLowerCase();
      const before = await standingOf(fastify.prisma, ownerId, userId);
      if (before === 'not-blood') return sendNotFound(reply, 'Personne introuvable');
      if (before === 'neutral') return neutral(reply, userId, parsed.data.version);
      const data = { bloodBundleAcceptedAt: new Date(), bloodBundleVersion: parsed.data.version };
      await fastify.prisma.relationFeatureSetting.upsert({
        where: { ownerId_otherId: { ownerId, otherId: userId } },
        create: { ownerId, otherId: userId, ...data },
        update: data,
      });
      // Vérifier PUIS écrire n'est pas atomique (Mongo, deux collections) : une baisse ou un blocage
      // arrivé entre les deux laisserait un accord sur une paire qui n'est plus Sang. Le niveau et le
      // blocage sont RELUS après l'écriture ; s'ils ont changé, l'accord est retiré et rien n'est dit.
      // Le verrou, lui, ne lit jamais l'accord seul : il exige le niveau effectif Sang à chaque lecture.
      const after = await standingOf(fastify.prisma, ownerId, userId);
      if (after !== 'accepting') {
        await fastify.prisma.relationFeatureSetting.updateMany({ where: { ownerId, otherId: userId }, data: { bloodBundleAcceptedAt: null, bloodBundleVersion: null } });
        return after === 'neutral' ? neutral(reply, userId, parsed.data.version) : sendNotFound(reply, 'Personne introuvable');
      }
      // Comme le rituel et tout changement de palier : ce que l'accord ouvre arrive aussitôt chez l'autre
      // (écoute, batterie, position partagée, inactivité et chute). Best-effort, jamais levant.
      await refreshBloodBundleRelays({ prisma: fastify.prisma, io: relationIoOf(fastify), report: (what, error) => logError(fastify.log, `${what} not refreshed after blood bundle:`, error) }, { userA: ownerId, userB: userId });
      return sendSuccess(reply, { userId, bloodBundleAccepted: true, version: parsed.data.version, lockedByLevel: true });
    } catch (error) {
      logError(fastify.log, 'Blood bundle acceptance error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
