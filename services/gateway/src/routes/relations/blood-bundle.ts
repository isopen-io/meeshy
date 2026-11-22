import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { isCurrentBloodBundle } from '@meeshy/shared/utils/blood-bundle';
import { appVersionFloorPreHandler } from '../../middleware/app-version-floor';
import { isBlockedBetween } from '../../utils/blocking';
import { niveauEffectif } from '../../services/friendship';
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
 */
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
      const [level, blocked] = await Promise.all([niveauEffectif(fastify.prisma, ownerId, userId), isBlockedBetween(fastify.prisma, ownerId, userId)]);
      if (level !== 'BLOOD' || blocked) return sendNotFound(reply, 'Personne introuvable');
      const data = { bloodBundleAcceptedAt: new Date(), bloodBundleVersion: parsed.data.version };
      await fastify.prisma.relationFeatureSetting.upsert({
        where: { ownerId_otherId: { ownerId, otherId: userId } },
        create: { ownerId, otherId: userId, ...data },
        update: data,
      });
      return sendSuccess(reply, { userId, bloodBundleAccepted: true, version: parsed.data.version, lockedByLevel: true });
    } catch (error) {
      logError(fastify.log, 'Blood bundle acceptance error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
