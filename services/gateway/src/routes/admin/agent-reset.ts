/**
 * Surface RESET des routes admin de l'agent — réinitialisation des données
 * agent d'une conversation, d'un utilisateur, ou de la plateforme entière
 * (souverain, #4157). Point d'entrée : `agent.ts` (#4284).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { logError } from '../../utils/logger';
import { getCacheStore } from '../../services/CacheStore';
import { sendSuccess, sendInternalError } from '../../utils/response';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { withAudit } from '../../middleware/authorize';
import {
  requireAgentAdmin,
  requireAgentSovereign,
  validateObjectId,
  objectIdParam,
  conversationIdParams,
  stdErrors,
  securityBearerAuth,
  type AgentRouteDeps,
} from './agent-shared';

const resetResultResponse = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      additionalProperties: true,
      properties: {
        deleted: { type: 'object', additionalProperties: true },
      },
    },
    message: { type: 'string' },
  },
} as const;

export function registerAgentResetRoutes(fastify: FastifyInstance, deps: AgentRouteDeps): void {
  const { broadcastInvalidation } = deps;

  // DELETE /reset/conversation/:conversationId
  fastify.delete('/reset/conversation/:conversationId', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
    schema: {
      description: 'Reset all agent data (config, roles, summary, analytics, Redis cache) for a single conversation.',
      tags: ['admin-agent'],
      summary: 'Reset conversation agent data',
      security: securityBearerAuth,
      params: conversationIdParams,
      response: { 200: resetResultResponse, ...stdErrors },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { conversationId } = request.params as { conversationId: string };
      /* istanbul ignore next -- Fastify schema validates the ObjectId pattern before the handler runs */
      if (!validateObjectId(conversationId, 'conversationId', reply)) return;

      const [config, roles, summary, analytic] = await fastify.prisma.$transaction([
        fastify.prisma.agentConfig.deleteMany({ where: { conversationId } }),
        fastify.prisma.agentUserRole.deleteMany({ where: { conversationId } }),
        fastify.prisma.agentConversationSummary.deleteMany({ where: { conversationId } }),
        fastify.prisma.agentAnalytic.deleteMany({ where: { conversationId } }),
      ]);

      const cache = getCacheStore();
      const keysToDelete = [
        `agent:messages:${conversationId}`,
        `agent:summary:${conversationId}`,
        `agent:profiles:${conversationId}`,
        // Explicitly drop the in-Redis config snapshot too — otherwise the
        // agent service keeps scanning a config the admin just nuked, for up
        // to CONFIG_TTL (5 min). The broadcastInvalidation below also clears
        // the in-process cache copy across all agent instances.
        `agent:config:${conversationId}`,
      ];
      const cooldownKeys = await cache.keys(`agent:cooldown:${conversationId}:*`);
      keysToDelete.push(...cooldownKeys);

      let redisKeysDeleted = 0;
      for (const key of keysToDelete) {
        await cache.del(key);
        redisKeysDeleted++;
      }
      const invalidationStatus = await broadcastInvalidation({ conversationId });

      return sendSuccess(reply, {
        conversationId,
        deleted: {
          configs: config.count,
          roles: roles.count,
          summaries: summary.count,
          analytics: analytic.count,
          redisKeys: redisKeysDeleted,
        },
        cacheInvalidation: invalidationStatus,
      }, { message: 'Reset conversation effectué' });
    } catch (error) {
      logError(fastify.log, 'Error during conversation reset:', error);
      return sendInternalError(reply, 'Erreur lors du reset conversation');
    }
  });

  // DELETE /reset/user/:userId
  fastify.delete('/reset/user/:userId', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
    schema: {
      description: 'Reset all agent data (roles, global profile, Redis tone profiles, cooldowns) for a single user across all conversations.',
      tags: ['admin-agent'],
      summary: 'Reset user agent data',
      security: securityBearerAuth,
      params: {
        type: 'object',
        required: ['userId'],
        properties: { userId: objectIdParam },
      },
      response: { 200: resetResultResponse, ...stdErrors },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.params as { userId: string };
      /* istanbul ignore next -- Fastify schema validates the ObjectId pattern before the handler runs */
      if (!validateObjectId(userId, 'userId', reply)) return;

      const [roles, globalProfile] = await fastify.prisma.$transaction([
        fastify.prisma.agentUserRole.deleteMany({ where: { userId } }),
        fastify.prisma.agentGlobalProfile.deleteMany({ where: { userId } }),
      ]);

      const cache = getCacheStore();
      const profileKeys = await cache.keys('agent:profiles:*');
      let profilesCleaned = 0;
      for (const key of profileKeys) {
        const raw = await cache.get(key);
        if (!raw) continue;
        try {
          const profiles = JSON.parse(raw) as Record<string, unknown>;
          if (userId in profiles) {
            delete profiles[userId];
            await cache.set(key, JSON.stringify(profiles));
            profilesCleaned++;
          }
        } catch { /* skip malformed */ }
      }

      const cooldownKeys = await cache.keys(`agent:cooldown:*:${userId}`);
      for (const key of cooldownKeys) {
        await cache.del(key);
      }

      // A user reset wipes their global profile, which feeds auto-pickup
      // in every conversation. Bust the global cache so the next scan
      // anywhere sees the change instead of resurrecting the deleted
      // profile from a stale cached config.
      const invalidationStatus = await broadcastInvalidation({ global: true });

      return sendSuccess(reply, {
        userId,
        deleted: {
          roles: roles.count,
          globalProfiles: globalProfile.count,
          redisProfilesCleaned: profilesCleaned,
          cooldownsCleared: cooldownKeys.length,
        },
        cacheInvalidation: invalidationStatus,
      }, { message: 'Reset utilisateur effectué' });
    } catch (error) {
      logError(fastify.log, 'Error during user reset:', error);
      return sendInternalError(reply, 'Erreur lors du reset utilisateur');
    }
  });

  // DELETE /reset
  // DELETE /reset — S6 souverain (#4157) : destruction TOTALE de l'état de
  // l'agent, voir la note à côté de `requireAgentSovereign`.
  fastify.delete('/reset', {
    onRequest: [fastify.authenticate, requireAgentSovereign],
    schema: {
      description: 'Nuclear reset: delete ALL agent configs, roles, summaries, analytics, global profiles and Redis cache. Rang souverain (BIGBOSS) et motif écrit requis — #4157.',
      tags: ['admin-agent'],
      summary: 'Reset all agent data',
      security: securityBearerAuth,
      body: {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: { type: 'string', minLength: 10, description: 'Motif écrit du reset complet (10 caractères minimum), consigné dans AdminAuditLog' }
        }
      },
      response: { 200: resetResultResponse, 400: errorResponseSchema, ...stdErrors },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Le schéma ci-dessus REFUSE déjà (400, avant ce handler) un corps sans
      // `reason` d'au moins 10 caractères — Fastify/AJV valide `body` avant
      // d'invoquer le handler, ce n'est pas une revérification défensive.
      const { reason } = request.body as { reason: string };

      const [configs, roles, summaries, analytics, globalProfiles] = await fastify.prisma.$transaction([
        fastify.prisma.agentConfig.deleteMany(),
        fastify.prisma.agentUserRole.deleteMany(),
        fastify.prisma.agentConversationSummary.deleteMany(),
        fastify.prisma.agentAnalytic.deleteMany(),
        fastify.prisma.agentGlobalProfile.deleteMany(),
      ]);

      const cache = getCacheStore();
      const agentKeys = await cache.keys('agent:*');
      let redisKeysDeleted = 0;
      for (const key of agentKeys) {
        await cache.del(key);
        redisKeysDeleted++;
      }
      // The Redis wipe above clears the persistent cache, but the agent
      // service holds an in-process snapshot of the global config that
      // only refreshes on pub/sub events or TTL expiry. Notify it so
      // the next scan rebuilds from a clean slate.
      const invalidationStatus = await broadcastInvalidation({ global: true });

      // Écrite APRÈS le succès du reset — un geste de cette taille (toute la
      // plateforme) ne doit JAMAIS rester sans trace, quel qu'en soit
      // l'auteur : c'était exactement ce que l'audit constatait manquant.
      const authContext = (request as UnifiedAuthRequest).authContext;
      await withAudit(request, {
        action: 'AGENT_FULL_RESET',
        entity: 'Agent',
        entityId: 'ALL',
        userId: authContext.registeredUser.id,
        reason,
        changes: {
          configs: configs.count,
          roles: roles.count,
          summaries: summaries.count,
          analytics: analytics.count,
          globalProfiles: globalProfiles.count,
          redisKeys: redisKeysDeleted,
        },
      });

      return sendSuccess(reply, {
        deleted: {
          configs: configs.count,
          roles: roles.count,
          summaries: summaries.count,
          analytics: analytics.count,
          globalProfiles: globalProfiles.count,
          redisKeys: redisKeysDeleted,
        },
        cacheInvalidation: invalidationStatus,
      }, { message: 'Reset complet effectué' });
    } catch (error) {
      logError(fastify.log, 'Error during agent reset:', error);
      return sendInternalError(reply, 'Erreur lors du reset agent');
    }
  });
}
