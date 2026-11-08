import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { SHARED_LOCATION_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/shared-location-event-names';

import type { HttpRequest, HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { loadCirclesCatalog } from '@/lib/i18n-circles-catalog';
import type { SocketClient } from '@/lib/net/socket';
import { createSharedLocationsStore } from '@/lib/shared-locations/shared-locations-live';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { SharedLocationsMap } from './shared-locations-map';

/**
 * **LA CARTE DES POSITIONS PARTAGÉES, SON HÔTE (#16984)** — rattrape par l'emprise visible,
 * suit le direct, cache le partage à `expiresAt`, et peint d'abord ce que le cache sait
 * (jamais de spinner sur un magasin non vide).
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, settle } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadCirclesCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  unmountAll();
  appQueryClient.clear();
});

const inFuture = (ms: number) => new Date(Date.now() + ms).toISOString();

const served = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  userId: 'u-ada',
  latitude: 48.85,
  longitude: 2.35,
  precision: 'neighborhood',
  radiusMeters: 800,
  updatedAt: new Date(Date.now() - 1000).toISOString(),
  expiresAt: inFuture(3_600_000),
  ...overrides,
});

function fakeDeps(items: readonly unknown[]) {
  const requests: HttpRequest[] = [];
  const transport = (async () => ({ ok: true, data: { items } })) as unknown as HttpTransport;
  transport.request = (async (req: HttpRequest) => {
    requests.push(req);
    return { ok: true, data: { items } };
  }) as HttpTransport['request'];
  return { deps: { source: 'gateway' as const, transport }, requests };
}

function fakeWatch() {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  const socket = {
    on: (event: string, handler: (payload: unknown) => void) => void handlers.set(event, new Set([...(handlers.get(event) ?? []), handler])),
    off: (event: string, handler: (payload: unknown) => void) => void handlers.get(event)?.delete(handler),
  } as unknown as SocketClient;
  const watch = (watcher: (socket: SocketClient) => (() => void) | void) => {
    const stop = watcher(socket);
    return () => void stop?.();
  };
  const fire = (event: string, payload: unknown) => act(() => [...(handlers.get(event) ?? [])].forEach((handler) => handler(payload)));
  return { watch, fire };
}

const view = { center: { latitude: 48.85, longitude: 2.35 }, zoom: 12 };

const host = (props: { readonly store?: ReturnType<typeof createSharedLocationsStore>; readonly items?: readonly unknown[]; readonly watch?: ReturnType<typeof fakeWatch>['watch'] }) => {
  const { deps, requests } = fakeDeps(props.items ?? []);
  const store = props.store ?? createSharedLocationsStore();
  return {
    requests,
    store,
    element: <SharedLocationsMap language="fr" store={store} deps={deps} watch={props.watch ?? (() => () => undefined)} initialView={view} />,
  };
};

describe('l’hôte de la carte', () => {
  test('rattrape par l’emprise visible et range ce qui est servi', async () => {
    const { element, requests } = host({ items: [served()] });
    const node = await mount(element);
    await settle();
    expect(requests.map((req) => req.path)).toEqual([expect.stringMatching(/^\/api\/v1\/relations\/locations\?bbox=-?\d/)]);
    expect(node.querySelector('[data-shared-location-row="u-ada"]')).not.toBeNull();
  });

  test('cache d’abord : un magasin non vide se peint SANS attendre le réseau', async () => {
    const store = createSharedLocationsStore();
    store.getState().receive(served() as never);
    const { element } = host({ store });
    const node = await mount(element);
    expect(node.querySelector('[data-shared-location-pin="u-ada"]')).not.toBeNull();
    expect(node.querySelector('[aria-busy="true"]')).toBeNull();
  });

  test('le direct pose, puis retire, une épingle', async () => {
    const live = fakeWatch();
    const { element } = host({ watch: live.watch });
    const node = await mount(element);
    await live.fire(SHARED_LOCATION_SERVER_EVENTS.SHARED_LOCATION_CHANGED, served({ userId: 'u-bob' }));
    expect(node.querySelector('[data-shared-location-pin="u-bob"]')).not.toBeNull();
    await live.fire(SHARED_LOCATION_SERVER_EVENTS.SHARED_LOCATION_ENDED, { userId: 'u-bob' });
    expect(node.querySelector('[data-shared-location-pin="u-bob"]')).toBeNull();
  });

  test('un partage échu disparaît à `expiresAt`, sans événement', async () => {
    const store = createSharedLocationsStore();
    store.getState().receive(served({ expiresAt: inFuture(80) }) as never);
    const { element } = host({ store });
    const node = await mount(element);
    expect(node.querySelector('[data-shared-location-row="u-ada"]')).not.toBeNull();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    expect(node.querySelector('[data-shared-location-row="u-ada"]')).toBeNull();
  });

  test('la personne est nommée par les caches de l’onglet, jamais inventée', async () => {
    appQueryClient.setQueryData(['conversations'], {
      pages: [{ conversations: [{ participants: [{ user: { id: 'u-ada', username: 'ada', displayName: 'Ada Lovelace', isOnline: true } }] }] }],
    });
    const store = createSharedLocationsStore();
    store.getState().receive(served() as never);
    store.getState().receive(served({ userId: 'u-x', latitude: 48.86 }) as never);
    const { element } = host({ store });
    const node = await mount(element);
    const text = node.textContent ?? '';
    expect(text).toContain('Ada Lovelace');
    expect(text).toContain('Quelqu’un');
    expect(node.querySelectorAll('[data-presence="online"]').length).toBe(1);
  });
});
