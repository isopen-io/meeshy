/**
 * LA FRONTIÈRE DE ZONE — `public/sw.js` n'a AUCUNE juridiction sur la v3.
 *
 * `apps/web` enregistre son Service Worker sur `scope: '/'` — DEUX sites, même
 * script, même portée (`utils/service-worker.ts:28-31`, monté sans condition
 * par `app/layout.tsx:93` ; `utils/service-worker-registration.ts:95-97`, pour
 * FCM) : il voit donc TOUTE l'origine, la zone `/__v3` de `apps/web-v3`
 * comprise. Sa branche « App Shell » est un cache-first qui attrape les
 * navigations, le JS, le CSS, les polices et les images. Traefik n'est donc pas
 * le seul aiguilleur de `meeshy.me` — ce worker en est un SECOND, non déclaré,
 * et il survit exactement à l'opération dont il fausse le résultat : ajouter ou
 * retirer un `PathPrefix` est un `docker compose up -d` SANS rebuild, alors que
 * `CACHE_NAME` est indexé sur `APP_BUILD_VERSION`, un horodatage posé par
 * `docker-entrypoint.sh:57-60` au DÉMARRAGE du conteneur `frontend` — un
 * `up -d` qui ne recrée que `frontend-v3` ne le change pas.
 *
 * Conséquence, et c'est le fond de l'issue #4416 : le retour arrière documenté
 * au § 4.3 de la conception (« retirer le préfixe, rien d'autre ne bouge »)
 * était INERTE côté client. La garde rend son autorité au routeur dans les
 * DEUX sens — ne pas intercepter, c'est laisser le navigateur parler à Traefik.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA JURIDICTION A TROIS CANAUX, PAS UN
 * ─────────────────────────────────────────────────────────────────────────
 * « Ne pas intercepter » ne ferme que le premier. Les deux autres restent des
 * pouvoirs du worker legacy sur la zone, et ils ne composent aucune requête —
 * c'est pourquoi on ne les trouve pas en cherchant « qui répond à cette URL ? » :
 *
 *   1. le listener `fetch`      → la garde `belongsToV3Zone` (1er describe) ;
 *   2. la REGISTRATION `scope:'/'` → hors de ce fichier : deux scripts
 *      enregistrés sur la MÊME portée ne coexistent pas, c'est une décision de
 *      déploiement (§ 4.4 bis, « qui détient la portée de l'origine ») ;
 *   3. le CACHE STORAGE, qui est à l'échelle de l'ORIGINE et non du worker →
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

const PROD_COMPOSE_PATH = path.join(__dirname, '../../../../docker-compose.prod.yml');

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
 * Les préfixes que la règle Traefik du routeur `frontend-v3` revendique
 * AUJOURD'HUI, lus dans le compose de production. C'est ce qui fait du témoin
 * §9 un gate d'anti-divergence : `V3_ZONE_PREFIXES` est un JUMEAU tenu à la
 * main, et un préfixe ajouté au routeur sans être ajouté au worker rouvre le
 * défaut sur la route qu'il vient de basculer.
 */
function traefikV3Prefixes(): readonly string[] {
  const compose = fs.readFileSync(PROD_COMPOSE_PATH, 'utf8');
  const rule = compose
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.includes('traefik.http.routers.frontend-v3.rule='));
  if (rule === undefined) {
    throw new Error('la règle du routeur frontend-v3 est absente de docker-compose.prod.yml');
  }
  return [...rule.matchAll(/PathPrefix\(`([^`]+)`\)/g)].map(([, value]) => value);
}

describe('public/sw.js — la zone v3 échappe entièrement au Service Worker legacy', () => {
  it('une NAVIGATION dans la zone n’est pas interceptée : le routeur redevient seul juge', () => {
    const cache = createFakeCache();
    const sw = loadServiceWorker({ fetchImpl: neverCalled(), cache });

    const intercepted = sw.dispatchFetch(
      makeRequest(`${ORIGIN}/__v3/l/abc123`, { mode: 'navigate' })
    );

    expect(intercepted).toBeNull();
  });

  it('l’optimiseur d’images de la zone (`/__v3/_next/image`) n’est pas intercepté', () => {
    const cache = createFakeCache();
    const sw = loadServiceWorker({ fetchImpl: neverCalled(), cache });

    const intercepted = sw.dispatchFetch(
      makeRequest(`${ORIGIN}/__v3/_next/image?url=%2Fhero.png&w=640&q=75`, {
        destination: 'image',
      })
    );

    expect(intercepted).toBeNull();
  });

  it(
    'les bundles `/__v3/_next/static/*` sont hors juridiction PAR LA GARDE, ' +
      'et non par la coïncidence de la règle « 1bis » écrite pour les pièces jointes',
    () => {
      const cache = createFakeCache();
      const sw = loadServiceWorker({ fetchImpl: neverCalled(), cache });

      const script = sw.dispatchFetch(
        makeRequest(`${ORIGIN}/__v3/_next/static/chunks/main-9f2c.js`, { destination: 'script' })
      );
      const style = sw.dispatchFetch(
        makeRequest(`${ORIGIN}/__v3/_next/static/css/app-1a2b.css`, { destination: 'style' })
      );

      expect(script).toBeNull();
      expect(style).toBeNull();
    }
  );

  it('la racine NUE de la zone (`/__v3`, sans barre) est déjà dans la zone', () => {
    const cache = createFakeCache();
    const sw = loadServiceWorker({ fetchImpl: neverCalled(), cache });

    const intercepted = sw.dispatchFetch(makeRequest(`${ORIGIN}/__v3`, { mode: 'navigate' }));

    expect(intercepted).toBeNull();
  });

  it(
    'un chemin VOISIN qui commence par les mêmes lettres (`/__v3-legacy`) reste ' +
      'servi par le worker : la frontière est un segment, pas un `startsWith`',
    async () => {
      const cache = createFakeCache();
      const fetchImpl = jest.fn(async () => new FakeResponse('LEGACY_PAGE', { ok: true }));
      const sw = loadServiceWorker({ fetchImpl, cache });

      const intercepted = sw.dispatchFetch(
        makeRequest(`${ORIGIN}/__v3-legacy/page`, { mode: 'navigate' })
      );

      expect(intercepted).not.toBeNull();
      expect(await (intercepted as Promise<FakeResponse>)).toBeDefined();
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  );

  it(
    'une entrée de cache LEGACY déjà posée sur une URL de zone n’est plus jamais ' +
      'servie — c’est ce qui rend le retrait d’un `PathPrefix` de nouveau effectif',
    () => {
      const cache = createFakeCache();
      const ZONE_URL = `${ORIGIN}/__v3/_next/static/chunks/app-7d1e.js`;
      cache._store.set(ZONE_URL, new FakeResponse('CACHÉ_AVANT_LE_RETRAIT', { ok: true }));

      const sw = loadServiceWorker({ fetchImpl: neverCalled(), cache });
      const intercepted = sw.dispatchFetch(makeRequest(ZONE_URL, { destination: 'script' }));

      expect(intercepted).toBeNull();
      expect(cache._store.get(ZONE_URL)?.body).toBe('CACHÉ_AVANT_LE_RETRAIT');
    }
  );

  it('une réponse de la zone n’entre jamais dans le cache du legacy', async () => {
    const cache = createFakeCache();
    const sw = loadServiceWorker({ fetchImpl: neverCalled(), cache });

    const intercepted = sw.dispatchFetch(
      makeRequest(`${ORIGIN}/__v3/stories/650000000000000000000001`, { mode: 'navigate' })
    );
    await Promise.resolve();

    expect(intercepted).toBeNull();
    expect(cache._store.size).toBe(0);
  });

  it(
    'NON-RÉGRESSION — hors de la zone, le worker garde son rôle : une navigation ' +
      'legacy est servie et mise en cache',
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

  it(
    'JUMEAU — chaque `PathPrefix` revendiqué par le routeur `frontend-v3` du ' +
      'compose de production échappe au worker, préfixe exact et sous-chemin',
    () => {
      const prefixes = traefikV3Prefixes();
      expect(prefixes.length).toBeGreaterThan(0);

      const cache = createFakeCache();
      const sw = loadServiceWorker({ fetchImpl: neverCalled(), cache });

      for (const prefix of prefixes) {
        expect(sw.dispatchFetch(makeRequest(`${ORIGIN}${prefix}`, { mode: 'navigate' }))).toBeNull();
        expect(
          sw.dispatchFetch(makeRequest(`${ORIGIN}${prefix}/quelque-chose`, { mode: 'navigate' }))
        ).toBeNull();
      }
    }
  );
});

/**
 * TROISIÈME CANAL — le Cache Storage.
 *
 * `caches` est une API d'ORIGINE : les noms qu'elle rend appartiennent à tous
 * les scripts de `meeshy.me`, pas à celui qui appelle. L'`activate` du legacy
 * supprimait « ABSOLUMENT TOUS les anciens caches » ≠ `CACHE_NAME` — donc, le
 * jour où la zone v3 aura son propre worker (§ 7 de la conception : servi à la
 * RACINE par nécessité de portée), le cache de la zone à chaque activation du
 * legacy. Aucune de ces suppressions ne compose une requête : la garde du
 * listener `fetch` ne pouvait pas les attraper.
 */
const CACHE_NAMESPACE = 'meeshy-cache-';

describe('public/sw.js — la purge de l’`activate` ne sort pas du namespace du legacy', () => {
  const OBSOLETE_LEGACY = `${CACHE_NAMESPACE}BUILD_20260829_101500`;
  const V3_ZONE_CACHE = 'meeshy-v3-cache-BUILD_20260830_090000';
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
    'le cache d’un AUTRE worker de la même origine (la zone v3) survit à ' +
      'l’activation du legacy — la purge est bornée au namespace, pas à l’origine',
    async () => {
      const { sw, cacheStorage } = activateWith([OBSOLETE_LEGACY, V3_ZONE_CACHE, TIERS]);

      await sw.dispatchLifecycle('activate');

      expect(cacheStorage.deleted).toEqual([OBSOLETE_LEGACY]);
      expect(cacheStorage.survivors).toContain(V3_ZONE_CACHE);
      expect(cacheStorage.survivors).toContain(TIERS);
    }
  );

  it('le cache du build COURANT — celui que l’`install` vient d’ouvrir — n’est jamais supprimé', async () => {
    const { sw, cacheStorage } = activateWith([V3_ZONE_CACHE]);

    await sw.dispatchLifecycle('install');
    await sw.dispatchLifecycle('activate');

    const current = cacheStorage.survivors.filter((name) => name.startsWith(CACHE_NAMESPACE));
    expect(cacheStorage.deleted).toEqual([]);
    expect(current).toHaveLength(1);
    expect(cacheStorage.survivors).toContain(V3_ZONE_CACHE);
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
