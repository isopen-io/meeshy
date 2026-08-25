/**
 * Les DEUX stratégies de cache de `public/sw.js`, et ce que chacune doit tenir.
 *
 * **Données API** (`/api/*` et tout host `gate.*`) — RÉSEAU D'ABORD, repli sur
 * le cache. En ligne l'appelant reçoit toujours le corps frais ; hors ligne il
 * reçoit le dernier connu. Cette branche a longtemps rendu
 * `cachedResponse || fetchPromise` sous l'étiquette « SWR » : sur un hit,
 * l'appelant recevait le corps PRÉCÉDENT et le frais n'était écrit que pour la
 * fois d'après — donc l'état n−1, indéfiniment, y compris après un
 * rechargement complet. Corrigé le 2026-08-25 ; ce fichier garde les deux
 * moitiés, la LECTURE et l'ÉCRITURE.
 *
 * **App Shell** (navigation, JS, CSS, polices, images) — vrai
 * stale-while-revalidate, et c'est le bon compromis pour des ressources
 * immuables. Le mot « SWR » n'est vrai que sur CETTE branche.
 *
 * Cet en-tête décrivait le défaut au PRÉSENT, avec un numéro de ligne périmé,
 * des mois après sa correction. Un commentaire qui survit à son correctif
 * devient la loi lue par la session suivante.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * HARNAIS — justification
 * ─────────────────────────────────────────────────────────────────────────
 * `public/sw.js` n'est pas un module importable : c'est un script de worker
 * qui s'installe via `self.addEventListener` (aucun `import`/`export`). Ce
 * témoin choisit la PREMIÈRE option offerte par le mandat : évaluer le
 * fichier SOURCE tel quel — lu avec `fs.readFileSync`, chargé par
 * `new Function('self', 'caches', 'fetch', 'Response', <source>)` — dans un
 * contexte où `self`, `caches`, `fetch` et `Response` sont des DOUBLES
 * fournis par ce fichier de test. C'est donc le CODE DE PRODUCTION réel qui
 * s'exécute, listener `fetch` compris ; rien n'est réécrit ni réimplémenté.
 *
 * La seconde option du mandat — extraire la stratégie dans un module pur
 * importable par `sw.js` — est délibérément ÉCARTÉE ici : cette extraction
 * change la STRUCTURE du fichier de production, ce qui en fait une partie du
 * CORRECTIF (phase 2), pas du témoin. Un témoin qui commencerait par
 * réorganiser le code sous test perdrait sa valeur de preuve : il ne serait
 * plus garanti d'être rouge sur le code d'AUJOURD'HUI tel qu'il est commité.
 *
 * Un seul chargement du script sert les DEUX requêtes d'un test : un vrai
 * Service Worker ne se recharge pas entre deux `fetch` d'une même page — seul
 * le CACHE doit survivre d'une requête à l'autre, ce que ce harnais respecte
 * en laissant `self`/les listeners intacts et en ne modifiant que ce que le
 * script lui-même écrit dans `caches`.
 */

import fs from 'fs';
import path from 'path';

const SW_SOURCE_PATH = path.join(__dirname, '../../public/sw.js');
const swSource = fs.readFileSync(SW_SOURCE_PATH, 'utf8');

// ─────────────────────────────────────────────────────────────────────────
// Doubles minimaux du Cache Storage / Response — juste assez pour que le
// code de production (inchangé) s'exécute et que son résultat soit lisible.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Un corps de `Response` est un FLUX À USAGE UNIQUE, et c'est ce qui rend
 * `.clone()` obligatoire avant `cache.put`.
 *
 * Ce double ne le modélisait pas : `text()` rendait indéfiniment la même
 * chaîne, si bien que retirer le `.clone()` de `sw.js` laissait la suite
 * ENTIÈREMENT VERTE — sur une mutation qui, en vrai navigateur, ferait échouer
 * CHAQUE requête API en ligne (« Response body is already used »).
 *
 * Un harnais plus permissif que la plateforme rend ses témoins incapables de
 * tomber. Le corps se consomme donc ici comme au navigateur.
 */
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

// `mode` et `destination` sont ce par quoi `sw.js` distingue l'App Shell des
// données API : sans eux, aucun témoin ne peut atteindre la seconde branche.
type FakeRequest = { url: string; method: string; mode?: string; destination?: string };

function makeGetRequest(
  url: string,
  extra: { mode?: string; destination?: string } = {},
): FakeRequest {
  return { url, method: 'GET', ...extra };
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
 * Exécute LE fichier source réel de `public/sw.js` avec des doubles, et rend
 * un moyen d'invoquer synchroniquement son listener `fetch` — exactement ce
 * qu'un navigateur ferait à chaque requête interceptée.
 */
function loadServiceWorker(options: {
  fetchImpl: (request: FakeRequest) => Promise<FakeResponse>;
  cache: FakeCache;
}) {
  const listeners: Record<string, Array<(event: unknown) => void>> = {};

  const fakeSelf = {
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      (listeners[type] ??= []).push(handler);
    },
    skipWaiting: () => {},
    clients: { claim: async () => {}, matchAll: async () => [] },
    registration: { showNotification: async () => {} },
    location: { origin: 'https://app.meeshy.me' },
  };

  const fakeCaches = {
    open: async () => options.cache,
    keys: async () => [],
    delete: async () => true,
  };

  // `new Function` exécute le CODE SOURCE inchangé de sw.js : self/caches/
  // fetch/Response sont injectés comme paramètres, donc chaque référence du
  // script à ces globals résout vers nos doubles plutôt que vers de vrais
  // globals de test.
  //
  // `swSource` n'est PAS une entrée utilisateur : c'est le contenu, lu à un
  // chemin fixe du dépôt (`fs.readFileSync(SW_SOURCE_PATH, …)` plus haut),
  // d'un fichier de PREMIÈRE PARTIE déjà committé — le même risque de
  // confiance que `require('../../public/sw.js')` aurait si ce fichier était
  // un module. Rien d'externe ni de dynamique n'entre dans cette chaîne.
  const run = new Function(
    'self',
    'caches',
    'fetch',
    'Response',
    `${swSource}\n//# sourceURL=sw-under-test.js`
  );
  run(fakeSelf, fakeCaches, options.fetchImpl, FakeResponse);

  return {
    dispatchFetch: (request: FakeRequest): Promise<FakeResponse> => {
      const handlers = listeners['fetch'] ?? [];
      let respondWithPromise: Promise<FakeResponse> | null = null;
      const event: FetchEvent = {
        request,
        respondWith: (promise) => {
          respondWithPromise = promise;
        },
      };
      for (const handler of handlers) handler(event);
      if (!respondWithPromise) {
        throw new Error('le listener fetch de sw.js n’a pas appelé event.respondWith()');
      }
      return respondWithPromise;
    },
  };
}

const API_URL = 'https://gate.meeshy.me/api/v1/conversations';

describe('public/sw.js — stratégie de cache pour /api/*', () => {
  it(
    'sur un HIT de cache, une seconde requête vers la MÊME url — après que le ' +
      'serveur a changé de réponse — rend le NOUVEAU corps, jamais l’ancien',
    async () => {
      const cache = createFakeCache();
      let callCount = 0;
      const fetchImpl = jest.fn(async () => {
        callCount += 1;
        // 1er appel réseau (peuple le cache) : « OLD ». 2e appel (déclenché
        // en arrière-plan par la 2e requête) : le serveur a changé — « NEW ».
        return new FakeResponse(callCount === 1 ? 'OLD' : 'NEW', { ok: true });
      });

      const sw = loadServiceWorker({ fetchImpl, cache });

      // Première requête : cache vide, sert le réseau et le peuple.
      const first = await sw.dispatchFetch(makeGetRequest(API_URL));
      expect(await first.text()).toBe('OLD');

      // Seconde requête vers la MÊME url : le serveur répond désormais
      // « NEW ». Ce que l'appelant DOIT recevoir est « NEW ».
      const second = await sw.dispatchFetch(makeGetRequest(API_URL));
      expect(await second.text()).toBe('NEW');
    }
  );

  it(
    'jumeau OFFLINE — réseau en échec + entrée en cache ⇒ le cache est servi ' +
      '(reste vert après le correctif : la lecture hors ligne ne doit jamais régresser)',
    async () => {
      const cache = createFakeCache();
      cache._store.set(API_URL, new FakeResponse('CACHED_WHILE_ONLINE', { ok: true }));

      const fetchImpl = jest.fn(async (): Promise<FakeResponse> => {
        throw new Error('network down');
      });

      const sw = loadServiceWorker({ fetchImpl, cache });
      const response = await sw.dispatchFetch(makeGetRequest(API_URL));

      expect(await response.text()).toBe('CACHED_WHILE_ONLINE');
    }
  );
});

/**
 * Ajouté avec le CORRECTIF (phase 2), pas avec les témoins de la phase 1.
 *
 * Le témoin ci-dessus prouve la MOITIÉ « en ligne ⇒ frais » sur une réponse
 * qui réussit. Cette moitié-ci est celle qu'un futur « ça ferait une
 * meilleure UX » défera en silence : quand le réseau répond une ERREUR (401
 * après déconnexion, 403, 500), le réflexe est de servir le cache « pour ne
 * pas montrer d'écran vide ». Ce serait rejouer le défaut B sous un autre
 * nom, en pire — la personne qui vient de se déconnecter relirait le corps
 * AUTHENTIFIÉ mis en cache par la session précédente, sur un cache qui ne
 * porte aucun `Vary` et n'est donc segmenté ni par jeton ni par compte.
 *
 * Le repli sur le cache est réservé à l'ÉCHEC RÉSEAU (hors ligne), jamais à
 * une réponse HTTP reçue. Et une réponse non-`ok` ne doit pas non plus
 * empoisonner l'entrée qui sert la lecture hors ligne.
 */
describe('public/sw.js — une réponse d’erreur du réseau n’est pas masquée par le cache', () => {
  it('rend le 401 du réseau, et laisse l’entrée en cache intacte', async () => {
    const cache = createFakeCache();
    cache._store.set(API_URL, new FakeResponse('AUTHENTICATED_BODY', { ok: true }));

    const fetchImpl = jest.fn(
      async () => new FakeResponse('UNAUTHORIZED', { ok: false, status: 401 })
    );

    const sw = loadServiceWorker({ fetchImpl, cache });
    const response = await sw.dispatchFetch(makeGetRequest(API_URL));

    expect(await response.text()).toBe('UNAUTHORIZED');
    expect(response.ok).toBe(false);
    expect(cache._store.get(API_URL)?.body).toBe('AUTHENTICATED_BODY');
  });
});

/**
 * ─────────────────────────────────────────────────────────────────────────
 * TÉMOIN D'ÉCRITURE — la moitié du repli hors ligne que rien ne gardait.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Les trois témoins ci-dessus gardent la LECTURE. Aucun ne garde l'ÉCRITURE :
 * les deux qui touchent au cache PRÉ-REMPLISSENT `cache._store` à la main, si
 * bien qu'ils n'exercent jamais le Service Worker en tant qu'ÉCRIVAIN.
 *
 * MESURE (reproductible) : retirer `cache.put(request, networkResponse.clone())`
 * de la branche « données API » de `public/sw.js` — LA seule ligne qui alimente
 * le mode hors ligne pour les données API — laisse ce fichier ENTIÈREMENT VERT
 * (3/3). Un lot futur qui « simplifie » cette ligne tue le mode hors ligne de
 * toute donnée API sans qu'aucune suite ne rougisse : l'application paraît
 * fonctionner, jusqu'au premier tunnel.
 *
 * Ce témoin fait donc l'ALLER-RETOUR, et ne plante RIEN dans le cache à la
 * main — chaque moitié prise isolément peut être verte à vide :
 *   1. requête EN LIGNE qui réussit ⇒ le corps frais est rendu À L'APPELANT ;
 *   2. le cache a été PEUPLÉ par ce passage, et par LUI SEUL (le store part
 *      vide, un seul appel réseau, une seule entrée, sous la clé demandée) ;
 *   3. requête suivante, réseau EN ÉCHEC ⇒ c'est CE corps-là qui est rendu.
 *
 * Un seul `loadServiceWorker` et un seul cache pour les deux requêtes : c'est
 * le scénario RÉEL — le worker ne se recharge pas quand le réseau tombe, seule
 * la disponibilité du réseau change entre les deux passages.
 */
describe('public/sw.js — l’ÉCRITURE du repli hors ligne pour /api/*', () => {
  it(
    'aller-retour : le passage EN LIGNE rend le frais ET peuple le cache ; ' +
      'réseau coupé, la requête suivante rend ce corps-là',
    async () => {
      const cache = createFakeCache();
      let networkUp = true;
      const fetchImpl = jest.fn(async (): Promise<FakeResponse> => {
        if (!networkUp) throw new Error('network down');
        return new FakeResponse('FRESH_FROM_NETWORK', { ok: true });
      });

      const sw = loadServiceWorker({ fetchImpl, cache });

      // Rien n'est planté à la main : tout ce que le cache contiendra plus bas
      // aura été écrit par le Service Worker lui-même.
      expect(cache._store.size).toBe(0);

      // 1. EN LIGNE — le corps frais est rendu À L'APPELANT.
      const online = await sw.dispatchFetch(makeGetRequest(API_URL));
      expect(await online.text()).toBe('FRESH_FROM_NETWORK');

      // 2. …et ce passage, seul, a PEUPLÉ le cache sous la clé demandée.
      expect(fetchImpl).toHaveBeenCalledTimes(1);
      expect([...cache._store.keys()]).toEqual([API_URL]);
      // `body` et non `text()` : inspecter le magasin ne doit pas BRÛLER le corps
      // que la requête hors ligne, plus bas, doit encore pouvoir lire.
      expect(cache._store.get(API_URL)?.body).toBe('FRESH_FROM_NETWORK');

      // 3. RÉSEAU COUPÉ — le dernier corps connu est rendu, et c'est une vraie
      //    réponse, pas le `Response.error()` du cache vide.
      networkUp = false;
      const offline = await sw.dispatchFetch(makeGetRequest(API_URL));
      expect(await offline.text()).toBe('FRESH_FROM_NETWORK');
      expect(offline.ok).toBe(true);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    }
  );
});

describe('public/sw.js — l’ÉCRITURE du cache App Shell', () => {
  // Jumelle exacte du témoin d'écriture des données API. La ligne est la même
  // (`cache.put(request, networkResponse.clone())`) sur l'autre branche, et
  // elle porte le principe « Cache-First, Network-Second » du dépôt : sans
  // elle, l'App Shell n'est jamais mis en cache, le chargement instantané
  // disparaît et l'application ne s'ouvre plus hors ligne. Rien ne rougissait.
  it('un passage EN LIGNE peuple le cache, et le tour suivant hors ligne le sert', async () => {
    // Une NAVIGATION, et non un chunk sous `/_next/static/` : le worker exclut
    // tout chemin contenant `/static/` (garde « 1bis »), si bien qu'un tel
    // témoin n'atteindrait jamais cette branche — `respondWith` n'est même pas
    // appelé. Constat au passage, hors périmètre : les assets Next vivant tous
    // sous `/_next/static/`, cette branche ne voit en pratique que les
    // navigations, les polices et les images.
    const ASSET_URL = 'https://app.meeshy.me/conversations';
    const cache = createFakeCache();
    let reseauDebout = true;
    const fetchImpl = jest.fn(async () => {
      if (!reseauDebout) throw new Error('offline');
      return new FakeResponse('ASSET_FROM_NETWORK', { ok: true });
    });

    const sw = loadServiceWorker({ fetchImpl, cache });

    // Rien n'est planté à la main : ce que le magasin contiendra plus bas aura
    // été écrit par le Service Worker lui-même.
    expect(cache._store.size).toBe(0);

    const enLigne = await sw.dispatchFetch(makeGetRequest(ASSET_URL, { mode: 'navigate' }));
    expect(await enLigne.text()).toBe('ASSET_FROM_NETWORK');
    expect(cache._store.get(ASSET_URL)?.body).toBe('ASSET_FROM_NETWORK');

    reseauDebout = false;
    const horsLigne = await sw.dispatchFetch(makeGetRequest(ASSET_URL, { mode: 'navigate' }));
    expect(await horsLigne.text()).toBe('ASSET_FROM_NETWORK');
  });
});
