/**
 * La QUALITÉ des appels (#11277) : gels, limitation, MOS, relais, codec,
 * plateforme — lue sur la télémétrie que `call:analytics` persiste sur
 * `CallParticipant.analytics`, à côté de la fiabilité
 * (`callAnalyticsAggregate.ts`), sur la même fenêtre et la même lecture.
 *
 * Pure et totale (aucune E/S, aucune levée). Une mesure illisible ou hors de
 * son domaine est écartée SEULE, jamais la ligne. Aucune donnée personnelle
 * ne survit à la coercition : ni appareil, ni appel, ni participant.
 */
import type { CallQualitySummary } from '@meeshy/shared/types/call-analytics';

export type CallQualityRecord = {
  readonly connected: boolean;
  readonly isVideo: boolean;
  readonly codec: string;
  readonly platform: string;
  readonly freezeCount?: number;
  readonly totalFreezesDuration?: number;
  readonly qualityLimitationReason?: string;
  readonly jitterBufferDelay?: number;
  readonly concealedSamples?: number;
  readonly nackCount?: number;
  readonly pliCount?: number;
  readonly mos?: number;
  readonly candidateType?: string;
  readonly relayProtocol?: string;
};

const LOW_MOS = 3.5;
const LIMITATION_REASONS = ['none', 'cpu', 'bandwidth'] as const;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const measure = (value: unknown, accepts: (n: number) => boolean): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && accepts(value) ? value : undefined;

const label = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value.trim().toLowerCase() : undefined;

const count = (n: number) => Number.isInteger(n) && n >= 0;
const nonNegative = (n: number) => n >= 0;

export function coerceCallQuality(value: unknown): CallQualityRecord | null {
  if (!isRecord(value)) return null;
  const setupTimeMs = measure(value.setupTimeMs, () => true);
  if (setupTimeMs === undefined) return null;
  return {
    connected: setupTimeMs >= 0,
    isVideo: value.isVideo === true,
    codec: label(value.codec) ?? 'unknown',
    platform: label(value.platform) ?? 'unknown',
    freezeCount: measure(value.freezeCount, count),
    totalFreezesDuration: measure(value.totalFreezesDuration, nonNegative),
    qualityLimitationReason: label(value.qualityLimitationReason),
    jitterBufferDelay: measure(value.jitterBufferDelay, nonNegative),
    concealedSamples: measure(value.concealedSamples, count),
    nackCount: measure(value.nackCount, count),
    pliCount: measure(value.pliCount, count),
    mos: measure(value.mos, (n) => n >= 1 && n <= 5),
    candidateType: label(value.candidateType),
    relayProtocol: label(value.relayProtocol),
  };
}

const QUALITY_FIELDS = [
  'freezeCount', 'totalFreezesDuration', 'qualityLimitationReason', 'jitterBufferDelay', 'concealedSamples',
  'nackCount', 'pliCount', 'mos', 'candidateType', 'relayProtocol',
] as const satisfies readonly (keyof CallQualityRecord)[];

const average = (values: readonly number[]): number | null =>
  values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

const share = (part: number, whole: number): number | null => (whole > 0 ? part / whole : null);

const tally = (keys: readonly string[]): Record<string, number> =>
  keys.reduce<Record<string, number>>((acc, key) => ({ ...acc, [key]: (acc[key] ?? 0) + 1 }), {});

const defined = <T>(values: readonly (T | undefined)[]): T[] => values.filter((value): value is T => value !== undefined);

const limitationOf = (reason: string): (typeof LIMITATION_REASONS)[number] | 'other' =>
  (LIMITATION_REASONS as readonly string[]).includes(reason) ? (reason as (typeof LIMITATION_REASONS)[number]) : 'other';

export function summarizeCallQuality(records: readonly CallQualityRecord[]): CallQualitySummary {
  const connected = records.filter((record) => record.connected);
  const videoFreezes = connected.filter((record) => record.isVideo && record.freezeCount !== undefined);
  const moses = defined(connected.map((record) => record.mos));
  const candidates = connected.filter((record) => record.candidateType !== undefined);
  const relayed = candidates.filter((record) => record.candidateType === 'relay');
  const limitations = tally(defined(connected.map((record) => record.qualityLimitationReason)).map(limitationOf));

  return {
    connectedCalls: connected.length,
    reportingCalls: connected.filter((record) => QUALITY_FIELDS.some((field) => record[field] !== undefined)).length,
    freezes: {
      reportingVideoCalls: videoFreezes.length,
      frozenRate: share(videoFreezes.filter((record) => (record.freezeCount ?? 0) > 0).length, videoFreezes.length),
      avgFreezeCount: average(defined(videoFreezes.map((record) => record.freezeCount))),
      avgFreezeDurationSeconds: average(defined(videoFreezes.map((record) => record.totalFreezesDuration))),
    },
    qualityLimitation: {
      none: limitations.none ?? 0,
      cpu: limitations.cpu ?? 0,
      bandwidth: limitations.bandwidth ?? 0,
      other: limitations.other ?? 0,
    },
    mos: {
      reportingCalls: moses.length,
      avg: average(moses),
      lowRate: share(moses.filter((mos) => mos < LOW_MOS).length, moses.length),
    },
    avgJitterBufferDelayMs: average(defined(connected.map((record) => record.jitterBufferDelay))),
    avgConcealedSamples: average(defined(connected.map((record) => record.concealedSamples))),
    avgNackCount: average(defined(connected.map((record) => record.nackCount))),
    avgPliCount: average(defined(connected.map((record) => record.pliCount))),
    relay: {
      reportingCalls: candidates.length,
      relayedRate: share(relayed.length, candidates.length),
      byProtocol: tally(defined(relayed.map((record) => record.relayProtocol))),
    },
    byCodec: tally(connected.map((record) => record.codec)),
    byPlatform: tally(connected.map((record) => record.platform)),
  };
}
