import { describe, expect, test } from 'bun:test';

import { estimateCallMos } from '@meeshy/shared/utils/call-mos';

import { socketCallAnalyticsSchema } from '../../../../../services/gateway/src/validation/call-schemas';
import { analyticsPayload, createTelemetry, deviceLabel, markCaptions, markConnected, markNegotiating, markNetworkChange, markReconnecting, withCodec, withMedia, withSample } from './call-analytics';
import type { MediaQuality } from './call-analytics-stats';

const context = { callId: '507f1f77bcf86cd799439099', isVideo: true, endReason: 'local', platform: 'web', deviceModel: 'Chrome · Linux' } as const;

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

const QUALITY_FIELDS = ['freezeCount', 'totalFreezesDuration', 'qualityLimitationReason', 'jitterBufferDelay', 'concealedSamples', 'nackCount', 'pliCount', 'mos', 'candidateType', 'relayProtocol'] as const;

const NOTHING_MEASURED: MediaQuality = { freezeCount: null, totalFreezesDuration: null, jitterBufferDelay: null, jitterBufferEmittedCount: null, concealedSamples: null, nackCount: null, pliCount: null, qualityLimitationReason: null, candidateType: null, relayProtocol: null };

const media = (overrides: Partial<MediaQuality> = {}): MediaQuality => ({ ...NOTHING_MEASURED, ...overrides });

const chrome = media({ freezeCount: 2, totalFreezesDuration: 0.9, jitterBufferDelay: 4.8, jitterBufferEmittedCount: 96, concealedSamples: 480, nackCount: 12, pliCount: 3, qualityLimitationReason: 'bandwidth', candidateType: 'relay', relayProtocol: 'udp' });

const sampled = (steps: ReadonlyArray<readonly [MediaQuality, number]>) =>
  steps.reduce((t, [peer, jitter]) => withMedia(withSample(t, { level: 'good', rtt: 200, packetLoss: 2 }), { a: peer }, jitter), createTelemetry(0));

describe('le rapport de fin d’appel porte les gels, la limitation, le MOS et le relais (#19876)', () => {
  test('les compteurs cumulés du DERNIER relevé, le tampon de gigue en millisecondes moyennes, la route élue', () => {
    const early = media({ ...chrome, freezeCount: 1, nackCount: 4 });
    const payload = analyticsPayload(sampled([[early, 20], [chrome, 20]]), { ...context, now: 1 });
    expect(payload.freezeCount).toBe(2);
    expect(payload.totalFreezesDuration).toBe(0.9);
    expect(payload.jitterBufferDelay).toBe(50);
    expect(payload.concealedSamples).toBe(480);
    expect(payload.nackCount).toBe(12);
    expect(payload.pliCount).toBe(3);
    expect(payload.candidateType).toBe('relay');
    expect(payload.relayProtocol).toBe('udp');
  });

  test('la limitation rapportée est la cause DOMINANTE sur l’appel, pas la dernière', () => {
    const at = (qualityLimitationReason: string) => [media({ ...chrome, qualityLimitationReason }), 10] as const;
    expect(analyticsPayload(sampled([at('bandwidth'), at('cpu'), at('bandwidth'), at('none')]), { ...context, now: 1 }).qualityLimitationReason).toBe('bandwidth');
    expect(analyticsPayload(sampled([at('none'), at('cpu')]), { ...context, now: 1 }).qualityLimitationReason).toBe('cpu');
  });

  test('le MOS suit la loi partagée, sur la latence, la gigue et la perte MOYENNES de l’appel', () => {
    const payload = analyticsPayload(sampled([[chrome, 10], [chrome, 30]]), { ...context, now: 1 });
    expect(payload.mos).toBe(Math.round(estimateCallMos({ roundTripTimeMs: 200, jitterMs: 20, packetLossPercent: 2 }) * 100) / 100);
    expect(payload.mos).toBeCloseTo(3.76, 1);
  });

  test('une mesure absente reste ABSENTE : ni 0, ni clé vide', () => {
    const firefox = analyticsPayload(sampled([[media({ nackCount: 4, pliCount: 1, concealedSamples: 7 }), 10]]), { ...context, now: 1 });
    expect(Object.keys(firefox)).not.toContain('freezeCount');
    expect(Object.keys(firefox)).not.toContain('totalFreezesDuration');
    expect(Object.keys(firefox)).not.toContain('jitterBufferDelay');
    expect(Object.keys(firefox)).not.toContain('qualityLimitationReason');
    expect(Object.keys(firefox)).not.toContain('candidateType');
    expect(Object.keys(firefox)).not.toContain('relayProtocol');
    expect(firefox.nackCount).toBe(4);
    const direct = analyticsPayload(sampled([[media({ candidateType: 'host' }), 10]]), { ...context, now: 1 });
    expect(direct.candidateType).toBe('host');
    expect(Object.keys(direct)).not.toContain('relayProtocol');
  });

  test('sans aucun relevé média, aucun champ de qualité ne part — pas même le MOS', () => {
    const silent = analyticsPayload(withSample(createTelemetry(0), { level: 'good', rtt: 200, packetLoss: 2 }), { ...context, now: 1 });
    QUALITY_FIELDS.forEach((field) => expect(Object.keys(silent)).not.toContain(field));
    expect(withMedia(createTelemetry(0), {}, 10)).toEqual(createTelemetry(0));
  });

  test('plusieurs pairs : les compteurs s’additionnent et chaque pair compte sa cause de limitation', () => {
    const telemetry = withMedia(createTelemetry(0), { a: media({ ...chrome, qualityLimitationReason: 'cpu' }), b: media({ freezeCount: 1, qualityLimitationReason: 'cpu' }), c: chrome }, 10);
    const payload = analyticsPayload(telemetry, { ...context, now: 1 });
    expect(payload.freezeCount).toBe(5);
    expect(payload.qualityLimitationReason).toBe('cpu');
  });

  test('un pair parti, ou dont le dernier getStats a échoué, garde ses gels, NACK et PLI dans le rapport (QA R1)', () => {
    const first = withMedia(createTelemetry(0), { a: media({ freezeCount: 2, nackCount: 10, pliCount: 1 }), b: media({ freezeCount: 3, nackCount: 20, pliCount: 4 }) }, 10);
    const payload = analyticsPayload(withMedia(first, { a: media({ freezeCount: 5, nackCount: 11, pliCount: 1 }) }, 10), { ...context, now: 1 });
    expect(payload.freezeCount).toBe(8);
    expect(payload.nackCount).toBe(31);
    expect(payload.pliCount).toBe(5);
  });

  test('un lien reconstruit pour le MÊME pair remplace son entrée : ses compteurs repartent de zéro, le rapport suit le nouveau lien (accepté)', () => {
    const before = withMedia(createTelemetry(0), { a: media({ freezeCount: 7, nackCount: 40 }) }, 10);
    const payload = analyticsPayload(withMedia(before, { a: media({ freezeCount: 1, nackCount: 2 }) }, 10), { ...context, now: 1 });
    expect(payload.freezeCount).toBe(1);
    expect(payload.nackCount).toBe(2);
  });

  test('la mémoire reste bornée par le nombre de pairs, quel que soit le nombre de relevés', () => {
    const many = Array.from({ length: 5_000 }, (_, index) => index).reduce((t, index) => withMedia(t, { [`p${index % 3}`]: media({ freezeCount: index }) }, 10), createTelemetry(0));
    expect(Object.keys(many.peers)).toEqual(['p0', 'p1', 'p2']);
  });

  test('le rapport produit passe le schéma de la passerelle, avec ou sans qualité', () => {
    expect(() => socketCallAnalyticsSchema.parse(analyticsPayload(sampled([[chrome, 20]]), { ...context, now: 1 }))).not.toThrow();
    expect(() => socketCallAnalyticsSchema.parse(analyticsPayload(sampled([[media({ nackCount: 1 }), 20]]), { ...context, now: 1 }))).not.toThrow();
    expect(() => socketCallAnalyticsSchema.parse(analyticsPayload(createTelemetry(0), { ...context, now: 1 }))).not.toThrow();
  });

  test('la mémoire reste bornée avec les relevés média : aucun historique', () => {
    const long = Array.from({ length: 10_000 }, (_, index) => media({ ...chrome, qualityLimitationReason: ['none', 'cpu', 'bandwidth', 'other'][index % 4] ?? null })).reduce((t, peer) => withMedia(t, { a: peer }, 12), createTelemetry(0));
    expect(JSON.stringify(long).length).toBeLessThan(900);
  });
});
