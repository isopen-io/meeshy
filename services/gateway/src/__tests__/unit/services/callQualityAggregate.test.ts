/**
 * La qualité d'un appel se LIT (#11277) : gels, limitation, MOS, relais,
 * codec, plateforme — agrégés depuis la télémétrie persistée sur
 * `CallParticipant.analytics`, qui porte désormais ces champs (tous
 * optionnels : un ancien client ne les envoie pas, et ne fausse aucune
 * moyenne).
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { coerceCallQuality, summarizeCallQuality } from '../../../services/callQualityAggregate';

const stored = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  callId: '507f1f77bcf86cd799439099',
  setupTimeMs: 1800,
  durationSeconds: 120,
  reconnectionCount: 0,
  networkTransitions: 0,
  averageRtt: 80,
  averagePacketLoss: 0.4,
  maxPacketLoss: 1.5,
  codec: 'opus',
  effectsUsed: [],
  filtersUsed: false,
  transcriptionUsed: false,
  qualityDistribution: { excellent: 1, good: 0, fair: 0, poor: 0 },
  platform: 'ios',
  deviceModel: 'iPhone16,2',
  isVideo: true,
  endReason: 'completed',
  ...overrides,
});

const summaryOf = (rows: readonly unknown[]) =>
  summarizeCallQuality(rows.map(coerceCallQuality).filter((row): row is NonNullable<typeof row> => row !== null));

describe('coerceCallQuality', () => {
  it('lit une ligne d’avant #11277 sans inventer de mesure', () => {
    const row = coerceCallQuality(stored());

    expect(row).toEqual(expect.objectContaining({ connected: true, isVideo: true, codec: 'opus', platform: 'ios' }));
    expect(row?.mos).toBeUndefined();
    expect(row?.freezeCount).toBeUndefined();
    expect(row?.candidateType).toBeUndefined();
  });

  it('ne garde jamais l’appareil ni l’identifiant d’appel : l’agrégat est sans donnée personnelle', () => {
    const keys = Object.keys(coerceCallQuality(stored({ mos: 4.2 })) ?? {});

    expect(keys).not.toContain('deviceModel');
    expect(keys).not.toContain('callId');
  });

  it('écarte une valeur qui n’est pas un nombre fini ou hors de son domaine, sans écarter la ligne', () => {
    const row = coerceCallQuality(stored({ mos: 9, freezeCount: -1, jitterBufferDelay: Number.NaN, nackCount: '3' }));

    expect(row).not.toBeNull();
    expect(row?.mos).toBeUndefined();
    expect(row?.freezeCount).toBeUndefined();
    expect(row?.jitterBufferDelay).toBeUndefined();
    expect(row?.nackCount).toBeUndefined();
  });

  it('rend null pour ce qui n’est pas une ligne de télémétrie', () => {
    expect(coerceCallQuality(null)).toBeNull();
    expect(coerceCallQuality('x')).toBeNull();
    expect(coerceCallQuality({ codec: 'opus' })).toBeNull();
  });
});

describe('summarizeCallQuality', () => {
  it('rend des null — jamais des zéros — quand aucun client ne mesure encore', () => {
    const summary = summaryOf([stored(), stored({ isVideo: false })]);

    expect(summary.connectedCalls).toBe(2);
    expect(summary.reportingCalls).toBe(0);
    expect(summary.mos).toEqual({ reportingCalls: 0, avg: null, lowRate: null });
    expect(summary.freezes).toEqual({ reportingVideoCalls: 0, frozenRate: null, avgFreezeCount: null, avgFreezeDurationSeconds: null });
    expect(summary.relay).toEqual({ reportingCalls: 0, relayedRate: null, byProtocol: {} });
    expect(summary.avgJitterBufferDelayMs).toBeNull();
  });

  it('mesure les gels sur les seuls appels VIDÉO qui les rapportent', () => {
    const summary = summaryOf([
      stored({ freezeCount: 0, totalFreezesDuration: 0 }),
      stored({ freezeCount: 4, totalFreezesDuration: 3 }),
      stored({ isVideo: false, freezeCount: 9, totalFreezesDuration: 50 }),
      stored(),
    ]);

    expect(summary.freezes).toEqual({ reportingVideoCalls: 2, frozenRate: 0.5, avgFreezeCount: 2, avgFreezeDurationSeconds: 1.5 });
  });

  it('moyenne le MOS et compte les appels sous 3,5', () => {
    const summary = summaryOf([stored({ mos: 4.4 }), stored({ mos: 3.0 }), stored({ mos: 4.0 }), stored({ mos: 2.6 })]);

    expect(summary.mos.reportingCalls).toBe(4);
    expect(summary.mos.avg).toBeCloseTo(3.5);
    expect(summary.mos.lowRate).toBe(0.5);
  });

  it('range la limitation de qualité sous none, cpu, bandwidth ou other', () => {
    const summary = summaryOf([
      stored({ qualityLimitationReason: 'bandwidth' }),
      stored({ qualityLimitationReason: 'bandwidth' }),
      stored({ qualityLimitationReason: 'cpu' }),
      stored({ qualityLimitationReason: 'none' }),
      stored({ qualityLimitationReason: 'thermal' }),
      stored(),
    ]);

    expect(summary.qualityLimitation).toEqual({ none: 1, cpu: 1, bandwidth: 2, other: 1 });
  });

  it('dit quelle part des appels passe par un relais, et par quel transport', () => {
    const summary = summaryOf([
      stored({ candidateType: 'relay', relayProtocol: 'tls' }),
      stored({ candidateType: 'relay', relayProtocol: 'udp' }),
      stored({ candidateType: 'srflx' }),
      stored({ candidateType: 'host' }),
    ]);

    expect(summary.relay).toEqual({ reportingCalls: 4, relayedRate: 0.5, byProtocol: { tls: 1, udp: 1 } });
  });

  it('moyenne le tampon de gigue, les échantillons masqués, les NACK et les PLI sur les lignes qui les portent', () => {
    const summary = summaryOf([
      stored({ jitterBufferDelay: 40, concealedSamples: 100, nackCount: 2, pliCount: 1 }),
      stored({ jitterBufferDelay: 60, concealedSamples: 300, nackCount: 6, pliCount: 3 }),
      stored(),
    ]);

    expect(summary.avgJitterBufferDelayMs).toBe(50);
    expect(summary.avgConcealedSamples).toBe(200);
    expect(summary.avgNackCount).toBe(4);
    expect(summary.avgPliCount).toBe(2);
    expect(summary.reportingCalls).toBe(2);
  });

  it('n’agrège que les appels CONNECTÉS : un appel manqué n’a aucun échantillon', () => {
    const summary = summaryOf([stored({ mos: 4 }), stored({ setupTimeMs: -1, mos: 1, codec: 'vp8' })]);

    expect(summary.connectedCalls).toBe(1);
    expect(summary.mos.avg).toBe(4);
    expect(summary.byCodec).toEqual({ opus: 1 });
  });

  it('compte codecs et plateformes', () => {
    const summary = summaryOf([stored({ codec: 'opus', platform: 'ios' }), stored({ codec: 'VP8', platform: 'web' }), stored({ codec: 'vp8', platform: 'web' })]);

    expect(summary.byCodec).toEqual({ opus: 1, vp8: 2 });
    expect(summary.byPlatform).toEqual({ ios: 1, web: 2 });
  });
});
