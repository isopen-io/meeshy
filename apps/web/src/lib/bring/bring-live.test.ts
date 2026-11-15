import { describe, expect, test } from 'bun:test';

import { RELATION_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/relation-event-names';

import type { SocketClient } from '@/lib/net/socket';

import { bindBringLive, createBringStore, decodeBringRing, decodeBringStopped } from './bring-live';

/**
 * LES BRINGS EN VOL (#13936, `proche-bring@web`) — `bring:ring` chez le
 * destinataire, `bring:stopped` chez les deux, aucun événement à l'expiration :
 * le client cesse de sonner à `expiresAt`. Socket ET push partent : on
 * dédoublonne par `bringId`.
 */

const ME = 'me';
const NOW = Date.parse('2026-11-07T10:00:30.000Z');

const ring = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  bringId: 'b1',
  fromUserId: 'friend',
  toUserId: ME,
  sentAt: '2026-11-07T10:00:00.000Z',
  expiresAt: '2026-11-07T10:02:00.000Z',
  ...overrides,
});

const stopped = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  bringId: 'b1',
  fromUserId: 'friend',
  toUserId: ME,
  reason: 'recipient',
  stoppedAt: '2026-11-07T10:00:40.000Z',
  ...overrides,
});

function fakeSocket() {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  const socket = {
    on: (event: string, handler: (payload: unknown) => void) => {
      handlers.set(event, new Set([...(handlers.get(event) ?? []), handler]));
    },
    off: (event: string, handler: (payload: unknown) => void) => {
      handlers.get(event)?.delete(handler);
    },
  } as unknown as SocketClient;
  const fire = (event: string, payload: unknown) => [...(handlers.get(event) ?? [])].forEach((handler) => handler(payload));
  const count = () => [...handlers.values()].reduce((total, set) => total + set.size, 0);
  return { socket, fire, count };
}

describe('decodeBringRing / decodeBringStopped', () => {
  test('une charge complète se lit, une charge incomplète est IGNORÉE entière', () => {
    expect(decodeBringRing(ring())).toEqual(ring());
    expect(decodeBringRing(ring({ expiresAt: 42 }))).toBeNull();
    expect(decodeBringStopped(stopped())).toEqual(stopped());
    expect(decodeBringStopped(stopped({ reason: 'blocked' }))).toBeNull();
  });
});

describe('le magasin des Brings en vol', () => {
  test('un Bring reçu sonne ; le même reçu deux fois (socket ET push) ne sonne qu’une fois', () => {
    const store = createBringStore({ now: () => NOW });
    store.getState().receive(ring());
    store.getState().receive(ring());
    expect(store.getState().incoming.map((entry) => entry.bringId)).toEqual(['b1']);
  });

  test('un Bring déjà échu ne sonne pas', () => {
    const store = createBringStore({ now: () => NOW });
    store.getState().receive(ring({ expiresAt: '2026-11-07T10:00:10.000Z' }));
    expect(store.getState().incoming).toEqual([]);
  });

  test('un Bring arrêté ne ressuscite pas quand sa copie arrive en retard', () => {
    const store = createBringStore({ now: () => NOW });
    store.getState().receive(ring());
    store.getState().stop('b1');
    store.getState().receive(ring());
    expect(store.getState().incoming).toEqual([]);
  });

  test('l’envoi est suivi par destinataire jusqu’à son arrêt', () => {
    const store = createBringStore({ now: () => NOW });
    store.getState().sent({ bringId: 'b2', toUserId: 'friend', sentAt: '2026-11-07T10:00:00.000Z', expiresAt: '2026-11-07T10:02:00.000Z', perDay: 1, remainingToday: 0 });
    expect(store.getState().outgoing.friend?.bringId).toBe('b2');
    store.getState().stop('b2');
    expect(store.getState().outgoing.friend).toBeUndefined();
  });

  test('l’horloge retire ce qui a échu, sans événement', () => {
    let clock = NOW;
    const store = createBringStore({ now: () => clock });
    store.getState().receive(ring());
    store.getState().sent({ bringId: 'b2', toUserId: 'friend', sentAt: '2026-11-07T10:00:00.000Z', expiresAt: '2026-11-07T10:02:00.000Z', perDay: 1, remainingToday: 0 });
    clock = Date.parse('2026-11-07T10:02:00.000Z');
    store.getState().expire();
    expect(store.getState().incoming).toEqual([]);
    expect(store.getState().outgoing).toEqual({});
  });
});

describe('bindBringLive', () => {
  test('`bring:ring` sonne, `bring:stopped` arrête, et le pont se défait entier', () => {
    const store = createBringStore({ now: () => NOW });
    const { socket, fire, count } = fakeSocket();
    const unbind = bindBringLive({ socket, store, viewerId: () => ME });
    fire(RELATION_SERVER_EVENTS.BRING_RING, ring());
    expect(store.getState().incoming).toHaveLength(1);
    fire(RELATION_SERVER_EVENTS.BRING_STOPPED, stopped());
    expect(store.getState().incoming).toEqual([]);
    unbind();
    expect(count()).toBe(0);
  });

  test('un `bring:ring` adressé à un AUTRE compte ne sonne pas ici (changement de compte en vol)', () => {
    const store = createBringStore({ now: () => NOW });
    const { socket, fire } = fakeSocket();
    bindBringLive({ socket, store, viewerId: () => ME });
    fire(RELATION_SERVER_EVENTS.BRING_RING, ring({ toUserId: 'someone-else' }));
    expect(store.getState().incoming).toEqual([]);
  });

  test('`bring:stopped` reçu par l’EXPÉDITEUR libère son bouton', () => {
    const store = createBringStore({ now: () => NOW });
    const { socket, fire } = fakeSocket();
    bindBringLive({ socket, store, viewerId: () => 'friend' });
    store.getState().sent({ bringId: 'b1', toUserId: ME, sentAt: '2026-11-07T10:00:00.000Z', expiresAt: '2026-11-07T10:02:00.000Z', perDay: 1, remainingToday: 0 });
    fire(RELATION_SERVER_EVENTS.BRING_STOPPED, stopped());
    expect(store.getState().outgoing).toEqual({});
  });
});
