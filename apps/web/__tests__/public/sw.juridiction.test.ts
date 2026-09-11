/**
 * LA JURIDICTION DE `public/sw.js` — ce qu'il laisse au réseau, et ce qu'il
 * s'interdit de détruire.
 *
 * `apps/web` enregistre son Service Worker sur `scope: '/'` — DEUX sites, même
 * script, même portée (`utils/service-worker.ts:28-31`, monté sans condition
 * par `app/layout.tsx:93` ; `utils/service-worker-registration.ts:95-97`, pour
 * FCM) : il voit donc TOUTE l'origine. Sa branche « App Shell » est un
 * cache-first qui attrape les navigations, le JS, le CSS, les polices et les
 * images.
 *
 * Ce worker s'effaçait devant une ZONE, celle de l'ancienne refonte v3. La
 * refonte a quitté le dépôt (#5994), et la zone a quitté le worker (#6001) :
 *
 *   1. le listener `fetch` → les chemins que seule la refonte servait
 *      redeviennent des navigations du legacy ; les pages que le legacy sert
 *      et qu'il ne mettait plus en cache restent au réseau (1er describe) ;
 *   2. le CACHE STORAGE, qui est à l'échelle de l'ORIGINE et non du worker →
 *      2e describe. `activate` supprimait tout nom ≠ `CACHE_NAME`, donc AUSSI
 *      les caches d'un worker qui n'est pas celui-ci.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * HARNAIS — pourquoi il est ici et non partagé avec `sw.stale-response.test.ts`
 * ─────────────────────────────────────────────────────────────────────────
 * Même principe : `public/sw.js` n'est pas un module importable, donc le
 * fichier SOURCE réel est lu puis exécuté par `new Function` avec des doubles
 * de `self`/`caches`/`fetch`/`Response`. C'est le code de PRODUCTION qui
 * s'exécute, listener `fetch` compris.
 *
 * Une seule chose change, et elle ne peut pas être partagée : ce fichier
 * observe la NON-interception. Le harnais voisin JETTE quand `respondWith`
 * n'est pas appelé — c'est son contrat, tous ses témoins passent par une
 * réponse. Ici, `respondWith` NON appelé est le résultat attendu, et le seul
 * témoignage possible que la requête est partie au réseau du navigateur.
 * `dispatchFetch` rend donc `null` dans ce cas plutôt que de jeter.
 */

import fs from 'fs';
import path from 'path';

const SW_SOURCE_PATH = path.join(__dirname, '../../public/sw.js');
const swSource = fs.readFileSync(SW_SOURCE_PATH, 'utf8');

class FakeResponse {
  readonly ok: boolean;
  readonly status: number;
  private corps: string | null;
  private consomme = false;

  constructor(body: string | null, init: { ok?: boolean; status?: number } = {}) {
    this.corps = body;
    this.ok = init.ok ?? true;
    this.status = init.status ?? (init.ok === false ? 0 : 200);
  }

  /** Le corps NON consommé, pour les assertions du harnais lui-même. */
  get body(): string | null {
    return this.corps;
  }

  clone(): FakeResponse {
    if (this.consomme) {
      throw new TypeError('Failed to execute \'clone\' on \'Response\': Response body is already used');
    }
    return new FakeResponse(this.corps, { ok: this.ok, status: this.status });
  }

  async text(): Promise<string | null> {
    if (this.consomme) {
      throw new TypeError('Failed to execute \'text\' on \'Response\': Response body is already used');
    }
    this.consomme = true;
    return this.corps;
  }

  static error(): FakeResponse {
    return new FakeResponse(null, { ok: false, status: 0 });
  }
}

type FakeRequest = { url: string; method: string; mode?: string; destination?: string };

function makeRequest(
  url: string,
  extra: { method?: string; mode?: string; destination?: string } = {},
): FakeRequest {
  return { url, method: extra.method ?? 'GET', mode: extra.mode, destination: extra.destination };
}

function createFakeCache() {
  const store = new Map<string, FakeResponse>();
  return {
    match: async (request: FakeRequest) => store.get(request.url),
    put: async (request: FakeRequest, response: FakeResponse) => {
      store.set(request.url, response);
    },
    addAll: async () => {},
    _store: store,
  };
}
type FakeCache = ReturnType<typeof createFakeCache>;

type FetchEvent = {
  request: FakeRequest;
  respondWith: (promise: Promise<FakeResponse>) => void;
};

/**
 * Le Cache Storage de l'ORIGINE — pas celui du worker. C'est toute la question
 * du 2e describe : `caches.keys()` rend les noms de TOUS les scripts de
 * `meeshy.me`, et `caches.delete(name)` les supprime pour de bon.
 */
function createFakeCacheStorage(initialNames: readonly string[], cache: FakeCache) {
  const names = new Set(initialNames);
  const deleted: string[] = [];
  return {
    api: {
      open: async (name: string) => {
        names.add(name);
        return cache;
      },
      keys: async () => [...names],
      delete: async (name: string) => {
        deleted.push(name);
        return names.delete(name);
      },
    },
    get deleted(): readonly string[] {
      return deleted;
    },
    get survivors(): readonly string[] {
      return [...names];
    },
  };
}

function loadServiceWorker(options: {
  fetchImpl: (request: FakeRequest) => Promise<FakeResponse>;
  cache: FakeCache;
  cacheStorage?: ReturnType<typeof createFakeCacheStorage>;
}) {
  const listeners: Record<string, Array<(event: unknown) => void>> = {};

  const fakeSelf = {
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      (listeners[type] ??= []).push(handler);
    },
    skipWaiting: () => {},
    clients: { claim: async () => {}, matchAll: async () => [] },
    registration: { showNotification: async () => {} },
    location: { origin: 'https://meeshy.me' },
  };

  const fakeCaches = options.cacheStorage?.api ?? {
    open: async () => options.cache,
    keys: async () => [],
    delete: async () => true,
  };

  const run = new Function(
    'self',
    'caches',
    'fetch',
    'Response',
    `${swSource}\n//# sourceURL=sw-under-test.js`
  );
  run(fakeSelf, fakeCaches, options.fetchImpl, FakeResponse);

  return {
    /**
     * Rend la réponse promise par `respondWith`, ou `null` quand le worker a
     * laissé la requête au navigateur — c'est CE `null` que la frontière de
     * zone doit produire.
     */
    dispatchFetch: (request: FakeRequest): Promise<FakeResponse> | null => {
      const handlers = listeners['fetch'] ?? [];
      let respondWithPromise: Promise<FakeResponse> | null = null;
      const event: FetchEvent = {
        request,
        respondWith: (promise) => {
          respondWithPromise = promise;
        },
      };
      for (const handler of handlers) handler(event);
      return respondWithPromise;
    },

    /** Joue un listener de cycle de vie et attend ce qu'il a passé à `waitUntil`. */
    dispatchLifecycle: async (type: 'install' | 'activate'): Promise<void> => {
      const pending: Array<Promise<unknown>> = [];
      const event = { waitUntil: (promise: Promise<unknown>) => pending.push(promise) };
      for (const handler of listeners[type] ?? []) handler(event);
      await Promise.all(pending);
    },
  };
}

const ORIGIN = 'https://meeshy.me';

function neverCalled(): (request: FakeRequest) => Promise<FakeResponse> {
  return jest.fn(async () => new FakeResponse('LEGACY_WORKER_SHOULD_NOT_FETCH', { ok: true }));
}

/**
 * Les chemins que l'ancienne refonte servait SEULE : le legacy n'a aucune route
 * sous ces préfixes, ils redeviennent des navigations comme les autres.
 */
const CHEMINS_DE_LA_REFONTE_RETIREE = [
  '/__v3',
  '/__v3/l/abc123',
  '/chats',
  '/stories/650000000000000000000001',
  '/reels',
  '/moods',
  '/composer',
  '/deconnexion',
  '/calls',
];

/**
 * Des pages que le legacy SERT et que ce worker ne met plus en cache depuis la
 * zone : le retrait de la zone ne doit rien changer à ce qu'y voient les
 * utilisateurs. La branche App Shell sert le cache AVANT le réseau ; y rouvrir
 * l'accueil ou `/login` rendrait le shell d'une session ou d'un déploiement
 * précédent.
 */
const PAGES_LAISSEES_AU_RESEAU = ['/', '/login', '/signup', '/settings', '/chat/lien', '/communities', '/l/abc123'];

describe('public/sw.js — la zone de l’ancienne refonte a quitté le worker (#6001)', () => {
  it.each(CHEMINS_DE_LA_REFONTE_RETIREE)(
    '%s, que seule la refonte retirée servait, redevient une navigation du legacy',
    async (chemin) => {
      const cache = createFakeCache();
      const fetchImpl = jest.fn(async () => new FakeResponse('LEGACY_PAGE', { ok: true }));
      const sw = loadServiceWorker({ fetchImpl, cache });

      const intercepted = sw.dispatchFetch(makeRequest(`${ORIGIN}${chemin}`, { mode: 'navigate' }));

      expect(intercepted).not.toBeNull();
      await intercepted;
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  );

  it('le worker ne porte plus ni le vocabulaire de la zone ni ses jumeaux de routeur', () => {
    expect(swSource).not.toMatch(/V3_ZONE|belongsToV3Zone|frontend-v3|web-old-version3|__v3/);
  });

  it.each(PAGES_LAISSEES_AU_RESEAU)('%s reste au réseau : le worker ne l’intercepte pas', (chemin) => {
    const cache = createFakeCache();
    const sw = loadServiceWorker({ fetchImpl: neverCalled(), cache });

    expect(sw.dispatchFetch(makeRequest(`${ORIGIN}${chemin}`, { mode: 'navigate' }))).toBeNull();
  });

  it(
    'un chemin VOISIN qui commence par les mêmes lettres (`/about-us`) reste servi ' +
      'par le worker : la frontière est un segment, pas un `startsWith`',
    async () => {
      const cache = createFakeCache();
      const fetchImpl = jest.fn(async () => new FakeResponse('LEGACY_PAGE', { ok: true }));
      const sw = loadServiceWorker({ fetchImpl, cache });

      const intercepted = sw.dispatchFetch(makeRequest(`${ORIGIN}/about-us`, { mode: 'navigate' }));

      expect(intercepted).not.toBeNull();
      await intercepted;
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  );

  it('une entrée de cache déjà posée sur une page laissée au réseau n’est jamais servie', () => {
    const cache = createFakeCache();
    const LOGIN_URL = `${ORIGIN}/login`;
    cache._store.set(LOGIN_URL, new FakeResponse('SHELL_D_UNE_SESSION_PRECEDENTE', { ok: true }));

    const sw = loadServiceWorker({ fetchImpl: neverCalled(), cache });

    expect(sw.dispatchFetch(makeRequest(LOGIN_URL, { mode: 'navigate' }))).toBeNull();
    expect(cache._store.get(LOGIN_URL)?.body).toBe('SHELL_D_UNE_SESSION_PRECEDENTE');
  });

  it(
    'NON-RÉGRESSION — une navigation legacy ordinaire est servie et mise en cache',
    async () => {
      const cache = createFakeCache();
      const LEGACY_URL = `${ORIGIN}/conversations`;
      const fetchImpl = jest.fn(async () => new FakeResponse('LEGACY_SHELL', { ok: true }));
      const sw = loadServiceWorker({ fetchImpl, cache });

      const intercepted = sw.dispatchFetch(makeRequest(LEGACY_URL, { mode: 'navigate' }));
      expect(intercepted).not.toBeNull();

      const response = await (intercepted as Promise<FakeResponse>);
      expect(await response.text()).toBe('LEGACY_SHELL');
      expect(cache._store.get(LEGACY_URL)?.body).toBe('LEGACY_SHELL');
    }
  );
});

/**
 * SECOND CANAL — le Cache Storage.
 *
 * `caches` est une API d'ORIGINE : les noms qu'elle rend appartiennent à tous
 * les scripts de `meeshy.me`, pas à celui qui appelle. L'`activate` du legacy
 * supprimait « ABSOLUMENT TOUS les anciens caches » ≠ `CACHE_NAME` — donc le
 * cache de tout AUTRE worker de l'origine, à commencer par celui de
 * l'application qui succédera au legacy, à chaque activation. Aucune de ces
 * suppressions ne compose une requête : aucune garde du listener `fetch` ne
 * pouvait les attraper.
 */
const CACHE_NAMESPACE = 'meeshy-cache-';

describe('public/sw.js — la purge de l’`activate` ne sort pas du namespace du legacy', () => {
  const OBSOLETE_LEGACY = `${CACHE_NAMESPACE}BUILD_20260829_101500`;
  const AUTRE_WORKER_CACHE = 'meeshy-successeur-cache-BUILD_20260830_090000';
  const TIERS = 'workbox-precache-v2-https://meeshy.me/';

  function activateWith(initialNames: readonly string[]) {
    const cache = createFakeCache();
    const cacheStorage = createFakeCacheStorage(initialNames, cache);
    const sw = loadServiceWorker({ fetchImpl: neverCalled(), cache, cacheStorage });
    return { sw, cacheStorage };
  }

  it('NON-RÉGRESSION — un cache LEGACY d’un build antérieur est bien supprimé', async () => {
    const { sw, cacheStorage } = activateWith([OBSOLETE_LEGACY]);

    await sw.dispatchLifecycle('activate');

    expect(cacheStorage.deleted).toContain(OBSOLETE_LEGACY);
    expect(cacheStorage.survivors).not.toContain(OBSOLETE_LEGACY);
  });

  it(
    'le cache d’un AUTRE worker de la même origine (le successeur du legacy) survit à ' +
      'l’activation du legacy — la purge est bornée au namespace, pas à l’origine',
    async () => {
      const { sw, cacheStorage } = activateWith([OBSOLETE_LEGACY, AUTRE_WORKER_CACHE, TIERS]);

      await sw.dispatchLifecycle('activate');

      expect(cacheStorage.deleted).toEqual([OBSOLETE_LEGACY]);
      expect(cacheStorage.survivors).toContain(AUTRE_WORKER_CACHE);
      expect(cacheStorage.survivors).toContain(TIERS);
    }
  );

  it('le cache du build COURANT — celui que l’`install` vient d’ouvrir — n’est jamais supprimé', async () => {
    const { sw, cacheStorage } = activateWith([AUTRE_WORKER_CACHE]);

    await sw.dispatchLifecycle('install');
    await sw.dispatchLifecycle('activate');

    const current = cacheStorage.survivors.filter((name) => name.startsWith(CACHE_NAMESPACE));
    expect(cacheStorage.deleted).toEqual([]);
    expect(current).toHaveLength(1);
    expect(cacheStorage.survivors).toContain(AUTRE_WORKER_CACHE);
  });

  it(
    'JUMEAU — le namespace déclaré par `sw.js` est celui que la page purge ' +
      '(`utils/service-worker.ts`), sinon l’un des deux sort de sa propriété',
    () => {
      const swLiteral = /const CACHE_NAMESPACE = '([^']+)'/.exec(swSource)?.[1];
      const pageSource = fs.readFileSync(
        path.join(__dirname, '../../utils/service-worker.ts'),
        'utf8'
      );
      const pageLiteral = /export const LEGACY_CACHE_NAMESPACE = '([^']+)'/.exec(pageSource)?.[1];

      expect(swLiteral).toBe(CACHE_NAMESPACE);
      expect(pageLiteral).toBe(swLiteral);
    }
  );
});
