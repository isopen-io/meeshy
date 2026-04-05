import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { listArchetypes, getArchetype } from '@meeshy/shared/agent/archetypes';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { logError } from '../../utils/logger';
import { getCacheStore } from '../../services/CacheStore';
import { sendSuccess, sendError, sendBadRequest, sendNotFound, sendInternalError } from '../../utils/response';
import { AgentHttpClient, AgentUnavailableError } from '../../services/AgentHttpClient';
import type { UnifiedAuthRequest } from '../../middleware/auth';

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

const validateObjectId = (id: string, name: string, reply: FastifyReply): boolean => {
  if (!OBJECT_ID_REGEX.test(id)) {
    sendBadRequest(reply, `${name} invalide`);
    return false;
  }
  return true;
};

const requireAgentAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  const authContext = (request as UnifiedAuthRequest).authContext;
  if (!authContext?.isAuthenticated || !authContext.registeredUser) {
    sendError(reply, 401, 'Authentification requise');
    return;
  }
  if (!['BIGBOSS', 'ADMIN'].includes(authContext.registeredUser.role)) {
    sendError(reply, 403, 'Permission insuffisante');
    return;
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
  globalScanEnabled: z.boolean().optional(),
  globalScanMinInterval: z.number().int().min(1).optional(),
  globalScanMaxInterval: z.number().int().min(1).optional(),
  minDelayMinutes: z.number().int().min(1).max(1440).optional(),
  maxDelayMinutes: z.number().int().min(1).max(1440).optional(),
  spreadOverDayEnabled: z.boolean().optional(),
  maxMessagesPerUserPer10Min: z.number().int().min(1).max(20).optional(),
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
}, { message: 'minWordsPerMessage doit être <= maxWordsPerMessage' }).refine((data) => {
  if (data.minDelayMinutes !== undefined && data.maxDelayMinutes !== undefined) {
    return data.minDelayMinutes <= data.maxDelayMinutes;
  }
  return true;
}, { message: 'minDelayMinutes doit être <= maxDelayMinutes' });

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
      const [configsCount, activeCount, rolesCount, uniqueControlledUsers, analyticsAgg] = await Promise.all([
        fastify.prisma.agentConfig.count(),
        fastify.prisma.agentConfig.count({ where: { enabled: true } }),
        fastify.prisma.agentUserRole.count(),
        fastify.prisma.agentUserRole.findMany({ select: { userId: true }, distinct: ['userId'] }),
        fastify.prisma.agentAnalytic.aggregate({
          _sum: { messagesSent: true, totalWordsSent: true },
          _avg: { avgConfidence: true },
        }),
      ]);

      const recentAnalytics = await fastify.prisma.agentAnalytic.findMany({
        where: { lastResponseAt: { not: null } },
        orderBy: { lastResponseAt: 'desc' },
        take: 10,
        include: {
          conversation: { select: { id: true, title: true, type: true } },
        },
      });

      return reply.send({
        success: true,
        data: {
          totalConfigs: configsCount,
          activeConfigs: activeCount,
          totalRoles: rolesCount,
          totalArchetypes: listArchetypes().length,
          totalControlledUsers: uniqueControlledUsers.length,
          totalMessagesSent: analyticsAgg._sum.messagesSent ?? 0,
          totalWordsSent: analyticsAgg._sum.totalWordsSent ?? 0,
          avgConfidence: analyticsAgg._avg.avgConfidence ?? 0,
          recentActivity: recentAnalytics.map((a) => ({
            conversationId: a.conversationId,
            conversation: a.conversation
              ? { id: a.conversation.id, title: a.conversation.title, type: a.conversation.type }
              : null,
            messagesSent: a.messagesSent,
            totalWordsSent: a.totalWordsSent,
            avgConfidence: a.avgConfidence,
            lastResponseAt: a.lastResponseAt?.toISOString() ?? null,
          })),
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
      description: 'List all conversations with agent activity (configs, roles, or analytics) with pagination.',
      tags: ['admin-agent'],
      summary: 'List agent configs',
      security: securityBearerAuth,
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'string', description: 'Page number (default: 1)' },
          limit: { type: 'string', description: 'Items per page (default: 20, max: 100)' },
          search: { type: 'string', description: 'Filter by conversation title' },
        },
      },
      response: { 200: paginatedArrayResponse, ...stdErrors },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { page = '1', limit = '20', search } = request.query as { page?: string; limit?: string; search?: string };
      const pageNum = Math.max(1, parseInt(page, 10));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
      const skip = (pageNum - 1) * limitNum;

      // Collect ALL conversationIds with any agent activity
      const [configConvIds, roleConvIds, analyticConvIds] = await Promise.all([
        fastify.prisma.agentConfig.findMany({ select: { conversationId: true } }),
        fastify.prisma.agentUserRole.findMany({ select: { conversationId: true }, distinct: ['conversationId'] }),
        fastify.prisma.agentAnalytic.findMany({ select: { conversationId: true } }),
      ]);

      const allConvIds = [...new Set([
        ...configConvIds.map((c) => c.conversationId),
        ...roleConvIds.map((r) => r.conversationId),
        ...analyticConvIds.map((a) => a.conversationId),
      ])];

      if (allConvIds.length === 0) {
        return reply.send({ success: true, data: [], pagination: { total: 0, page: pageNum, limit: limitNum, hasMore: false } });
      }

      // Fetch conversations (with optional search filter)
      const conversationWhere = {
        id: { in: allConvIds },
        ...(search ? { title: { contains: search, mode: 'insensitive' as const } } : {}),
      };
      const [conversations, total] = await Promise.all([
        fastify.prisma.conversation.findMany({
          where: conversationWhere,
          select: { id: true, title: true, type: true },
          orderBy: { lastMessageAt: 'desc' },
          skip,
          take: limitNum,
        }),
        fastify.prisma.conversation.count({ where: conversationWhere }),
      ]);

      const pageConvIds = conversations.map((c) => c.id);
      const convMap = new Map(conversations.map((c) => [c.id, c]));

      // Fetch configs, roles, analytics for this page
      const [configs, allRoles, allAnalytics] = await Promise.all([
        fastify.prisma.agentConfig.findMany({
          where: { conversationId: { in: pageConvIds } },
        }),
        fastify.prisma.agentUserRole.findMany({
          where: { conversationId: { in: pageConvIds } },
          select: { conversationId: true, userId: true },
        }),
        fastify.prisma.agentAnalytic.findMany({
          where: { conversationId: { in: pageConvIds } },
          select: { conversationId: true, messagesSent: true, totalWordsSent: true, avgConfidence: true, lastResponseAt: true },
        }),
      ]);

      const configByConvId = new Map(configs.map((c) => [c.conversationId, c]));
      const rolesByConvId = new Map<string, string[]>();
      for (const role of allRoles) {
        const arr = rolesByConvId.get(role.conversationId) ?? [];
        arr.push(role.userId);
        rolesByConvId.set(role.conversationId, arr);
      }
      const analyticsByConvId = new Map(allAnalytics.map((a) => [a.conversationId, a]));

      const enrichedConfigs = pageConvIds.map((convId) => {
        const config = configByConvId.get(convId);
        const analytics = analyticsByConvId.get(convId);
        const roleUserIds = rolesByConvId.get(convId) ?? [];
        const manualIds = ((config?.manualUserIds ?? []) as string[]);
        const mergedUserIds = [...new Set([...roleUserIds, ...manualIds])];

        return {
          id: config?.id ?? convId,
          conversationId: convId,
          conversation: convMap.get(convId) ?? null,
          enabled: config?.enabled ?? false,
          configuredBy: config?.configuredBy ?? null,
          agentType: config?.agentType ?? 'personal',
          autoPickupEnabled: config?.autoPickupEnabled ?? true,
          inactivityThresholdHours: config?.inactivityThresholdHours ?? 72,
          maxControlledUsers: config?.maxControlledUsers ?? 5,
          manualUserIds: manualIds,
          excludedRoles: config?.excludedRoles ?? [],
          excludedUserIds: (config?.excludedUserIds ?? []) as string[],
          triggerOnTimeout: config?.triggerOnTimeout ?? true,
          timeoutSeconds: config?.timeoutSeconds ?? 300,
          triggerOnUserMessage: config?.triggerOnUserMessage ?? false,
          triggerFromUserIds: (config?.triggerFromUserIds ?? []) as string[],
          triggerOnReplyTo: config?.triggerOnReplyTo ?? true,
          contextWindowSize: config?.contextWindowSize ?? 50,
          useFullHistory: config?.useFullHistory ?? false,
          scanIntervalMinutes: config?.scanIntervalMinutes ?? 3,
          minResponsesPerCycle: config?.minResponsesPerCycle ?? 2,
          maxResponsesPerCycle: config?.maxResponsesPerCycle ?? 12,
          reactionsEnabled: config?.reactionsEnabled ?? true,
          maxReactionsPerCycle: config?.maxReactionsPerCycle ?? 8,
          agentInstructions: config?.agentInstructions ?? null,
          webSearchEnabled: config?.webSearchEnabled ?? true,
          minWordsPerMessage: config?.minWordsPerMessage ?? 3,
          maxWordsPerMessage: config?.maxWordsPerMessage ?? 400,
          minHistoricalMessages: config?.minHistoricalMessages ?? 0,
          generationTemperature: config?.generationTemperature ?? 0.8,
          qualityGateEnabled: config?.qualityGateEnabled ?? true,
          qualityGateMinScore: config?.qualityGateMinScore ?? 0.5,
          weekdayMaxMessages: config?.weekdayMaxMessages ?? 10,
          weekendMaxMessages: config?.weekendMaxMessages ?? 25,
          weekdayMaxUsers: config?.weekdayMaxUsers ?? 4,
          weekendMaxUsers: config?.weekendMaxUsers ?? 6,
          burstEnabled: config?.burstEnabled ?? true,
          burstSize: config?.burstSize ?? 4,
          burstIntervalMinutes: config?.burstIntervalMinutes ?? 5,
          quietIntervalMinutes: config?.quietIntervalMinutes ?? 90,
          inactivityDaysThreshold: config?.inactivityDaysThreshold ?? 3,
          prioritizeTaggedUsers: config?.prioritizeTaggedUsers ?? true,
          prioritizeRepliedUsers: config?.prioritizeRepliedUsers ?? true,
          reactionBoostFactor: config?.reactionBoostFactor ?? 1.5,
          minDelayMinutes: config?.minDelayMinutes ?? null,
          maxDelayMinutes: config?.maxDelayMinutes ?? null,
          spreadOverDayEnabled: config?.spreadOverDayEnabled ?? true,
          maxMessagesPerUserPer10Min: config?.maxMessagesPerUserPer10Min ?? null,
          createdAt: config?.createdAt ?? null,
          updatedAt: config?.updatedAt ?? null,
          isScanning: config?.isScanning ?? false,
          currentNode: config?.currentNode ?? null,
          controlledUserIds: mergedUserIds,
          analytics: analytics
            ? {
                messagesSent: analytics.messagesSent,
                totalWordsSent: analytics.totalWordsSent,
                avgConfidence: analytics.avgConfidence,
                lastResponseAt: analytics.lastResponseAt?.toISOString() ?? null,
              }
            : null,
        };
      });

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
      const roleUserIds = roles.map((r) => r.userId);
      const manualIds = (config.manualUserIds ?? []) as string[];
      const mergedUserIds = [...new Set([...roleUserIds, ...manualIds])];
      return reply.send({ success: true, data: { ...config, controlledUserIds: mergedUserIds } });
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

      // Sync manualUserIds → AgentUserRole so they appear in admin lists
      // and the scanner can pick them up immediately.
      const manualIds = parsed.data.manualUserIds;
      if (manualIds && manualIds.length > 0) {
        const users = await fastify.prisma.user.findMany({
          where: { id: { in: manualIds } },
          select: { id: true, displayName: true, username: true, agentGlobalProfile: true },
        });

        for (const u of users) {
          const gp = u.agentGlobalProfile;
          await fastify.prisma.agentUserRole.upsert({
            where: { userId_conversationId: { userId: u.id, conversationId } },
            create: {
              userId: u.id,
              conversationId,
              origin: gp ? 'observed' : 'archetype',
              personaSummary: gp?.personaSummary ?? '',
              tone: gp?.tone ?? 'neutre',
              vocabularyLevel: gp?.vocabularyLevel ?? 'courant',
              typicalLength: gp?.typicalLength ?? 'moyen',
              emojiUsage: gp?.emojiUsage ?? 'occasionnel',
              topicsOfExpertise: gp?.topicsOfExpertise ?? [],
              topicsAvoided: gp?.topicsAvoided ?? [],
              relationshipMap: {},
              catchphrases: gp?.catchphrases ?? [],
              responseTriggers: [],
              silenceTriggers: [],
              commonEmojis: gp?.commonEmojis ?? [],
              reactionPatterns: gp?.reactionPatterns ?? [],
              messagesAnalyzed: gp?.messagesAnalyzed ?? 0,
              confidence: gp?.confidence ?? 0.1,
              locked: false,
            },
            update: {},
          });
        }
      }

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

      const [profilesRaw, summaryRaw, messagesRaw, analytics, summaryRecord, roles, agentConfig] = await Promise.all([
        cache.get(`agent:profiles:${conversationId}`),
        cache.get(`agent:summary:${conversationId}`),
        cache.get(`agent:messages:${conversationId}`),
        fastify.prisma.agentAnalytic.findUnique({ where: { conversationId } }),
        fastify.prisma.agentConversationSummary.findUnique({ where: { conversationId } }),
        fastify.prisma.agentUserRole.findMany({
          where: { conversationId },
          select: { userId: true, confidence: true, locked: true },
        }),
        fastify.prisma.agentConfig.findUnique({
          where: { conversationId },
          select: { isScanning: true, currentNode: true },
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
          isScanning: agentConfig?.isScanning ?? false,
          currentNode: agentConfig?.currentNode ?? null,
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

  // GET /recent-activity
  fastify.get('/recent-activity', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
    schema: {
      description: 'List conversations with recent agent activity, ordered by last response. Used for Live tab quick access.',
      tags: ['admin-agent'],
      summary: 'Recent agent activity',
      security: securityBearerAuth,
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'string', description: 'Max items (default: 20, max: 50)' },
          search: { type: 'string', description: 'Filter by conversation title' },
        },
      },
      response: { 200: successArrayResponse, ...stdErrors },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { limit = '20', search } = request.query as { limit?: string; search?: string };
      const limitNum = Math.min(50, Math.max(1, parseInt(limit, 10)));

      const analytics = await fastify.prisma.agentAnalytic.findMany({
        where: {
          lastResponseAt: { not: null },
          ...(search ? {
            conversation: { title: { contains: search, mode: 'insensitive' as const } },
          } : {}),
        },
        orderBy: { lastResponseAt: 'desc' },
        take: limitNum,
        include: {
          conversation: {
            select: { id: true, title: true, type: true },
          },
        },
      });

      const conversationIds = analytics.map((a) => a.conversationId);

      type ConfigSelect = { conversationId: string; enabled: boolean };
      const configs: ConfigSelect[] = conversationIds.length > 0
        ? await fastify.prisma.agentConfig.findMany({
            where: { conversationId: { in: conversationIds } },
            select: { conversationId: true, enabled: true },
          })
        : [];

      const roles = conversationIds.length > 0
        ? await fastify.prisma.agentUserRole.findMany({
            where: { conversationId: { in: conversationIds } },
            select: { conversationId: true, userId: true, confidence: true, locked: true },
          })
        : [];

      const configByConvId = new Map(configs.map((c) => [c.conversationId, c]));
      type RoleEntry = (typeof roles)[number];
      const rolesByConvId = new Map<string, RoleEntry[]>();
      for (const role of roles) {
        const arr = rolesByConvId.get(role.conversationId) ?? [];
        arr.push(role);
        rolesByConvId.set(role.conversationId, arr);
      }

      const result = analytics.map((a) => {
        const config = configByConvId.get(a.conversationId);
        const convRoles = rolesByConvId.get(a.conversationId) ?? [];
        return {
          conversationId: a.conversationId,
          conversation: a.conversation
            ? { id: a.conversation.id, title: a.conversation.title, type: a.conversation.type }
            : null,
          enabled: config?.enabled ?? false,
          messagesSent: a.messagesSent,
          totalWordsSent: a.totalWordsSent,
          avgConfidence: a.avgConfidence,
          lastResponseAt: a.lastResponseAt?.toISOString() ?? null,
          controlledUserIds: convRoles.map((r) => r.userId),
          controlledUsersCount: convRoles.length,
        };
      });

      return reply.send({ success: true, data: result });
    } catch (error) {
      logError(fastify.log, 'Error fetching recent activity:', error);
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
    weekdayMaxConversations: z.number().int().min(1).max(500).optional(),
    weekendMaxConversations: z.number().int().min(1).max(500).optional(),
    globalScanEnabled: z.boolean().optional(),
    globalScanMinInterval: z.number().int().min(1).optional(),
    globalScanMaxInterval: z.number().int().min(1).optional(),
  });

  // GET /configs/:conversationId/schedule
  fastify.get('/configs/:conversationId/schedule', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
    schema: {
      description: 'Get the 24h scan schedule, budget usage and burst cooldown for a conversation.',
      tags: ['admin-agent'],
      summary: 'Get conversation scan schedule',
      security: securityBearerAuth,
      params: conversationIdParams,
      response: { 200: successDataResponse, ...stdErrorsWithNotFound },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { conversationId } = request.params as { conversationId: string };
      if (!validateObjectId(conversationId, 'conversationId', reply)) return;

      const config = await fastify.prisma.agentConfig.findUnique({ where: { conversationId } });
      if (!config) return sendNotFound(reply, 'Config non trouvée');

      const cache = getCacheStore();
      const now = Date.now();
      const date = new Date().toISOString().slice(0, 10);
      const isWknd = [0, 6].includes(new Date().getUTCDay());

      const [lastScanRaw, budgetRaw, usersCount, lastBurstRaw] = await Promise.all([
        cache.get(`agent:last-scan:${conversationId}`),
        cache.get(`agent:budget:${conversationId}:${date}`),
        cache.get(`agent:budget:${conversationId}:${date}:users`),
        cache.get(`agent:budget:${conversationId}:last-burst`),
      ]);

      const lastScan = parseInt(lastScanRaw ?? '0', 10);
      const intervalMs = (config.scanIntervalMinutes ?? 3) * 60_000;
      const nextScan = lastScan === 0 ? now : lastScan + intervalMs;

      const upcomingScans: number[] = [];
      const horizon = now + 24 * 60 * 60 * 1000;
      let cursor = nextScan <= now ? now + intervalMs : nextScan;
      while (cursor <= horizon && upcomingScans.length < 200) {
        upcomingScans.push(cursor);
        cursor += intervalMs;
      }

      const maxMessages = isWknd
        ? (config.weekendMaxMessages ?? 25)
        : (config.weekdayMaxMessages ?? 10);
      const messagesUsed = parseInt(budgetRaw ?? '0', 10);

      const lastBurst = parseInt(lastBurstRaw ?? '0', 10);
      const cooldownMs = (config.quietIntervalMinutes ?? 90) * 60_000;
      const burstCooldownEndsAt = lastBurst > 0 ? lastBurst + cooldownMs : 0;

      return sendSuccess(reply, {
        conversationId,
        scanIntervalMinutes: config.scanIntervalMinutes ?? 3,
        lastScan,
        nextScan: Math.max(nextScan, now),
        upcomingScans,
        budget: {
          messagesUsed,
          messagesMax: maxMessages,
          remaining: Math.max(0, maxMessages - messagesUsed),
          isWeekend: isWknd,
        },
        burst: {
          enabled: config.burstEnabled ?? true,
          lastBurst,
          cooldownEndsAt: burstCooldownEndsAt,
          cooldownActive: burstCooldownEndsAt > now,
          quietIntervalMinutes: config.quietIntervalMinutes ?? 90,
        },
        delay: {
          minDelayMinutes: config.minDelayMinutes ?? null,
          maxDelayMinutes: config.maxDelayMinutes ?? null,
          spreadOverDayEnabled: config.spreadOverDayEnabled ?? true,
          maxMessagesPerUserPer10Min: config.maxMessagesPerUserPer10Min ?? null,
        },
      });
    } catch (error) {
      logError(fastify.log, 'Error fetching schedule:', error);
      return sendInternalError(reply, 'Erreur serveur');
    }
  });

  // POST /configs/:conversationId/stop
  fastify.post('/configs/:conversationId/stop', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
    schema: {
      description: 'Stop an ongoing scan for a conversation.',
      tags: ['admin-agent'],
      summary: 'Stop scan',
      security: securityBearerAuth,
      params: conversationIdParams,
      response: { 200: successDataResponse, ...stdErrorsWithNotFound },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const client = ensureAgentClient(reply);
    if (!client) return;

    try {
      const { conversationId } = request.params as { conversationId: string };
      if (!validateObjectId(conversationId, 'conversationId', reply)) return;

      await client.stopScan(conversationId);
      return sendSuccess(reply, { conversationId, stopped: true });
    } catch (error) {
      if (error instanceof AgentUnavailableError) {
        return sendError(reply, 502, 'Agent service unavailable');
      }
      logError(fastify.log, 'Error stopping scan:', error);
      return sendInternalError(reply, 'Erreur serveur');
    }
  });

  // POST /configs/:conversationId/trigger
  fastify.post('/configs/:conversationId/trigger', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
    schema: {
      description: 'Trigger an immediate scan for a conversation by resetting lastScan and publishing a trigger event.',
      tags: ['admin-agent'],
      summary: 'Trigger immediate scan',
      security: securityBearerAuth,
      params: conversationIdParams,
      response: { 200: successDataResponse, ...stdErrorsWithNotFound },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { conversationId } = request.params as { conversationId: string };
      if (!validateObjectId(conversationId, 'conversationId', reply)) return;

      const config = await fastify.prisma.agentConfig.findUnique({ where: { conversationId } });
      if (!config) return sendNotFound(reply, 'Config non trouvée');

      const cache = getCacheStore();
      await cache.set(`agent:last-scan:${conversationId}`, '0', 86400);
      await cache.publish('agent:trigger-scan', JSON.stringify({ conversationId }));

      return sendSuccess(reply, {
        conversationId,
        triggered: true,
        triggeredAt: Date.now(),
      });
    } catch (error) {
      logError(fastify.log, 'Error triggering scan:', error);
      return sendInternalError(reply, 'Erreur serveur');
    }
  });

  // GET /configs/:conversationId/messages
  fastify.get('/configs/:conversationId/messages', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
    schema: {
      description: 'List messages sent by the agent in a conversation.',
      tags: ['admin-agent'],
      summary: 'List agent messages',
      security: securityBearerAuth,
      params: conversationIdParams,
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', default: 1 },
          limit: { type: 'integer', default: 20 },
        },
      },
      response: { 200: paginatedArrayResponse, ...stdErrorsWithNotFound },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { conversationId } = request.params as { conversationId: string };
      if (!validateObjectId(conversationId, 'conversationId', reply)) return;

      const { page = 1, limit = 20 } = request.query as { page?: number; limit?: number };
      const limitNum = Math.min(Math.max(1, Number(limit)), 50);
      const skip = (Math.max(1, Number(page)) - 1) * limitNum;

      const config = await fastify.prisma.agentConfig.findUnique({ where: { conversationId } });
      if (!config) return sendNotFound(reply, 'Config non trouvée');

      const where = { conversationId, messageSource: 'agent' as const };

      const [messages, total] = await Promise.all([
        fastify.prisma.message.findMany({
          where,
          select: {
            id: true,
            content: true,
            createdAt: true,
            senderId: true,
            originalLanguage: true,
            replyToId: true,
            sender: { select: { id: true, displayName: true, avatar: true, user: { select: { username: true } } } },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limitNum,
        }),
        fastify.prisma.message.count({ where }),
      ]);

      return reply.send({
        success: true,
        data: messages,
        pagination: { total, page: Math.max(1, Number(page)), limit: limitNum, hasMore: skip + limitNum < total },
      });
    } catch (error) {
      logError(fastify.log, 'Error fetching agent messages:', error);
      return sendInternalError(reply, 'Erreur serveur');
    }
  });

  // GET /scan-logs
  fastify.get('/scan-logs', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
    schema: {
      description: 'List scan logs with pagination and filters.',
      tags: ['admin-agent'],
      summary: 'List scan logs',
      security: securityBearerAuth,
      querystring: {
        type: 'object',
        properties: {
          page: { type: 'integer', default: 1 },
          limit: { type: 'integer', default: 20 },
          conversationId: { type: 'string' },
          trigger: { type: 'string' },
          outcome: { type: 'string' },
          from: { type: 'string' },
          to: { type: 'string' },
        },
      },
      response: { 200: paginatedArrayResponse, ...stdErrors },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { page = 1, limit = 20, conversationId, trigger, outcome, from, to } = request.query as {
        page?: number; limit?: number; conversationId?: string; trigger?: string; outcome?: string; from?: string; to?: string;
      };

      const where: Record<string, unknown> = {};
      if (conversationId) where.conversationId = conversationId;
      if (trigger) where.trigger = trigger;
      if (outcome) where.outcome = outcome;
      if (from || to) {
        where.startedAt = {};
        if (from) (where.startedAt as Record<string, unknown>).gte = new Date(from);
        if (to) (where.startedAt as Record<string, unknown>).lte = new Date(to);
      }

      const [logs, total] = await Promise.all([
        fastify.prisma.agentScanLog.findMany({
          where,
          orderBy: { startedAt: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true, conversationId: true, trigger: true, startedAt: true,
            durationMs: true, outcome: true, messagesSent: true, reactionsSent: true,
            messagesRejected: true, userIdsUsed: true, totalInputTokens: true,
            totalOutputTokens: true, estimatedCostUsd: true,
            conversation: { select: { id: true, title: true, type: true } },
          },
        }),
        fastify.prisma.agentScanLog.count({ where }),
      ]);

      return reply.send({
        success: true, data: logs,
        pagination: { total, page, limit, hasMore: page * limit < total },
      });
    } catch (error) {
      logError(fastify.log, 'Error fetching scan logs:', error);
      return sendInternalError(reply, 'Erreur serveur');
    }
  });

  // GET /scan-logs/stats
  fastify.get('/scan-logs/stats', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
    schema: {
      description: 'Get aggregated scan stats for charting (daily/weekly buckets over N months).',
      tags: ['admin-agent'],
      summary: 'Get scan stats for chart',
      security: securityBearerAuth,
      querystring: {
        type: 'object',
        properties: {
          conversationId: { type: 'string' },
          months: { type: 'integer', default: 6 },
          bucket: { type: 'string', default: 'day' },
        },
      },
      response: { 200: successDataResponse, ...stdErrors },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { conversationId, months = 6, bucket = 'day' } = request.query as {
        conversationId?: string; months?: number; bucket?: 'day' | 'week';
      };

      const since = new Date();
      since.setMonth(since.getMonth() - months);

      const where: Record<string, unknown> = { startedAt: { gte: since } };
      if (conversationId) where.conversationId = conversationId;

      const logs = await fastify.prisma.agentScanLog.findMany({
        where,
        select: {
          startedAt: true, conversationId: true, outcome: true,
          messagesSent: true, reactionsSent: true, userIdsUsed: true,
          estimatedCostUsd: true, configChangedAt: true,
        },
        orderBy: { startedAt: 'asc' },
      });

      const buckets = new Map<string, {
        date: string; scans: number; conversations: Set<string>; users: Set<string>;
        messagesSent: number; reactionsSent: number; costUsd: number;
        configChanges: number; outcomes: Record<string, number>;
      }>();

      for (const log of logs) {
        const d = log.startedAt;
        let key: string;
        if (bucket === 'week') {
          const weekStart = new Date(d);
          weekStart.setDate(weekStart.getDate() - weekStart.getDay());
          key = weekStart.toISOString().slice(0, 10);
        } else {
          key = d.toISOString().slice(0, 10);
        }

        let b = buckets.get(key);
        if (!b) {
          b = { date: key, scans: 0, conversations: new Set(), users: new Set(), messagesSent: 0, reactionsSent: 0, costUsd: 0, configChanges: 0, outcomes: {} };
          buckets.set(key, b);
        }
        b.scans++;
        b.conversations.add(log.conversationId);
        for (const uid of log.userIdsUsed) b.users.add(uid);
        b.messagesSent += log.messagesSent;
        b.reactionsSent += log.reactionsSent;
        b.costUsd += log.estimatedCostUsd;
        if (log.configChangedAt) b.configChanges++;
        b.outcomes[log.outcome] = (b.outcomes[log.outcome] ?? 0) + 1;
      }

      const data = [...buckets.values()].map(b => ({
        date: b.date, scans: b.scans, conversations: b.conversations.size,
        users: b.users.size, messagesSent: b.messagesSent, reactionsSent: b.reactionsSent,
        costUsd: Math.round(b.costUsd * 10000) / 10000, configChanges: b.configChanges,
        outcomes: b.outcomes,
      }));

      return sendSuccess(reply, { buckets: data, totalLogs: logs.length, since: since.toISOString() });
    } catch (error) {
      logError(fastify.log, 'Error fetching scan stats:', error);
      return sendInternalError(reply, 'Erreur serveur');
    }
  });

  // GET /scan-logs/:logId
  fastify.get('/scan-logs/:logId', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
    schema: {
      description: 'Get full detail of a single scan log.',
      tags: ['admin-agent'],
      summary: 'Get scan log detail',
      security: securityBearerAuth,
      params: { type: 'object', required: ['logId'], properties: { logId: objectIdParam } },
      response: { 200: successDataResponse, ...stdErrorsWithNotFound },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { logId } = request.params as { logId: string };
      if (!validateObjectId(logId, 'logId', reply)) return;

      const log = await fastify.prisma.agentScanLog.findUnique({
        where: { id: logId },
        include: { conversation: { select: { id: true, title: true, type: true } } },
      });
      if (!log) return sendNotFound(reply, 'Scan log non trouve');

      return sendSuccess(reply, log);
    } catch (error) {
      logError(fastify.log, 'Error fetching scan log detail:', error);
      return sendInternalError(reply, 'Erreur serveur');
    }
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

  // ── Delivery Queue Proxy (Agent HTTP) ─────────────────────────────────────

  const agentHost = process.env.AGENT_HOST;
  const agentHttpPort = process.env.AGENT_HTTP_PORT || '3200';
  const agentClient = agentHost ? new AgentHttpClient(`http://${agentHost}:${agentHttpPort}`) : null;

  const ensureAgentClient = (reply: FastifyReply): AgentHttpClient | null => {
    if (!agentClient) {
      sendError(reply, 503, 'Agent service not configured');
      return null;
    }
    return agentClient;
  };

  // GET /delivery-queue
  fastify.get('/delivery-queue', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
    schema: {
      description: 'List pending items in the agent delivery queue.',
      tags: ['admin-agent'],
      summary: 'List delivery queue',
      security: securityBearerAuth,
      querystring: {
        type: 'object',
        properties: {
          conversationId: { type: 'string' },
        },
      },
      response: { 200: successDataResponse, ...stdErrors },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const client = ensureAgentClient(reply);
    if (!client) return;

    try {
      const { conversationId } = request.query as { conversationId?: string };
      const data = await client.getQueue(conversationId);
      return sendSuccess(reply, data);
    } catch (error) {
      if (error instanceof AgentUnavailableError) {
        return sendError(reply, 502, 'Agent service unavailable');
      }
      logError(fastify.log, 'Error fetching delivery queue:', error);
      return sendInternalError(reply, 'Erreur serveur');
    }
  });

  // DELETE /delivery-queue/:id
  fastify.delete('/delivery-queue/:id', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
    schema: {
      description: 'Delete a pending item from the delivery queue.',
      tags: ['admin-agent'],
      summary: 'Delete delivery queue item',
      security: securityBearerAuth,
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      response: { 200: successDataResponse, ...stdErrorsWithNotFound },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const client = ensureAgentClient(reply);
    if (!client) return;

    try {
      const { id } = request.params as { id: string };
      const data = await client.deleteQueueItem(id);
      return sendSuccess(reply, data);
    } catch (error) {
      if (error instanceof AgentUnavailableError) {
        return sendError(reply, 502, 'Agent service unavailable');
      }
      const statusCode = (error as Error & { statusCode?: number }).statusCode;
      if (statusCode === 404) {
        return sendNotFound(reply, 'Item not found or already delivered');
      }
      logError(fastify.log, 'Error deleting delivery queue item:', error);
      return sendInternalError(reply, 'Erreur serveur');
    }
  });

  // PATCH /delivery-queue/:id
  fastify.patch('/delivery-queue/:id', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
    schema: {
      description: 'Edit the content of a pending message in the delivery queue.',
      tags: ['admin-agent'],
      summary: 'Edit delivery queue item',
      security: securityBearerAuth,
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        required: ['content'],
        properties: { content: { type: 'string', minLength: 1, maxLength: 5000 } },
      },
      response: { 200: successDataResponse, ...stdErrorsWithNotFound },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const client = ensureAgentClient(reply);
    if (!client) return;

    try {
      const { id } = request.params as { id: string };
      const { content } = request.body as { content: string };
      const data = await client.editQueueItem(id, content);
      return sendSuccess(reply, data);
    } catch (error) {
      if (error instanceof AgentUnavailableError) {
        return sendError(reply, 502, 'Agent service unavailable');
      }
      const statusCode = (error as Error & { statusCode?: number }).statusCode;
      if (statusCode === 404) {
        return sendNotFound(reply, 'Item not found or already delivered');
      }
      if (statusCode === 400) {
        return sendBadRequest(reply, 'Cannot edit reaction content');
      }
      logError(fastify.log, 'Error editing delivery queue item:', error);
      return sendInternalError(reply, 'Erreur serveur');
    }
  });
}
