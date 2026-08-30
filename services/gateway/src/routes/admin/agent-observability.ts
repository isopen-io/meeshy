/**
 * Surface OBSERVABILITÉ des routes admin de l'agent — statistiques globales,
 * activité récente et logs de scan (liste, agrégats pour graphe, détail).
 * Point d'entrée : `agent.ts` (#4284).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { listArchetypes } from '@meeshy/shared/agent/archetypes';
import { logError } from '../../utils/logger';
import { sendSuccess, sendNotFound, sendInternalError, sendPaginatedSuccess } from '../../utils/response';
import {
  requireAgentAdmin,
  validateObjectId,
  objectIdParam,
  securityBearerAuth,
  stdErrors,
  stdErrorsWithNotFound,
  successDataResponse,
  successArrayResponse,
  paginatedArrayResponse,
} from './agent-shared';

export function registerAgentObservabilityRoutes(fastify: FastifyInstance): void {
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

      return sendSuccess(reply, {
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
      });
    } catch (error) {
      logError(fastify.log, 'Error fetching agent stats:', error);
      return sendInternalError(reply, 'Erreur lors de la récupération des stats agent');
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

      return sendSuccess(reply, result);
    } catch (error) {
      logError(fastify.log, 'Error fetching recent activity:', error);
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
      /* istanbul ignore next -- AJV injects defaults before the handler; page/limit defaults are never reached */
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

      return sendPaginatedSuccess(reply, logs, { total, page, limit, hasMore: page * limit < total } as any);
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
      /* istanbul ignore next -- AJV injects defaults before the handler; months/bucket defaults are never reached */
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
      /* istanbul ignore next -- Fastify schema validates the ObjectId pattern before the handler runs */
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
}
