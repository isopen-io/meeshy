/**
 * Surface CONFIGS des routes admin de l'agent — CRUD des configs de
 * conversation (liste, détail, upsert, suppression), rôles de la
 * conversation, résumé, état live, planning de scan, stop/trigger et
 * historique des messages envoyés par l'agent. Point d'entrée : `agent.ts`
 * (#4284).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { isScanActive } from '@meeshy/shared/types/agent';
import { OBJECT_ID_REGEX } from '@meeshy/shared/utils/object-id';
import { logError } from '../../utils/logger';
import { getCacheStore } from '../../services/CacheStore';
import { sendSuccess, sendBadRequest, sendNotFound, sendInternalError, sendPaginatedSuccess } from '../../utils/response';
import { validatePagination, buildPaginationMeta } from '../../utils/pagination';
import { AgentUnavailableError } from '../../services/AgentHttpClient';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import {
  requireAgentAdmin,
  validateObjectId,
  conversationIdParams,
  successDataResponse,
  paginatedArrayResponse,
  stdErrors,
  stdErrorsWithNotFound,
  securityBearerAuth,
  type AgentRouteDeps,
} from './agent-shared';

// #4165 — plafond du nombre de rôles agent par conversation, utilisé pour
// borner explicitement `agentUserRole.findMany` sur une page de
// `GET /configs`. Aligné sur `agentConfigSchema.maxControlledUsers` (`.max(50)`
// ci-dessous) : un config ne peut de toute façon piloter plus de 50 comptes.
const AGENT_MAX_CONTROLLED_USERS_PER_CONVERSATION = 50;

const agentConfigSchema = z.object({
  enabled: z.boolean().optional(),
  autoPickupEnabled: z.boolean().optional(),
  inactivityThresholdHours: z.number().int().min(1).max(720).optional(),
  minHistoricalMessages: z.number().int().min(0).optional(),
  maxControlledUsers: z.number().int().min(1).max(50).optional(),
  manualUserIds: z.array(z.string().regex(OBJECT_ID_REGEX)).optional(),
  excludedRoles: z.array(z.string()).optional(),
  excludedUserIds: z.array(z.string().regex(OBJECT_ID_REGEX)).optional(),
  triggerOnTimeout: z.boolean().optional(),
  timeoutSeconds: z.number().int().min(30).max(3600).optional(),
  triggerOnUserMessage: z.boolean().optional(),
  triggerFromUserIds: z.array(z.string().regex(OBJECT_ID_REGEX)).optional(),
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
  minDelayMinutes: z.number().int().min(1).max(1440).nullable().optional(),
  maxDelayMinutes: z.number().int().min(1).max(1440).nullable().optional(),
  spreadOverDayEnabled: z.boolean().optional(),
  maxMessagesPerUserPer10Min: z.number().int().min(1).max(20).nullable().optional(),
  freshTopicProbability: z.number().min(0).max(1).optional(),
  freshTopicCategoryHints: z.array(z.string().min(1).max(40)).max(20).optional(),
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
  if (typeof data.minDelayMinutes === 'number' && typeof data.maxDelayMinutes === 'number') {
    return data.minDelayMinutes <= data.maxDelayMinutes;
  }
  return true;
}, { message: 'minDelayMinutes doit être <= maxDelayMinutes' });

const successMessageResponse = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    message: { type: 'string' },
  },
} as const;

export function registerAgentConfigsRoutes(fastify: FastifyInstance, deps: AgentRouteDeps): void {
  const { agentClient, broadcastInvalidation, notifyAdminDashboards } = deps;

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

      // BORNÉ (#4165). Les trois `findMany` retirés ici lisaient CHAQUE ligne
      // de `agentConfig`/`agentUserRole`/`agentAnalytic` — même projetée sur
      // le seul `conversationId` — pour construire, EN MÉMOIRE, l'univers des
      // conversations « avec une activité agent », AVANT même que la
      // pagination ne s'applique : le coût grandissait avec le nombre TOTAL de
      // conversations ayant jamais eu un agent, pas avec la taille d'une page.
      // Le `where` ci-dessous pose la MÊME question dans la requête
      // `conversation.findMany`, via les relations inverses que
      // `schema.prisma` déclare déjà (`agentConfig`, `agentAnalytic`,
      // `agentUserRoles` sur `Conversation`) : MongoDB l'évalue au moment de
      // sélectionner LA PAGE, jamais sur la collection entière. Le coût
      // redevient celui d'une page.
      const conversationWhere = {
        OR: [
          { agentConfig: { isNot: null } },
          { agentAnalytic: { isNot: null } },
          { agentUserRoles: { some: {} } },
        ],
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

      // Fetch configs, roles, analytics for this page. Les trois requêtes sont
      // déjà scopées à `pageConvIds` (≤ `limitNum` ≤ 100, lui-même issu de
      // `conversation.findMany` BORNÉ ci-dessus) — leur risque n'est donc pas
      // celui des trois `findMany` retirés plus haut. `take` explicite quand
      // même (#4165) : la borne ne doit pas dépendre implicitement d'une
      // contrainte `schema.prisma` qu'un futur changement de modèle pourrait
      // lever sans qu'aucun témoin ne le voie ici.
      const [configs, allRoles, allAnalytics] = await Promise.all([
        fastify.prisma.agentConfig.findMany({
          where: { conversationId: { in: pageConvIds } },
          // `@@unique([conversationId])` : au plus UNE ligne par conversation de la page.
          take: pageConvIds.length,
        }),
        fastify.prisma.agentUserRole.findMany({
          where: { conversationId: { in: pageConvIds } },
          select: { conversationId: true, userId: true },
          // Plusieurs rôles par conversation, bornés par `maxControlledUsers`
          // (Zod : `.max(50)` sur `agentConfigSchema` ci-dessus).
          take: pageConvIds.length * AGENT_MAX_CONTROLLED_USERS_PER_CONVERSATION,
        }),
        fastify.prisma.agentAnalytic.findMany({
          where: { conversationId: { in: pageConvIds } },
          // `@@unique([conversationId])` : au plus UNE ligne par conversation de la page.
          take: pageConvIds.length,
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
          maxReactionsPerCycle: config?.maxReactionsPerCycle ?? 4,
          agentInstructions: config?.agentInstructions ?? null,
          webSearchEnabled: config?.webSearchEnabled ?? true,
          minWordsPerMessage: config?.minWordsPerMessage ?? 1,
          maxWordsPerMessage: config?.maxWordsPerMessage ?? 500,
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
          isScanning: isScanActive(config?.scanStartedAt),
          currentNode: isScanActive(config?.scanStartedAt) ? (config?.currentNode ?? null) : null,
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

      return sendPaginatedSuccess(reply, enrichedConfigs, { total, page: pageNum, limit: limitNum, hasMore: skip + limitNum < total } as any);
    } catch (error) {
      logError(fastify.log, 'Error fetching agent configs:', error);
      return sendInternalError(reply, 'Erreur lors de la récupération des configs');
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
      /* istanbul ignore next -- Fastify schema validates the ObjectId pattern before the handler runs */
      if (!validateObjectId(conversationId, 'conversationId', reply)) return;
      const config = await fastify.prisma.agentConfig.findUnique({ where: { conversationId } });
      if (!config) {
        return sendNotFound(reply, 'Config non trouvée');
      }
      const roles = await fastify.prisma.agentUserRole.findMany({
        where: { conversationId },
        select: { userId: true },
      });
      const roleUserIds = roles.map((r) => r.userId);
      const manualIds = (config.manualUserIds ?? []) as string[];
      const mergedUserIds = [...new Set([...roleUserIds, ...manualIds])];
      return sendSuccess(reply, { ...config, controlledUserIds: mergedUserIds });
    } catch (error) {
      logError(fastify.log, 'Error fetching agent config:', error);
      return sendInternalError(reply, 'Erreur serveur');
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
      /* istanbul ignore next -- Fastify schema validates the ObjectId pattern before the handler runs */
      if (!validateObjectId(conversationId, 'conversationId', reply)) return;
      const parsed = agentConfigSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendBadRequest(reply, 'Données invalides');
      }

      const authContext = (request as UnifiedAuthRequest).authContext;
      // inactivityDaysThreshold is a derived mirror of inactivityThresholdHours:
      // the agent uses a single inactivity delay, expressed in hours for the
      // conversation and surfaced in days for display.
      const data = { ...parsed.data };
      if (typeof data.inactivityThresholdHours === 'number') {
        data.inactivityDaysThreshold = Math.max(1, Math.round(data.inactivityThresholdHours / 24));
      }
      const config = await fastify.prisma.agentConfig.upsert({
        where: { conversationId },
        create: { conversationId, configuredBy: authContext.registeredUser.id, ...data },
        update: data,
      });

      // Sync manualUserIds → AgentUserRole so they appear in admin lists
      // and the scanner can pick them up immediately.
      const manualIds = parsed.data.manualUserIds;
      if (manualIds && manualIds.length > 0) {
        const users = await fastify.prisma.user.findMany({
          where: { id: { in: manualIds } },
          select: {
            id: true,
            displayName: true,
            username: true,
            // #4888 — la relation partait NUE (`agentGlobalProfile: true`),
            // chargeant `id`/`userId`/`responsePatterns`/`locked`/`createdAt`/
            // `updatedAt` qu'aucune ligne ci-dessous ne lit. Projection sur
            // les seuls champs que la construction d'`AgentUserRole` consomme.
            agentGlobalProfile: {
              select: {
                personaSummary: true,
                tone: true,
                vocabularyLevel: true,
                typicalLength: true,
                emojiUsage: true,
                topicsOfExpertise: true,
                topicsAvoided: true,
                catchphrases: true,
                commonEmojis: true,
                reactionPatterns: true,
                messagesAnalyzed: true,
                confidence: true,
              },
            },
          },
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

      const invalidationStatus = await broadcastInvalidation({ conversationId });
      if (!invalidationStatus.anyChannelSucceeded) {
        fastify.log.warn(
          { conversationId, invalidationStatus },
          '[AgentConfig] Cache invalidation failed on both Redis pub/sub AND direct HTTP; agent service may serve stale config for up to 5 min',
        );
      }

      return sendSuccess(reply, { ...config, cacheInvalidation: invalidationStatus });
    } catch (error) {
      logError(fastify.log, 'Error upserting agent config:', error);
      return sendInternalError(reply, 'Erreur serveur');
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
      /* istanbul ignore next -- Fastify schema validates the ObjectId pattern before the handler runs */
      if (!validateObjectId(conversationId, 'conversationId', reply)) return;
      await fastify.prisma.agentConfig.delete({ where: { conversationId } });
      // Bust the agent service's cached copy so it stops scheduling scans for
      // the deleted conversation immediately (without it the agent could run
      // up to 5 more minutes on a config that no longer exists in Mongo).
      await broadcastInvalidation({ conversationId });
      return sendSuccess(reply, null, { message: 'Config supprimée' });
    } catch (error) {
      logError(fastify.log, 'Error deleting agent config:', error);
      return sendInternalError(reply, 'Erreur serveur');
    }
  });

  // GET /configs/:conversationId/roles
  fastify.get('/configs/:conversationId/roles', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
    schema: {
      description: 'List all agent user roles for a conversation, paginated.',
      tags: ['admin-agent'],
      summary: 'List conversation roles',
      security: securityBearerAuth,
      params: conversationIdParams,
      querystring: {
        type: 'object',
        properties: {
          offset: { type: 'string', description: 'Number of items to skip (default: 0)' },
          limit: { type: 'string', description: 'Items per page (default: 20, max: 100)' },
        },
      },
      response: { 200: paginatedArrayResponse, ...stdErrors },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { conversationId } = request.params as { conversationId: string };
      /* istanbul ignore next -- Fastify schema validates the ObjectId pattern before the handler runs */
      if (!validateObjectId(conversationId, 'conversationId', reply)) return;
      // BORNÉ (#4165). Sans `take` ni `select`, cette liste grandissait avec
      // l'effectif de LA conversation — jusqu'à des milliers de rôles sur le
      // salon le plus peuplé — et chaque ligne transporte tous ses tableaux
      // de profil (catchphrases, relationshipMap, topicsOfExpertise…).
      // `validatePagination` pose le même plafond (≤ 100) que le reste du
      // dépôt ; `hasMore` dit au client s'il y a une page de plus.
      const { offset: offsetStr, limit: limitStr } = request.query as { offset?: string; limit?: string };
      const { offset, limit } = validatePagination(offsetStr, limitStr);
      const [roles, total] = await Promise.all([
        fastify.prisma.agentUserRole.findMany({
          where: { conversationId },
          orderBy: { id: 'asc' },
          skip: offset,
          take: limit,
        }),
        fastify.prisma.agentUserRole.count({ where: { conversationId } }),
      ]);
      return sendPaginatedSuccess(reply, roles, buildPaginationMeta(total, offset, limit, roles.length));
    } catch (error) {
      logError(fastify.log, 'Error fetching agent roles:', error);
      return sendInternalError(reply, 'Erreur serveur');
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
      /* istanbul ignore next -- Fastify schema validates the ObjectId pattern before the handler runs */
      if (!validateObjectId(conversationId, 'conversationId', reply)) return;
      const summary = await fastify.prisma.agentConversationSummary.findUnique({ where: { conversationId } });
      if (!summary) {
        return sendNotFound(reply, 'Résumé non trouvé');
      }
      return sendSuccess(reply, summary);
    } catch (error) {
      logError(fastify.log, 'Error fetching agent summary:', error);
      return sendInternalError(reply, 'Erreur serveur');
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
      /* istanbul ignore next -- Fastify schema validates the ObjectId pattern before the handler runs */
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
          select: { scanStartedAt: true, currentNode: true },
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

      return sendSuccess(reply, {
        conversationId,
        summary: summaryRaw ?? '',
        toneProfiles,
        cachedMessageCount: messages.length,
        isScanning: isScanActive(agentConfig?.scanStartedAt),
        currentNode: isScanActive(agentConfig?.scanStartedAt) ? (agentConfig?.currentNode ?? null) : null,
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
      });
    } catch (error) {
      logError(fastify.log, 'Error fetching live analytics:', error);
      return sendInternalError(reply, 'Erreur serveur');
    }
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
      /* istanbul ignore next -- Fastify schema validates the ObjectId pattern before the handler runs */
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
    try {
      const { conversationId } = request.params as { conversationId: string };
      /* istanbul ignore next -- Fastify schema validates the ObjectId pattern before the handler runs */
      if (!validateObjectId(conversationId, 'conversationId', reply)) return;

      // Clear the DB marker FIRST, unconditionally. This unsticks stale STOP/<node> badges
      // even when the agent service is crashed / unreachable / not configured, and gives
      // the admin UI instant feedback on the next refresh. The agent service will also
      // clear it (idempotent) when it observes the stop flag via Redis.
      await fastify.prisma.agentConfig.updateMany({
        where: { conversationId },
        data: { scanStartedAt: null, currentNode: null },
      });
      notifyAdminDashboards('scan', conversationId);

      if (!agentClient) {
        return sendSuccess(reply, { conversationId, stopped: true, agentUnavailable: true });
      }

      try {
        await agentClient.stopScan(conversationId);
      } catch (error) {
        if (error instanceof AgentUnavailableError) {
          return sendSuccess(reply, { conversationId, stopped: true, agentUnavailable: true });
        }
        throw error;
      }
      return sendSuccess(reply, { conversationId, stopped: true });
    } catch (error) {
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
      /* istanbul ignore next -- Fastify schema validates the ObjectId pattern before the handler runs */
      if (!validateObjectId(conversationId, 'conversationId', reply)) return;

      const config = await fastify.prisma.agentConfig.findUnique({ where: { conversationId } });
      if (!config) return sendNotFound(reply, 'Config non trouvée');

      const cache = getCacheStore();
      await cache.set(`agent:last-scan:${conversationId}`, '0', 86400);
      await cache.publish('agent:trigger-scan', JSON.stringify({ conversationId }));
      notifyAdminDashboards('scan', conversationId);

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
      /* istanbul ignore next -- Fastify schema validates the ObjectId pattern before the handler runs */
      if (!validateObjectId(conversationId, 'conversationId', reply)) return;

      /* istanbul ignore next -- AJV injects defaults before the handler; page/limit defaults are never reached */
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

      return sendPaginatedSuccess(reply, messages, { total, page: Math.max(1, Number(page)), limit: limitNum, hasMore: skip + limitNum < total } as any);
    } catch (error) {
      logError(fastify.log, 'Error fetching agent messages:', error);
      return sendInternalError(reply, 'Erreur serveur');
    }
  });
}
