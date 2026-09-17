import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { LEGACY_CACHE_NAMESPACE, SW_RUNTIME_CACHES, WORKBOX_PRECACHE_PREFIX } from '../sw-caches';

import {
  createAppUpdateController,
  SKIP_WAITING_MESSAGE,
  SW_SCRIPT_URL,
  SW_UPDATE_AVAILABLE_EVENT,
  UPDATE_CHECK_INTERVAL_MS,
  type AppUpdateEnvironment,
  type RegistrationLike,
  type WorkerLike,
} from './service-worker';

beforeAll(() => {
  ensureHappyDomRegistered();
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

type Fired = { readonly type: string; run: () => void };

function fakeWorker(): WorkerLike & { readonly messages: readonly unknown[]; install(): void } {
  const messages: unknown[] = [];
  const listeners: Array<() => void> = [];
  let state = 'installing';
  return {
    messages,
    get state() {
      return state;
    },
    postMessage(message: unknown) {
      messages.push(message);
    },
    addEventListener(_type: 'statechange', listener: () => void) {
      listeners.push(listener);
    },
    install() {
      state = 'installed';
      for (const listener of [...listeners]) listener();
    },
  };
}

function fakeRegistration(initial: { readonly waiting?: WorkerLike | null } = {}): RegistrationLike & {
  readonly updates: number;
  findUpdate(worker: WorkerLike): void;
  setWaiting(worker: WorkerLike | null): void;
} {
  const found: Array<() => void> = [];
  let installing: WorkerLike | null = null;
  let waiting: WorkerLike | null = initial.waiting ?? null;
  let updates = 0;
  return {
    get installing() {
      return installing;
    },
    get waiting() {
      return waiting;
    },
    get updates() {
      return updates;
    },
    addEventListener(_type: 'updatefound', listener: () => void) {
      found.push(listener);
    },
    update() {
      updates += 1;
      return Promise.resolve();
    },
    findUpdate(worker: WorkerLike) {
      installing = worker;
      for (const listener of [...found]) listener();
    },
    setWaiting(worker: WorkerLike | null) {
      waiting = worker;
    },
  };
}

type Harness = {
  readonly env: AppUpdateEnvironment;
  readonly registration: ReturnType<typeof fakeRegistration>;
  readonly announcements: readonly RegistrationLike[];
  readonly reloads: () => number;
  readonly discards: () => number;
  readonly caches: { readonly alive: ReadonlySet<string> };
  readonly errors: readonly unknown[];
  readonly registrations: readonly { readonly url: string; readonly options: unknown }[];
  controllerChange(): void;
  fire(type: string): void;
  tickInterval(): void;
  tickTimeouts(): void;
};

function harness(
  options: {
    readonly controlled?: boolean;
    readonly waiting?: WorkerLike | null;
    readonly cacheNames?: readonly string[];
    readonly keysFail?: boolean;
  } = {},
): Harness {
  const registration = fakeRegistration({ waiting: options.waiting ?? null });
  const announcements: RegistrationLike[] = [];
  const errors: unknown[] = [];
  const registrations: { readonly url: string; readonly options: unknown }[] = [];
  const intervals: Array<() => void> = [];
  const timeouts: Array<() => void> = [];
  const controllerListeners: Array<() => void> = [];
  const fired: Fired[] = [];
  const alive = new Set(
    options.cacheNames ?? [
      SW_RUNTIME_CACHES.api,
      SW_RUNTIME_CACHES.medias,
      `${LEGACY_CACHE_NAMESPACE}2026.09.14-1`,
      `${WORKBOX_PRECACHE_PREFIX}-v2-https://meeshy.me/`,
    ],
  );
  let reloads = 0;
  let discards = 0;
  let visibility = 'visible';

  window.addEventListener(SW_UPDATE_AVAILABLE_EVENT, (event) => {
    announcements.push((event as CustomEvent<{ readonly registration: RegistrationLike }>).detail.registration);
  });

  const env: AppUpdateEnvironment = {
    container: {
      controller: options.controlled === false ? null : {},
      register(url, registerOptions) {
        registrations.push({ url, options: registerOptions });
        return Promise.resolve(registration);
      },
      addEventListener(_type, listener) {
        controllerListeners.push(listener);
      },
    },
    host: window,
    document: {
      get visibilityState() {
        return visibility;
      },
      addEventListener(type: string, listener: () => void) {
        fired.push({ type, run: listener });
      },
    },
    caches: {
      keys: () => (options.keysFail === true ? Promise.reject(new Error('refus')) : Promise.resolve([...alive])),
      delete: (name: string) => Promise.resolve(alive.delete(name)),
    },
    reload: () => {
      reloads += 1;
    },
    discardPersistedCache: () => {
      discards += 1;
    },
    setInterval: (handler) => {
      intervals.push(handler);
    },
    setTimeout: (handler) => {
      timeouts.push(handler);
    },
    onError: (error) => {
      errors.push(error);
    },
  };

  return {
    env,
    registration,
    announcements,
    errors,
    registrations,
    caches: { alive },
    reloads: () => reloads,
    discards: () => discards,
    controllerChange: () => {
      for (const listener of [...controllerListeners]) listener();
    },
    fire: (type: string) => {
      if (type === 'visibilitychange') visibility = 'visible';
      for (const entry of fired.filter((f) => f.type === type)) entry.run();
      if (type === 'focus') window.dispatchEvent(new Event('focus'));
    },
    tickInterval: () => {
      for (const handler of [...intervals]) handler();
    },
    tickTimeouts: () => {
      for (const handler of [...timeouts]) handler();
    },
  };
}

describe("l'inscription du service worker — l'API du legacy", () => {
  test("inscrit `/sw.js` à la racine, sans jamais servir le script depuis le cache HTTP", async () => {
    const h = harness();
    await createAppUpdateController(h.env).register();

    expect(h.registrations).toEqual([{ url: SW_SCRIPT_URL, options: { scope: '/', updateViaCache: 'none' } }]);
  });

  test('vérifie la mise à jour dès son inscription', async () => {
    const h = harness();
    await createAppUpdateController(h.env).register();

    expect(h.registration.updates).toBe(1);
  });

  test("annonce la version EN ATTENTE trouvée au chargement — c'est la bannière qui écoute", async () => {
    const waiting = fakeWorker();
    const h = harness({ waiting });

    await createAppUpdateController(h.env).register();

    expect(h.announcements).toEqual([h.registration]);
  });

  test("n'annonce rien quand aucune version n'attend", async () => {
    const h = harness();
    await createAppUpdateController(h.env).register();

    expect(h.announcements).toEqual([]);
  });

  test('annonce une version qui S’INSTALLE pendant que la page est ouverte', async () => {
    const h = harness();
    await createAppUpdateController(h.env).register();

    const neuf = fakeWorker();
    h.registration.findUpdate(neuf);
    expect(h.announcements).toEqual([]);

    neuf.install();
    expect(h.announcements).toEqual([h.registration]);
  });

  test("n'annonce RIEN à la première installation — il n'y a pas de version précédente à remplacer", async () => {
    const h = harness({ controlled: false });
    await createAppUpdateController(h.env).register();

    const premier = fakeWorker();
    h.registration.findUpdate(premier);
    premier.install();

    expect(h.announcements).toEqual([]);
  });
});

describe('les déclencheurs de vérification', () => {
  test('le retour au premier plan vérifie — `focus` comme le legacy, et la visibilité que le mobile donne', async () => {
    const h = harness();
    await createAppUpdateController(h.env).register();
    expect(h.registration.updates).toBe(1);

    h.fire('focus');
    expect(h.registration.updates).toBe(2);

    h.fire('visibilitychange');
    expect(h.registration.updates).toBe(3);
  });

  test('un battement horaire vérifie aussi — une page laissée ouverte finit par apprendre', async () => {
    const h = harness();
    await createAppUpdateController(h.env).register();

    h.tickInterval();

    expect(h.registration.updates).toBe(2);
    expect(UPDATE_CHECK_INTERVAL_MS).toBe(60 * 60 * 1000);
  });
});

describe('appliquer la mise à jour — ce que le clic fait, dans cet ordre', () => {
  test("purge les caches de l'application, garde le précache de la version neuve", async () => {
    const waiting = fakeWorker();
    const h = harness({ waiting });
    const controller = createAppUpdateController(h.env);
    await controller.register();

    await controller.applyUpdate(h.registration);

    expect([...h.caches.alive]).toEqual([`${WORKBOX_PRECACHE_PREFIX}-v2-https://meeshy.me/`]);
  });

  test('jette le cache de requêtes persisté — la session, elle, ne lui appartient pas', async () => {
    const waiting = fakeWorker();
    const h = harness({ waiting });
    const controller = createAppUpdateController(h.env);
    await controller.register();

    await controller.applyUpdate(h.registration);

    expect(h.discards()).toBe(1);
  });

  test('demande au worker en attente de prendre la main, puis recharge au CHANGEMENT DE CONTRÔLEUR', async () => {
    const waiting = fakeWorker();
    const h = harness({ waiting });
    const controller = createAppUpdateController(h.env);
    await controller.register();

    await controller.applyUpdate(h.registration);

    expect(waiting.messages).toEqual([SKIP_WAITING_MESSAGE]);
    expect(h.reloads()).toBe(0);

    h.controllerChange();
    expect(h.reloads()).toBe(1);
  });

  test('recharge UNE fois, quels que soient les signaux qui arrivent ensuite', async () => {
    const waiting = fakeWorker();
    const h = harness({ waiting });
    const controller = createAppUpdateController(h.env);
    await controller.register();

    await controller.applyUpdate(h.registration);
    h.controllerChange();
    h.controllerChange();
    h.tickTimeouts();

    expect(h.reloads()).toBe(1);
  });

  test("recharge quand même si le changement de contrôleur n'arrive jamais — un clic sans effet serait un contrôle mort", async () => {
    const waiting = fakeWorker();
    const h = harness({ waiting });
    const controller = createAppUpdateController(h.env);
    await controller.register();

    await controller.applyUpdate(h.registration);
    expect(h.reloads()).toBe(0);

    h.tickTimeouts();
    expect(h.reloads()).toBe(1);
  });

  test('sans worker en attente, recharge tout de suite', async () => {
    const h = harness();
    const controller = createAppUpdateController(h.env);
    await controller.register();

    await controller.applyUpdate(h.registration);

    expect(h.reloads()).toBe(1);
  });

  test('une purge qui ÉCHOUE ne bloque ni le rechargement ni la session', async () => {
    const waiting = fakeWorker();
    const h = harness({ waiting, keysFail: true });
    const controller = createAppUpdateController(h.env);
    await controller.register();

    await controller.applyUpdate(h.registration);

    expect(h.discards()).toBe(1);
    expect(waiting.messages).toEqual([SKIP_WAITING_MESSAGE]);
    h.controllerChange();
    expect(h.reloads()).toBe(1);
  });
});

describe("la version appliquée par un AUTRE onglet", () => {
  test('recharge cet onglet-ci, et jette son cache persisté avant de partir', async () => {
    const h = harness();
    await createAppUpdateController(h.env).register();

    h.controllerChange();

    expect(h.discards()).toBe(1);
    expect(h.reloads()).toBe(1);
  });

  test("ne recharge PAS la page que personne ne contrôlait — c'est la première installation", async () => {
    const h = harness({ controlled: false });
    await createAppUpdateController(h.env).register();

    h.controllerChange();

    expect(h.reloads()).toBe(0);
    expect(h.discards()).toBe(0);
  });
});

describe("un navigateur sans service worker", () => {
  test("ne lève pas, et ne prétend pas avoir inscrit quoi que ce soit", async () => {
    const h = harness();
    const controller = createAppUpdateController({ ...h.env, container: undefined });

    expect(await controller.register()).toBeNull();
    expect(h.errors).toEqual([]);
  });
});
