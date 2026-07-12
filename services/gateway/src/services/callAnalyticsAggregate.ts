/**
 * Pure aggregation of the per-participant call telemetry persisted on
 * `CallParticipant.analytics` (written by CallEventsHandler's `call:analytics`
 * handler at hangup). The write side has existed since the reliability arc but
 * nothing ever READ it back — the telemetry accumulated write-only, invisible
 * to the dashboards it was collected for. This module closes that loop: the
 * admin `GET /analytics/calls` endpoint coerces the stored JSON rows and
 * summarises them into reliability metrics.
 *
 * Pure + total (no I/O, no throw): every branch is unit-tested without a DB,
 * the same discipline as the Android `CallAnalytics` model.
 */

export type QualityDistribution = {
  readonly excellent: number;
  readonly good: number;
  readonly fair: number;
  readonly poor: number;
};

/** The validated shape written on the wire (`socketCallAnalyticsSchema`), read
 *  back from the JSON column — `callId`/device fields are irrelevant to the
 *  aggregate and intentionally dropped. */
export type CallAnalyticsRecord = {
  readonly setupTimeMs: number;
  readonly negotiationTimeMs?: number;
  readonly durationSeconds: number;
  readonly reconnectionCount: number;
  readonly networkTransitions: number;
  readonly averageRtt: number;
  readonly averagePacketLoss: number;
  readonly maxPacketLoss: number;
  readonly qualityDistribution: QualityDistribution;
  readonly platform: string;
  readonly isVideo: boolean;
  readonly endReason: string;
};

export type CallReliabilitySummary = {
  readonly totalCalls: number;
  readonly videoShare: number;
  /** Fraction of calls that actually connected (setupTimeMs >= 0); the rest
   *  carry the -1 « never connected » sentinel (missed/rejected/failed setup). */
  readonly connectSuccessRate: number;
  /** Averaged over CONNECTED calls only (setupTimeMs >= 0); null if none — the
   *  -1 « never connected » sentinel must never pollute the mean. */
  readonly avgSetupTimeMs: number | null;
  /** Averaged over rows carrying a real value only (present and >= 0); null if none. */
  readonly avgNegotiationTimeMs: number | null;
  readonly avgDurationSeconds: number;
  readonly avgReconnectionCount: number;
  /** Fraction of calls that reconnected at least once. */
  readonly reconnectionRate: number;
  readonly avgNetworkTransitions: number;
  readonly avgRtt: number;
  readonly avgPacketLoss: number;
  readonly maxPacketLoss: number;
  readonly qualityDistribution: QualityDistribution;
  readonly byPlatform: Record<string, number>;
  readonly byEndReason: Record<string, number>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const finiteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const coerceQuality = (value: unknown): QualityDistribution => {
  if (!isRecord(value)) return { excellent: 0, good: 0, fair: 0, poor: 0 };
  return {
    excellent: finiteNumber(value.excellent) ?? 0,
    good: finiteNumber(value.good) ?? 0,
    fair: finiteNumber(value.fair) ?? 0,
    poor: finiteNumber(value.poor) ?? 0,
  };
};

/**
 * Turn one stored JSON value into a typed record, or `null` if it can't be
 * trusted (legacy/shape-drifted rows must be skipped, never crash the endpoint).
 * Required numeric fields must be present and finite; `qualityDistribution`
 * defaults to zeros; `negotiationTimeMs` stays optional.
 */
export function coerceCallAnalytics(value: unknown): CallAnalyticsRecord | null {
  if (!isRecord(value)) return null;

  const setupTimeMs = finiteNumber(value.setupTimeMs);
  const durationSeconds = finiteNumber(value.durationSeconds);
  const reconnectionCount = finiteNumber(value.reconnectionCount);
  const networkTransitions = finiteNumber(value.networkTransitions);
  const averageRtt = finiteNumber(value.averageRtt);
  const averagePacketLoss = finiteNumber(value.averagePacketLoss);
  const maxPacketLoss = finiteNumber(value.maxPacketLoss);
  if (
    setupTimeMs === null || durationSeconds === null || reconnectionCount === null ||
    networkTransitions === null || averageRtt === null || averagePacketLoss === null ||
    maxPacketLoss === null
  ) {
    return null;
  }

  const negotiation = finiteNumber(value.negotiationTimeMs);

  return {
    setupTimeMs,
    negotiationTimeMs: negotiation ?? undefined,
    durationSeconds,
    reconnectionCount,
    networkTransitions,
    averageRtt,
    averagePacketLoss,
    maxPacketLoss,
    qualityDistribution: coerceQuality(value.qualityDistribution),
    platform: typeof value.platform === 'string' ? value.platform : 'unknown',
    isVideo: value.isVideo === true,
    endReason: typeof value.endReason === 'string' ? value.endReason : 'unknown',
  };
}

const ZERO_SUMMARY: CallReliabilitySummary = {
  totalCalls: 0,
  videoShare: 0,
  connectSuccessRate: 0,
  avgSetupTimeMs: null,
  avgNegotiationTimeMs: null,
  avgDurationSeconds: 0,
  avgReconnectionCount: 0,
  reconnectionRate: 0,
  avgNetworkTransitions: 0,
  avgRtt: 0,
  avgPacketLoss: 0,
  maxPacketLoss: 0,
  qualityDistribution: { excellent: 0, good: 0, fair: 0, poor: 0 },
  byPlatform: {},
  byEndReason: {},
};

/** Aggregate reliability metrics over a set of call-analytics records. */
export function summarizeCallReliability(
  records: readonly CallAnalyticsRecord[]
): CallReliabilitySummary {
  const n = records.length;
  if (n === 0) return ZERO_SUMMARY;

  const sum = (pick: (r: CallAnalyticsRecord) => number): number =>
    records.reduce((acc, r) => acc + pick(r), 0);

  // Both setup and negotiation times use -1 (or absent) as the « never
  // connected » sentinel — averaging them in would deflate the mean with a
  // fake value. Aggregate each over its connected rows only.
  const setups = records.map((r) => r.setupTimeMs).filter((v) => v >= 0);
  const negotiations = records
    .map((r) => r.negotiationTimeMs)
    .filter((v): v is number => typeof v === 'number' && v >= 0);
  const avg = (xs: readonly number[]): number | null =>
    xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : null;

  const byCount = (pick: (r: CallAnalyticsRecord) => string): Record<string, number> =>
    records.reduce<Record<string, number>>((acc, r) => {
      const key = pick(r);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

  return {
    totalCalls: n,
    videoShare: records.filter((r) => r.isVideo).length / n,
    connectSuccessRate: setups.length / n,
    avgSetupTimeMs: avg(setups),
    avgNegotiationTimeMs: avg(negotiations),
    avgDurationSeconds: sum((r) => r.durationSeconds) / n,
    avgReconnectionCount: sum((r) => r.reconnectionCount) / n,
    reconnectionRate: records.filter((r) => r.reconnectionCount > 0).length / n,
    avgNetworkTransitions: sum((r) => r.networkTransitions) / n,
    avgRtt: sum((r) => r.averageRtt) / n,
    avgPacketLoss: sum((r) => r.averagePacketLoss) / n,
    maxPacketLoss: records.reduce((acc, r) => Math.max(acc, r.maxPacketLoss), 0),
    qualityDistribution: {
      excellent: sum((r) => r.qualityDistribution.excellent) / n,
      good: sum((r) => r.qualityDistribution.good) / n,
      fair: sum((r) => r.qualityDistribution.fair) / n,
      poor: sum((r) => r.qualityDistribution.poor) / n,
    },
    byPlatform: byCount((r) => r.platform),
    byEndReason: byCount((r) => r.endReason),
  };
}
