import { DEVICE_TIERS, type DeviceTier } from '@meeshy/shared/types/social-events-v2';
import { PLAYBACK_PAGE_VITALS, type PlaybackPageVital, type PlaybackPageVitalsQuantiles, type PlaybackQoeCell, type QuantilePair } from '@meeshy/shared/types/playback-qoe';
import { CONTENT_EVENT_COLLECTION, type RawCommandPrisma } from './contentEvents';

/**
 * La LECTURE de la qualité de lecture (#11280) : temps-à-première-image,
 * rebuffer et — pour le web — Web Vitals et longues images (#11317) de chaque surface, en p50/p95, par tier d'appareil et par jour —
 * depuis les sessions `playback` que l'ingestion v2 range dans `ContentEvent`.
 *
 * Pur et total sauf `readPlaybackQoeRows`. Une mesure illisible est écartée
 * SEULE, jamais la ligne. Le k-anonymat compte les COMPTES distincts : une
 * ligne sans compte nourrit la mesure, jamais le seuil (on ne compte que ce
 * qu'on peut prouver distinct). Aucun identifiant ne sort de l'agrégat.
 */

export type PlaybackQoeRow = {
  readonly day: number;
  readonly surface?: string;
  readonly deviceTier?: DeviceTier;
  readonly accountId?: string;
  readonly startupMs?: number;
  readonly rebufferMs?: number;
  readonly playedMs?: number;
  readonly rebufferCount?: number;
} & { readonly [K in PlaybackPageVital]?: number };

const TIERS: ReadonlySet<string> = new Set(DEVICE_TIERS);
const UNKNOWN = 'unknown';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const nonNegative = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;

const isDay = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 19_700_101 && value <= 99_991_231;

const objectIdOf = (value: unknown): string | undefined => {
  if (typeof value === 'string') return value;
  if (isRecord(value) && typeof value.$oid === 'string') return value.$oid;
  return undefined;
};

export function coercePlaybackQoeRow(value: unknown): PlaybackQoeRow | null {
  if (!isRecord(value) || !isDay(value.day)) return null;
  const props = isRecord(value.props) ? value.props : {};
  const tier = typeof props.deviceTier === 'string' && TIERS.has(props.deviceTier) ? (props.deviceTier as DeviceTier) : undefined;
  return {
    day: value.day,
    surface: typeof value.surface === 'string' && value.surface.length > 0 ? value.surface : undefined,
    deviceTier: tier,
    accountId: objectIdOf(value.userId),
    startupMs: props.exitBeforeStart === true ? undefined : nonNegative(props.startupMs),
    rebufferMs: nonNegative(props.rebufferMs),
    playedMs: nonNegative(props.playedMs),
    rebufferCount: nonNegative(props.rebufferCount),
    ...vitalsOf(props),
  };
}

/** W11 (#11317) — les mesures de page du résumé ; une illisible est écartée SEULE. */
const vitalsOf = (props: Record<string, unknown>): { readonly [K in PlaybackPageVital]?: number } =>
  Object.fromEntries(PLAYBACK_PAGE_VITALS.map((field) => [field, nonNegative(props[field])]));

const nearestRank = (sorted: readonly number[], p: number): number =>
  sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];

const quantiles = (values: readonly number[]): QuantilePair | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return { p50: nearestRank(sorted, 0.5), p95: nearestRank(sorted, 0.95) };
};

const defined = <T>(values: readonly (T | undefined)[]): T[] => values.filter((value): value is T => value !== undefined);

const ratioOf = (row: PlaybackQoeRow): number | undefined => {
  if (row.rebufferMs === undefined || row.playedMs === undefined) return undefined;
  const total = row.playedMs + row.rebufferMs;
  return total > 0 ? row.rebufferMs / total : undefined;
};

const isoDayOf = (day: number): string => {
  const text = String(day);
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
};

const cellKeyOf = (row: PlaybackQoeRow): string =>
  `${row.day}|${row.surface ?? UNKNOWN}|${row.deviceTier ?? UNKNOWN}`;

const cellOf = (rows: readonly PlaybackQoeRow[]): PlaybackQoeCell => {
  const [first] = rows;
  const counted = rows.filter((row) => row.rebufferCount !== undefined);
  return {
    day: isoDayOf(first.day),
    surface: first.surface ?? UNKNOWN,
    deviceTier: first.deviceTier ?? UNKNOWN,
    sessions: rows.length,
    devices: new Set(defined(rows.map((row) => row.accountId))).size,
    timeToFirstFrameMs: quantiles(defined(rows.map((row) => row.startupMs))),
    rebufferMs: quantiles(defined(rows.map((row) => row.rebufferMs))),
    rebufferRatio: quantiles(defined(rows.map(ratioOf))),
    rebufferedRate: counted.length > 0 ? counted.filter((row) => (row.rebufferCount ?? 0) > 0).length / counted.length : null,
    ...vitalQuantilesOf(rows),
  };
};

const vitalQuantilesOf = (rows: readonly PlaybackQoeRow[]): PlaybackPageVitalsQuantiles =>
  Object.fromEntries(PLAYBACK_PAGE_VITALS.map((field) => [field, quantiles(defined(rows.map((row) => row[field])))])) as PlaybackPageVitalsQuantiles;

const byCellKey = (a: PlaybackQoeCell, b: PlaybackQoeCell): number =>
  a.day.localeCompare(b.day) || a.surface.localeCompare(b.surface) || a.deviceTier.localeCompare(b.deviceTier);

/**
 * Groupement LINÉAIRE : la lecture porte jusqu'à 50 000 lignes, et une
 * réduction qui recopie la carte à chaque ligne serait quadratique. La
 * mutation reste confinée à cette fonction, qui ne rend qu'une vue en lecture.
 */
const groupByCell = (rows: readonly PlaybackQoeRow[]): ReadonlyMap<string, readonly PlaybackQoeRow[]> => {
  const groups = new Map<string, PlaybackQoeRow[]>();
  rows.forEach((row) => {
    const key = cellKeyOf(row);
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  });
  return groups;
};

export function summarizePlaybackQoe(
  rows: readonly PlaybackQoeRow[],
  options: { readonly minDevices: number },
): { readonly cells: readonly PlaybackQoeCell[]; readonly suppressedCells: number } {
  const all = [...groupByCell(rows).values()].map(cellOf);
  const served = all.filter((cell) => cell.devices >= options.minDevices);
  return { cells: [...served].sort(byCellKey), suppressedCells: all.length - served.length };
}

/** Une lecture bornée sur l'index `ContentEvent_type_action_day`, qui ne projette que la mesure. */
export function playbackQoePipeline(params: { readonly sinceDay: number; readonly cap: number }): readonly Record<string, unknown>[] {
  return [
    { $match: { type: 'playback', action: 'session', day: { $gte: params.sinceDay } } },
    { $sort: { day: -1 } },
    { $limit: params.cap },
    {
      $project: {
        _id: 0,
        day: 1,
        surface: 1,
        userId: 1,
        'props.startupMs': 1,
        'props.exitBeforeStart': 1,
        'props.rebufferMs': 1,
        'props.playedMs': 1,
        'props.rebufferCount': 1,
        'props.deviceTier': 1,
        ...Object.fromEntries(PLAYBACK_PAGE_VITALS.map((field) => [`props.${field}`, 1])),
      },
    },
  ];
}

export async function readPlaybackQoeRows(
  prisma: RawCommandPrisma,
  params: { readonly sinceDay: number; readonly cap: number },
): Promise<readonly PlaybackQoeRow[]> {
  const result = await prisma.$runCommandRaw({
    aggregate: CONTENT_EVENT_COLLECTION,
    pipeline: [...playbackQoePipeline(params)],
    cursor: { batchSize: params.cap },
  });
  const batch = isRecord(result) && isRecord(result.cursor) && Array.isArray(result.cursor.firstBatch)
    ? result.cursor.firstBatch
    : [];
  return batch.map(coercePlaybackQoeRow).filter((row): row is PlaybackQoeRow => row !== null);
}
