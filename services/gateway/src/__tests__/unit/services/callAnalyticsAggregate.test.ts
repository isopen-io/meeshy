/**
 * Pure aggregation of the per-participant call telemetry persisted on
 * `CallParticipant.analytics` (written by CallEventsHandler's `call:analytics`
 * handler). The write side has existed since the reliability arc; this closes
 * the READ side end-to-end — the admin dashboard endpoint aggregates these
 * records into a reliability summary. Pure + total so every branch is unit-
 * tested without a DB (same discipline as the Android `CallAnalytics` model).
 */

import { describe, it, expect } from '@jest/globals';
import {
  coerceCallAnalytics,
  summarizeCallReliability,
  type CallAnalyticsRecord,
} from '../../../services/callAnalyticsAggregate';

function record(overrides: Partial<CallAnalyticsRecord> = {}): CallAnalyticsRecord {
  return {
    setupTimeMs: 3000,
    negotiationTimeMs: 800,
    durationSeconds: 120,
    reconnectionCount: 0,
    networkTransitions: 0,
    averageRtt: 100,
    averagePacketLoss: 0.5,
    maxPacketLoss: 2,
    qualityDistribution: { excellent: 1, good: 0, fair: 0, poor: 0 },
    platform: 'ios',
    isVideo: false,
    endReason: 'completed',
    ...overrides,
  };
}

describe('coerceCallAnalytics', () => {
  it('accepts a well-formed persisted record', () => {
    const out = coerceCallAnalytics(record({ platform: 'android' }));
    expect(out?.platform).toBe('android');
  });

  it('rejects null / non-object JSON', () => {
    expect(coerceCallAnalytics(null)).toBeNull();
    expect(coerceCallAnalytics('nope')).toBeNull();
    expect(coerceCallAnalytics(42)).toBeNull();
  });

  it('rejects a record missing required numeric fields (shape drift / legacy row)', () => {
    const { setupTimeMs: _drop, ...partial } = record();
    expect(coerceCallAnalytics(partial)).toBeNull();
  });

  it('defaults an absent qualityDistribution to zeros rather than crashing', () => {
    const { qualityDistribution: _drop, ...partial } = record();
    const out = coerceCallAnalytics(partial);
    expect(out?.qualityDistribution).toEqual({ excellent: 0, good: 0, fair: 0, poor: 0 });
  });

  it('preserves an absent negotiationTimeMs as undefined (iOS < 2026-07-03)', () => {
    const { negotiationTimeMs: _drop, ...partial } = record();
    const out = coerceCallAnalytics(partial);
    expect(out?.negotiationTimeMs).toBeUndefined();
  });
});

describe('summarizeCallReliability', () => {
  it('returns a zeroed summary for an empty set (no divide-by-zero)', () => {
    const s = summarizeCallReliability([]);
    expect(s.totalCalls).toBe(0);
    expect(s.connectSuccessRate).toBe(0);
    expect(s.avgSetupTimeMs).toBeNull();
    expect(s.avgRtt).toBe(0);
    expect(s.maxPacketLoss).toBe(0);
    expect(s.reconnectionRate).toBe(0);
    expect(s.avgNegotiationTimeMs).toBeNull();
    expect(s.qualityDistribution).toEqual({ excellent: 0, good: 0, fair: 0, poor: 0 });
    expect(s.byPlatform).toEqual({});
    expect(s.byEndReason).toEqual({});
  });

  it('excludes the -1 « never connected » sentinel from the setup-time average', () => {
    // A missed/rejected/failed-setup call reports setupTimeMs=-1; averaging it
    // in would deflate the mean (prod data 2026-07-12: real -1 rows exist).
    const s = summarizeCallReliability([
      record({ setupTimeMs: 2000 }),
      record({ setupTimeMs: 4000 }),
      record({ setupTimeMs: -1 }),
    ]);
    expect(s.avgSetupTimeMs).toBe(3000);
  });

  it('leaves avgSetupTimeMs null when no call ever connected', () => {
    const s = summarizeCallReliability([
      record({ setupTimeMs: -1 }),
      record({ setupTimeMs: -1 }),
    ]);
    expect(s.avgSetupTimeMs).toBeNull();
  });

  it('reports the connect success rate as the fraction that actually connected', () => {
    const s = summarizeCallReliability([
      record({ setupTimeMs: 1500 }),  // connected
      record({ setupTimeMs: -1 }),    // never connected
      record({ setupTimeMs: 0 }),     // connected (instant, edge)
      record({ setupTimeMs: -1 }),    // never connected
    ]);
    expect(s.connectSuccessRate).toBe(0.5);
  });

  it('counts total calls and the video share', () => {
    const s = summarizeCallReliability([
      record({ isVideo: true }),
      record({ isVideo: false }),
      record({ isVideo: false }),
    ]);
    expect(s.totalCalls).toBe(3);
    expect(s.videoShare).toBeCloseTo(1 / 3, 5);
  });

  it('averages setup/rtt/packet-loss and takes the max packet loss', () => {
    const s = summarizeCallReliability([
      record({ setupTimeMs: 2000, averageRtt: 100, averagePacketLoss: 1, maxPacketLoss: 3 }),
      record({ setupTimeMs: 4000, averageRtt: 200, averagePacketLoss: 2, maxPacketLoss: 9 }),
    ]);
    expect(s.avgSetupTimeMs).toBe(3000);
    expect(s.avgRtt).toBe(150);
    expect(s.avgPacketLoss).toBe(1.5);
    expect(s.maxPacketLoss).toBe(9);
  });

  it('computes the reconnection rate as the fraction of calls that reconnected', () => {
    const s = summarizeCallReliability([
      record({ reconnectionCount: 0 }),
      record({ reconnectionCount: 2 }),
      record({ reconnectionCount: 1 }),
      record({ reconnectionCount: 0 }),
    ]);
    expect(s.avgReconnectionCount).toBe(0.75);
    expect(s.reconnectionRate).toBe(0.5);
  });

  it('averages negotiationTimeMs only over rows that carry a real value (>=0, present)', () => {
    const s = summarizeCallReliability([
      record({ negotiationTimeMs: 600 }),
      record({ negotiationTimeMs: 1000 }),
      record({ negotiationTimeMs: -1 }), // sentinel: never connected / missing anchor
      record({ negotiationTimeMs: undefined }), // legacy build without the metric
    ]);
    expect(s.avgNegotiationTimeMs).toBe(800);
  });

  it('leaves avgNegotiationTimeMs null when no row carries a real value', () => {
    const s = summarizeCallReliability([
      record({ negotiationTimeMs: -1 }),
      record({ negotiationTimeMs: undefined }),
    ]);
    expect(s.avgNegotiationTimeMs).toBeNull();
  });

  it('averages the quality distribution across calls', () => {
    const s = summarizeCallReliability([
      record({ qualityDistribution: { excellent: 1, good: 0, fair: 0, poor: 0 } }),
      record({ qualityDistribution: { excellent: 0, good: 0, fair: 0, poor: 1 } }),
    ]);
    expect(s.qualityDistribution.excellent).toBeCloseTo(0.5, 5);
    expect(s.qualityDistribution.poor).toBeCloseTo(0.5, 5);
  });

  it('breaks calls down by platform and by end reason', () => {
    const s = summarizeCallReliability([
      record({ platform: 'ios', endReason: 'completed' }),
      record({ platform: 'ios', endReason: 'rejected' }),
      record({ platform: 'android', endReason: 'completed' }),
      record({ platform: 'web', endReason: 'connectionLost' }),
    ]);
    expect(s.byPlatform).toEqual({ ios: 2, android: 1, web: 1 });
    expect(s.byEndReason).toEqual({ completed: 2, rejected: 1, connectionLost: 1 });
  });
});
