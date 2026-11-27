import type { FastifyInstance, FastifyRequest, FastifyReply, onRequestHookHandler } from 'fastify';
import {
  GAME_BASELINE_COHORT_WEEKS,
  GAME_BASELINE_DEFAULT_WINDOW_DAYS,
  GAME_BASELINE_LONG_FLAME_DAYS,
  GAME_BASELINE_MAX_WINDOW_DAYS,
  type GameBaselineSummary,
} from '@meeshy/shared/types/game-baseline';
import { sendSuccess, sendInternalError } from '../../utils/response';
import { logError } from '../../utils/logger';
import { getCacheStore } from '../../services/CacheStore';
import { FLAME_USER_SELECT } from '../../services/game/FlameService';
import { countAliveLongFlames, summarizeDailyGameCounters, summarizeRollingRetention } from '../../services/game/gameBaselineAggregate';

const DAY_MS = 24 * 60 * 60 * 1000;
const CACHE_TTL_SECONDS = 600;
const ROW_CAP = 50_000;
/** Un document par jour : la fenêtre (≤ 30 jours) plus une marge. */
const SPARKS_DAY_CAP = GAME_BASELINE_MAX_WINDOW_DAYS + 2;
/**
 * Une Flamme vivante a reçu son dernier geste il y a au plus dix jours : un jour à risque, deux Veilleuses
 * (`FLAME_FREEZE_MAX`) et une veille de sept jours au plus. Quatorze couvrent les fuseaux avec de la marge.
 */
const LONG_FLAME_LOOKBACK_DAYS = 14;

const windowDaysOf = (raw: string | undefined): number => {
  const parsed = Number(raw ?? GAME_BASELINE_DEFAULT_WINDOW_DAYS);
  return Number.isFinite(parsed)
    ? Math.min(GAME_BASELINE_MAX_WINDOW_DAYS, Math.max(1, Math.floor(parsed)))
    : GAME_BASELINE_DEFAULT_WINDOW_DAYS;
};

const totalOf = (raw: unknown): number => {
  const first = Array.isArray(raw) ? (raw[0] as { total?: unknown } | undefined) : undefined;
  return typeof first?.total === 'number' && Number.isFinite(first.total) ? first.total : 0;
};

async function readGameBaseline(fastify: FastifyInstance, params: { readonly days: number; readonly now: Date }): Promise<GameBaselineSummary> {
  const { prisma } = fastify;
  const { now } = params;
  const cohortStart = new Date(now.getTime() - GAME_BASELINE_COHORT_WEEKS * 7 * DAY_MS);
  const windowStart = new Date(now.getTime() - params.days * DAY_MS);
  const flameSince = new Date(now.getTime() - LONG_FLAME_LOOKBACK_DAYS * DAY_MS);
  const firstDay = new Date(now.getTime() - (params.days - 1) * DAY_MS).toISOString().slice(0, 10);

  const [signups, flames, offerings, ledger, gameHidden, notificationsOff, sparksDays] = await Promise.all([
    prisma.user.findMany({
      where: { createdAt: { gte: cohortStart } },
      select: { createdAt: true, lastActiveAt: true },
      orderBy: { createdAt: 'desc' },
      take: ROW_CAP,
    }),
    prisma.user.findMany({
      where: { currentStreakDays: { gte: GAME_BASELINE_LONG_FLAME_DAYS }, lastStreakDate: { gte: flameSince } },
      select: FLAME_USER_SELECT,
      take: ROW_CAP,
    }),
    prisma.gameDay.findMany({
      where: { chestClaimedAt: { gte: windowStart } },
      select: { chestClaimedAt: true },
      take: ROW_CAP,
    }),
    prisma.meeshLedger.findMany({
      where: { createdAt: { gte: windowStart }, reason: { in: ['mint', 'spend'] } },
      select: { reason: true, delta: true, createdAt: true },
      take: ROW_CAP,
    }),
    prisma.gameProfile.count({ where: { gameHiddenAt: { not: null } } }),
    prisma.userPreferences.aggregateRaw({
      pipeline: [{ $match: { 'notification.gameEnabled': false } }, { $count: 'total' }],
    }),
    prisma.gameSparksDay.findMany({
      where: { day: { gte: firstDay } },
      select: { day: true, sparks: true, earners: true },
      take: SPARKS_DAY_CAP,
    }),
  ]);

  return {
    windowDays: params.days,
    cohortWeeks: GAME_BASELINE_COHORT_WEEKS,
    sampled: [signups, flames, offerings, ledger].some((rows) => rows.length >= ROW_CAP),
    retention: summarizeRollingRetention({
      rows: signups.map((row) => ({ createdAt: row.createdAt, lastActiveAt: row.lastActiveAt ?? row.createdAt })),
      now,
    }),
    daily: summarizeDailyGameCounters({
      offeringsOpenedAt: offerings.flatMap((row) => (row.chestClaimedAt ? [row.chestClaimedAt] : [])),
      ledger,
      sparksDays,
      days: params.days,
      now,
    }),
    longFlames: {
      minDays: GAME_BASELINE_LONG_FLAME_DAYS,
      alive: countAliveLongFlames({ rows: flames, now, minDays: GAME_BASELINE_LONG_FLAME_DAYS }),
    },
    guards: { gameHidden, gameNotificationsOff: totalOf(notificationsOff) },
  };
}

/**
 * GET /api/v1/admin/analytics/game?days=14
 * Le point de départ du Jeu (#17363, #20617) : retour glissant à 1, 7 et 30 jours par semaine d'inscription,
 * Offrandes, Meeshes et étincelles gagnées par jour (#20619), Flammes de sept jours et plus, comptes en « Jeu masqué »
 * et sans notifications de jeu. Des agrégats : aucune ligne par compte ne quitte la passerelle. Fenêtre ≤ 30 jours, cache 10 min.
 */
export function registerGameBaselineRoute(fastify: FastifyInstance, guard: onRequestHookHandler): void {
  fastify.get('/game', {
    onRequest: [fastify.authenticate, guard],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const days = windowDaysOf((request.query as { days?: string }).days);
      const cacheKey = `admin:analytics:game:v2:${days}`;
      const cached = await getCacheStore().get(cacheKey);
      if (cached) {
        return sendSuccess(reply, JSON.parse(cached));
      }

      const data = await readGameBaseline(fastify, { days, now: new Date() });

      getCacheStore().set(cacheKey, JSON.stringify(data), CACHE_TTL_SECONDS).catch(/* istanbul ignore next -- fire-and-forget cache write */ () => {});
      return sendSuccess(reply, data);
    } catch (error) {
      logError(fastify.log, 'Get game baseline analytics error:', error);
      return sendInternalError(reply, 'Erreur lors de la récupération du point de départ du Jeu');
    }
  });
}
