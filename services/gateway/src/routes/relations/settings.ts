import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { relationPersonSettingsUpdateSchema, type RelationPersonSettings } from '@meeshy/shared/types/relation-person-settings';
import { appVersionFloorPreHandler } from '../../middleware/app-version-floor';
import { stopBringsOnBlock } from '../../services/bring/bringService';
import { cutTalkiesOnBlock, talkieCutDepsOf } from '../../services/talkie/talkieCut';
import { logError } from '../../utils/logger';
import { sendBadRequest, sendInternalError, sendSuccess } from '../../utils/response';
import { bringDepsOf, bringQuotaOf } from '../bring';
import { errorResponses, otherUserOf, relationLimiter, userIdParams } from './shared';

const settingsSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: { type: 'object', properties: { userId: { type: 'string' }, bringBlocked: { type: 'boolean' }, talkieBlocked: { type: 'boolean' } } },
  },
} as const;

/**
 * Les RÉGLAGES PAR PERSONNE (#13936, spec § 4) : ce que JE règle pour quelqu'un —
 * `GET|PUT /relations/:userId/settings` : `bringBlocked` (#13936, D-3) et
 * `talkieBlocked` (#13935), deux préférences de RÉCEPTION actives par défaut
 * (contrat : `@meeshy/shared/types/relation-person-settings`). Un
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
      description: 'What I allow this person: bringBlocked, talkieBlocked (both open by default).',
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
        select: { bringBlockedAt: true, talkieBlockedAt: true },
      });
      const served: RelationPersonSettings = { userId, bringBlocked: Boolean(row?.bringBlockedAt), talkieBlocked: Boolean(row?.talkieBlockedAt) };
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
      description: 'Set what I allow this person: { bringBlocked?, talkieBlocked? } (at least one). Unknown settings are refused (400).',
      tags: ['relations'],
      summary: 'Update per-person settings',
      params: userIdParams,
      body: { type: 'object', properties: { bringBlocked: { type: 'boolean' }, talkieBlocked: { type: 'boolean' } } },
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
      const at = new Date();
      const columns = {
        ...(parsed.data.bringBlocked === undefined ? {} : { bringBlockedAt: parsed.data.bringBlocked ? at : null }),
        ...(parsed.data.talkieBlocked === undefined ? {} : { talkieBlockedAt: parsed.data.talkieBlocked ? at : null }),
      };
      const row = await fastify.prisma.relationFeatureSetting.upsert({
        where: { ownerId_otherId: { ownerId, otherId: userId } },
        create: { ownerId, otherId: userId, ...columns },
        update: columns,
      });
      if (parsed.data.bringBlocked) {
        await stopBringsOnBlock(bringDepsOf(fastify, bringQuotaOf(fastify)), { blockerId: ownerId, blockedId: userId, scope: 'bring' })
          .catch((error: unknown) => logError(fastify.log, 'Bring not stopped after Bring block:', error));
      }
      if (parsed.data.talkieBlocked) {
        await cutTalkiesOnBlock(talkieCutDepsOf(), { blockerId: ownerId, blockedId: userId, scope: 'talkie' })
          .catch((error: unknown) => logError(fastify.log, 'Talkie not cut after talkie block:', error));
      }

      const served: RelationPersonSettings = { userId, bringBlocked: Boolean(row.bringBlockedAt), talkieBlocked: Boolean(row.talkieBlockedAt) };
      return sendSuccess(reply, served);
    } catch (error) {
      logError(fastify.log, 'Update relation settings error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
