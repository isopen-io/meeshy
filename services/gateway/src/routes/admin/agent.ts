import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { listArchetypes, getArchetype } from '@meeshy/shared/agent/archetypes';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { logError } from '../../utils/logger';
import { getCacheStore } from '../../services/CacheStore';
import type { UnifiedAuthRequest } from '../../middleware/auth';

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

const validateObjectId = (id: string, name: string, reply: FastifyReply): boolean => {
  if (!OBJECT_ID_REGEX.test(id)) {
    reply.status(400).send({ success: false, message: `${name} invalide` });
    return false;
  }
  return true;
};

const requireAgentAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  const authContext = (request as UnifiedAuthRequest).authContext;
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
  minWordsPerMessage: z.number().int().min(1).max(200).optional(),
  maxWordsPerMessage: z.number().int().min(10).max(2000).optional(),
  generationTemperature: z.number().min(0).max(2).optional(),
  qualityGateEnabled: z.boolean().optional(),
  qualityGateMinScore: z.number().min(0).max(1).optional(),
  weekdayMaxMessages: z.number().int().min(1).max(100).optional(),
  weekendMaxMessages: z.number().int().min(1).max(200).optional(),
  weekdayMaxUsers: z.number().int().min(1).max(20).optional(),
  weekendMaxUsers: z.number().int().min(1).max(30).optional(),
  burstEnabled: z.boolean().optional(),
  burstSize: z.number().int().min(1).max(10).optional(),
  burstIntervalMinutes: z.number().int().min(1).max(30).optional(),
  quietIntervalMinutes: z.number().int().min(10).max(480).optional(),
  inactivityDaysThreshold: z.number().int().min(1).max(30).optional(),
  prioritizeTaggedUsers: z.boolean().optional(),
  prioritizeRepliedUsers: z.boolean().optional(),
  reactionBoostFactor: z.number().min(0.5).max(5).optional(),
  eligibleConversationTypes: z.array(z.string()).optional(),
  messageFreshnessHours: z.number().int().min(1).max(168).optional(),
  maxConversationsPerCycle: z.number().int().min(0).optional(),
}).refine((data) => {
  if (data.minResponsesPerCycle !== undefined && data.maxResponsesPerCycle !== undefined) {
    return data.minResponsesPerCycle <= data.maxResponsesPerCycle;
  }
  return true;
}, { message: 'minResponsesPerCycle doit être <= maxResponsesPerCycle' }).refine((data) => {
  if (data.minWordsPerMessage !== undefined && data.maxWordsPerMessage !== undefined) {
    return data.minWordsPerMessage <= data.maxWordsPerMessage;
  }
  return true;
}, { message: 'minWordsPerMessage doit être <= maxWordsPerMessage' });

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

// ── Reusable JSON Schema fragments ──────────────────────────────────────────

const objectIdParam = { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } as const;

const conversationIdParams = {
  type: 'object',
  required: ['conversationId'],
  properties: { conversationId: objectIdParam },
} as const;

const conversationUserParams = {
  type: 'object',
  required: ['conversationId', 'userId'],
  properties: { conversationId: objectIdParam, userId: objectIdParam },
} as const;

const successDataResponse = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: { oneOf: [{ type: 'object', additionalProperties: true }, { type: 'null' }] },
  },
} as const;

const successArrayResponse = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: { type: 'array', items: { type: 'object', additionalProperties: true } },
  },
} as const;

const paginatedArrayResponse = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: { type: 'array', items: { type: 'object', additionalProperties: true } },
    pagination: {
      type: 'object',
      additionalProperties: true,
      properties: {
        total: { type: 'integer' },
        page: { type: 'integer' },
        limit: { type: 'integer' },
        hasMore: { type: 'boolean' },
      },
    },
  },
} as const;

const successMessageResponse = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    message: { type: 'string' },
  },
} as const;

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

const securityBearerAuth = [{ bearerAuth: [] }];

const stdErrors = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: errorResponseSchema,
  500: errorResponseSchema,
} as const;

const stdErrorsWithNotFound = {
  ...stdErrors,
  404: errorResponseSchema,
} as const;

// ── Routes ──────────────────────────────────────────────────────────────────

export async function agentAdminRoutes(fastify: FastifyInstance) {
  // GET /stats
  fastify.get('/stats', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
    schema: {
      description: 'Agent statistics: total configs, active configs, roles, archetypes.',
      tags: ['admin-agent'],
      summary: 'Agent stats',
      security: securityBearerAuth,
      response: { 200: successDataResponse, ...stdErrors },
    },
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
    schema: {
      description: 'List all agent conversation configs with pagination.',
      tags: ['admin-agent'],
      summary: 'List agent configs',
      security: securityBearerAuth,
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string', description: 'Page number (default: 1)' },
          limit: { type: 'string', description: 'Items per page (default: 20, max: 100)' },
        },
      },
      response: { 200: paginatedArrayResponse, ...stdErrors },
    },
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
          include: {
            conversation: {
              select: { id: true, title: true, type: true },
            },
          },
        }),
        fastify.prisma.agentConfig.count(),
      ]);

      const conversationIds = configs.map((c) => c.conversationId);
      const allRoles = conversationIds.length > 0
        ? await fastify.prisma.agentUserRole.findMany({
            where: { conversationId: { in: conversationIds } },
            select: { conversationId: true, userId: true },
          })
        : [];

      const rolesByConvId = new Map<string, string[]>();
      for (const role of allRoles) {
        const arr = rolesByConvId.get(role.conversationId) ?? [];
        arr.push(role.userId);
        rolesByConvId.set(role.conversationId, arr);
      }

      const enrichedConfigs = configs.map((c) => ({
        ...c,
        controlledUserIds: rolesByConvId.get(c.conversationId) ?? [],
      }));

      return reply.send({
        success: true,
        data: enrichedConfigs,
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
    schema: {
      description: 'Get a single agent config by conversation ID.',
      tags: ['admin-agent'],
      summary: 'Get agent config',
      security: securityBearerAuth,
      params: conversationIdParams,
      response: { 200: successDataResponse, ...stdErrorsWithNotFound },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { conversationId } = request.params as { conversationId: string };
      if (!validateObjectId(conversationId, 'conversationId', reply)) return;
      const config = await fastify.prisma.agentConfig.findUnique({ where: { conversationId } });
      if (!config) {
        return reply.status(404).send({ success: false, message: 'Config non trouvée' });
      }
      const roles = await fastify.prisma.agentUserRole.findMany({
        where: { conversationId },
        select: { userId: true },
      });
      return reply.send({ success: true, data: { ...config, controlledUserIds: roles.map((r) => r.userId) } });
    } catch (error) {
      logError(fastify.log, 'Error fetching agent config:', error);
      return reply.status(500).send({ success: false, message: 'Erreur serveur' });
    }
  });

  // PUT /configs/:conversationId
  fastify.put('/configs/:conversationId', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
    schema: {
      description: 'Create or update an agent config for a conversation. Publishes config-invalidated event.',
      tags: ['admin-agent'],
      summary: 'Upsert agent config',
      security: securityBearerAuth,
      params: conversationIdParams,
      body: { type: 'object' },
      response: { 200: successDataResponse, ...stdErrors },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { conversationId } = request.params as { conversationId: string };
      if (!validateObjectId(conversationId, 'conversationId', reply)) return;
      const parsed = agentConfigSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, message: 'Données invalides', errors: parsed.error.flatten() });
      }

      const authContext = (request as UnifiedAuthRequest).authContext;
      const config = await fastify.prisma.agentConfig.upsert({
        where: { conversationId },
        create: { conversationId, configuredBy: authContext.registeredUser.id, ...parsed.data },
        update: parsed.data,
      });

      const cache = getCacheStore();
      await cache.publish('agent:config-invalidated', JSON.stringify({ conversationId }));

      return reply.send({ success: true, data: config });
    } catch (error) {
      logError(fastify.log, 'Error upserting agent config:', error);
      return reply.status(500).send({ success: false, message: 'Erreur serveur' });
    }
  });

  // DELETE /configs/:conversationId
  fastify.delete('/configs/:conversationId', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
    schema: {
      description: 'Delete an agent config for a conversation.',
      tags: ['admin-agent'],
      summary: 'Delete agent config',
      security: securityBearerAuth,
      params: conversationIdParams,
      response: { 200: successMessageResponse, ...stdErrorsWithNotFound },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { conversationId } = request.params as { conversationId: string };
      if (!validateObjectId(conversationId, 'conversationId', reply)) return;
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
    schema: {
      description: 'List all agent user roles for a conversation.',
      tags: ['admin-agent'],
      summary: 'List conversation roles',
      security: securityBearerAuth,
      params: conversationIdParams,
      response: { 200: successArrayResponse, ...stdErrors },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { conversationId } = request.params as { conversationId: string };
      if (!validateObjectId(conversationId, 'conversationId', reply)) return;
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
    schema: {
      description: 'Assign an archetype to a user role in a conversation.',
      tags: ['admin-agent'],
      summary: 'Assign archetype to role',
      security: securityBearerAuth,
      params: conversationUserParams,
      body: {
        type: 'object',
        required: ['archetypeId'],
        properties: { archetypeId: { type: 'string', minLength: 1 } },
      },
      response: { 200: successDataResponse, ...stdErrorsWithNotFound },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { conversationId, userId } = request.params as { conversationId: string; userId: string };
      if (!validateObjectId(conversationId, 'conversationId', reply)) return;
      if (!validateObjectId(userId, 'userId', reply)) return;
      const assignBody = z.object({ archetypeId: z.string().min(1) }).safeParse(request.body);
      if (!assignBody.success) {
        return reply.status(400).send({ success: false, message: 'archetypeId requis' });
      }
      const { archetypeId } = assignBody.data;

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
    schema: {
      description: 'Unlock a user role, resetting confidence to 0 to allow re-observation.',
      tags: ['admin-agent'],
      summary: 'Unlock user role',
      security: securityBearerAuth,
      params: conversationUserParams,
      response: { 200: successDataResponse, ...stdErrorsWithNotFound },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { conversationId, userId } = request.params as { conversationId: string; userId: string };
      if (!validateObjectId(conversationId, 'conversationId', reply)) return;
      if (!validateObjectId(userId, 'userId', reply)) return;
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
    schema: {
      description: 'List all available agent archetypes (hardcoded catalogue).',
      tags: ['admin-agent'],
      summary: 'List archetypes',
      security: securityBearerAuth,
      response: { 200: successArrayResponse, ...stdErrors },
    },
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ success: true, data: listArchetypes() });
  });

  // GET /llm
  fastify.get('/llm', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
    schema: {
      description: 'Get the current LLM provider config. Sensitive keys are redacted (hasApiKey flag instead).',
      tags: ['admin-agent'],
      summary: 'Get LLM config',
      security: securityBearerAuth,
      response: { 200: successDataResponse, ...stdErrors },
    },
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
    schema: {
      description: 'Create or update the LLM provider config (provider, model, API key, budget).',
      tags: ['admin-agent'],
      summary: 'Update LLM config',
      security: securityBearerAuth,
      body: { type: 'object' },
      response: { 200: successDataResponse, ...stdErrors },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const parsed = llmConfigSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, message: 'Données invalides', errors: parsed.error.flatten() });
      }

      const authContext = (request as UnifiedAuthRequest).authContext;
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
      ];
      const cooldownKeys = await cache.keys(`agent:cooldown:${conversationId}:*`);
      keysToDelete.push(...cooldownKeys);

      let redisKeysDeleted = 0;
      for (const key of keysToDelete) {
        await cache.del(key);
        redisKeysDeleted++;
      }

      return reply.send({
        success: true,
        data: {
          conversationId,
          deleted: {
            configs: config.count,
            roles: roles.count,
            summaries: summary.count,
            analytics: analytic.count,
            redisKeys: redisKeysDeleted,
          },
        },
        message: 'Reset conversation effectué',
      });
    } catch (error) {
      logError(fastify.log, 'Error during conversation reset:', error);
      return reply.status(500).send({ success: false, message: 'Erreur lors du reset conversation' });
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

      return reply.send({
        success: true,
        data: {
          userId,
          deleted: {
            roles: roles.count,
            globalProfiles: globalProfile.count,
            redisProfilesCleaned: profilesCleaned,
            cooldownsCleared: cooldownKeys.length,
          },
        },
        message: 'Reset utilisateur effectué',
      });
    } catch (error) {
      logError(fastify.log, 'Error during user reset:', error);
      return reply.status(500).send({ success: false, message: 'Erreur lors du reset utilisateur' });
    }
  });

  // DELETE /reset
  fastify.delete('/reset', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
    schema: {
      description: 'Nuclear reset: delete ALL agent configs, roles, summaries, analytics, global profiles and Redis cache.',
      tags: ['admin-agent'],
      summary: 'Reset all agent data',
      security: securityBearerAuth,
      response: { 200: resetResultResponse, ...stdErrors },
    },
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
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
    schema: {
      description: 'Get the conversation summary generated by the agent.',
      tags: ['admin-agent'],
      summary: 'Get conversation summary',
      security: securityBearerAuth,
      params: conversationIdParams,
      response: { 200: successDataResponse, ...stdErrorsWithNotFound },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { conversationId } = request.params as { conversationId: string };
      if (!validateObjectId(conversationId, 'conversationId', reply)) return;
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
    schema: {
      description: 'Get live agent state for a conversation: Redis cache, tone profiles, analytics, summary, controlled users.',
      tags: ['admin-agent'],
      summary: 'Get live agent state',
      security: securityBearerAuth,
      params: conversationIdParams,
      response: { 200: successDataResponse, ...stdErrors },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { conversationId } = request.params as { conversationId: string };
      if (!validateObjectId(conversationId, 'conversationId', reply)) return;
      const cache = getCacheStore();

      const [profilesRaw, summaryRaw, messagesRaw, analytics, summaryRecord, roles] = await Promise.all([
        cache.get(`agent:profiles:${conversationId}`),
        cache.get(`agent:summary:${conversationId}`),
        cache.get(`agent:messages:${conversationId}`),
        fastify.prisma.agentAnalytic.findUnique({ where: { conversationId } }),
        fastify.prisma.agentConversationSummary.findUnique({ where: { conversationId } }),
        fastify.prisma.agentUserRole.findMany({
          where: { conversationId },
          select: { userId: true, confidence: true, locked: true },
        }),
      ]);

      const toneProfiles = profilesRaw ? JSON.parse(profilesRaw) : {};
      const messages = messagesRaw ? JSON.parse(messagesRaw) : [];

      type LiveUser = { id: string; displayName: string | null; username: string | null; systemLanguage: string | null };
      const userIds = roles.map((r) => r.userId);
      const users: LiveUser[] = userIds.length > 0
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

  const globalConfigSchema = z.object({
    systemPrompt: z.string().max(10000).optional(),
    enabled: z.boolean().optional(),
    defaultProvider: z.enum(['openai', 'anthropic']).optional(),
    defaultModel: z.string().min(1).optional(),
    fallbackProvider: z.string().nullable().optional(),
    fallbackModel: z.string().nullable().optional(),
    globalDailyBudgetUsd: z.number().min(0).max(1000).optional(),
    maxConcurrentCalls: z.number().int().min(1).max(50).optional(),
    eligibleConversationTypes: z.array(z.string()).optional(),
    messageFreshnessHours: z.number().int().min(1).max(168).optional(),
    maxConversationsPerCycle: z.number().int().min(0).optional(),
  });

  // GET /global-config
  fastify.get('/global-config', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
    schema: {
      description: 'Get the global agent configuration (system prompt, provider defaults, budget).',
      tags: ['admin-agent'],
      summary: 'Get global agent config',
      security: securityBearerAuth,
      response: { 200: successDataResponse, ...stdErrors },
    },
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      let config = await fastify.prisma.agentGlobalConfig.findFirst({ orderBy: { updatedAt: 'desc' } });
      if (!config) {
        config = await fastify.prisma.agentGlobalConfig.create({ data: {} });
      }
      return reply.send({ success: true, data: config });
    } catch (error) {
      logError(fastify.log, 'Error fetching global agent config:', error);
      return reply.status(500).send({ success: false, message: 'Erreur serveur' });
    }
  });

  // PUT /global-config
  fastify.put('/global-config', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
    schema: {
      description: 'Update the global agent configuration. Publishes config-invalidated event.',
      tags: ['admin-agent'],
      summary: 'Update global agent config',
      security: securityBearerAuth,
      body: { type: 'object' },
      response: { 200: successDataResponse, ...stdErrors },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const parsed = globalConfigSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ success: false, message: 'Données invalides', errors: parsed.error.flatten() });
      }

      let existing = await fastify.prisma.agentGlobalConfig.findFirst({ orderBy: { updatedAt: 'desc' } });
      let config;
      if (existing) {
        config = await fastify.prisma.agentGlobalConfig.update({
          where: { id: existing.id },
          data: parsed.data,
        });
      } else {
        config = await fastify.prisma.agentGlobalConfig.create({ data: parsed.data });
      }

      const cache = getCacheStore();
      await cache.publish('agent:config-invalidated', JSON.stringify({ global: true }));

      return reply.send({ success: true, data: config });
    } catch (error) {
      logError(fastify.log, 'Error upserting global agent config:', error);
      return reply.status(500).send({ success: false, message: 'Erreur serveur' });
    }
  });
}
