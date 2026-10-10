import { describe, expect, test } from 'bun:test';

import { baseCall } from './engine-session';
import { boundedJournal, callEvents, journalSummary, MAX_JOURNAL_EVENTS, QUALITY_SAMPLE_MS, tickEvents, type JournalEvent } from './call-network-journal';
import type { ActiveCall, CallMember } from './call-store';
import type { QualityTick } from './call-quality-loop';

const call = (overrides: Partial<ActiveCall> = {}): ActiveCall => ({
  ...baseCall({ conversationId: 'c-1', media: 'video', title: 'Nadia', avatar: null, isGroup: false }, 'outgoing', { kind: 'outgoing' }),
  callId: 'call-1',
  ...overrides,
});

const member = (overrides: Partial<CallMember> = {}): CallMember => ({ userId: 'u-2', name: 'Nadia', avatar: null, micMuted: false, cameraOn: true, screenSharing: false, weakNetwork: false, capturing: false, link: 'connecting', ...overrides });

const tick = (overrides: Partial<QualityTick> = {}, total: Partial<QualityTick['total']> = {}): QualityTick => ({
  total: { level: 'good', packetLoss: 0.5, rtt: 120.4, jitter: 8.2, audioKbps: 30.6, videoKbps: 540.2, bytesSent: 1, bytesReceived: 2, ...total },
  stage: 'sending',
  codec: 'VP8',
  profile: 'wifi',
  audioBitrate: 32_000,
  path: 'direct',
  ...overrides,
});

describe('le journal réseau et qualité d’un appel (#8698)', () => {
  test('les changements de phase s’inscrivent, la fin avec sa raison et son détail', () => {
    expect(callEvents(null, call({ phase: { kind: 'connecting' } }), 10)).toEqual([{ at: 10, kind: 'phase', phase: 'connecting' }]);
    expect(callEvents(call({ phase: { kind: 'connecting' } }), call({ phase: { kind: 'connected' } }), 20)).toEqual([{ at: 20, kind: 'phase', phase: 'connected' }]);
    expect(callEvents(call({ phase: { kind: 'connected' } }), call({ phase: { kind: 'connected' }, micMuted: true }), 30)).toEqual([]);
    expect(callEvents(call({ phase: { kind: 'connected' } }), call({ phase: { kind: 'ended', reason: 'permission', detail: 'media' } }), 40)).toEqual([{ at: 40, kind: 'phase', phase: 'ended', reason: 'permission', detail: 'media' }]);
  });

  test('la sonnerie n’est pas du réseau : sortant et entrant ne s’inscrivent pas', () => {
    expect(callEvents(null, call(), 0)).toEqual([]);
    expect(callEvents(null, call({ phase: { kind: 'incoming' } }), 0)).toEqual([]);
  });

  test('le lien de chaque pair s’inscrit quand il change d’état, avec son nom', () => {
    const before = call({ phase: { kind: 'connected' }, members: { 'u-2': member({ link: 'connected' }) } });
    const after = call({ phase: { kind: 'connected' }, members: { 'u-2': member({ link: 'reconnecting' }) } });
    expect(callEvents(before, after, 50)).toEqual([{ at: 50, kind: 'link', name: 'Nadia', state: 'reconnecting' }]);
    expect(callEvents(after, after, 60)).toEqual([]);
  });

  test('le premier relevé inscrit la qualité, le profil et le chemin ; les valeurs sont arrondies', () => {
    const [events] = tickEvents(null, tick(), 1_000);
    expect(events).toEqual([
      { at: 1_000, kind: 'quality', level: 'good', loss: 0.5, rtt: 120, jitter: 8, audioKbps: 31, videoKbps: 540 },
      { at: 1_000, kind: 'profile', profile: 'wifi', audioBitrate: 32_000 },
      { at: 1_000, kind: 'path', path: 'direct' },
    ]);
  });

  test('un relevé identique ne s’inscrit qu’une fois toutes les 30 s ; un changement de niveau, tout de suite', () => {
    const [, memory] = tickEvents(null, tick(), 0);
    const [quiet, same] = tickEvents(memory, tick(), 2_000);
    expect(quiet).toEqual([]);
    const [sampled] = tickEvents(same, tick(), QUALITY_SAMPLE_MS);
    expect(sampled.map((event) => event.kind)).toEqual(['quality']);
    const [worse] = tickEvents(same, tick({}, { level: 'poor', packetLoss: 12 }), 4_000);
    expect(worse).toEqual([{ at: 4_000, kind: 'quality', level: 'poor', loss: 12, rtt: 120, jitter: 8, audioKbps: 31, videoKbps: 540 }]);
  });

  test('la survie de la vidéo, le passage par un relais et le changement de profil s’inscrivent', () => {
    const [, memory] = tickEvents(null, tick(), 0);
    const [events] = tickEvents(memory, tick({ stage: 'frozen', path: 'relay', profile: 'cellular', audioBitrate: 24_000 }), 2_000);
    expect(events).toEqual([
      { at: 2_000, kind: 'survival', stage: 'frozen' },
      { at: 2_000, kind: 'profile', profile: 'cellular', audioBitrate: 24_000 },
      { at: 2_000, kind: 'path', path: 'relay' },
    ]);
  });

  test('le journal d’un appel est borné : les plus anciens relevés partent, la première phase reste', () => {
    const first: JournalEvent = { at: 0, kind: 'phase', phase: 'connecting' };
    const flood: JournalEvent[] = Array.from({ length: MAX_JOURNAL_EVENTS + 20 }, (_, index) => ({ at: index + 1, kind: 'survival', stage: 'sending' }));
    const kept = boundedJournal([first, ...flood]);
    expect(kept.length).toBe(MAX_JOURNAL_EVENTS);
    expect(kept[0]).toEqual(first);
    expect(kept.at(-1)).toEqual(flood.at(-1) as JournalEvent);
  });

  test('le résumé : pire niveau, pires mesures, reconnexions, relais, profils et fin', () => {
    const events: JournalEvent[] = [
      { at: 0, kind: 'phase', phase: 'connecting' },
      { at: 1, kind: 'phase', phase: 'connected' },
      { at: 2, kind: 'quality', level: 'good', loss: 1, rtt: 90, jitter: 4, audioKbps: 30, videoKbps: 500 },
      { at: 3, kind: 'profile', profile: 'wifi', audioBitrate: 32_000 },
      { at: 4, kind: 'phase', phase: 'reconnecting' },
      { at: 5, kind: 'quality', level: 'poor', loss: 9, rtt: 480, jitter: 30, audioKbps: 16, videoKbps: 90 },
      { at: 6, kind: 'path', path: 'relay' },
      { at: 7, kind: 'profile', profile: 'cellular', audioBitrate: 24_000 },
      { at: 8, kind: 'phase', phase: 'ended', reason: 'connectionLost', detail: null },
    ];
    expect(journalSummary(events)).toEqual({ worstLevel: 'poor', maxLoss: 9, maxRtt: 480, maxJitter: 30, reconnections: 1, relayed: true, profiles: ['wifi', 'cellular'], endReason: 'connectionLost' });
    expect(journalSummary([])).toEqual({ worstLevel: null, maxLoss: 0, maxRtt: 0, maxJitter: 0, reconnections: 0, relayed: false, profiles: [], endReason: null });
  });
});
