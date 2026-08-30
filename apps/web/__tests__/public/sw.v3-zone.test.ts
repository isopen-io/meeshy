/**
 * `public/sw.js` face à la ZONE v3 — le SECOND intercepteur same-origin.
 *
 * Ce worker est enregistré sur `scope: '/'`
 * (`utils/service-worker-registration.ts:95-97`) et monté sans condition dans
 * la coquille racine du legacy (`app/layout.tsx:93`). Sa branche « App Shell »
 * est du cache-first jusque sur les NAVIGATIONS. Traefik n'est donc pas le seul
 * aiguilleur de l'origine, et la garantie du § 4.3 de la conception —
 * « migrer = ajouter un `PathPrefix`, revenir en arrière = l'enlever, rien
 * d'autre ne bouge » — était FAUSSE côté client : le worker sert ce qu'il a
 * gardé, et retirer un préfixe ne vide aucun Cache Storage.
 *
 * Ce que ces témoins verrouillent : **rien de la zone v3 n'est intercepté**.
 * Ne pas intercepter est ce qui rend la règle Traefik effective dans les deux
 * sens — c'est la propriété testée, pas « le bon contenu est servi » (ce que ce
 * worker, par construction, ne peut plus décider une fois qu'il s'est tu).
 *
 * HARNAIS — même choix que `sw.stale-response.test.ts`, et pour la même
 * raison : `public/sw.js` n'est pas un module importable, donc le fichier
 * SOURCE réel est évalué tel quel avec des doubles. Une différence : ici le
 * verdict attendu est l'ABSENCE d'appel à `respondWith`, donc `dispatchFetch`
 * rend `null` au lieu de lever.
 */

import fs from 'fs';
import path from 'path';

const SW_SOURCE_PATH = path.join(__dirname, '../../public/sw.js');
const swSource = fs.readFileSync(SW_SOURCE_PATH, 'utf8');

const ORIGIN = 'https://meeshy.me';

class FakeResponse {
  readonly ok = true;
  readonly status = 200;
  constructor(readonly body: string) {}
  clone(): FakeResponse {
    return new FakeResponse(this.body);
  }
  async text(): Promise<string> {
    return this.body;
  }
  static error(): FakeResponse {
    return new FakeResponse('');
  }
}

type FakeRequest = { url: string; method: string; mode?: string; destination?: string };

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

function loadServiceWorker(options: {
  fetchImpl: (request: FakeRequest) => Promise<FakeResponse>;
  cache: ReturnType<typeof createFakeCache>;
}) {
  const listeners: Record<string, Array<(event: unknown) => void>> = {};

  const fakeSelf = {
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      (listeners[type] ??= []).push(handler);
    },
    skipWaiting: () => {},
    clients: { claim: async () => {}, matchAll: async () => [] },
    registration: { showNotification: async () => {} },
    location: { origin: ORIGIN },
  };

  const fakeCaches = {
    open: async () => options.cache,
    keys: async () => [],
    delete: async () => true,
  };

  // `swSource` est le contenu d'un fichier de PREMIÈRE PARTIE lu à un chemin
  // fixe du dépôt — aucune entrée externe n'entre dans cette chaîne.
  const run = new Function(
    'self',
    'caches',
    'fetch',
    'Response',
    `${swSource}\n//# sourceURL=sw-under-test.js`
  );
  run(fakeSelf, fakeCaches, options.fetchImpl, FakeResponse);

  return {
    /** Rend la promesse passée à `respondWith`, ou `null` si le worker s'est tu. */
    dispatchFetch: (request: FakeRequest): Promise<FakeResponse> | null => {
      let responded: Promise<FakeResponse> | null = null;
      const event = {
        request,
        respondWith: (promise: Promise<FakeResponse>) => {
          responded = promise;
        },
      };
      for (const handler of listeners['fetch'] ?? []) handler(event);
      return responded;
    },
  };
}

function setup() {
  const cache = createFakeCache();
  const fetchImpl = jest.fn(async (request: FakeRequest) => new FakeResponse(`réseau:${request.url}`));
  return { cache, fetchImpl, sw: loadServiceWorker({ fetchImpl, cache }) };
}

const navigation = (pathname: string): FakeRequest => ({
  url: `${ORIGIN}${pathname}`,
  method: 'GET',
  mode: 'navigate',
  destination: 'document',
});

const script = (pathname: string): FakeRequest => ({
  url: `${ORIGIN}${pathname}`,
  method: 'GET',
  mode: 'no-cors',
  destination: 'script',
});

describe('public/sw.js — la zone v3 n’est jamais interceptée', () => {
  /**
   * NOTE de portée, mesurée : `/__v3/_next/static/*.js` était DÉJÀ laissé
   * passer avant ce garde-fou — non par intention, mais par la règle « 1bis »
   * (`url.pathname.includes('/static/')`), écrite pour les pièces jointes. Ce
   * témoin reste vert des deux côtés du correctif ; il documente la portée, il
   * ne la prouve pas. Le témoin qui TOMBE sans le garde-fou est celui des
   * navigations, et celui de `/_next/image` juste en dessous.
   */
  it('laisse passer les chunks de la v3', () => {
    const { sw, fetchImpl } = setup();

    expect(sw.dispatchFetch(script('/__v3/_next/static/chunks/main.js'))).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('laisse passer les images optimisées de la v3, hors de tout chemin /static/', () => {
    const { sw, fetchImpl } = setup();

    expect(
      sw.dispatchFetch({
        url: `${ORIGIN}/__v3/_next/image?url=%2Fog.png&w=640&q=75`,
        method: 'GET',
        mode: 'no-cors',
        destination: 'image',
      })
    ).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('laisse passer une navigation de la zone v3', () => {
    const { sw } = setup();

    expect(sw.dispatchFetch(navigation('/__v3'))).toBeNull();
  });

  it('ne garde AUCUNE entrée en cache pour la zone v3 — le retrait du PathPrefix reste effectif', async () => {
    const { sw, cache } = setup();

    const served = [
      sw.dispatchFetch(navigation('/__v3/diagnostic')),
      sw.dispatchFetch(script('/__v3/_next/static/chunks/framework.js')),
    ];
    await Promise.all(served.map((promise) => promise ?? Promise.resolve(null)));

    expect([...cache._store.keys()]).toHaveLength(0);
  });

  it('ne se laisse pas déborder par un chemin qui COMMENCE par le préfixe sans lui appartenir', () => {
    const { sw } = setup();

    expect(sw.dispatchFetch(navigation('/__v3suffixe'))).not.toBeNull();
  });

  it('continue d’intercepter tout ce qui reste au legacy', () => {
    const { sw } = setup();

    expect(sw.dispatchFetch(navigation('/conversations'))).not.toBeNull();
    expect(
      sw.dispatchFetch({
        url: `${ORIGIN}/fonts/nunito.woff2`,
        method: 'GET',
        mode: 'no-cors',
        destination: 'font',
      })
    ).not.toBeNull();
  });
});

describe('public/sw.js — la liste des préfixes de zone', () => {
  it('est déclarée dans le fichier, en un seul endroit nommé', () => {
    expect(swSource).toContain('const V3_ZONE_PREFIXES = ');
  });

  it('porte le préfixe permanent des actifs de la v3', () => {
    expect(swSource).toMatch(/const V3_ZONE_PREFIXES = \[[^\]]*'\/__v3'/);
  });

  it('est consultée AVANT toute autre décision du listener fetch', () => {
    const guard = swSource.indexOf('belongsToV3Zone(url.pathname)');
    const socketGuard = swSource.indexOf("url.pathname.startsWith('/socket.io')");

    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(socketGuard);
  });
});
