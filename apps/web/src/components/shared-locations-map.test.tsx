import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import { SHARED_LOCATION_SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/shared-location-event-names';

import type { HttpRequest, HttpTransport } from '@/lib/api/http';
import type { SharedLocation } from '@/lib/api/shared-locations';
import { appQueryClient } from '@/lib/api/query-client';
import { publicProfileQueryKey, type PublicProfileView } from '@/lib/api/public-profile';
import { loadCirclesCatalog } from '@/lib/i18n-circles-catalog';
import type { SocketClient } from '@/lib/net/socket';
import { createSharedLocationsStore, watchSharedLocationsIdentity } from '@/lib/shared-locations/shared-locations-live';
import { createSessionStore, type SessionStoreApi } from '@/lib/api/session';
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

const served = (overrides: Partial<SharedLocation> = {}): SharedLocation => ({
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

function failingDeps() {
  const requests: HttpRequest[] = [];
  const transport = (async () => ({ ok: false, status: 0, error: 'hors ligne' })) as unknown as HttpTransport;
  transport.request = (async (req: HttpRequest) => {
    requests.push(req);
    return requests.length === 1 ? { ok: false, status: 404, error: 'introuvable' } : { ok: true, data: { items: [served()] } };
  }) as HttpTransport['request'];
  return { deps: { source: 'gateway' as const, transport }, requests };
}

function pendingDeps() {
  const transport = (async () => new Promise(() => undefined)) as unknown as HttpTransport;
  transport.request = (() => new Promise(() => undefined)) as HttpTransport['request'];
  return { source: 'gateway' as const, transport };
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

const host = (props: {
  readonly store?: ReturnType<typeof createSharedLocationsStore>;
  readonly items?: readonly unknown[];
  readonly watch?: ReturnType<typeof fakeWatch>['watch'];
  readonly pending?: boolean;
}) => {
  const fake = fakeDeps(props.items ?? []);
  const { requests } = fake;
  const deps = props.pending === true ? pendingDeps() : fake.deps;
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
    const paths = requests.map((request) => request.path).filter((path) => path.startsWith('/api/v1/relations/locations'));
    expect(paths).toHaveLength(2);
    expect(paths[0]).toBe('/api/v1/relations/locations?bbox=-180,-90,180,90');
    expect(paths[1]).toMatch(/^\/api\/v1\/relations\/locations\?bbox=2\.\d+,48\.\d+,2\.\d+,48\.\d+$/);
    expect(node.querySelector('[data-shared-location-row="u-ada"]')).not.toBeNull();
  });

  test('cache d’abord : un magasin non vide se peint SANS attendre le réseau', async () => {
    const store = createSharedLocationsStore();
    store.getState().receive(served());
    const { element } = host({ store, pending: true });
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
    store.getState().receive(served({ expiresAt: inFuture(80) }));
    const { element } = host({ store, pending: true });
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
    store.getState().receive(served());
    store.getState().receive(served({ userId: 'u-x', latitude: 48.86 }));
    const { element } = host({ store, pending: true });
    const node = await mount(element);
    const text = node.textContent ?? '';
    expect(text).toContain('Ada Lovelace');
    expect(text).toContain('Quelqu’un');
    expect(node.querySelectorAll('[data-presence="online"]').length).toBe(1);
  });

  test('un lien sans conversation commune est nommé, et son visage posé, par sa fiche publique', async () => {
    const view: PublicProfileView = {
      profile: { id: 'u-ada', username: 'ada', displayName: 'Ada Lovelace', avatar: 'https://cdn.meeshy.me/ada.png', banner: null, bio: null, createdAt: null },
      stats: null,
      relation: 'friend',
      isSelf: false,
      blockedByViewer: false,
      relationRequestId: null,
      presence: { isOnline: true, lastActiveAt: null },
    };
    appQueryClient.setQueryData(publicProfileQueryKey('u-ada'), view);
    const store = createSharedLocationsStore();
    store.getState().receive(served());
    const { element } = host({ store, pending: true });
    const node = await mount(element);
    await settle();
    expect(node.textContent ?? '').toContain('Ada Lovelace');
    expect(node.textContent ?? '').not.toContain('Quelqu’un');
    expect(node.querySelector('[data-shared-location-pin="u-ada"] img')?.getAttribute('src')).toBe('https://cdn.meeshy.me/ada.png');
    expect(node.querySelectorAll('[data-presence="online"]').length).toBe(1);
  });

  test('le premier rattrapage couvre le MONDE : un lien qui partage loin de la vue initiale est trouvé', async () => {
    const { element, requests } = host({ items: [served({ userId: 'u-tokyo', latitude: 35.68, longitude: 139.69 })] });
    const node = await mount(element);
    await settle();
    expect(requests[0]?.path).toBe('/api/v1/relations/locations?bbox=-180,-90,180,90');
    expect(node.querySelector('[data-shared-location-row="u-tokyo"]')).not.toBeNull();
  });

  test('une fin manquée hors écoute (blocage, baisse sous Ami) ne survit pas au retour sur la carte', async () => {
    const store = createSharedLocationsStore();
    store.getState().receive(served({ userId: 'u-bloque' }));
    await new Promise((resolve) => setTimeout(resolve, 5));
    const { element } = host({ store, items: [] });
    const node = await mount(element);
    await settle();
    expect(node.querySelector('[data-shared-location-row="u-bloque"]')).toBeNull();
    expect(node.querySelector('[data-shared-location-pin="u-bloque"]')).toBeNull();
  });

  test('un rattrapage en échec ne prétend pas que personne ne partage : il le dit, et Réessayer relance', async () => {
    const { deps, requests } = failingDeps();
    const node = await mount(<SharedLocationsMap language="fr" store={createSharedLocationsStore()} deps={deps} watch={() => () => undefined} initialView={view} />);
    await settle();
    const text = node.textContent ?? '';
    expect(text).not.toContain('Personne ne partage');
    expect(text).toContain('Les positions n’ont pas pu être chargées.');
    const retry = [...node.querySelectorAll('button')].find((button) => button.textContent === 'Réessayer');
    expect(retry).toBeDefined();
    await act(async () => {
      retry?.click();
    });
    await settle();
    expect(requests[1]?.path).toBe('/api/v1/relations/locations?bbox=-180,-90,180,90');
    expect(node.querySelector('[data-shared-location-row="u-ada"]')).not.toBeNull();
  });

  test('pendant le premier rattrapage d’un magasin vide, rien ne dit « personne »', async () => {
    const node = await mount(<SharedLocationsMap language="fr" store={createSharedLocationsStore()} deps={pendingDeps()} watch={() => () => undefined} initialView={view} />);
    await settle();
    expect(node.textContent ?? '').not.toContain('Personne ne partage');
    expect(node.querySelector('[aria-busy="true"]')).not.toBeNull();
  });
});

describe('une carte au repos', () => {
  test('ne se repeint plus une fois immobile (aucune boucle de rendu sur l’emprise)', async () => {
    const store = createSharedLocationsStore();
    store.getState().receive(served());
    const { element } = host({ store, items: [served()] });
    const original = appQueryClient.getQueryData.bind(appQueryClient);
    let reads = 0;
    appQueryClient.getQueryData = ((key: Parameters<typeof original>[0]) => {
      reads += 1;
      return original(key);
    }) as typeof appQueryClient.getQueryData;
    try {
      await mount(element);
      await settle();
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 900));
      });
      const resting = reads;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 900));
      });
      expect(reads).toBe(resting);
    } finally {
      appQueryClient.getQueryData = original;
    }
  });
});

describe('les positions appartiennent au compte ouvert', () => {
  const signIn = (session: SessionStoreApi, id: string) =>
    session.getState().establish({ user: { id, username: id }, token: `jwt-${id}`, sessionToken: `s-${id}`, expiresIn: 86_400 });

  test('A → B : les positions partagées avec A ne s’affichent pas chez B', () => {
    const session = createSessionStore({ storage: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined } });
    signIn(session, 'a');
    const store = createSharedLocationsStore();
    const unwatch = watchSharedLocationsIdentity({ session, store });
    store.getState().receive(served());
    signIn(session, 'a');
    expect(Object.keys(store.getState().byUser)).toEqual(['u-ada']);
    signIn(session, 'b');
    expect(store.getState().byUser).toEqual({});
    unwatch();
  });
});
