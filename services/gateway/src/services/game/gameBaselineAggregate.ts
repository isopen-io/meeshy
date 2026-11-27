/**
 * LE POINT DE DÉPART DU JEU (#17363, #20617) — le retour des comptes par semaine d'inscription, et ce que le Jeu
 * fait vivre chaque jour.
 *
 * Le retour est GLISSANT : un compte est « revenu au jour N » s'il a encore été actif N jours pleins, ou plus, après
 * son inscription. Il se lit de deux colonnes que chaque compte porte déjà (`createdAt`, `lastActiveAt`) : aucune
 * trace d'activité par jour n'est gardée pour le calculer. Un horizon ne s'observe que sur les comptes qui ont eu le
 * temps de l'atteindre ; sans compte observable, le taux est `null`, jamais zéro.
 *
 * Pur et total : aucune lecture, aucune levée. Les jours sont des jours UTC.
 */

import { flameStatus } from '@meeshy/shared/utils/game/flame';
import {
  RETENTION_HORIZON_DAYS,
  type GameDailyCounters,
  type RetentionCell,
  type RetentionCohort,
  type RetentionHorizon,
} from '@meeshy/shared/types/game-baseline';
import { flameFactsOf, type FlameUserRow } from './FlameService';

const DAY_MS = 24 * 60 * 60 * 1000;

export type SignupActivityRow = {
  readonly createdAt: Date;
  readonly lastActiveAt: Date;
};

/** Un document du seau quotidien des étincelles (#20619) : jour UTC, somme des gains, joueurs qui en ont gagné. */
export type SparksDayRow = {
  readonly day: string;
  readonly sparks: number;
  readonly earners: number;
};

export type MeeshLedgerRow = {
  readonly reason: string;
  readonly delta: number;
  readonly createdAt: Date;
};

const HORIZONS = Object.keys(RETENTION_HORIZON_DAYS) as readonly RetentionHorizon[];

const utcDay = (date: Date): string => date.toISOString().slice(0, 10);

const isReadableDate = (date: Date): boolean => Number.isFinite(date.getTime());

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): ReadonlyMap<string, readonly T[]> {
  return items.reduce((groups, item) => {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
    return groups;
  }, new Map<string, T[]>());
}

export const signupWeekOf = (createdAt: Date): string => {
  const day = new Date(Date.UTC(createdAt.getUTCFullYear(), createdAt.getUTCMonth(), createdAt.getUTCDate()));
  const daysSinceMonday = (day.getUTCDay() + 6) % 7;
  return utcDay(new Date(day.getTime() - daysSinceMonday * DAY_MS));
};

const isReadable = (row: SignupActivityRow): boolean => isReadableDate(row.createdAt) && isReadableDate(row.lastActiveAt);

const cellOf = (rows: readonly SignupActivityRow[], days: number, now: Date): RetentionCell => {
  const observable = rows.filter((row) => row.createdAt.getTime() + days * DAY_MS <= now.getTime());
  const returned = observable.filter((row) => row.lastActiveAt.getTime() - row.createdAt.getTime() >= days * DAY_MS).length;
  return {
    eligible: observable.length,
    returned,
    rate: observable.length === 0 ? null : Math.round((returned / observable.length) * 100),
  };
};

export function summarizeRollingRetention(params: { readonly rows: readonly SignupActivityRow[]; readonly now: Date }): RetentionCohort[] {
  const byWeek = groupBy(params.rows.filter(isReadable), (row) => signupWeekOf(row.createdAt));

  return [...byWeek.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([weekStart, rows]) => ({
      weekStart,
      accounts: rows.length,
      ...(Object.fromEntries(HORIZONS.map((horizon) => [horizon, cellOf(rows, RETENTION_HORIZON_DAYS[horizon], params.now)])) as Record<RetentionHorizon, RetentionCell>),
    }));
}

const countOf = (value: number | undefined): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0);

const sumOf = (rows: readonly MeeshLedgerRow[] | undefined, reason: string): number =>
  (rows ?? []).filter((row) => row.reason === reason).reduce((total, row) => total + Math.abs(row.delta), 0);

/** Un jour UTC par entrée, des `days` derniers jours jusqu'à aujourd'hui inclus, zéros compris. */
export function summarizeDailyGameCounters(params: {
  readonly offeringsOpenedAt: readonly Date[];
  readonly ledger: readonly MeeshLedgerRow[];
  readonly sparksDays?: readonly SparksDayRow[];
  readonly days: number;
  readonly now: Date;
}): GameDailyCounters[] {
  const offeringsByDay = groupBy(params.offeringsOpenedAt.filter(isReadableDate), utcDay);
  const ledgerByDay = groupBy(params.ledger.filter((row) => isReadableDate(row.createdAt)), (row) => utcDay(row.createdAt));
  const sparksByDay = new Map((params.sparksDays ?? []).map((row) => [row.day, row] as const));

  return Array.from({ length: Math.max(0, params.days) }, (_, index) => {
    const day = utcDay(new Date(params.now.getTime() - (params.days - 1 - index) * DAY_MS));
    const ledger = ledgerByDay.get(day);
    return {
      day,
      offeringsOpened: offeringsByDay.get(day)?.length ?? 0,
      meeshesMinted: sumOf(ledger, 'mint'),
      meeshesSpent: sumOf(ledger, 'spend'),
      sparksEarned: countOf(sparksByDay.get(day)?.sparks),
      sparkEarners: countOf(sparksByDay.get(day)?.earners),
    };
  });
}

const ALIVE = new Set(['lit', 'at-risk', 'covered']);

/** Les Flammes d'au moins `minDays` jours encore vivantes aujourd'hui, selon la loi de la carte de la Flamme. */
export function countAliveLongFlames(params: { readonly rows: readonly FlameUserRow[]; readonly now: Date; readonly minDays: number }): number {
  return params.rows.filter((row) => {
    const facts = flameFactsOf(row, params.now);
    if (facts.streak < params.minDays) return false;
    const status = flameStatus({ lastActiveDay: facts.lastActiveDay, today: facts.today, streak: facts.streak, freezes: facts.freezes });
    return ALIVE.has(status);
  }).length;
}
