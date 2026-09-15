import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

/**
 * LES CACHES DU LEGACY SONT PURGÉS QUAND LE SERVICE WORKER DE LA V2 S'ACTIVE
 * (bascule de meeshy.me, #6702).
 *
 * Le Cache Storage vit à l'échelle de l'ORIGINE, pas du worker. Le service
 * worker du legacy (`apps/web/public/sw.js`) y a rangé, sous le préfixe
 * `meeshy-cache-`, sa coquille ET des réponses d'API privées. Le service worker
 * de la v2 remplace le sien dans la MÊME inscription (`/sw.js`) : rien d'autre
 * ne viendra jamais les effacer, et ils survivraient sur le disque du lecteur
 * au-delà de la vie de l'application qui les a écrits.
 *
 * Le script est un fichier CLASSIQUE (`importScripts`), sans module ni
 * bundler : le témoin l'évalue tel quel, avec un `self` et un `caches` de
 * substitution — ce que le navigateur lui fournit.
 */

const V2 = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(V2, 'public/sw-legacy-purge.js');

type ActivateEvent = { waitUntil(promise: Promise<unknown>): void };
type Listener = (event: ActivateEvent) => void;

function fakeCaches(names: readonly string[], options: { readonly keysFail?: boolean } = {}) {
  const alive = new Set(names);
  return {
    alive,
    api: {
      keys: () => (options.keysFail ? Promise.reject(new Error('stockage refusé')) : Promise.resolve([...alive])),
      delete: (name: string) => Promise.resolve(alive.delete(name)),
    },
  };
}

function loadPurge(caches: ReturnType<typeof fakeCaches>['api']) {
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

describe('sw-legacy-purge.js — la purge des caches du legacy à l’activation', () => {
  test('efface les caches `meeshy-cache-*` du legacy, et eux seuls', async () => {
    const caches = fakeCaches([
      'meeshy-cache-2026.09.14-1',
      'meeshy-cache-DEV_1757000000000',
      'workbox-precache-v2-https://meeshy.me/',
      'api',
      'medias',
    ]);

    await activate(loadPurge(caches.api));

    expect([...caches.alive].sort()).toEqual(['api', 'medias', 'workbox-precache-v2-https://meeshy.me/']);
  });

  test('un cache dont le nom CONTIENT le préfixe sans commencer par lui reste intact', async () => {
    const caches = fakeCaches(['v2-meeshy-cache-copie']);

    await activate(loadPurge(caches.api));

    expect([...caches.alive]).toEqual(['v2-meeshy-cache-copie']);
  });

  test('un stockage qui refuse la lecture ne fait pas échouer l’activation', async () => {
    const caches = fakeCaches(['meeshy-cache-1'], { keysFail: true });

    const outcome = await activate(loadPurge(caches.api)).then(
      () => 'activé',
      () => 'rejeté',
    );

    expect(outcome).toBe('activé');
  });

  test('le script n’intercepte aucune requête — il ne pose qu’un écouteur `activate`', () => {
    const listeners = loadPurge(fakeCaches([]).api);

    expect([...listeners.keys()]).toEqual(['activate']);
  });
});

/**
 * UN SCRIPT QUE LE SERVICE WORKER N'IMPORTE PAS NE PURGE RIEN — et aucun des
 * témoins ci-dessus ne le verrait : ils évaluent le fichier directement.
 * `vite.config.ts` déclare la liste UNE fois (`SERVICE_WORKER_SCRIPTS`), lue
 * par `importScripts` (variante A) et par le retrait de la variante B.
 */
describe('vite.config.ts — le service worker généré importe la purge', () => {
  const config = readFileSync(join(V2, 'vite.config.ts'), 'utf8');
  const declared = config.match(/const SERVICE_WORKER_SCRIPTS = \[([^\]]*)\]/);
  const scripts = declared === null ? [] : [...(declared[1] ?? '').matchAll(/'([^']+)'/g)].map(([, name]) => name ?? '');

  test('la liste déclarée porte la purge, et chaque script existe dans `public/`', () => {
    expect(scripts).toContain('sw-legacy-purge.js');
    for (const name of scripts) expect(existsSync(join(V2, 'public', name))).toBe(true);
  });

  test('`importScripts` et le retrait de la coque lisent cette liste, pas une copie', () => {
    expect(config).toContain('importScripts: [...SERVICE_WORKER_SCRIPTS]');
    expect(config).toMatch(/for \(const name of SERVICE_WORKER_SCRIPTS\)/);
  });
});
