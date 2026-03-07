import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { listArchetypes, getArchetype } from '@meeshy/shared/agent/archetypes';
import { logError } from '../../utils/logger';
import { getRedisWrapper } from '../../services/RedisWrapper';

const requireAgentAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  const authContext = (request as any).authContext;
  if (!authContext?.isAuthenticated || !authContext.registeredUser) {
    return reply.status(401).send({ success: false, message: 'Authentification requise' });
  }
  if (!['BIGBOSS', 'ADMIN'].includes(authContext.registeredUser.role)) {
    return reply.status(403).send({ success: false, message: 'Permission insuffisante' });
  }
};

const agentConfigSchema = z.object({
  enabled: z.boolean().optional(),
  autoPickupEnabled: z.boolean().optional(),
  inactivityThresholdHours: z.number().int().min(1).max(720).optional(),
  minHistoricalMessages: z.number().int().min(0).optional(),
  maxControlledUsers: z.number().int().min(1).max(50).optional(),
  manualUserIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/)).optional(),
  excludedRoles: z.array(z.string()).optional(),
  excludedUserIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/)).optional(),
  triggerOnTimeout: z.boolean().optional(),
  timeoutSeconds: z.number().int().min(30).max(3600).optional(),
  triggerOnUserMessage: z.boolean().optional(),
  triggerFromUserIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/)).optional(),
  triggerOnReplyTo: z.boolean().optional(),
  agentType: z.string().optional(),
  contextWindowSize: z.number().int().min(10).max(250).optional(),
  useFullHistory: z.boolean().optional(),
  scanIntervalMinutes: z.number().int().min(1).max(1440).optional(),
  minResponsesPerCycle: z.number().int().min(0).max(50).optional(),
  maxResponsesPerCycle: z.number().int().min(1).max(50).optional(),
  reactionsEnabled: z.boolean().optional(),
  maxReactionsPerCycle: z.number().int().min(0).max(50).optional(),
  agentInstructions: z.string().max(5000).nullable().optional(),
  webSearchEnabled: z.boolean().optional(),
});

const llmConfigSchema = z.object({
  provider: z.enum(['openai', 'anthropic']).optional(),
  model: z.string().min(1).optional(),
  apiKeyEncrypted: z.string().min(1).optional(),
  baseUrl: z.string().url().nullable().optional(),
  maxTokens: z.number().int().min(64).max(16384).optional(),
  temperature: z.number().min(0).max(2).optional(),
  dailyBudgetUsd: z.number().min(0).optional(),
  maxCostPerCall: z.number().min(0).optional(),
  fallbackProvider: z.string().nullable().optional(),
  fallbackModel: z.string().nullable().optional(),
  fallbackApiKeyEncrypted: z.string().nullable().optional(),
});

export async function agentAdminRoutes(fastify: FastifyInstance) {
  // GET /stats
  fastify.get('/stats', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const [configsCount, activeCount, rolesCount] = await Promise.all([
        fastify.prisma.agentConfig.count(),
        fastify.prisma.agentConfig.count({ where: { enabled: true } }),
        fastify.prisma.agentUserRole.count(),
      ]);
      return reply.send({
        success: true,
        data: {
          totalConfigs: configsCount,
          activeConfigs: activeCount,
          totalRoles: rolesCount,
          totalArchetypes: listArchetypes().length,
        },
      });
    } catch (error) {
      logError(fastify.log, 'Error fetching agent stats:', error);
      return reply.status(500).send({ success: false, message: 'Erreur lors de la récupération des stats agent' });
    }
  });

  // GET /configs
  fastify.get('/configs', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { page = '1', limit = '20' } = request.query as { page?: string; limit?: string };
      const pageNum = Math.max(1, parseInt(page, 10));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
      const skip = (pageNum - 1) * limitNum;

      const [configs, total] = await Promise.all([
        fastify.prisma.agentConfig.findMany({
          skip,
          take: limitNum,
          orderBy: { updatedAt: 'desc' },
        }),
        fastify.prisma.agentConfig.count(),
      ]);

      return reply.send({
        success: true,
        data: configs,
        pagination: { total, page: pageNum, limit: limitNum, hasMore: skip + limitNum < total },
      });
    } catch (error) {
      logError(fastify.log, 'Error fetching agent configs:', error);
      return reply.status(500).send({ success: false, message: 'Erreur lors de la récupération des configs' });
    }
  });

  // GET /configs/:conversationId
  fastify.get('/configs/:conversationId', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { conversationId } = request.params as { conversationId: string };
      const config = await fastify.prisma.agentConfig.findUnique({ where: { conversationId } });
      if (!config) {
        return reply.status(404).send({ success: false, message: 'Config non trouvée' });
      }
      return reply.send({ success: true, data: config });
    } catch (error) {
      logError(fastify.log, 'Error fetching agent config:', error);
      return reply.status(500).send({ success: false, message: 'Erreur serveur' });
    }
  });

  // PUT /configs/:conversationId
  fastify.put('/configs/:conversationId', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { conversationId } = request.params as { conversationId: string };
      const parsed = agentConfigSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, message: 'Données invalides', errors: parsed.error.flatten() });
      }

      const authContext = (request as any).authContext;
      const config = await fastify.prisma.agentConfig.upsert({
        where: { conversationId },
        create: { conversationId, configuredBy: authContext.registeredUser.id, ...parsed.data },
        update: parsed.data,
      });

      return reply.send({ success: true, data: config });
    } catch (error) {
      logError(fastify.log, 'Error upserting agent config:', error);
      return reply.status(500).send({ success: false, message: 'Erreur serveur' });
    }
  });

  // DELETE /configs/:conversationId
  fastify.delete('/configs/:conversationId', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { conversationId } = request.params as { conversationId: string };
      await fastify.prisma.agentConfig.delete({ where: { conversationId } });
      return reply.send({ success: true, message: 'Config supprimée' });
    } catch (error) {
      logError(fastify.log, 'Error deleting agent config:', error);
      return reply.status(500).send({ success: false, message: 'Erreur serveur' });
    }
  });

  // GET /configs/:conversationId/roles
  fastify.get('/configs/:conversationId/roles', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { conversationId } = request.params as { conversationId: string };
      const roles = await fastify.prisma.agentUserRole.findMany({ where: { conversationId } });
      return reply.send({ success: true, data: roles });
    } catch (error) {
      logError(fastify.log, 'Error fetching agent roles:', error);
      return reply.status(500).send({ success: false, message: 'Erreur serveur' });
    }
  });

  // POST /roles/:conversationId/:userId/assign
  fastify.post('/roles/:conversationId/:userId/assign', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { conversationId, userId } = request.params as { conversationId: string; userId: string };
      const { archetypeId } = request.body as { archetypeId: string };

      const archetype = getArchetype(archetypeId);
      if (!archetype) {
        return reply.status(404).send({ success: false, message: 'Archétype non trouvé' });
      }

      const role = await fastify.prisma.agentUserRole.upsert({
        where: { userId_conversationId: { userId, conversationId } },
        create: {
          userId,
          conversationId,
          origin: 'archetype',
          archetypeId,
          personaSummary: archetype.personaSummary,
          tone: archetype.tone,
          vocabularyLevel: archetype.vocabularyLevel,
          typicalLength: archetype.typicalLength,
          emojiUsage: archetype.emojiUsage,
          topicsOfExpertise: [...archetype.topicsOfExpertise],
          topicsAvoided: [],
          relationshipMap: {},
          catchphrases: [...archetype.catchphrases],
          responseTriggers: [...archetype.responseTriggers],
          silenceTriggers: [...archetype.silenceTriggers],
          confidence: archetype.confidence,
        },
        update: {
          origin: 'archetype',
          archetypeId,
          personaSummary: archetype.personaSummary,
          tone: archetype.tone,
          vocabularyLevel: archetype.vocabularyLevel,
          typicalLength: archetype.typicalLength,
          emojiUsage: archetype.emojiUsage,
          topicsOfExpertise: [...archetype.topicsOfExpertise],
          catchphrases: [...archetype.catchphrases],
          responseTriggers: [...archetype.responseTriggers],
          silenceTriggers: [...archetype.silenceTriggers],
        },
      });

      return reply.send({ success: true, data: role });
    } catch (error) {
      logError(fastify.log, 'Error assigning archetype:', error);
      return reply.status(500).send({ success: false, message: 'Erreur serveur' });
    }
  });

  // POST /roles/:conversationId/:userId/unlock
  fastify.post('/roles/:conversationId/:userId/unlock', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { conversationId, userId } = request.params as { conversationId: string; userId: string };
      const role = await fastify.prisma.agentUserRole.update({
        where: { userId_conversationId: { userId, conversationId } },
        data: { locked: false, confidence: 0 },
      });
      return reply.send({ success: true, data: role });
    } catch (error) {
      logError(fastify.log, 'Error unlocking role:', error);
      return reply.status(500).send({ success: false, message: 'Erreur serveur' });
    }
  });

  // GET /archetypes
  fastify.get('/archetypes', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ success: true, data: listArchetypes() });
  });

  // GET /llm
  fastify.get('/llm', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const config = await fastify.prisma.agentLlmConfig.findFirst({ orderBy: { updatedAt: 'desc' } });
      if (!config) {
        return reply.send({ success: true, data: null });
      }
      const { apiKeyEncrypted, fallbackApiKeyEncrypted, ...safeConfig } = config;
      return reply.send({
        success: true,
        data: {
          ...safeConfig,
          hasApiKey: !!apiKeyEncrypted,
          hasFallbackApiKey: !!fallbackApiKeyEncrypted,
        },
      });
    } catch (error) {
      logError(fastify.log, 'Error fetching LLM config:', error);
      return reply.status(500).send({ success: false, message: 'Erreur serveur' });
    }
  });

  // PUT /llm
  fastify.put('/llm', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const parsed = llmConfigSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, message: 'Données invalides', errors: parsed.error.flatten() });
      }

      const authContext = (request as any).authContext;
      const existing = await fastify.prisma.agentLlmConfig.findFirst();

      let config;
      if (existing) {
        config = await fastify.prisma.agentLlmConfig.update({
          where: { id: existing.id },
          data: parsed.data,
        });
      } else {
        config = await fastify.prisma.agentLlmConfig.create({
          data: {
            configuredBy: authContext.registeredUser.id,
            apiKeyEncrypted: parsed.data.apiKeyEncrypted ?? '',
            ...parsed.data,
          },
        });
      }

      const { apiKeyEncrypted, fallbackApiKeyEncrypted, ...safeConfig } = config;
      return reply.send({
        success: true,
        data: {
          ...safeConfig,
          hasApiKey: !!apiKeyEncrypted,
          hasFallbackApiKey: !!fallbackApiKeyEncrypted,
        },
      });
    } catch (error) {
      logError(fastify.log, 'Error updating LLM config:', error);
      return reply.status(500).send({ success: false, message: 'Erreur serveur' });
    }
  });

  // DELETE /reset — Nuclear reset: all configs, roles, summaries, analytics + Redis
  fastify.delete('/reset', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const [configs, roles, summaries, analytics, globalProfiles] = await fastify.prisma.$transaction([
        fastify.prisma.agentConfig.deleteMany(),
        fastify.prisma.agentUserRole.deleteMany(),
        fastify.prisma.agentConversationSummary.deleteMany(),
        fastify.prisma.agentAnalytic.deleteMany(),
        fastify.prisma.agentGlobalProfile.deleteMany(),
      ]);

      const redis = getRedisWrapper();
      const agentKeys = await redis.keys('agent:*');
      let redisKeysDeleted = 0;
      for (const key of agentKeys) {
        await redis.del(key);
        redisKeysDeleted++;
      }

      return reply.send({
        success: true,
        data: {
          deleted: {
            configs: configs.count,
            roles: roles.count,
            summaries: summaries.count,
            analytics: analytics.count,
            globalProfiles: globalProfiles.count,
            redisKeys: redisKeysDeleted,
          },
        },
        message: 'Reset complet effectué',
      });
    } catch (error) {
      logError(fastify.log, 'Error during agent reset:', error);
      return reply.status(500).send({ success: false, message: 'Erreur lors du reset agent' });
    }
  });

  // GET /configs/:conversationId/summary
  fastify.get('/configs/:conversationId/summary', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { conversationId } = request.params as { conversationId: string };
      const summary = await fastify.prisma.agentConversationSummary.findUnique({ where: { conversationId } });
      if (!summary) {
        return reply.status(404).send({ success: false, message: 'Résumé non trouvé' });
      }
      return reply.send({ success: true, data: summary });
    } catch (error) {
      logError(fastify.log, 'Error fetching agent summary:', error);
      return reply.status(500).send({ success: false, message: 'Erreur serveur' });
    }
  });

  // GET /configs/:conversationId/live
  fastify.get('/configs/:conversationId/live', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { conversationId } = request.params as { conversationId: string };
      const redis = getRedisWrapper();

      const [profilesRaw, summaryRaw, messagesRaw, analytics, summaryRecord, roles] = await Promise.all([
        redis.get(`agent:profiles:${conversationId}`),
        redis.get(`agent:summary:${conversationId}`),
        redis.get(`agent:messages:${conversationId}`),
        fastify.prisma.agentAnalytic.findUnique({ where: { conversationId } }),
        fastify.prisma.agentConversationSummary.findUnique({ where: { conversationId } }),
        fastify.prisma.agentUserRole.findMany({
          where: { conversationId },
          select: { userId: true, confidence: true, locked: true },
        }),
      ]);

      const toneProfiles = profilesRaw ? JSON.parse(profilesRaw) : {};
      const messages = messagesRaw ? JSON.parse(messagesRaw) : [];

      const userIds = roles.map((r) => r.userId);
      const users = userIds.length > 0
        ? await fastify.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, displayName: true, username: true, systemLanguage: true },
          })
        : [];
      const userMap = new Map(users.map((u) => [u.id, u]));

      return reply.send({
        success: true,
        data: {
          conversationId,
          summary: summaryRaw ?? '',
          toneProfiles,
          cachedMessageCount: messages.length,
          analytics: analytics
            ? {
                messagesSent: analytics.messagesSent,
                totalWordsSent: analytics.totalWordsSent,
                avgConfidence: analytics.avgConfidence,
                lastResponseAt: analytics.lastResponseAt?.toISOString() ?? null,
              }
            : null,
          summaryRecord: summaryRecord
            ? {
                summary: summaryRecord.summary,
                currentTopics: summaryRecord.currentTopics,
                overallTone: summaryRecord.overallTone,
                messageCount: summaryRecord.messageCount,
              }
            : null,
          controlledUsers: roles.map((r) => {
            const user = userMap.get(r.userId);
            return {
              userId: r.userId,
              displayName: user?.displayName ?? user?.username ?? r.userId,
              systemLanguage: user?.systemLanguage ?? 'fr',
              confidence: r.confidence,
              locked: r.locked,
            };
          }),
        },
      });
    } catch (error) {
      logError(fastify.log, 'Error fetching live analytics:', error);
      return reply.status(500).send({ success: false, message: 'Erreur serveur' });
    }
  });
}
