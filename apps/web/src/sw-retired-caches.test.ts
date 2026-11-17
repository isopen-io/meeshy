import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

import { SW_RUNTIME_CACHES } from './lib/sw-caches';

/**
 * CE QUE LA V2 NE RANGE PLUS NE SURVIT PAS À L'ACTIVATION DU WORKER (#18987).
 *
 * Cesser de ranger ne suffit pas : le seau `api` d'un profil existant contient
 * déjà des réponses `/api/v1/e2ee/*` (« Mes appareils chiffrés » appelle
 * `/e2ee/devices` depuis #13013), que le worker rejouerait encore sur une
 * passerelle injoignable. Le script est un fichier CLASSIQUE
 * (`importScripts`) : le témoin l'évalue tel quel, avec un `self` et un
 * `caches` de substitution — ce que le navigateur lui fournit.
 */

const V2 = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(V2, 'public/sw-retired-caches.js');

type ActivateEvent = { waitUntil(promise: Promise<unknown>): void };
type Listener = (event: ActivateEvent) => void;

type FakeCache = { readonly urls: Set<string>; readonly api: { keys(): Promise<Request[]>; delete(request: Request): Promise<boolean> } };

function fakeCache(urls: readonly string[], options: { readonly keysFail?: boolean } = {}): FakeCache {
  const alive = new Set(urls);
  return {
    urls: alive,
    api: {
      keys: () => (options.keysFail ? Promise.reject(new Error('stockage refusé')) : Promise.resolve([...alive].map((url) => new Request(url)))),
      delete: (request) => Promise.resolve(alive.delete(request.url)),
    },
  };
}

function fakeCaches(buckets: Readonly<Record<string, FakeCache>>) {
  const alive = new Map(Object.entries(buckets));
  return {
    alive,
    api: {
      keys: () => Promise.resolve([...alive.keys()]),
      has: (name: string) => Promise.resolve(alive.has(name)),
      open: (name: string) => {
        const bucket = alive.get(name);
        return bucket === undefined ? Promise.reject(new Error(`seau ${name} absent`)) : Promise.resolve(bucket.api);
      },
      delete: (name: string) => Promise.resolve(alive.delete(name)),
    },
  };
}

function load(caches: ReturnType<typeof fakeCaches>['api']) {
  const listeners = new Map<string, Listener[]>();
  const self = {
    addEventListener: (type: string, listener: Listener) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
  };
  new Function('self', 'caches', readFileSync(SCRIPT, 'utf8'))(self, caches);
  return listeners;
}

async function activate(listeners: Map<string, Listener[]>): Promise<void> {
  const pending: Promise<unknown>[] = [];
  for (const listener of listeners.get('activate') ?? []) listener({ waitUntil: (promise) => pending.push(promise) });
  await Promise.all(pending);
}

const GATE = 'https://gate.meeshy.me';

describe('sw-retired-caches.js — les réponses e2ee déjà rangées quittent le seau `api` à l’activation', () => {
  test('chaque réponse `/api/v1/e2ee/*` est effacée, et elle seule', async () => {
    const api = fakeCache([
      `${GATE}/api/v1/e2ee/devices`,
      `${GATE}/api/v1/e2ee/keys/64b000000000000000000001?deviceIds=1`,
      `${GATE}/api/v1/e2ee/envelopes?after=x&limit=200`,
      `${GATE}/api/v1/e2ee/devices/self/prekey-count`,
      `${GATE}/api/v1/conversations?limit=30`,
      `${GATE}/api/v1/e2eestats`,
    ]);
    const caches = fakeCaches({ [SW_RUNTIME_CACHES.api]: api });

    await activate(load(caches.api));

    expect([...api.urls].sort()).toEqual([`${GATE}/api/v1/conversations?limit=30`, `${GATE}/api/v1/e2eestats`]);
  });

  test('sans seau `api` (première installation), l’activation n’ouvre rien et réussit', async () => {
    const caches = fakeCaches({});

    await activate(load(caches.api));

    expect([...caches.alive.keys()]).toEqual([]);
  });

  test('un stockage qui refuse la lecture ne fait pas échouer l’activation', async () => {
    const caches = fakeCaches({ [SW_RUNTIME_CACHES.api]: fakeCache([`${GATE}/api/v1/e2ee/devices`], { keysFail: true }) });

    const outcome = await activate(load(caches.api)).then(
      () => 'activé',
      () => 'rejeté',
    );

    expect(outcome).toBe('activé');
  });

  test('le script n’intercepte aucune requête — il ne pose qu’un écouteur `activate`', () => {
    expect([...load(fakeCaches({}).api).keys()]).toEqual(['activate']);
  });

  test('son nom du seau `api` est le JUMEAU de `SW_RUNTIME_CACHES.api`', () => {
    expect(readFileSync(SCRIPT, 'utf8')).toContain(`const API_CACHE = '${SW_RUNTIME_CACHES.api}';`);
  });
});

describe('vite/pwa.ts — le service worker généré importe la purge, et ne la précache pas', () => {
  const config = readFileSync(join(V2, 'vite/pwa.ts'), 'utf8');

  test('la liste des scripts importés la porte, et le fichier existe dans `public/`', () => {
    expect(config).toMatch(/const SERVICE_WORKER_SCRIPTS = \[[^\]]*'sw-retired-caches\.js'/);
    expect(existsSync(SCRIPT)).toBe(true);
  });

  test('le précache l’ignore — le navigateur garde déjà les scripts importés avec le worker', () => {
    expect(config).toMatch(/globIgnores: \[[\s\S]*'sw-retired-caches\.js'/);
  });
});
