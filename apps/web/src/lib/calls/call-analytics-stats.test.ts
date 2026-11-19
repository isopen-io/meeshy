import { describe, expect, test } from 'bun:test';

import { combineMediaQuality, readMediaQuality } from './call-analytics-stats';

type Entry = Readonly<Record<string, unknown>>;

const report = (entries: readonly Entry[]) => ({ forEach: (fn: (entry: Entry) => void) => entries.forEach(fn) });

const chrome: readonly Entry[] = [
  { type: 'transport', id: 't', selectedCandidatePairId: 'p2' },
  { type: 'candidate-pair', id: 'p1', state: 'succeeded', nominated: true, localCandidateId: 'l1' },
  { type: 'candidate-pair', id: 'p2', state: 'succeeded', nominated: false, localCandidateId: 'l2' },
  { type: 'local-candidate', id: 'l1', candidateType: 'host' },
  { type: 'local-candidate', id: 'l2', candidateType: 'relay', relayProtocol: 'tls' },
  { type: 'inbound-rtp', kind: 'video', freezeCount: 3, totalFreezesDuration: 1.5, nackCount: 12, pliCount: 2 },
  { type: 'inbound-rtp', kind: 'audio', jitterBufferDelay: 4.8, jitterBufferEmittedCount: 96, concealedSamples: 480, nackCount: 99 },
  { type: 'outbound-rtp', kind: 'audio', qualityLimitationReason: 'cpu' },
  { type: 'outbound-rtp', kind: 'video', qualityLimitationReason: 'bandwidth' },
];

describe('ce que `getStats` dit des gels, de la limitation et du relais (#19876)', () => {
  test('les compteurs cumulés : gels, NACK et PLI de la vidéo reçue, tampon et masquage de l’audio reçu', () => {
    const media = readMediaQuality(report(chrome));
    expect(media.freezeCount).toBe(3);
    expect(media.totalFreezesDuration).toBe(1.5);
    expect(media.nackCount).toBe(12);
    expect(media.pliCount).toBe(2);
    expect(media.concealedSamples).toBe(480);
    expect(media.jitterBufferDelay).toBe(4.8);
    expect(media.jitterBufferEmittedCount).toBe(96);
  });

  test('la limitation est celle de l’ÉMISSION vidéo', () => {
    expect(readMediaQuality(report(chrome)).qualityLimitationReason).toBe('bandwidth');
  });

  test('la paire élue est celle du transport ; son candidat local dit le type et le transport vers le relais', () => {
    const media = readMediaQuality(report(chrome));
    expect(media.candidateType).toBe('relay');
    expect(media.relayProtocol).toBe('tls');
  });

  test('sans transport, la paire élue est la paire nominée réussie ; un candidat direct n’a pas de transport vers un relais', () => {
    const media = readMediaQuality(report(chrome.filter((entry) => entry.type !== 'transport').map((entry) => (entry.id === 'l1' ? { ...entry, relayProtocol: 'udp' } : entry))));
    expect(media.candidateType).toBe('host');
    expect(media.relayProtocol).toBeNull();
  });

  test('une mesure que le navigateur ne donne pas reste absente, jamais 0 (Firefox, Safari)', () => {
    const firefox = readMediaQuality(report([
      { type: 'inbound-rtp', kind: 'video', nackCount: 4, pliCount: 1 },
      { type: 'inbound-rtp', kind: 'audio', concealedSamples: 10 },
    ]));
    expect(firefox.freezeCount).toBeNull();
    expect(firefox.totalFreezesDuration).toBeNull();
    expect(firefox.jitterBufferDelay).toBeNull();
    expect(firefox.qualityLimitationReason).toBeNull();
    expect(firefox.candidateType).toBeNull();
    expect(firefox.relayProtocol).toBeNull();
    expect(firefox.nackCount).toBe(4);
  });

  test('plusieurs pairs : les compteurs s’additionnent, un relais l’emporte sur un lien direct, une mesure absente partout reste absente', () => {
    const direct = readMediaQuality(report([
      { type: 'candidate-pair', id: 'p', state: 'succeeded', nominated: true, localCandidateId: 'l' },
      { type: 'local-candidate', id: 'l', candidateType: 'srflx' },
      { type: 'inbound-rtp', kind: 'video', freezeCount: 1, nackCount: 3, pliCount: 1 },
    ]));
    const combined = combineMediaQuality([direct, readMediaQuality(report(chrome))]);
    expect(combined?.freezeCount).toBe(4);
    expect(combined?.nackCount).toBe(15);
    expect(combined?.jitterBufferDelay).toBe(4.8);
    expect(combined?.candidateType).toBe('relay');
    expect(combined?.relayProtocol).toBe('tls');
    expect(combineMediaQuality([direct])?.concealedSamples).toBeNull();
    expect(combineMediaQuality([])).toBeNull();
  });
});
