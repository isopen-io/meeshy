import { describe, expect, test } from 'bun:test';

import { aggregateQuality, appliedTier, encodingFor, metricGrade, peerRate, qualityLevel, readStats, TIER_ENCODING, type PeerQuality } from './call-quality';

type Entry = Readonly<Record<string, unknown>>;

const report = (entries: readonly Entry[]): { forEach: (fn: (entry: Entry) => void) => void } => ({ forEach: (fn) => entries.forEach(fn) });

const stats = (overrides: { readonly lost?: number; readonly received?: number; readonly audioBytes?: number; readonly videoBytes?: number; readonly rtt?: number; readonly jitter?: number } = {}) =>
  report([
    { type: 'candidate-pair', nominated: true, state: 'succeeded', currentRoundTripTime: (overrides.rtt ?? 80) / 1000 },
    { type: 'inbound-rtp', kind: 'audio', packetsLost: overrides.lost ?? 0, packetsReceived: overrides.received ?? 1000, bytesReceived: overrides.audioBytes ?? 40_000, jitter: (overrides.jitter ?? 12) / 1000 },
    { type: 'inbound-rtp', kind: 'video', packetsLost: 0, packetsReceived: 0, bytesReceived: overrides.videoBytes ?? 500_000, jitter: 0.004 },
    { type: 'outbound-rtp', kind: 'video', bytesSent: 700_000, codecId: 'c-vp8' },
    { type: 'outbound-rtp', kind: 'audio', bytesSent: 50_000, codecId: 'c-opus' },
    { type: 'codec', id: 'c-vp8', mimeType: 'video/VP8' },
    { type: 'codec', id: 'c-opus', mimeType: 'audio/opus' },
  ]);

describe('la qualité d’un lien, lue dans getStats (#8047)', () => {
  test('les paliers de qualité d’iOS : la perte est le vrai signal, la latence est calibrée pour le mobile', () => {
    expect(qualityLevel({ packetLoss: 0, rtt: 50 })).toBe('excellent');
    expect(qualityLevel({ packetLoss: 2, rtt: 250 })).toBe('good');
    expect(qualityLevel({ packetLoss: 4, rtt: 100 })).toBe('fair');
    expect(qualityLevel({ packetLoss: 0, rtt: 400 })).toBe('fair');
    expect(qualityLevel({ packetLoss: 6, rtt: 50 })).toBe('poor');
    expect(qualityLevel({ packetLoss: 0, rtt: 500 })).toBe('poor');
  });

  test('un relevé donne la latence, la gigue audio, les compteurs et le codec émis', () => {
    const read = readStats(stats({ rtt: 120, jitter: 30 }), 1_000);
    expect(read.rtt).toBeCloseTo(120);
    expect(read.jitter).toBeCloseTo(30);
    expect(read.bytesSent).toBe(750_000);
    expect(read.codec).toBe('VP8');
  });

  /**
   * LA GIGUE SE LIT COMME SUR iOS (#8209) — `CallStats.reduce` : la MOYENNE des
   * flux audio entrants qui la rapportent, en ms. La vidéo n'y entre pas ; un
   * flux sans `kind` compte comme audio (iOS range tout ce qui n'est pas
   * `video` côté audio) ; sans flux audio, 0.
   */
  test('la gigue est la moyenne des flux AUDIO entrants, la vidéo n’y entre pas — la règle d’iOS (#8209)', () => {
    const read = readStats(
      report([
        { type: 'inbound-rtp', kind: 'audio', jitter: 0.01 },
        { type: 'inbound-rtp', kind: 'audio', jitter: 0.03 },
        { type: 'inbound-rtp', jitter: 0.05 },
        { type: 'inbound-rtp', kind: 'audio' },
        { type: 'inbound-rtp', kind: 'video', jitter: 0.4 },
      ]),
      0,
    );
    expect(read.jitter).toBeCloseTo(30);
    expect(readStats(report([{ type: 'inbound-rtp', kind: 'video', jitter: 0.2 }]), 0).jitter).toBe(0);
  });

  test('chaque mesure a le niveau d’iOS : perte 3/5 %, latence 300/450 ms, gigue 30/50 ms (#8209)', () => {
    expect(metricGrade('jitter', 29.9)).toBe('good');
    expect(metricGrade('jitter', 30)).toBe('medium');
    expect(metricGrade('jitter', 49.9)).toBe('medium');
    expect(metricGrade('jitter', 50)).toBe('poor');
    expect(metricGrade('packetLoss', 2.9)).toBe('good');
    expect(metricGrade('packetLoss', 3)).toBe('medium');
    expect(metricGrade('packetLoss', 5)).toBe('poor');
    expect(metricGrade('rtt', 299)).toBe('good');
    expect(metricGrade('rtt', 300)).toBe('medium');
    expect(metricGrade('rtt', 450)).toBe('poor');
  });

  test('sans vidéo émise, le codec est celui de l’audio', () => {
    const read = readStats(report([{ type: 'outbound-rtp', kind: 'audio', bytesSent: 10, codecId: 'c' }, { type: 'codec', id: 'c', mimeType: 'audio/opus' }]), 0);
    expect(read.codec).toBe('opus');
  });

  test('la perte et les débits sont des TAUX sur l’intervalle, jamais le cumul de l’appel', () => {
    const before = readStats(stats({ lost: 0, received: 1000, audioBytes: 40_000, videoBytes: 500_000 }), 0);
    const after = readStats(stats({ lost: 100, received: 1900, audioBytes: 44_000, videoBytes: 625_000 }), 2_000);
    const rate = peerRate(after, before);
    expect(rate.packetLoss).toBeCloseTo(10);
    expect(rate.audioKbps).toBeCloseTo(16);
    expect(rate.videoKbps).toBeCloseTo(500);
    expect(rate.level).toBe('poor');
  });

  test('un premier relevé n’a pas de débit ; un compteur remis à zéro ne rend jamais un taux négatif', () => {
    const first = peerRate(readStats(stats(), 0), null);
    expect(first.audioKbps).toBe(0);
    const reset = peerRate(readStats(stats({ lost: 0, received: 10, audioBytes: 10 }), 2_000), readStats(stats({ lost: 50, received: 5000, audioBytes: 90_000 }), 0));
    expect(reset.packetLoss).toBe(0);
    expect(reset.audioKbps).toBe(0);
  });

  test('un appel de groupe : le pire lien fait le niveau, les débits s’additionnent', () => {
    const peer = (overrides: Partial<PeerQuality>): PeerQuality => ({ level: 'excellent', packetLoss: 0, rtt: 40, jitter: 5, audioKbps: 30, videoKbps: 400, bytesSent: 10, bytesReceived: 20, ...overrides });
    const total = aggregateQuality([peer({}), peer({ level: 'poor', packetLoss: 9, rtt: 420, jitter: 40 })]);
    expect(total?.level).toBe('poor');
    expect(total?.packetLoss).toBe(9);
    expect(total?.rtt).toBe(420);
    expect(total?.jitter).toBe(40);
    expect(total?.videoKbps).toBe(800);
    expect(total?.bytesReceived).toBe(40);
    expect(aggregateQuality([])).toBeNull();
  });
});

describe('les paliers d’encodage vidéo, par pair (#8047)', () => {
  test('chaque pair suit SON lien ; la survie impose son plancher à tous', () => {
    expect(appliedTier('excellent', 'sending')).toBe('high');
    expect(appliedTier('fair', 'sending')).toBe('medium');
    expect(appliedTier('poor', 'sending')).toBe('low');
    expect(appliedTier('excellent', 'frozen')).toBe('frozen');
    expect(appliedTier('excellent', 'suspended')).toBe('suspended');
  });

  test('le gel tient l’image à 2 i/s au plancher de débit ; la suspension n’émet plus rien', () => {
    expect(TIER_ENCODING.frozen.maxFramerate).toBe(2);
    expect(TIER_ENCODING.frozen.maxBitrate).toBeLessThan(TIER_ENCODING.low.maxBitrate);
    expect(TIER_ENCODING.suspended.active).toBe(false);
    expect(TIER_ENCODING.high.active).toBe(true);
  });

  test('un palier réécrit chaque couche d’encodage sans toucher au reste des paramètres', () => {
    const next = encodingFor({ rid: 'q', maxBitrate: 9, active: true }, 'medium');
    expect(next).toEqual({ rid: 'q', ...TIER_ENCODING.medium });
  });
});
