/**
 * `GET /admin/monitoring` — la santé de la plateforme en UNE lecture (#8876, § 6.3).
 *
 * ## Pourquoi une route de plus quand `/health/metrics` existe
 *
 * L'écran de supervision affiche sept choses à la fois : le processus, la base,
 * Redis, le temps réel, la traduction, les disjoncteurs, la présence. Les lire
 * par quatre adresses (`health/metrics`, `health/circuit-breakers`,
 * `socketio/stats`, `maintenance/status-metrics`) coûte quatre allers-retours et
 * quatre authentifications — et deux de ces quatre vivent HORS `/admin`, donc
 * hors du motif que le service worker ne met jamais en cache. Celle-ci ferme cet
 * écart sans toucher au motif.
 *
 * ## Composée depuis les MÊMES sources, sans appel HTTP interne
 *
 * Les sondes (`services/admin/platform-probes.ts`) sont partagées avec
 * `/health/*` : un seul site dit comment se mesure « la base répond ». Le temps
 * réel et la traduction viennent du gestionnaire Socket.IO (`getStats()`, ce que
 * sert `socketio/stats`).
 *
 * ## La porte
 *
 * `canAccessAdmin` + `canViewAnalytics` + `requireAdminRank()` : BIGBOSS et ADMIN.
 * AUDIT passe les deux permissions mais pas le rang — ce que cette route rend est
 * une carte du fonctionnement interne du service (tas mémoire, disjoncteurs,
 * latences), pas de la donnée produit.
 *
 * ## Ce qui n'est PAS servi, et pourquoi
 *
 * - Une dépendance tombée est annoncée `down`, jamais avec le texte d'erreur du
 *   pilote (il porte l'hôte, le port et le nom de la base).
 * - `presenceUpdates` est `null` tant qu'aucun service de statut VIVANT n'est
 *   exposé sur l'instance : l'instance que `/maintenance/status-metrics`
 *   construit pour elle-même ne reçoit aucune mise à jour, et servir ses zéros
 *   serait un faux zéro. `null` dit « inconnu », et l'écran ne dessine pas la
 *   carte.
 * - `translator` est `null` sans gestionnaire Socket.IO : la traduction n'a
 *   alors aucune statistique à lire.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireAdminRank, requirePermission } from '../../middleware/authorize';
import {
  baseState,
  countConnections,
  pingBase,
  pingCache,
  servedCircuitBreakers,
} from '../../services/admin/platform-probes';
import { logError } from '../../utils/logger';
import { sendInternalError, sendSuccess } from '../../utils/response';
import {
  chaine,
  chaineNulle,
  enveloppe,
  nombre,
  nombreNul,
  reponsesEnErreur,
  dateServie,
} from './oversight-schemas';

type SocketStatsLike = {
  readonly active_connections?: number;
  readonly connected_users?: number;
  readonly messages_processed?: number;
  readonly translations_sent?: number;
  readonly errors?: number;
  readonly translation_service_stats?: {
    readonly translation_requests_sent?: number;
    readonly translations_received?: number;
    readonly errors?: number;
    readonly pool_full_rejections?: number;
    readonly avg_processing_time?: number;
    readonly cache_hit_rate?: number;
    readonly memory_usage_mb?: number;
    readonly uptime_seconds?: number;
  };
};

type StatusMetricsLike = {
  readonly totalRequests: number;
  readonly throttledRequests: number;
  readonly successfulUpdates: number;
  readonly failedUpdates: number;
};

type FastifyWithLiveServices = {
  readonly socketIOHandler?: { readonly getManager?: () => { readonly getStats?: () => SocketStatsLike } | null };
  readonly statusService?: { readonly getMetrics?: () => StatusMetricsLike };
};

const count = (value: number | undefined): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

/** Les statistiques du gestionnaire Socket.IO — `null` s'il n'existe pas encore ou ne sait pas les lire. */
function readSocketStats(fastify: FastifyInstance): SocketStatsLike | null {
  const handler = (fastify as unknown as FastifyWithLiveServices).socketIOHandler;
  if (typeof handler?.getManager !== 'function') return null;
  try {
    const manager = handler.getManager();
    return typeof manager?.getStats === 'function' ? manager.getStats() : null;
  } catch {
    return null;
  }
}

function readPresenceMetrics(fastify: FastifyInstance) {
  const service = (fastify as unknown as FastifyWithLiveServices).statusService;
  if (typeof service?.getMetrics !== 'function') return null;
  try {
    const metrics = service.getMetrics();
    const throttleRate =
      metrics.totalRequests > 0 ? Math.round((metrics.throttledRequests / metrics.totalRequests) * 10_000) / 100 : 0;
    return {
      totalRequests: metrics.totalRequests,
      throttledRequests: metrics.throttledRequests,
      throttleRate,
      successfulUpdates: metrics.successfulUpdates,
      failedUpdates: metrics.failedUpdates,
    };
  } catch {
    return null;
  }
}

function readTranslator(stats: SocketStatsLike | null) {
  const translation = stats?.translation_service_stats;
  if (!translation) return null;
  return {
    requestsSent: count(translation.translation_requests_sent),
    received: count(translation.translations_received),
    errors: count(translation.errors),
    poolFullRejections: count(translation.pool_full_rejections),
    avgProcessingTimeMs: count(translation.avg_processing_time),
    cacheHitRate: count(translation.cache_hit_rate),
    memoryUsageMb: count(translation.memory_usage_mb),
    uptimeSeconds: count(translation.uptime_seconds),
  };
}

const dependencySchema = {
  type: 'object',
  properties: { status: chaine, latencyMs: nombreNul },
} as const;

const monitoringSchema = {
  type: 'object',
  properties: {
    generatedAt: dateServie,
    gateway: {
      type: 'object',
      properties: {
        uptimeSeconds: nombre,
        memory: { type: 'object', properties: { heapUsed: nombre, heapTotal: nombre, rss: nombre } },
      },
    },
    database: dependencySchema,
    redis: dependencySchema,
    realtime: {
      type: 'object',
      properties: {
        connections: nombre,
        connectedUsers: nombre,
        messagesProcessed: nombre,
        translationsSent: nombre,
        errors: nombre,
      },
    },
    translator: {
      type: 'object',
      nullable: true,
      properties: {
        requestsSent: nombre,
        received: nombre,
        errors: nombre,
        poolFullRejections: nombre,
        avgProcessingTimeMs: nombre,
        cacheHitRate: nombre,
        memoryUsageMb: nombre,
        uptimeSeconds: nombre,
      },
    },
    circuitBreakers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: chaine,
          state: chaine,
          failures: nombre,
          successes: nombre,
          totalRequests: nombre,
          lastFailureAt: chaineNulle,
        },
      },
    },
    presenceUpdates: {
      type: 'object',
      nullable: true,
      properties: {
        totalRequests: nombre,
        throttledRequests: nombre,
        throttleRate: nombre,
        successfulUpdates: nombre,
        failedUpdates: nombre,
      },
    },
  },
} as const;

export function registerMonitoringRoutes(fastify: FastifyInstance): void {
  fastify.get(
    '/monitoring',
    {
      onRequest: [
        fastify.authenticate,
        requirePermission('canAccessAdmin'),
        requirePermission('canViewAnalytics'),
        requireAdminRank(),
      ],
      schema: {
        description:
          "La santé de la plateforme en une lecture : processus, base, Redis, temps réel, traduction, disjoncteurs, présence. canAccessAdmin + canViewAnalytics + rang d'administration. #8876.",
        tags: ['admin'],
        summary: 'Platform health overview (admin)',
        security: [{ bearerAuth: [] }],
        response: { 200: enveloppe(monitoringSchema), ...reponsesEnErreur },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const memory = process.memoryUsage();
        const [databaseLatency, redis] = await Promise.all([pingBase(fastify.prisma), pingCache()]);
        const socketStats = readSocketStats(fastify);

        return sendSuccess(reply, {
          generatedAt: new Date(),
          gateway: {
            uptimeSeconds: Math.round(process.uptime()),
            memory: { heapUsed: memory.heapUsed, heapTotal: memory.heapTotal, rss: memory.rss },
          },
          database: baseState(databaseLatency),
          redis,
          realtime: {
            connections: count(socketStats?.active_connections),
            connectedUsers: socketStats ? count(socketStats.connected_users) : countConnections(fastify),
            messagesProcessed: count(socketStats?.messages_processed),
            translationsSent: count(socketStats?.translations_sent),
            errors: count(socketStats?.errors),
          },
          translator: readTranslator(socketStats),
          circuitBreakers: servedCircuitBreakers().map(({ lastFailure, ...breaker }) => ({
            ...breaker,
            lastFailureAt: lastFailure,
          })),
          presenceUpdates: readPresenceMetrics(fastify),
        });
      } catch (error) {
        logError(fastify.log, 'Admin monitoring error:', error);
        return sendInternalError(reply, 'Erreur lors de la lecture de la supervision');
      }
    }
  );
}
