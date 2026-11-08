import { describe, expect, test } from 'bun:test';

import { NOW_PLAYING_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/now-playing-event-names';

import type { ApiResult } from '@/lib/api/http';
import type { NowPlayingChangedEventData } from '@meeshy/shared/types/now-playing';
import type { SocketClient } from '@/lib/net/socket';

import { bindListeningLive, createListeningStore } from './listening-live';

/**
 * L'ÉCOUTE D'UN PROCHE OU D'UN SANG, REÇUE SUR CET ONGLET (#16729) — le serveur a
 * déjà tronqué : ce client range ce qu'il reçoit, le remplace à chaque montée, le
 * retire à `cleared` ou à l'expiration, et rattrape à chaque socket accrochée.
 */

const ME = 'me';
const PROCHE = 'proche';
const SANG = 'sang';
const T0 = Date.parse('2026-11-07T10:00:00.000Z');

const changed = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  userId: PROCHE,
  category: 'music',
  updatedAt: '2026-11-07T10:00:00.000Z',
  expiresAt: '2026-11-07T10:15:00.000Z',
  ...overrides,
});

function fakeSocket() {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  const socket = {
    connected: true,
    connect: () => undefined,
    disconnect: () => undefined,
    emit: () => undefined,
    on: (event: string, handler: (payload: unknown) => void) => {
      handlers.set(event, (handlers.get(event) ?? new Set()).add(handler));
    },
    off: (event: string, handler: (payload: unknown) => void) => {
      handlers.get(event)?.delete(handler);
    },
  } as unknown as SocketClient;
  const fire = (event: string, payload: unknown): void => handlers.get(event)?.forEach((handler) => handler(payload));
  const listeners = (): number => [...handlers.values()].reduce((sum, set) => sum + set.size, 0);
  return { socket, fire, listeners };
}

const clock = () => {
  let now = T0;
  return { now: () => now, advance: (ms: number) => (now += ms) };
};

const noSnapshot = async (): Promise<ApiResult<readonly NowPlayingChangedEventData[]>> => ({ ok: true, data: [] });

describe('l’écoute reçue', () => {
  test('un Proche : la catégorie seule, sans titre ni origine', () => {
    const store = createListeningStore();
    const { socket, fire } = fakeSocket();
    bindListeningLive({ socket, store, viewerId: () => ME, snapshot: noSnapshot });
    fire(NOW_PLAYING_SERVER_EVENTS.NOW_PLAYING_CHANGED, changed());
    const entry = store.getState().byUser[PROCHE];
    expect(entry?.category).toBe('music');
    expect(entry !== undefined && 'title' in entry).toBe(false);
    expect(entry !== undefined && 'source' in entry).toBe(false);
  });

  test('une montée au Sang : le titre et l’origine remplacent la catégorie seule, sans recharger', () => {
    const store = createListeningStore();
    const { socket, fire } = fakeSocket();
    bindListeningLive({ socket, store, viewerId: () => ME, snapshot: noSnapshot });
    fire(NOW_PLAYING_SERVER_EVENTS.NOW_PLAYING_CHANGED, changed());
    fire(NOW_PLAYING_SERVER_EVENTS.NOW_PLAYING_CHANGED, changed({ title: 'Clair de lune', source: 'Spotify', updatedAt: '2026-11-07T10:00:01.000Z' }));
    expect(store.getState().byUser[PROCHE]).toMatchObject({ category: 'music', title: 'Clair de lune', source: 'Spotify' });
  });

  test('une baisse : un état sans titre efface le titre gardé', () => {
    const store = createListeningStore();
    const { socket, fire } = fakeSocket();
    bindListeningLive({ socket, store, viewerId: () => ME, snapshot: noSnapshot });
    fire(NOW_PLAYING_SERVER_EVENTS.NOW_PLAYING_CHANGED, changed({ userId: SANG, title: 'Clair de lune', source: 'Spotify' }));
    fire(NOW_PLAYING_SERVER_EVENTS.NOW_PLAYING_CHANGED, changed({ userId: SANG, updatedAt: '2026-11-07T10:00:02.000Z' }));
    const entry = store.getState().byUser[SANG];
    expect(entry !== undefined && 'title' in entry).toBe(false);
  });

  test('`cleared` retire l’écoute, sans toucher aux autres', () => {
    const store = createListeningStore();
    const { socket, fire } = fakeSocket();
    bindListeningLive({ socket, store, viewerId: () => ME, snapshot: noSnapshot });
    fire(NOW_PLAYING_SERVER_EVENTS.NOW_PLAYING_CHANGED, changed());
    fire(NOW_PLAYING_SERVER_EVENTS.NOW_PLAYING_CHANGED, changed({ userId: SANG }));
    fire(NOW_PLAYING_SERVER_EVENTS.NOW_PLAYING_CLEARED, { userId: PROCHE });
    expect(Object.keys(store.getState().byUser)).toEqual([SANG]);
  });

  test('ma propre écoute, venue d’un autre de mes appareils, ne s’affiche pas ici', () => {
    const store = createListeningStore();
    const { socket, fire } = fakeSocket();
    bindListeningLive({ socket, store, viewerId: () => ME, snapshot: noSnapshot });
    fire(NOW_PLAYING_SERVER_EVENTS.NOW_PLAYING_CHANGED, changed({ userId: ME }));
    expect(store.getState().byUser).toEqual({});
  });

  test('une charge illisible ne range rien', () => {
    const store = createListeningStore();
    const { socket, fire } = fakeSocket();
    bindListeningLive({ socket, store, viewerId: () => ME, snapshot: noSnapshot });
    fire(NOW_PLAYING_SERVER_EVENTS.NOW_PLAYING_CHANGED, changed({ category: 'podcast' }));
    fire(NOW_PLAYING_SERVER_EVENTS.NOW_PLAYING_CHANGED, changed({ expiresAt: 'bientôt' }));
    fire(NOW_PLAYING_SERVER_EVENTS.NOW_PLAYING_CHANGED, 'music');
    expect(store.getState().byUser).toEqual({});
  });

  test('un champ en trop ne traverse pas : seul le contrat est gardé', () => {
    const store = createListeningStore();
    const { socket, fire } = fakeSocket();
    bindListeningLive({ socket, store, viewerId: () => ME, snapshot: noSnapshot });
    fire(NOW_PLAYING_SERVER_EVENTS.NOW_PLAYING_CHANGED, changed({ app: 'com.spotify.client', position: { lat: 1, lng: 2 } }));
    expect(Object.keys(store.getState().byUser[PROCHE] ?? {}).sort()).toEqual(['category', 'deadline', 'updatedAt']);
  });

  test('une origine sans titre ne se montre pas : l’origine n’est servie qu’avec le titre', () => {
    const store = createListeningStore();
    const { socket, fire } = fakeSocket();
    bindListeningLive({ socket, store, viewerId: () => ME, snapshot: noSnapshot });
    fire(NOW_PLAYING_SERVER_EVENTS.NOW_PLAYING_CHANGED, changed({ source: 'Spotify' }));
    const entry = store.getState().byUser[PROCHE];
    expect(entry !== undefined && 'source' in entry).toBe(false);
  });

  test('l’expiration, comptée à l’horloge de l’onglet depuis la réception, retire l’écoute', () => {
    const time = clock();
    const store = createListeningStore({ now: time.now });
    const { socket, fire } = fakeSocket();
    bindListeningLive({ socket, store, viewerId: () => ME, snapshot: noSnapshot });
    fire(NOW_PLAYING_SERVER_EVENTS.NOW_PLAYING_CHANGED, changed({ updatedAt: '2020-01-01T00:00:00.000Z', expiresAt: '2020-01-01T00:15:00.000Z' }));
    expect(store.getState().msUntilExpiry()).toBe(15 * 60_000);
    time.advance(15 * 60_000 - 1);
    expect(store.getState().expire()).toEqual([]);
    time.advance(1);
    expect(store.getState().expire()).toEqual([PROCHE]);
    expect(store.getState().byUser).toEqual({});
    expect(store.getState().msUntilExpiry()).toBeNull();
  });

  test('une durée de vie servie plus longue que le TTL du contrat est bornée au TTL', () => {
    const store = createListeningStore({ now: () => T0 });
    const { socket, fire } = fakeSocket();
    bindListeningLive({ socket, store, viewerId: () => ME, snapshot: noSnapshot });
    fire(NOW_PLAYING_SERVER_EVENTS.NOW_PLAYING_CHANGED, changed({ expiresAt: '2026-11-08T10:00:00.000Z' }));
    expect(store.getState().msUntilExpiry()).toBe(15 * 60_000);
  });

  test('un état plus ancien que celui gardé ne le remplace pas', () => {
    const store = createListeningStore();
    const { socket, fire } = fakeSocket();
    bindListeningLive({ socket, store, viewerId: () => ME, snapshot: noSnapshot });
    fire(NOW_PLAYING_SERVER_EVENTS.NOW_PLAYING_CHANGED, changed({ category: 'video', updatedAt: '2026-11-07T10:00:05.000Z' }));
    fire(NOW_PLAYING_SERVER_EVENTS.NOW_PLAYING_CHANGED, changed({ category: 'music', updatedAt: '2026-11-07T10:00:01.000Z' }));
    expect(store.getState().byUser[PROCHE]?.category).toBe('video');
  });
});

describe('le rattrapage à chaque socket accrochée', () => {
  test('les écoutes servies par `GET /relations/now-playing` s’affichent', async () => {
    const store = createListeningStore();
    const { socket } = fakeSocket();
    bindListeningLive({
      socket,
      store,
      viewerId: () => ME,
      snapshot: async () => ({ ok: true, data: [{ userId: SANG, category: 'video', title: 'Le film', source: 'YouTube', updatedAt: '2026-11-07T10:00:00.000Z', expiresAt: '2026-11-07T10:15:00.000Z' }] }),
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(store.getState().byUser[SANG]).toMatchObject({ category: 'video', title: 'Le film', source: 'YouTube' });
  });

  test('le rattrapage retire une écoute éteinte pendant la coupure, et garde ce qui est arrivé après la demande', async () => {
    const store = createListeningStore();
    const first = fakeSocket();
    const detach = bindListeningLive({ socket: first.socket, store, viewerId: () => ME, snapshot: noSnapshot });
    first.fire(NOW_PLAYING_SERVER_EVENTS.NOW_PLAYING_CHANGED, changed());
    detach();
    const second = fakeSocket();
    let answer: (value: ApiResult<readonly NowPlayingChangedEventData[]>) => void = () => undefined;
    bindListeningLive({ socket: second.socket, store, viewerId: () => ME, snapshot: () => new Promise((resolve) => (answer = resolve)) });
    second.fire(NOW_PLAYING_SERVER_EVENTS.NOW_PLAYING_CHANGED, changed({ userId: SANG }));
    answer({ ok: true, data: [] });
    await Promise.resolve();
    await Promise.resolve();
    expect(Object.keys(store.getState().byUser)).toEqual([SANG]);
  });

  test('un rattrapage en échec garde ce qui est affiché', async () => {
    const store = createListeningStore();
    const { socket, fire } = fakeSocket();
    bindListeningLive({ socket, store, viewerId: () => ME, snapshot: async () => ({ ok: false, status: 0, error: 'network' }) });
    fire(NOW_PLAYING_SERVER_EVENTS.NOW_PLAYING_CHANGED, changed());
    await Promise.resolve();
    await Promise.resolve();
    expect(Object.keys(store.getState().byUser)).toEqual([PROCHE]);
  });

  test('se détacher retire toutes les écoutes de la socket', () => {
    const store = createListeningStore();
    const { socket, listeners } = fakeSocket();
    const detach = bindListeningLive({ socket, store, viewerId: () => ME, snapshot: noSnapshot });
    expect(listeners()).toBe(2);
    detach();
    expect(listeners()).toBe(0);
  });
});
