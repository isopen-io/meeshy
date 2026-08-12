/**
 * Pure web call-telemetry accumulator — the SSOT for the `call:analytics`
 * payload the web reports at hangup. Parité iOS `emitCallAnalyticsSnapshot` /
 * Android `CallAnalytics`: the web was the ONE client that never emitted this
 * telemetry (prod 2026-07-12: 100% of analytics rows were iOS), leaving the
 * reliability dashboard blind to web calls. Pure + total so every branch is
 * unit-tested without React or a socket.
 */

import {
  createCallAnalytics,
  markConnected,
  markReconnecting,
  addQualitySample,
  buildAnalyticsPayload,
} from '@/lib/call-analytics';

describe('call-analytics accumulator', () => {
  it('setupTimeMs is the connect delay for a call that connected', () => {
    let acc = createCallAnalytics(1_000);
    acc = markConnected(acc, 4_200);

    const payload = buildAnalyticsPayload(acc, {
      callId: 'c1', nowMs: 60_000, isVideo: false, endReason: 'local',
    });

    expect(payload.setupTimeMs).toBe(3_200);
  });

  it('setupTimeMs is the -1 « never connected » sentinel when the call never connected', () => {
    const acc = createCallAnalytics(1_000);

    const payload = buildAnalyticsPayload(acc, {
      callId: 'c1', nowMs: 5_000, isVideo: false, endReason: 'missed',
    });

    expect(payload.setupTimeMs).toBe(-1);
  });

  it('only the FIRST connect anchors setupTimeMs (a reconnect never re-anchors)', () => {
    let acc = createCallAnalytics(1_000);
    acc = markConnected(acc, 3_000);
    acc = markConnected(acc, 50_000);

    const payload = buildAnalyticsPayload(acc, {
      callId: 'c1', nowMs: 60_000, isVideo: false, endReason: 'local',
    });

    expect(payload.setupTimeMs).toBe(2_000);
  });

  it('counts reconnections', () => {
    let acc = createCallAnalytics(0);
    acc = markConnected(acc, 1_000);
    acc = markReconnecting(acc);
    acc = markReconnecting(acc);

    const payload = buildAnalyticsPayload(acc, {
      callId: 'c1', nowMs: 30_000, isVideo: false, endReason: 'local',
    });

    expect(payload.reconnectionCount).toBe(2);
  });

  it('averages RTT and packet loss over samples and keeps the max packet loss', () => {
    let acc = createCallAnalytics(0);
    acc = addQualitySample(acc, { level: 'good', rtt: 100, packetLoss: 1 });
    acc = addQualitySample(acc, { level: 'fair', rtt: 300, packetLoss: 5 });

    const payload = buildAnalyticsPayload(acc, {
      callId: 'c1', nowMs: 10_000, isVideo: true, endReason: 'local',
    });

    expect(payload.averageRtt).toBe(200);
    expect(payload.averagePacketLoss).toBe(3);
    expect(payload.maxPacketLoss).toBe(5);
  });

  it('reports zeroed quality metrics when no sample was taken (never connected)', () => {
    const acc = createCallAnalytics(0);

    const payload = buildAnalyticsPayload(acc, {
      callId: 'c1', nowMs: 5_000, isVideo: false, endReason: 'missed',
    });

    expect(payload.averageRtt).toBe(0);
    expect(payload.averagePacketLoss).toBe(0);
    expect(payload.maxPacketLoss).toBe(0);
  });

  it('builds a normalized quality distribution (fractions summing ~1)', () => {
    let acc = createCallAnalytics(0);
    acc = addQualitySample(acc, { level: 'excellent', rtt: 20, packetLoss: 0 });
    acc = addQualitySample(acc, { level: 'excellent', rtt: 25, packetLoss: 0 });
    acc = addQualitySample(acc, { level: 'poor', rtt: 500, packetLoss: 10 });

    const payload = buildAnalyticsPayload(acc, {
      callId: 'c1', nowMs: 30_000, isVideo: false, endReason: 'local',
    });

    expect(payload.qualityDistribution.excellent).toBeCloseTo(2 / 3, 5);
    expect(payload.qualityDistribution.poor).toBeCloseTo(1 / 3, 5);
    expect(payload.qualityDistribution.good).toBe(0);
    expect(payload.qualityDistribution.fair).toBe(0);
  });

  it('an empty distribution (no samples) is all zeros', () => {
    const acc = createCallAnalytics(0);
    const payload = buildAnalyticsPayload(acc, {
      callId: 'c1', nowMs: 1_000, isVideo: false, endReason: 'missed',
    });
    expect(payload.qualityDistribution).toEqual({ excellent: 0, good: 0, fair: 0, poor: 0 });
  });

  it('carries the durationSeconds derived from start→now, callId, platform=web and honest defaults', () => {
    let acc = createCallAnalytics(2_000);
    acc = markConnected(acc, 3_000);

    const payload = buildAnalyticsPayload(acc, {
      callId: 'call-xyz', nowMs: 62_000, isVideo: true, endReason: 'remote',
    });

    expect(payload.callId).toBe('call-xyz');
    expect(payload.durationSeconds).toBe(60);
    expect(payload.isVideo).toBe(true);
    expect(payload.endReason).toBe('remote');
    expect(payload.platform).toBe('web');
    // Honest defaults for signals the web doesn't track.
    expect(payload.networkTransitions).toBe(0);
    expect(payload.filtersUsed).toBe(false);
    expect(payload.effectsUsed).toEqual([]);
  });
});
