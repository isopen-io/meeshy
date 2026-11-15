/**
 * Surface OBSERVABILITÉ des routes admin de l'agent — statistiques globales,
 * activité récente et logs de scan (liste, agrégats pour graphe, détail).
 * Point d'entrée : `agent.ts` (#4284).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Prisma } from '@meeshy/shared/prisma/client';
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

/**
 * Nombre d'utilisateurs CONTRÔLÉS distincts, agrégé côté MongoDB (#4465).
 *
 * `GET /stats` faisait un `findMany({ select: { userId }, distinct: ['userId'] })`
 * sur TOUTE la table `AgentUserRole` (aucun `where`, aucun `take`) pour n'en
 * garder que `.length`. Un comptage UNIQUE n'a rien à combiner (contrainte 1
 * de #4465, à l'inverse de `scanLogsStatsPipeline` ci-dessous) : `$group` par
 * `userId` puis `$count` rend UN document — jamais une ligne par utilisateur
 * contrôlé.
 *
 * `$count` ne produit AUCUN document quand son entrée est vide — pas
 * `{ total: 0 }` — le site d'appel replie donc sur 0 lui-même.
 */
function distinctControlledUsersPipeline(): Prisma.InputJsonValue[] {
  return [
    { $group: { _id: '$userId' } },
    { $count: 'total' },
  ] as unknown as Prisma.InputJsonValue[];
}

type DistinctCountRow = { readonly total: number };

function extendedJsonDate(date: Date) {
  return { $date: date.toISOString() };
}

/**
 * Clé de seau (jour ou semaine, UTC) pour `AgentScanLog.startedAt`.
 *
 * `$dateTrunc` retrouve exactement le découpage que faisait la version JS
 * (`weekStart.setDate(weekStart.getDate() - weekStart.getDay())` — le
 * dimanche de la semaine) sans reposer sur le fuseau du PROCESS : le
 * découpage jour utilisait déjà `toISOString()` (UTC pur), et le découpage
 * semaine dépendait du fuseau LOCAL — UTC en production/CI (ni le Dockerfile
 * ni docker-compose.{prod,staging}.yml ne fixent `TZ`, seuls dev/local le
 * forcent à Europe/Paris — même lecture que `tendancesMessagesPipeline` dans
 * `admin/messages.ts`, #4465).
 */
function scanLogsBucketKeyExpr(bucket: string): Prisma.InputJsonValue {
  const troncature = bucket === 'week'
    ? { $dateTrunc: { date: '$startedAt', unit: 'week', timezone: 'UTC', startOfWeek: 'sunday' } }
    : { $dateTrunc: { date: '$startedAt', unit: 'day', timezone: 'UTC' } };
  return { $dateToString: { format: '%Y-%m-%d', date: troncature, timezone: 'UTC' } } as unknown as Prisma.InputJsonValue;
}

type ScanLogBucketRow = {
  readonly _id: string;
  readonly scans: number;
  readonly messagesSent: number;
  readonly reactionsSent: number;
  readonly costUsd: number;
  readonly configChanges: number;
  readonly conversations: number;
  readonly users: number;
};

type ScanLogOutcomeRow = {
  readonly _id: { readonly bucket: string; readonly outcome: string };
  readonly count: number;
};

type ScanLogsStatsFacet = {
  readonly buckets?: ReadonlyArray<ScanLogBucketRow>;
  readonly outcomes?: ReadonlyArray<ScanLogOutcomeRow>;
};

/**
 * Seaux de scan (#4465) — DEUX grains de repli sur le MÊME `$match`, combinés
 * en un document par `$facet` :
 *
 * - `buckets` : par SEAU seul — comptes et sommes additifs, plus deux
 *   comptes DISTINCTS (conversations, utilisateurs via `userIdsUsed`, un
 *   champ TABLEAU replié par `$addToSet` + `$reduce`/`$setUnion` — jamais un
 *   `$unwind`, qui gonflerait les accumulateurs additifs du MÊME groupe).
 * - `outcomes` : par {SEAU, issue} — la répartition par issue a besoin de
 *   cette maille plus fine, qu'`AgentScanLog.outcome` (chaîne libre, pas un
 *   enum Prisma) interdit de coder en sommes conditionnelles fixes.
 *
 * Ce n'est PAS le `$facet` MODULO de `tendancesMessagesPipeline`
 * (`admin/messages.ts`) plaqué par mimétisme (contrainte 1 de #4465) : l'axe
 * temporel ici est un partitionnement CONTIGU (jour/semaine), pas un
 * repliement qui revient à chaque période. Le `$facet` se justifie autrement
 * — les DEUX facets NE PEUVENT PAS partager un `$group`, parce que sommer les
 * comptes distincts de `buckets` À TRAVERS les sous-groupes d'`outcomes`
 * surcompterait une conversation ayant des scans de plusieurs issues le même
 * jour.
 */
function scanLogsStatsPipeline(options: {
  readonly since: Date;
  readonly bucket: string;
  readonly conversationId?: string;
}): Prisma.InputJsonValue[] {
  const match: Record<string, unknown> = { startedAt: { $gte: extendedJsonDate(options.since) } };
  if (options.conversationId) match.conversationId = { $oid: options.conversationId };
  const bucketKey = scanLogsBucketKeyExpr(options.bucket);

  return [
    { $match: match },
    {
      $facet: {
        buckets: [
          {
            $group: {
              _id: bucketKey,
              scans: { $sum: 1 },
              messagesSent: { $sum: '$messagesSent' },
              reactionsSent: { $sum: '$reactionsSent' },
              costUsd: { $sum: '$estimatedCostUsd' },
              configChanges: { $sum: { $cond: [{ $ne: ['$configChangedAt', null] }, 1, 0] } },
              conversationsSet: { $addToSet: '$conversationId' },
              userIdArrays: { $addToSet: '$userIdsUsed' },
            },
          },
          {
            $project: {
              _id: 1, scans: 1, messagesSent: 1, reactionsSent: 1, costUsd: 1, configChanges: 1,
              conversations: { $size: '$conversationsSet' },
              users: {
                $size: {
                  $reduce: {
                    input: '$userIdArrays',
                    initialValue: [],
                    in: { $setUnion: ['$$value', '$$this'] },
                  },
                },
              },
            },
          },
        ],
        outcomes: [
          { $group: { _id: { bucket: bucketKey, outcome: '$outcome' }, count: { $sum: 1 } } },
        ],
      },
    },
  ] as unknown as Prisma.InputJsonValue[];
}

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
      const [configsCount, activeCount, rolesCount, controlledUsersRows, analyticsAgg] = await Promise.all([
        fastify.prisma.agentConfig.count(),
        fastify.prisma.agentConfig.count({ where: { enabled: true } }),
        fastify.prisma.agentUserRole.count(),
        fastify.prisma.agentUserRole.aggregateRaw({
          pipeline: distinctControlledUsersPipeline(),
        }) as unknown as Promise<ReadonlyArray<DistinctCountRow>>,
        fastify.prisma.agentAnalytic.aggregate({
          _sum: { messagesSent: true, totalWordsSent: true },
          _avg: { avgConfidence: true },
        }),
      ]);
      const totalControlledUsers = controlledUsersRows[0]?.total ?? 0;

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
        totalControlledUsers,
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
          // #4465 — aucune borne n'existait : `months` restait un entier
          // libre alors que le seul appelant connu (`ScanHistoryChart.tsx`,
          // web) plafonne à 6. `scanLogsStatsPipeline` (ci-dessus) rend la
          // lecture BORNÉE À UNE REQUÊTE quel que soit `months` — la
          // N-requêtes-non-bornées de la contrainte 2 ne s'applique donc pas
          // ici —, mais Mongo balaie toujours `months` de lignes pour les
          // replier : `maximum: 24` (deux ans) referme la fenêtre plutôt que
          // de la laisser reposer sur le seul comportement du client.
          months: { type: 'integer', default: 6, minimum: 1, maximum: 24 },
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

      // Seaux + répartition par issue — UNE agrégation MongoDB (#4465, voir
      // le doc-comment de `scanLogsStatsPipeline` ci-dessus).
      const facets = await fastify.prisma.agentScanLog.aggregateRaw({
        pipeline: scanLogsStatsPipeline({ since, bucket, conversationId }),
      }) as unknown as ReadonlyArray<ScanLogsStatsFacet>;
      const facet: ScanLogsStatsFacet = facets[0] ?? {};

      const outcomesParSeau = new Map<string, Record<string, number>>();
      for (const ligne of facet.outcomes ?? []) {
        const carte = outcomesParSeau.get(ligne._id.bucket) ?? {};
        carte[ligne._id.outcome] = ligne.count;
        outcomesParSeau.set(ligne._id.bucket, carte);
      }

      const data = (facet.buckets ?? [])
        .map(b => ({
          date: b._id,
          scans: b.scans,
          conversations: b.conversations,
          users: b.users,
          messagesSent: b.messagesSent,
          reactionsSent: b.reactionsSent,
          costUsd: Math.round(b.costUsd * 10000) / 10000,
          configChanges: b.configChanges,
          outcomes: outcomesParSeau.get(b._id) ?? {},
        }))
        .sort((a, c) => a.date.localeCompare(c.date));

      const totalLogs = data.reduce((total, b) => total + b.scans, 0);

      return sendSuccess(reply, { buckets: data, totalLogs, since: since.toISOString() });
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
