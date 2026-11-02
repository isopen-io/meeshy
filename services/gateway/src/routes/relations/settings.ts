import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { relationPersonSettingsUpdateSchema, type RelationPersonSettings } from '@meeshy/shared/types/bring';
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

const settingsSchema = {
  type: 'object',
  properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { userId: { type: 'string' }, bringBlocked: { type: 'boolean' } } } },
} as const;

/**
 * Les RÉGLAGES PAR PERSONNE (#13936, spec § 4) : ce que JE règle pour quelqu'un —
 * `GET|PUT /relations/:userId/settings`. À ce lot, le seul réglage est
 * `bringBlocked` (D-3 : le Bring est disponible par défaut, bloquable par
 * personne) ; `talkieDirect` et les suivants s'y ajouteront avec leur lot. Un
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
      description: 'What I set for this person: bringBlocked (my Bring is available to them by default).',
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
      const row = await fastify.prisma.relationFeatureSetting.findUnique({
        where: { ownerId_otherId: { ownerId: request.user!.userId, otherId: userId } },
        select: { bringBlockedAt: true },
      });
      const served: RelationPersonSettings = { userId, bringBlocked: Boolean(row?.bringBlockedAt) };
      return sendSuccess(reply, served);
    } catch (error) {
      logError(fastify.log, 'Read relation settings error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  fastify.put<{ Params: { userId: string } }>('/:userId/settings', {
    onRequest: [fastify.authenticate],
    preHandler: [appVersionFloorPreHandler, writes.middleware()],
    schema: {
      description: 'Set what I allow this person: { bringBlocked }. Unknown settings are refused (400).',
      tags: ['relations'],
      summary: 'Update per-person settings',
      params: userIdParams,
      body: { type: 'object', required: ['bringBlocked'], properties: { bringBlocked: { type: 'boolean' } } },
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
      if (!(await linkedPerson(fastify.prisma, ownerId, userId))) return sendNotFound(reply, 'Personne introuvable');
      const bringBlockedAt = parsed.data.bringBlocked ? new Date() : null;
      await fastify.prisma.relationFeatureSetting.upsert({
        where: { ownerId_otherId: { ownerId, otherId: userId } },
        create: { ownerId, otherId: userId, bringBlockedAt },
        update: { bringBlockedAt },
      });
      if (parsed.data.bringBlocked) {
        await stopBringsOnBlock(bringDepsOf(fastify, bringQuotaOf(fastify)), { blockerId: ownerId, blockedId: userId, scope: 'bring' })
          .catch((error: unknown) => logError(fastify.log, 'Bring not stopped after Bring block:', error));
      }

      const served: RelationPersonSettings = { userId, bringBlocked: parsed.data.bringBlocked };
      return sendSuccess(reply, served);
    } catch (error) {
      logError(fastify.log, 'Update relation settings error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
