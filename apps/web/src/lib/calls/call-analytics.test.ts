import { describe, expect, test } from 'bun:test';

import { analyticsPayload, createTelemetry, deviceLabel, markCaptions, markConnected, markNegotiating, markNetworkChange, markReconnecting, withCodec, withSample } from './call-analytics';

const context = { callId: 'c1', isVideo: true, endReason: 'local', platform: 'web', deviceModel: 'Chrome · Linux' } as const;

describe('le rapport de fin d’appel `call:analytics` (#8047)', () => {
  test('un appel connecté rapporte son établissement, sa négociation, sa durée et ses reprises', () => {
    const telemetry = [
      (t: ReturnType<typeof createTelemetry>) => markNegotiating(t, 4_000),
      (t: ReturnType<typeof createTelemetry>) => markConnected(t, 5_500),
      (t: ReturnType<typeof createTelemetry>) => markConnected(t, 9_000),
      markReconnecting,
      markReconnecting,
      markNetworkChange,
    ].reduce((t, step) => step(t), createTelemetry(1_000));
    const payload = analyticsPayload(telemetry, { ...context, now: 65_500 });
    expect(payload.setupTimeMs).toBe(4_500);
    expect(payload.negotiationTimeMs).toBe(1_500);
    expect(payload.durationSeconds).toBe(60);
    expect(payload.reconnectionCount).toBe(2);
    expect(payload.networkTransitions).toBe(1);
    expect(payload.platform).toBe('web');
    expect(payload.endReason).toBe('local');
  });

  test('un appel jamais connecté rapporte -1 et une durée nulle', () => {
    const payload = analyticsPayload(createTelemetry(0), { ...context, endReason: 'missed', now: 45_000 });
    expect(payload.setupTimeMs).toBe(-1);
    expect(payload.negotiationTimeMs).toBe(-1);
    expect(payload.durationSeconds).toBe(0);
    expect(payload.qualityDistribution).toEqual({ excellent: 0, good: 0, fair: 0, poor: 0 });
  });

  test('la qualité : moyennes, pire perte et répartition en FRACTIONS qui somment à 1', () => {
    const telemetry = [
      { level: 'excellent', rtt: 40, packetLoss: 0 },
      { level: 'good', rtt: 200, packetLoss: 2 },
      { level: 'poor', rtt: 600, packetLoss: 10 },
      { level: 'poor', rtt: 360, packetLoss: 8 },
    ].reduce((t, sample) => withSample(t, sample as Parameters<typeof withSample>[1]), createTelemetry(0));
    const payload = analyticsPayload(telemetry, { ...context, now: 1 });
    expect(payload.averageRtt).toBe(300);
    expect(payload.averagePacketLoss).toBe(5);
    expect(payload.maxPacketLoss).toBe(10);
    expect(payload.qualityDistribution).toEqual({ excellent: 0.25, good: 0.25, fair: 0, poor: 0.5 });
  });

  test('le codec est celui que le lien a RÉELLEMENT négocié ; sans relevé, il est inconnu', () => {
    expect(analyticsPayload(createTelemetry(0), { ...context, now: 1 }).codec).toBe('unknown');
    expect(analyticsPayload(withCodec(withCodec(createTelemetry(0), 'VP8'), null), { ...context, now: 1 }).codec).toBe('VP8');
  });

  test('les sous-titres comptent quand ils ont été LUS, pas codés en dur ; le web n’a ni effet ni filtre', () => {
    expect(analyticsPayload(createTelemetry(0), { ...context, now: 1 }).transcriptionUsed).toBe(false);
    const payload = analyticsPayload(markCaptions(createTelemetry(0)), { ...context, now: 1 });
    expect(payload.transcriptionUsed).toBe(true);
    expect(payload.effectsUsed).toEqual([]);
    expect(payload.filtersUsed).toBe(false);
  });

  test('l’appareil est nommé par son navigateur et son système, jamais par l’agent entier', () => {
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36')).toBe('Chrome · Android');
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1')).toBe('Safari · iOS');
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0')).toBe('Edge · Windows');
    expect(deviceLabel('Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:130.0) Gecko/20100101 Firefox/130.0')).toBe('Firefox · macOS');
    expect(deviceLabel('')).toBe('web');
  });

  test('la mémoire reste bornée : un appel de cent heures ne garde aucun historique', () => {
    const long = Array.from({ length: 10_000 }, () => ({ level: 'good' as const, rtt: 100, packetLoss: 1 })).reduce(withSample, createTelemetry(0));
    expect(JSON.stringify(long).length).toBeLessThan(400);
  });
});
