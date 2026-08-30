/**
 * LE TROISIÈME CANAL DE JURIDICTION, VU DEPUIS LA PAGE (issue #4416).
 *
 * `performFullAppInvalidationAndReload` est l'autre site du dépôt qui détruit
 * du Cache Storage — celui que la bannière de mise à jour appelle au CLIC de
 * l'utilisateur (`components/common/SystemStatusBanner.tsx` → `handleUpdate`).
 * Il faisait `caches.keys()` puis `caches.delete(key)` sur CHAQUE nom rendu.
 *
 * Or `caches` est une API d'ORIGINE : ses noms appartiennent à tous les
 * scripts de `meeshy.me`, dont le worker de la zone v3 que le § 7 de la
 * conception planifie « servi à la RACINE de l'URL par nécessité de portée ».
 * Une invalidation « complète de l'application » qui balaie l'origine entière
 * n'invalide pas une application : elle en invalide DEUX.
 *
 * C'est la forme de la leçon 275 déplacée d'un cran : la garde du listener
 * `fetch` de `public/sw.js` retient une RÉPONSE, et la destruction qui part à
 * côté ne compose aucune réponse — donc aucune recherche partant de « qui
 * répond à cette URL ? » ne pouvait la trouver.
 */

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: { disconnectForUpdate: jest.fn() },
}));

import {
  LEGACY_CACHE_NAMESPACE,
  performFullAppInvalidationAndReload,
} from '@/utils/service-worker';

type CacheStorageDouble = {
  install: () => void;
  restore: () => void;
  readonly deleted: readonly string[];
  readonly survivors: readonly string[];
};

function fakeCacheStorage(initialNames: readonly string[]): CacheStorageDouble {
  const names = new Set(initialNames);
  const deleted: string[] = [];
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'caches');

  return {
    install: () => {
      Object.defineProperty(globalThis, 'caches', {
        configurable: true,
        writable: true,
        value: {
          keys: async () => [...names],
          delete: async (name: string) => {
            deleted.push(name);
            return names.delete(name);
          },
        },
      });
    },
    restore: () => {
      if (previous) Object.defineProperty(globalThis, 'caches', previous);
      else delete (globalThis as { caches?: unknown }).caches;
    },
    get deleted() {
      return deleted;
    },
    get survivors() {
      return [...names];
    },
  };
}

/** Un `waiting` présent évite le `window.location.reload()` de la branche sans worker. */
function registrationWithWaiting(): ServiceWorkerRegistration {
  return {
    waiting: { postMessage: jest.fn() },
  } as unknown as ServiceWorkerRegistration;
}

describe('performFullAppInvalidationAndReload — la purge reste dans le namespace du legacy', () => {
  const OBSOLETE_LEGACY = `${LEGACY_CACHE_NAMESPACE}BUILD_20260829_101500`;
  const CURRENT_LEGACY = `${LEGACY_CACHE_NAMESPACE}BUILD_20260830_120000`;
  const V3_ZONE_CACHE = 'meeshy-v3-cache-BUILD_20260830_090000';

  it('supprime les caches de CETTE application', async () => {
    const storage = fakeCacheStorage([OBSOLETE_LEGACY, CURRENT_LEGACY]);
    storage.install();

    await performFullAppInvalidationAndReload(registrationWithWaiting());

    expect(storage.deleted).toEqual([OBSOLETE_LEGACY, CURRENT_LEGACY]);
    storage.restore();
  });

  it('laisse INTACT le cache d’un autre worker de la même origine (la zone v3)', async () => {
    const storage = fakeCacheStorage([CURRENT_LEGACY, V3_ZONE_CACHE]);
    storage.install();

    await performFullAppInvalidationAndReload(registrationWithWaiting());

    expect(storage.deleted).not.toContain(V3_ZONE_CACHE);
    expect(storage.survivors).toEqual([V3_ZONE_CACHE]);
    storage.restore();
  });

  it('demande quand même au worker en attente de s’activer', async () => {
    const storage = fakeCacheStorage([CURRENT_LEGACY]);
    storage.install();
    const registration = registrationWithWaiting();

    await performFullAppInvalidationAndReload(registration);

    expect(registration.waiting?.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    storage.restore();
  });
});
