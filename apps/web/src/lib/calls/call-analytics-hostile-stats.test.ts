import { describe, expect, test } from 'bun:test';

import { socketCallAnalyticsSchema } from '../../../../../services/gateway/src/validation/call-schemas';
import { analyticsPayload, createTelemetry, withMedia, withSample } from './call-analytics';
import { readMediaQuality } from './call-analytics-stats';

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
});
