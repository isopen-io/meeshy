import { describe, expect, test } from 'bun:test';

import { socketCallAnalyticsSchema, socketQualityReportSchema } from '../../../../../services/gateway/src/validation/call-schemas';
import { analyticsPayload, createTelemetry, qualityReport, withCodec, withMedia, withSample } from './call-analytics';
import { readMediaQuality } from './call-analytics-read';
import { peerRate, readStats, type PeerQuality } from './call-quality';

type Entry = Readonly<Record<string, unknown>>;

const report = (entries: readonly Entry[]) => ({ forEach: (fn: (entry: Entry) => void) => entries.forEach(fn) });

const context = { callId: '507f1f77bcf86cd799439099', now: 1, isVideo: true, endReason: 'local', platform: 'web', deviceModel: 'Chrome · Linux' } as const;

const hostile: readonly Entry[] = [
  { type: 'transport', id: 't', selectedCandidatePairId: 'p' },
  { type: 'candidate-pair', id: 'p', state: 'succeeded', nominated: true, localCandidateId: 'l', remoteCandidateId: 'r' },
  { type: 'local-candidate', id: 'l', candidateType: 'relay-candidate-type-longer-than-twenty', relayProtocol: 'x'.repeat(64), address: '203.0.113.7', ip: '203.0.113.7', port: 3478, usernameFragment: 'ufrag', url: 'turn:turn.example:3478' },
  { type: 'remote-candidate', id: 'r', candidateType: 'host', address: '198.51.100.9', port: 5000 },
  { type: 'inbound-rtp', kind: 'video', freezeCount: Number.NaN, totalFreezesDuration: Number.POSITIVE_INFINITY, nackCount: -3, pliCount: '7' },
  { type: 'inbound-rtp', kind: 'video', freezeCount: 1.6, totalFreezesDuration: 0.4, nackCount: 2.4, pliCount: null },
  { type: 'inbound-rtp', kind: 'audio', jitterBufferDelay: -1, jitterBufferEmittedCount: Number.NaN, concealedSamples: Number.NEGATIVE_INFINITY },
  { type: 'outbound-rtp', kind: 'video', qualityLimitationReason: 'quantum' },
];

describe('une stat malformée ne casse ni la boucle ni le rapport (#19876, QA)', () => {
  test('NaN, Infinity, négatifs, chaînes : rien ne lève, seules les mesures finies et positives comptent', () => {
    const media = readMediaQuality(report(hostile));
    expect(media.freezeCount).toBe(1.6);
    expect(media.totalFreezesDuration).toBe(0.4);
    expect(media.nackCount).toBe(2.4);
    expect(media.pliCount).toBeNull();
    expect(media.jitterBufferDelay).toBeNull();
    expect(media.jitterBufferEmittedCount).toBeNull();
    expect(media.concealedSamples).toBeNull();
  });

  test('le rapport issu de stats hostiles passe le schéma de la passerelle : la télémétrie de l’appel n’est pas rejetée', () => {
    const telemetry = withMedia(withSample(createTelemetry(0), { level: 'good', rtt: 120, packetLoss: 1 }), { peer: readMediaQuality(report(hostile)) }, Number.NaN);
    const payload = analyticsPayload(telemetry, context);
    expect(socketCallAnalyticsSchema.safeParse(payload).success).toBe(true);
    expect(payload.freezeCount).toBe(2);
    expect(payload.nackCount).toBe(2);
    expect(Object.keys(payload)).not.toContain('qualityLimitationReason');
    expect(payload.mos).toBeGreaterThanOrEqual(1);
    expect(payload.mos).toBeLessThanOrEqual(4.5);
  });

  test('un candidat local ne fait partir ni adresse, ni port, ni ufrag, ni URL : seulement son type', () => {
    const relay = readMediaQuality(report(hostile.map((entry) => (entry.id === 'l' ? { ...entry, candidateType: 'relay', relayProtocol: 'tcp' } : entry))));
    const payload = analyticsPayload(withMedia(withSample(createTelemetry(0), { level: 'good', rtt: 120, packetLoss: 1 }), { peer: relay }, 10), context);
    const wire = JSON.stringify(payload);
    ['203.0.113.7', '198.51.100.9', '3478', 'ufrag', 'turn:'].forEach((secret) => expect(wire).not.toContain(secret));
    expect(payload.candidateType).toBe('relay');
    expect(payload.relayProtocol).toBe('tcp');
  });

  test('un compteur démesuré est omis, pas transmis : le reste du rapport passe le schéma (#19897)', () => {
    const huge: readonly Entry[] = [
      { type: 'inbound-rtp', kind: 'video', freezeCount: 1e30, totalFreezesDuration: 1e308, nackCount: 2 ** 53, pliCount: Number.MAX_SAFE_INTEGER },
      { type: 'inbound-rtp', kind: 'video', totalFreezesDuration: 1e308 },
      { type: 'inbound-rtp', kind: 'audio', concealedSamples: Number.MAX_SAFE_INTEGER + 0.4, jitterBufferDelay: 1e306, jitterBufferEmittedCount: 1 },
    ];
    const telemetry = withMedia(withSample(createTelemetry(0), { level: 'good', rtt: 120, packetLoss: 1 }), { peer: readMediaQuality(report(huge)) }, 10);
    const payload = analyticsPayload(telemetry, context);
    expect(socketCallAnalyticsSchema.safeParse(payload).success).toBe(true);
    const keys = Object.keys(payload);
    ['freezeCount', 'nackCount', 'totalFreezesDuration', 'jitterBufferDelay'].forEach((key) => expect(keys).not.toContain(key));
    expect(payload.pliCount).toBe(Number.MAX_SAFE_INTEGER);
    expect(payload.concealedSamples).toBe(Number.MAX_SAFE_INTEGER);
    expect(payload.mos).toBeGreaterThanOrEqual(1);
  });
});

const linkReport = (link: { readonly lost: number; readonly received: number; readonly rtt?: number; readonly mimeType?: string; readonly jitter?: number }) =>
  report([
    { type: 'candidate-pair', id: 'p', state: 'succeeded', nominated: true, currentRoundTripTime: link.rtt ?? 0.05 },
    { type: 'inbound-rtp', kind: 'audio', packetsLost: link.lost, packetsReceived: link.received, bytesReceived: 1000, jitter: link.jitter ?? 0.01 },
    { type: 'outbound-rtp', kind: 'video', bytesSent: 500, codecId: 'c' },
    { type: 'codec', id: 'c', mimeType: link.mimeType ?? 'video/VP8' },
  ]);

const payloadOf = (rates: readonly { readonly level: PeerQuality['level']; readonly rtt: number; readonly packetLoss: number }[], codec: string | null = null) =>
  analyticsPayload(
    rates.reduce((telemetry, rate) => withSample(telemetry, rate), withCodec(createTelemetry(0), codec)),
    context,
  );

describe('une perte, une latence ou un codec hors bornes ne font plus rejeter le rapport (#19911)', () => {
  test('une perte cumulée négative au premier relevé (RFC 3550, doublons) ne rend pas une perte négative', () => {
    const rate = peerRate(readStats(linkReport({ lost: -2, received: 10 }), 0), null);
    expect(rate.packetLoss).toBe(0);
    expect(rate.level).toBe('excellent');
    expect(socketCallAnalyticsSchema.safeParse(payloadOf([rate])).success).toBe(true);
  });

  test('une perte cumulée qui devient négative au relevé suivant ne rend pas une perte négative', () => {
    const first = readStats(linkReport({ lost: 0, received: 10 }), 0);
    const next = readStats(linkReport({ lost: -3, received: 20 }), 2000);
    const rate = peerRate(next, first);
    expect(rate.packetLoss).toBe(0);
    expect(socketCallAnalyticsSchema.safeParse(payloadOf([peerRate(first, null), rate])).success).toBe(true);
  });

  test('un RTT démesuré n’est pas lu comme une latence infinie', () => {
    const rate = peerRate(readStats(linkReport({ lost: 0, received: 10, rtt: 1e306 }), 0), null);
    expect(Number.isFinite(rate.rtt)).toBe(true);
    expect(rate.rtt).toBeGreaterThanOrEqual(0);
    expect(socketCallAnalyticsSchema.safeParse(payloadOf([rate])).success).toBe(true);
  });

  test('un RTT négatif n’est pas lu comme une latence négative', () => {
    const rate = peerRate(readStats(linkReport({ lost: 0, received: 10, rtt: -0.2 }), 0), null);
    expect(rate.rtt).toBe(0);
    expect(socketCallAnalyticsSchema.safeParse(payloadOf([rate])).success).toBe(true);
  });

  test('un codec de 80 caractères est coupé à 50', () => {
    const read = readStats(linkReport({ lost: 0, received: 10, mimeType: `video/${'x'.repeat(80)}` }), 0);
    const payload = payloadOf([peerRate(read, null)], read.codec);
    expect(payload.codec).toBe('x'.repeat(50));
    expect(socketCallAnalyticsSchema.safeParse(payload).success).toBe(true);
  });

  test('des sommes qui débordent ou des échantillons négatifs rendent des moyennes finies et positives', () => {
    const payload = payloadOf([
      { level: 'poor', rtt: Number.MAX_VALUE, packetLoss: -40 },
      { level: 'poor', rtt: Number.MAX_VALUE, packetLoss: -40 },
    ]);
    [payload.averageRtt, payload.averagePacketLoss, payload.maxPacketLoss].forEach((value) => {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
    expect(socketCallAnalyticsSchema.safeParse(payload).success).toBe(true);
  });

  test('des stats valides gardent leur valeur : perte, latence et niveau inchangés', () => {
    const first = readStats(linkReport({ lost: 0, received: 100, rtt: 0.12 }), 0);
    const rate = peerRate(readStats(linkReport({ lost: 2, received: 198, rtt: 0.12 }), 2000), first);
    expect(rate.packetLoss).toBe(2);
    expect(rate.rtt).toBe(120);
    expect(rate.level).toBe('good');
  });

  test('le relevé de qualité affiché et poussé reste fini et positif : aucun indicateur absurde', () => {
    [
      { lost: -2, received: 10, rtt: 1e306, jitter: 1e306 },
      { lost: -2, received: 10, rtt: -0.2, jitter: -0.5 },
    ].forEach((link) => {
      const rate = peerRate(readStats(linkReport(link), 0), null);
      expect([rate.packetLoss, rate.rtt, rate.jitter].every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
      expect(socketQualityReportSchema.safeParse(qualityReport('507f1f77bcf86cd799439099', rate, 0)).success).toBe(true);
    });
  });

  test('une somme de pertes ou d’octets qui déborde ne rend ni NaN ni Infinity, au relevé suivant non plus', () => {
    const overflowing = report([
      { type: 'candidate-pair', id: 'p', state: 'succeeded', nominated: true, currentRoundTripTime: 0.05 },
      { type: 'inbound-rtp', kind: 'audio', packetsLost: 1e308, packetsReceived: 10, bytesReceived: 1e308 },
      { type: 'inbound-rtp', kind: 'audio', packetsLost: 1e308, packetsReceived: 10, bytesReceived: 1e308 },
    ]);
    const first = readStats(overflowing, 0);
    const rates = [peerRate(first, null), peerRate(readStats(overflowing, 2000), first)];
    rates.forEach((rate) => {
      expect([rate.packetLoss, rate.audioKbps, rate.videoKbps].every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
      expect(socketQualityReportSchema.safeParse(qualityReport('507f1f77bcf86cd799439099', rate, 0)).success).toBe(true);
    });
    const payload = payloadOf(rates);
    [payload.averagePacketLoss, payload.maxPacketLoss].forEach((value) => {
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    });
    expect(socketCallAnalyticsSchema.safeParse(payload).success).toBe(true);
  });
});
