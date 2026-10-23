import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import type { AdminDeps } from './admin';
import { decoded, nonNegative, recordOf, textOf, withQuery } from './admin-analytics-decode';
import type { ApiResult } from './http';

/**
 * **LA QUALITÉ DE LECTURE** (#11280) — `GET /admin/analytics/playback?days=` :
 * temps jusqu'à la première image et rebuffer, en p50/p95, par jour × surface ×
 * tier d'appareil. La passerelle ne sert une cellule qu'au-delà de `minDevices`
 * comptes distincts (k-anonymat) et ne dit des autres que leur NOMBRE.
 *
 * Décodé champ par champ. Les cellules ne sont pas positionnelles : une cellule
 * illisible est écartée seule, une mesure illisible devient `null` (« — »).
 * Clés sous `['admin', 'analytics']` : jamais persistées sur le disque.
 */
export type PlaybackWindow = 7 | 30;

export type QuantilePair = { readonly p50: number; readonly p95: number };

export type PlaybackCell = {
  readonly day: string;
  readonly surface: string;
  readonly deviceTier: string;
  readonly sessions: number;
  readonly devices: number;
  readonly timeToFirstFrameMs: QuantilePair | null;
  readonly rebufferMs: QuantilePair | null;
  readonly rebufferedRate: number | null;
} & PlaybackPageVitals;

/**
 * W11 (#11317) — les Web Vitals de la page et les longues images d'animation
 * survenues pendant la séance, en p50/p95. `null` quand aucune séance de la
 * cellule ne les porte (applications natives, ancien web, passerelle d'avant).
 */
export const PLAYBACK_PAGE_VITALS = ['lcpMs', 'cls', 'inpMs', 'longFrames', 'longFramesBlockingMs', 'longFrameWorstMs'] as const;
export type PlaybackPageVitals = { readonly [K in (typeof PLAYBACK_PAGE_VITALS)[number]]: QuantilePair | null };

export type PlaybackQoe = {
  readonly windowDays: number;
  readonly sampled: boolean;
  readonly minDevices: number;
  readonly cells: readonly PlaybackCell[];
  readonly suppressedCells: number;
};

export const playbackKey = (days: PlaybackWindow) => ['admin', 'analytics', 'playback', days] as const;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function quantiles(raw: unknown): QuantilePair | null {
  const record = recordOf(raw);
  const p50 = nonNegative(record?.p50);
  const p95 = nonNegative(record?.p95);
  return p50 === null || p95 === null ? null : { p50, p95 };
}

function decodeCell(raw: unknown): PlaybackCell | null {
  const record = recordOf(raw);
  const day = textOf(record?.day);
  const surface = textOf(record?.surface);
  const deviceTier = textOf(record?.deviceTier);
  const sessions = nonNegative(record?.sessions);
  const devices = nonNegative(record?.devices);
  if (record === null || day === null || !DAY.test(day) || surface === null || deviceTier === null || sessions === null || devices === null) return null;
  return {
    day,
    surface,
    deviceTier,
    sessions,
    devices,
    timeToFirstFrameMs: quantiles(record.timeToFirstFrameMs),
    rebufferMs: quantiles(record.rebufferMs),
    rebufferedRate: nonNegative(record.rebufferedRate),
    ...(Object.fromEntries(PLAYBACK_PAGE_VITALS.map((field) => [field, quantiles(record[field])])) as PlaybackPageVitals),
  };
}

export function decodePlaybackQoe(raw: unknown): PlaybackQoe | null {
  const payload = recordOf(raw);
  const windowDays = nonNegative(payload?.windowDays);
  if (payload === null || windowDays === null || !Array.isArray(payload.cells)) return null;
  return {
    windowDays,
    sampled: payload.sampled === true,
    minDevices: nonNegative(payload.minDevices) ?? 0,
    cells: payload.cells.map(decodeCell).filter((cell): cell is PlaybackCell => cell !== null),
    suppressedCells: nonNegative(payload.suppressedCells) ?? 0,
  };
}

type Request = AdminDeps & { readonly signal?: AbortSignal; readonly days: PlaybackWindow };

export async function loadPlaybackQoe(params: Request): Promise<ApiResult<PlaybackQoe>> {
  const path = withQuery(adminEndpoints.analyticsPlayback, { days: String(params.days) });
  const result = await params.transport.request<unknown>({ method: 'GET', path, ...(params.signal === undefined ? {} : { signal: params.signal }) });
  return decoded(result, decodePlaybackQoe, 'Lecture');
}
