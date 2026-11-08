import { describe, expect, test } from 'bun:test';

import { SHARED_LOCATION_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/shared-location-event-names';

import type { SocketClient } from '@/lib/net/socket';

import { bindSharedLocationsLive, createSharedLocationsStore, decodeSharedLocationEnded } from './shared-locations-live';

/**
 * **LES POSITIONS PARTAGÉES EN VOL, SUR CET ONGLET (#16984)** — `location:share-changed`
 * remplace la position d’une personne, `location:share-ended` la retire, et le serveur
 * n’émet RIEN au terme : le client cache le partage à `expiresAt`. Le rattrapage
 * (`GET /relations/locations`) rejoue ce que le direct a manqué sans jamais écraser
 * une position plus récente.
 */

const NOW = Date.parse('2026-11-08T10:30:00.000Z');

const position = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  userId: 'ami',
  latitude: 48.85,
  longitude: 2.35,
  precision: 'neighborhood',
  radiusMeters: 800,
  updatedAt: '2026-11-08T10:00:00.000Z',
  expiresAt: '2026-11-08T11:00:00.000Z',
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

const storeAt = (now = NOW) => createSharedLocationsStore({ now: () => now });

describe('le magasin des positions partagées', () => {
  test('une position reçue remplace la précédente de la même personne', () => {
    const store = storeAt();
    store.getState().receive(position());
    store.getState().receive(position({ latitude: 48.9, updatedAt: '2026-11-08T10:10:00.000Z' }));
    expect(Object.keys(store.getState().byUser)).toEqual(['ami']);
    expect(store.getState().byUser.ami?.latitude).toBe(48.9);
  });

  test('une copie plus ancienne (rattrapage en retard) n’écrase pas le direct', () => {
    const store = storeAt();
    store.getState().receive(position({ latitude: 48.9, updatedAt: '2026-11-08T10:10:00.000Z' }));
    store.getState().receive(position({ latitude: 40, updatedAt: '2026-11-08T10:05:00.000Z' }));
    expect(store.getState().byUser.ami?.latitude).toBe(48.9);
  });

  test('un partage déjà échu n’entre jamais', () => {
    const store = storeAt();
    store.getState().receive(position({ expiresAt: '2026-11-08T10:29:59.000Z' }));
    expect(store.getState().byUser).toEqual({});
  });

  test('« ended » retire la personne, et une copie en retard ne la ressuscite pas', () => {
    const store = storeAt();
    store.getState().receive(position());
    store.getState().end('ami', '2026-11-08T10:20:00.000Z');
    expect(store.getState().byUser).toEqual({});
    store.getState().receive(position({ updatedAt: '2026-11-08T10:15:00.000Z' }));
    expect(store.getState().byUser).toEqual({});
    store.getState().receive(position({ updatedAt: '2026-11-08T10:25:00.000Z' }));
    expect(Object.keys(store.getState().byUser)).toEqual(['ami']);
  });

  test('expire() retire ce qui a passé son terme, et la file des échéances dit la prochaine', () => {
    let now = NOW;
    const store = createSharedLocationsStore({ now: () => now });
    store.getState().receive(position({ userId: 'a', expiresAt: '2026-11-08T10:40:00.000Z' }));
    store.getState().receive(position({ userId: 'b', expiresAt: '2026-11-08T11:00:00.000Z' }));
    expect(store.getState().nextExpiry()).toBe(Date.parse('2026-11-08T10:40:00.000Z'));
    now = Date.parse('2026-11-08T10:41:00.000Z');
    store.getState().expire();
    expect(Object.keys(store.getState().byUser)).toEqual(['b']);
  });

  test('merge() rattrape un lot sans rien retirer hors de l’emprise', () => {
    const store = storeAt();
    store.getState().receive(position({ userId: 'loin' }));
    store.getState().merge([position({ userId: 'proche' })]);
    expect(Object.keys(store.getState().byUser).sort()).toEqual(['loin', 'proche']);
  });

  test('clear() vide tout (changement de compte)', () => {
    const store = storeAt();
    store.getState().receive(position());
    store.getState().clear();
    expect(store.getState().byUser).toEqual({});
  });
});

describe('decodeSharedLocationEnded', () => {
  test('lit l’identifiant, refuse le reste', () => {
    expect(decodeSharedLocationEnded({ userId: 'ami' })).toEqual({ userId: 'ami' });
    expect(decodeSharedLocationEnded({ userId: '' })).toBeNull();
    expect(decodeSharedLocationEnded(null)).toBeNull();
  });
});

describe('bindSharedLocationsLive', () => {
  test('changed pose la position, ended la retire, détacher libère les écouteurs', () => {
    const { socket, fire, count } = fakeSocket();
    const store = storeAt();
    const unbind = bindSharedLocationsLive({ socket, store, now: () => NOW });
    fire(SHARED_LOCATION_SERVER_EVENTS.SHARED_LOCATION_CHANGED, position());
    expect(Object.keys(store.getState().byUser)).toEqual(['ami']);
    fire(SHARED_LOCATION_SERVER_EVENTS.SHARED_LOCATION_ENDED, { userId: 'ami' });
    expect(store.getState().byUser).toEqual({});
    unbind();
    expect(count()).toBe(0);
  });

  test('une charge illisible est ignorée, rien n’est fabriqué', () => {
    const { socket, fire } = fakeSocket();
    const store = storeAt();
    bindSharedLocationsLive({ socket, store, now: () => NOW });
    fire(SHARED_LOCATION_SERVER_EVENTS.SHARED_LOCATION_CHANGED, { userId: 'ami', latitude: 'ici' });
    expect(store.getState().byUser).toEqual({});
  });
});
