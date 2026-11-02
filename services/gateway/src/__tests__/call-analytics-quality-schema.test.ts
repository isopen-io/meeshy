/**
 * `call:analytics` porte la qualité de l'appel (#11277) : gels, limitation,
 * gigue, échantillons masqués, NACK, PLI, MOS, relais — tous OPTIONNELS.
 *
 * Rétrocompatibilité (#9223) dans les deux sens : un ancien client qui ne les
 * envoie pas reste valide ; un nouveau client contre un ancien serveur voit
 * ses champs ignorés (Zod retire les clés inconnues), jamais son rapport
 * refusé. Une valeur hors domaine refuse le rapport, comme pour les champs
 * existants : une télémétrie forgée ne se persiste pas.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { socketCallAnalyticsSchema } from '../validation/call-schemas';

const legacy = {
  callId: '507f1f77bcf86cd799439099',
  setupTimeMs: 1250,
  durationSeconds: 65.4,
  reconnectionCount: 0,
  networkTransitions: 1,
  averageRtt: 42.5,
  averagePacketLoss: 0.3,
  maxPacketLoss: 2.1,
  codec: 'opus',
  effectsUsed: [],
  filtersUsed: false,
  transcriptionUsed: true,
  qualityDistribution: { excellent: 0.8, good: 0.15, fair: 0.05, poor: 0 },
  platform: 'ios',
  deviceModel: 'iPhone',
  isVideo: true,
  endReason: 'completed',
};

const quality = {
  freezeCount: 3,
  totalFreezesDuration: 1.8,
  qualityLimitationReason: 'bandwidth',
  jitterBufferDelay: 48.5,
  concealedSamples: 1200,
  nackCount: 14,
  pliCount: 2,
  mos: 3.9,
  candidateType: 'relay',
  relayProtocol: 'tls',
};

describe('socketCallAnalyticsSchema — la qualité de l’appel (#11277)', () => {
  it('accepte un rapport d’ancien client, sans aucun champ de qualité', () => {
    const parsed = socketCallAnalyticsSchema.safeParse(legacy);

    expect(parsed.success).toBe(true);
  });

  it('garde chaque champ de qualité dans ce qui est persisté (validation.data)', () => {
    const parsed = socketCallAnalyticsSchema.safeParse({ ...legacy, ...quality });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toEqual(expect.objectContaining(quality));
  });

  it.each([
    ['freezeCount', -1],
    ['freezeCount', 1.5],
    ['totalFreezesDuration', -0.1],
    ['jitterBufferDelay', -3],
    ['concealedSamples', -1],
    ['nackCount', -2],
    ['pliCount', 0.5],
    ['mos', 0.9],
    ['mos', 5.1],
    ['qualityLimitationReason', 'x'.repeat(21)],
    ['candidateType', 'x'.repeat(21)],
    ['relayProtocol', 'x'.repeat(21)],
  ])('refuse %s = %p', (field, value) => {
    expect(socketCallAnalyticsSchema.safeParse({ ...legacy, [field]: value }).success).toBe(false);
  });
});
