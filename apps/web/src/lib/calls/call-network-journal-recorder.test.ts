import { describe, expect, test } from 'bun:test';

import { createCallStore, type ActiveCall } from './call-store';
import { createCallJournalStore } from './call-network-journal-store';
import { createJournalRecorder } from './call-network-journal-recorder';
import type { QualityTick } from './call-quality-loop';
import { baseCall } from './engine-session';

const memoryStorage = () => {
  const items = new Map<string, string>();
  return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value), removeItem: (key: string) => void items.delete(key) };
};

const call = (overrides: Partial<ActiveCall> = {}): ActiveCall => ({
  ...baseCall({ conversationId: 'c-1', media: 'video', title: 'Nadia', avatar: null, isGroup: false }, 'outgoing', { kind: 'outgoing' }),
  ...overrides,
});

const tick = (level: QualityTick['total']['level'] = 'good'): QualityTick => ({
  total: { level, packetLoss: 1, rtt: 100, jitter: 5, audioKbps: 30, videoKbps: 500, bytesSent: 0, bytesReceived: 0 },
  stage: 'sending',
  codec: 'VP8',
  profile: 'cellular',
  audioBitrate: 24_000,
  path: 'direct',
});

function harness(viewer = 'u-a') {
  let now = 0;
  const storage = memoryStorage();
  const store = createCallStore();
  const journal = createCallJournalStore({ storage, now: () => now });
  const recorder = createJournalRecorder({ store, journal, viewerId: () => viewer, now: () => now });
  const at = (ms: number) => void (now = ms);
  const set = (next: ActiveCall | null) => store.setState({ call: next });
  const reread = () => createCallJournalStore({ storage, now: () => now }).read('u-a', 'call-1');
  return { store, recorder, at, set, reread, storage };
}

describe('l’enregistreur du journal réseau (#8698)', () => {
  test('un appel entier s’inscrit sous son identifiant, relisible par un magasin neuf (rechargement)', () => {
    const h = harness();
    h.set(call());
    h.at(10);
    h.set(call({ callId: 'call-1', phase: { kind: 'connecting' } }));
    h.at(20);
    h.set(call({ callId: 'call-1', phase: { kind: 'connected' } }));
    h.at(30);
    h.recorder.noteTick(tick());
    h.at(40);
    h.set(call({ callId: 'call-1', phase: { kind: 'ended', reason: 'local', detail: null } }));
    h.set(null);
    expect(h.reread().map((event) => (event.kind === 'phase' ? `${event.phase}@${event.at}` : `${event.kind}@${event.at}`))).toEqual([
      'connecting@10',
      'connected@20',
      'quality@30',
      'profile@30',
      'path@30',
      'ended@40',
    ]);
  });

  test('ce qui arrive avant l’identifiant de l’appel attend, puis s’y range', () => {
    const h = harness();
    h.set(call({ phase: { kind: 'connecting' } }));
    expect(h.reread()).toEqual([]);
    h.set(call({ callId: 'call-1', phase: { kind: 'connecting' } }));
    expect(h.reread()).toEqual([{ at: 0, kind: 'phase', phase: 'connecting' }]);
  });

  test('un relevé hors appel identifié ne s’inscrit nulle part', () => {
    const h = harness();
    h.recorder.noteTick(tick());
    h.set(call());
    h.recorder.noteTick(tick());
    expect(h.reread()).toEqual([]);
  });

  test('un visiteur sans compte n’écrit rien sur l’appareil', () => {
    const h = harness('');
    h.set(call({ callId: 'call-1', phase: { kind: 'connected' } }));
    h.recorder.noteTick(tick());
    expect(h.reread()).toEqual([]);
  });

  test('un nouvel appel repart d’une mémoire vide : son premier relevé s’inscrit', () => {
    const h = harness();
    h.set(call({ callId: 'call-1', phase: { kind: 'connected' } }));
    h.recorder.noteTick(tick());
    h.set(null);
    h.set(call({ callId: 'call-2', phase: { kind: 'connected' } }));
    h.at(1_000);
    h.recorder.noteTick(tick());
    const second = createCallJournalStore({ storage: h.storage, now: () => 0 }).read('u-a', 'call-2');
    expect(second.map((event) => event.kind)).toEqual(['phase', 'quality', 'profile', 'path']);
  });

  test('arrêté, il n’écoute plus', () => {
    const h = harness();
    h.recorder.stop();
    h.set(call({ callId: 'call-1', phase: { kind: 'connected' } }));
    expect(h.reread()).toEqual([]);
  });
});
