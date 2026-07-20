/**
 * Pure web call-telemetry accumulator — the SSOT for the `call:analytics`
 * payload the web reports once at hangup. Parité iOS `emitCallAnalyticsSnapshot`
 * / Android `CallAnalytics`. The web was the ONE client that never emitted this
 * telemetry (prod 2026-07-12: 100% of persisted analytics rows were iOS),
 * leaving the reliability dashboard blind to web calls.
 *
 * Pure + total (no I/O, no React). The lifecycle hook threads real signals in;
 * `buildAnalyticsPayload` renders the schema-shaped payload
 * (`socketCallAnalyticsSchema`) at teardown.
 */

import type { ConnectionQualityLevel } from '@meeshy/shared/types/video-call';

export type QualitySample = {
  readonly level: ConnectionQualityLevel;
  readonly rtt: number;
  readonly packetLoss: number;
};

export type CallAnalyticsAccumulator = {
  readonly startedAtMs: number;
  readonly connectedAtMs: number | null;
  readonly reconnectionCount: number;
  readonly samples: readonly QualitySample[];
};

export type AnalyticsPayload = {
  callId: string;
  setupTimeMs: number;
  durationSeconds: number;
  reconnectionCount: number;
  networkTransitions: number;
  averageRtt: number;
  averagePacketLoss: number;
  maxPacketLoss: number;
  codec: string;
  effectsUsed: string[];
  filtersUsed: boolean;
  transcriptionUsed: boolean;
  qualityDistribution: { excellent: number; good: number; fair: number; poor: number };
  platform: string;
  deviceModel: string;
  isVideo: boolean;
  endReason: string;
};

export function createCallAnalytics(startedAtMs: number): CallAnalyticsAccumulator {
  return { startedAtMs, connectedAtMs: null, reconnectionCount: 0, samples: [] };
}

/** First connect anchors setupTimeMs; a later re-connect (post-reconnect) never re-anchors. */
export function markConnected(
  acc: CallAnalyticsAccumulator,
  nowMs: number
): CallAnalyticsAccumulator {
  if (acc.connectedAtMs !== null) return acc;
  return { ...acc, connectedAtMs: nowMs };
}

export function markReconnecting(acc: CallAnalyticsAccumulator): CallAnalyticsAccumulator {
  return { ...acc, reconnectionCount: acc.reconnectionCount + 1 };
}

export function addQualitySample(
  acc: CallAnalyticsAccumulator,
  sample: QualitySample
): CallAnalyticsAccumulator {
  return { ...acc, samples: [...acc.samples, sample] };
}

export function buildAnalyticsPayload(
  acc: CallAnalyticsAccumulator,
  opts: { callId: string; nowMs: number; isVideo: boolean; endReason: string; deviceModel?: string }
): AnalyticsPayload {
  const { samples } = acc;
  const n = samples.length;
  const setupTimeMs = acc.connectedAtMs !== null ? acc.connectedAtMs - acc.startedAtMs : -1;
  const durationSeconds = Math.max(0, Math.round((opts.nowMs - acc.startedAtMs) / 1000));

  const dist = { excellent: 0, good: 0, fair: 0, poor: 0 };
  for (const s of samples) dist[s.level] += 1;

  return {
    callId: opts.callId,
    setupTimeMs,
    durationSeconds,
    reconnectionCount: acc.reconnectionCount,
    networkTransitions: 0, // the browser has no reliable network-transition signal
    averageRtt: n > 0 ? samples.reduce((a, s) => a + s.rtt, 0) / n : 0,
    averagePacketLoss: n > 0 ? samples.reduce((a, s) => a + s.packetLoss, 0) / n : 0,
    maxPacketLoss: samples.reduce((a, s) => Math.max(a, s.packetLoss), 0),
    codec: 'unknown',
    effectsUsed: [],
    filtersUsed: false,
    transcriptionUsed: false,
    qualityDistribution: n > 0
      ? {
          excellent: dist.excellent / n,
          good: dist.good / n,
          fair: dist.fair / n,
          poor: dist.poor / n,
        }
      : { excellent: 0, good: 0, fair: 0, poor: 0 },
    platform: 'web',
    deviceModel: opts.deviceModel ?? 'web',
    isVideo: opts.isVideo,
    endReason: opts.endReason,
  };
}
