import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';
import { RETENTION_HORIZON_DAYS, type RetentionHorizon } from '@meeshy/shared/types/game-baseline';

import type { AdminDeps } from './admin';
import { decoded, finite, nonNegative, recordOf, textOf, withQuery } from './admin-analytics-decode';
import type { ApiResult } from './http';

/**
 * **LE POINT DE DÉPART DU JEU** (#20618, #17363) — `GET /admin/analytics/game?days=` :
 * le retour glissant à 1, 7 et 30 jours par semaine d'inscription, les Offrandes
 * ouvertes et les Meeshes frappées et dépensées par jour, les Flammes de sept jours
 * et plus encore vivantes, les comptes en « Jeu masqué » et sans notifications de jeu.
 * Des agrégats : aucune ligne n'y nomme un compte.
 *
 * Décodé champ par champ, comme la lecture (`admin-analytics-playback.ts`) : une
 * semaine ou un jour illisible est écarté seul, un compteur illisible devient `null`
 * (« — »), jamais zéro. Le contrat est `GameBaselineSummary` (`@meeshy/shared/types/game-baseline`).
 */
export type GameWindow = 7 | 30;

export const RETENTION_HORIZONS = Object.keys(RETENTION_HORIZON_DAYS) as readonly RetentionHorizon[];

export type GameRetentionCell = { readonly eligible: number | null; readonly returned: number | null; readonly rate: number | null };

export type GameRetentionCohort = { readonly weekStart: string; readonly accounts: number | null } & Readonly<Record<RetentionHorizon, GameRetentionCell>>;

export type GameDay = {
  readonly day: string;
  readonly offeringsOpened: number | null;
  readonly meeshesMinted: number | null;
  readonly meeshesSpent: number | null;
};

export type GameBaseline = {
  readonly windowDays: number;
  readonly sampled: boolean;
  readonly retention: readonly GameRetentionCohort[];
  readonly daily: readonly GameDay[];
  readonly longFlames: { readonly minDays: number; readonly alive: number } | null;
  readonly guards: { readonly gameHidden: number | null; readonly gameNotificationsOff: number | null };
};

export const gameBaselineKey = (days: GameWindow) => ['admin', 'analytics', 'game', days] as const;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

const dayOf = (raw: unknown): string | null => {
  const text = textOf(raw);
  return text !== null && DAY.test(text) ? text : null;
};

function decodeCell(raw: unknown): GameRetentionCell {
  const record = recordOf(raw);
  const rate = finite(record?.rate);
  return {
    eligible: nonNegative(record?.eligible),
    returned: nonNegative(record?.returned),
    rate: rate !== null && rate >= 0 && rate <= 100 ? rate : null,
  };
}

function decodeCohort(raw: unknown): GameRetentionCohort | null {
  const record = recordOf(raw);
  const weekStart = dayOf(record?.weekStart);
  if (record === null || weekStart === null) return null;
  return {
    weekStart,
    accounts: nonNegative(record.accounts),
    day1: decodeCell(record.day1),
    day7: decodeCell(record.day7),
    day30: decodeCell(record.day30),
  };
}

function decodeDay(raw: unknown): GameDay | null {
  const record = recordOf(raw);
  const day = dayOf(record?.day);
  if (record === null || day === null) return null;
  return {
    day,
    offeringsOpened: nonNegative(record.offeringsOpened),
    meeshesMinted: nonNegative(record.meeshesMinted),
    meeshesSpent: nonNegative(record.meeshesSpent),
  };
}

function decodeLongFlames(raw: unknown): GameBaseline['longFlames'] {
  const record = recordOf(raw);
  const minDays = nonNegative(record?.minDays);
  const alive = nonNegative(record?.alive);
  return minDays === null || alive === null ? null : { minDays, alive };
}

export function decodeGameBaseline(raw: unknown): GameBaseline | null {
  const payload = recordOf(raw);
  const windowDays = nonNegative(payload?.windowDays);
  if (payload === null || windowDays === null || !Array.isArray(payload.retention) || !Array.isArray(payload.daily)) return null;
  const guards = recordOf(payload.guards);
  return {
    windowDays,
    sampled: payload.sampled === true,
    retention: payload.retention.map(decodeCohort).filter((cohort): cohort is GameRetentionCohort => cohort !== null),
    daily: payload.daily.map(decodeDay).filter((day): day is GameDay => day !== null),
    longFlames: decodeLongFlames(payload.longFlames),
    guards: { gameHidden: nonNegative(guards?.gameHidden), gameNotificationsOff: nonNegative(guards?.gameNotificationsOff) },
  };
}

type Request = AdminDeps & { readonly signal?: AbortSignal; readonly days: GameWindow };

export async function loadGameBaseline(params: Request): Promise<ApiResult<GameBaseline>> {
  const path = withQuery(adminEndpoints.analyticsGame, { days: String(params.days) });
  const result = await params.transport.request<unknown>({ method: 'GET', path, ...(params.signal === undefined ? {} : { signal: params.signal }) });
  return decoded(result, decodeGameBaseline, 'Jeu');
}
