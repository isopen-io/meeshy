import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { bindPresenceLive, createPresenceStore, livePresenceOf } from './presence-live';
import type { SocketClient, SocketHandler } from '@/lib/net/socket';

/**
 * LA PRÉSENCE VIVANTE (#10571) — la pastille suit `user:status`,
 * `presence:snapshot` et la frappe, jamais le seul REST figé dans le cache.
 */

const VIEWER = 'viewer-1';
const BOB = 'user-bob';
const CAROL = 'user-carol';
const NOW = Date.parse('2026-10-13T12:00:00.000Z');

function fakeSocket() {
  const handlers = new Map<string, Set<SocketHandler>>();
  const socket: SocketClient = {
    connected: true,
    connect: () => undefined,
    disconnect: () => undefined,
    on: (event, handler) => {
      const set = handlers.get(event) ?? new Set<SocketHandler>();
      set.add(handler as SocketHandler);
      handlers.set(event, set);
    },
    off: (event, handler) => {
      handlers.get(event)?.delete(handler as SocketHandler);
    },
    emit: () => undefined,
  };
  const fire = (event: string, payload?: unknown): void => {
    for (const handler of handlers.get(event) ?? []) handler(payload);
  };
  return { socket, fire, listeners: () => [...handlers.values()].reduce((n, s) => n + s.size, 0) };
}

function bound() {
  const store = createPresenceStore();
  const { socket, fire, listeners } = fakeSocket();
  const unbind = bindPresenceLive({ socket, store, viewerId: () => VIEWER, now: () => NOW });
  return { store, fire, listeners, unbind };
}

const iso = (ms: number): string => new Date(ms).toISOString();

describe('bindPresenceLive', () => {
  test('user:status pose la présence servie du pair', () => {
    const { store, fire } = bound();

    fire(SERVER_EVENTS.USER_STATUS, { userId: BOB, username: 'bob', isOnline: true, lastActiveAt: iso(NOW) });

    expect(store.getState().byUser[BOB]).toEqual({ isOnline: true, lastActiveAt: iso(NOW) });
  });

  test('un pair qui se déconnecte repasse hors ligne au user:status suivant', () => {
    const { store, fire } = bound();
    fire(SERVER_EVENTS.USER_STATUS, { userId: BOB, username: 'bob', isOnline: true, lastActiveAt: iso(NOW) });

    fire(SERVER_EVENTS.USER_STATUS, { userId: BOB, username: 'bob', isOnline: false, lastActiveAt: iso(NOW - 10 * 60_000) });

    expect(livePresenceOf(store.getState(), BOB, NOW)).toBe('offline');
  });

  test('presence:snapshot amorce tous les contacts servis, en ligne ou non', () => {
    const { store, fire } = bound();

    fire(SERVER_EVENTS.PRESENCE_SNAPSHOT, {
      users: [
        { userId: BOB, username: 'bob', isOnline: true, lastActiveAt: iso(NOW) },
        { userId: CAROL, username: 'carol', isOnline: false, lastActiveAt: null },
      ],
    });

    expect(livePresenceOf(store.getState(), BOB, NOW)).toBe('online');
    expect(livePresenceOf(store.getState(), CAROL, NOW)).toBe('offline');
  });

  test('typing:start d’un pair vaut activité immédiate', () => {
    const { store, fire } = bound();
    fire(SERVER_EVENTS.USER_STATUS, { userId: BOB, username: 'bob', isOnline: false, lastActiveAt: iso(NOW - 30 * 60_000) });

    fire(SERVER_EVENTS.TYPING_START, { userId: BOB, username: 'bob', conversationId: 'conv-a' });

    expect(livePresenceOf(store.getState(), BOB, NOW)).toBe('online');
  });

  test('la frappe du lecteur lui-même ne s’inscrit pas', () => {
    const { store, fire } = bound();

    fire(SERVER_EVENTS.TYPING_START, { userId: VIEWER, username: 'me', conversationId: 'conv-a' });

    expect(store.getState().byUser[VIEWER]).toBeUndefined();
  });

  test('une charge mal formée est ignorée', () => {
    const { store, fire } = bound();

    fire(SERVER_EVENTS.USER_STATUS, { username: 'bob', isOnline: true });
    fire(SERVER_EVENTS.PRESENCE_SNAPSHOT, { users: 'nope' });

    expect(store.getState().byUser).toEqual({});
  });

  test('une coupure vide le magasin : la passerelle ré-amorce à la reconnexion', () => {
    const { store, fire } = bound();
    fire(SERVER_EVENTS.USER_STATUS, { userId: BOB, username: 'bob', isOnline: true, lastActiveAt: iso(NOW) });

    fire('disconnect');

    expect(store.getState().byUser).toEqual({});
  });

  test('le détachement retire chaque écouteur et vide le magasin de l’identité partie', () => {
    const { store, fire, listeners, unbind } = bound();
    fire(SERVER_EVENTS.USER_STATUS, { userId: BOB, username: 'bob', isOnline: true, lastActiveAt: iso(NOW) });

    unbind();

    expect(listeners()).toBe(0);
    expect(store.getState().byUser).toEqual({});
  });
});

describe('livePresenceOf', () => {
  test('rend undefined pour un pair jamais servi en direct — le REST décide', () => {
    expect(livePresenceOf(createPresenceStore().getState(), BOB, NOW)).toBeUndefined();
  });

  test('décroît 1/3/5 avec l’horloge, sans nouvel événement', () => {
    const store = createPresenceStore();
    store.getState().put(BOB, { isOnline: false, lastActiveAt: iso(NOW) });

    expect(livePresenceOf(store.getState(), BOB, NOW + 30_000)).toBe('online');
    expect(livePresenceOf(store.getState(), BOB, NOW + 2 * 60_000)).toBe('away');
    expect(livePresenceOf(store.getState(), BOB, NOW + 4 * 60_000)).toBe('idle');
    expect(livePresenceOf(store.getState(), BOB, NOW + 6 * 60_000)).toBe('offline');
  });
});
