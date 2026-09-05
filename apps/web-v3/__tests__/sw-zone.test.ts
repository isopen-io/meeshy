import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * LE TRAVAILLEUR DE ZONE (#4473) — et ce qu'il n'a PAS le droit de faire.
 *
 * Le harnais reprend celui de `apps/web/__tests__/public/sw.v3-zone.test.ts` :
 * le source est EXÉCUTÉ via `new Function` avec un faux `self`, et un
 * `dispatchFetch` qui rend `null` quand `respondWith` n'a pas été appelé — ce
 * `null` EST le témoignage de non-interception. Un témoin qui se contenterait
 * de grep le source prouverait qu'une ligne existe, pas qu'elle s'exécute.
 *
 * Les invariants gardés ici sont ceux que la conception impose (§ 4.4 bis
 * canal 3, § 7) et ceux que le legacy a payés pour apprendre :
 *  - namespace de cache DISTINCT de `meeshy-cache-` — le Cache Storage est à
 *    l'échelle de l'ORIGINE, et une purge sans préfixe détruit le cache du
 *    voisin ;
 *  - les navigations PRIVÉES ne sont PAS interceptées — un document `/chats`
 *    est par LECTEUR et le worker ne voit pas le cookie de session : le mettre
 *    en cache servirait le compte précédent au suivant (le trou `Vary` du
 *    legacy, en pire) ; seule la lecture PARTAGÉE (`/l/`, par lien, pas par
 *    compte) est servie en stale-while-revalidate ;
 *  - l'API est réseau d'abord, repli HORS LIGNE seulement (le § 2 du legacy
 *    dit pourquoi : servir le cache à qui peut joindre le gateway le fige sur
 *    la réponse n-1), et sa clé de cache est SEGMENTÉE par jeton — deux
 *    lecteurs sur le même appareil ne partagent jamais une entrée ;
 *  - jamais `skipWaiting()` à l'install (décision produit du legacy, reprise) ;
 *  - les portées arrivent par la QUERY de l'URL du script — une source unique
 *    (l'environnement du conteneur), jamais une liste cuite dans l'image, et
 *    jamais `/`.
 */

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'lib', 'sw', 'travailleur.js'), 'utf8');

type Ecouteurs = Record<string, ((event: unknown) => unknown)[]>;

type FauxCache = {
  readonly entrees: Map<string, unknown>;
  match: (cle: unknown) => Promise<unknown>;
  put: (cle: unknown, valeur: unknown) => Promise<void>;
};

const fauxCache = (): FauxCache => {
  const entrees = new Map<string, unknown>();
  const cleDe = (cle: unknown): string =>
    typeof cle === 'string' ? cle : String((cle as { url?: string }).url ?? cle);
  return {
    entrees,
    match: (cle) => Promise.resolve(entrees.get(cleDe(cle))),
    put: (cle, valeur) => {
      entrees.set(cleDe(cle), valeur);
      return Promise.resolve();
    },
  };
};

type Monde = {
  readonly ecouteurs: Ecouteurs;
  readonly caches: {
    ouverts: Map<string, FauxCache>;
    supprimes: string[];
    open: (nom: string) => Promise<FauxCache>;
    keys: () => Promise<string[]>;
    delete: (nom: string) => Promise<boolean>;
    nomsExistants: string[];
  };
  readonly fetchAppels: string[];
  fetchImpl: (request: unknown) => Promise<unknown>;
};

const monteLeMonde = (options?: {
  readonly url?: string;
  readonly nomsDeCaches?: readonly string[];
}): Monde => {
  const ecouteurs: Ecouteurs = {};
  const ouverts = new Map<string, FauxCache>();
  const supprimes: string[] = [];
  const nomsExistants = [...(options?.nomsDeCaches ?? [])];
  const monde: Monde = {
    ecouteurs,
    caches: {
      ouverts,
      supprimes,
      nomsExistants,
      open: (nom: string) => {
        const existant = ouverts.get(nom);
        if (existant !== undefined) return Promise.resolve(existant);
        const neuf = fauxCache();
        ouverts.set(nom, neuf);
        if (!nomsExistants.includes(nom)) nomsExistants.push(nom);
        return Promise.resolve(neuf);
      },
      keys: () => Promise.resolve([...nomsExistants]),
      delete: (nom: string) => {
        supprimes.push(nom);
        return Promise.resolve(nomsExistants.includes(nom));
      },
    },
    fetchAppels: [],
    fetchImpl: () =>
      Promise.resolve({ ok: true, clone: () => ({ ok: true }), status: 200 }),
  };
  const self = {
    location: { href: options?.url ?? 'https://staging.meeshy.me/__v3/sw?portees=%2Fl%2F%2C%2Fchats%2C%2Fchat%2F' },
    addEventListener: (type: string, fn: (event: unknown) => unknown) => {
      (ecouteurs[type] ??= []).push(fn);
    },
    clients: { claim: () => Promise.resolve() },
    skipWaiting: () => Promise.resolve(),
    registration: {},
  };
  const fetchTrace = (request: unknown): Promise<unknown> => {
    monde.fetchAppels.push(String((request as { url?: string }).url ?? request));
    return monde.fetchImpl(request);
  };
  new Function('self', 'caches', 'fetch', 'Response', 'URL', SOURCE)(
    self,
    monde.caches,
    fetchTrace,
    { error: () => ({ estUneErreur: true }) },
    URL,
  );
  return monde;
};

const requete = (
  url: string,
  options?: {
    readonly mode?: string;
    readonly method?: string;
    readonly destination?: string;
    readonly entetes?: Record<string, string>;
  },
) => ({
  url,
  method: options?.method ?? 'GET',
  mode: options?.mode ?? 'no-cors',
  destination: options?.destination ?? '',
  headers: {
    get: (nom: string) => options?.entetes?.[nom.toLowerCase()] ?? null,
  },
});

/** `null` = le worker n'a PAS intercepté — le navigateur parle au routeur. */
const dispatchFetch = async (monde: Monde, req: unknown): Promise<unknown> => {
  let reponse: Promise<unknown> | null = null;
  for (const fn of monde.ecouteurs['fetch'] ?? []) {
    fn({
      request: req,
      respondWith: (promesse: Promise<unknown>) => {
        reponse = promesse;
      },
    });
  }
  return reponse === null ? null : await reponse;
};

const dispatchActivate = async (monde: Monde): Promise<void> => {
  const attentes: Promise<unknown>[] = [];
  for (const fn of monde.ecouteurs['activate'] ?? []) {
    fn({
      waitUntil: (p: Promise<unknown>) => {
        attentes.push(p);
      },
    });
  }
  await Promise.all(attentes);
};

describe('le namespace de cache — canal 3 du § 4.4 bis', () => {
  it("porte son PROPRE préfixe, jamais celui du legacy, et le marqueur d'empreinte", () => {
    expect(SOURCE).toContain("'meeshy-v3-sw-'");
    expect(SOURCE).not.toContain('meeshy-cache-');
    expect(SOURCE).toContain('__V3_SW_EMPREINTE__');
  });

  it("l'activate purge SES caches périmés et ne touche NI au legacy NI aux tiers", async () => {
    const monde = monteLeMonde({
      nomsDeCaches: [
        'meeshy-v3-sw-ancienne',
        'meeshy-v3-sw-__V3_SW_EMPREINTE__',
        'meeshy-cache-BUILD_20260830_090000',
        'workbox-precache-v2-tiers',
      ],
    });
    await dispatchActivate(monde);
    expect(monde.caches.supprimes).toEqual(['meeshy-v3-sw-ancienne']);
  });

  it("ne s'active jamais de force : aucun skipWaiting à l'install", () => {
    expect(SOURCE).not.toContain('skipWaiting(');
  });
});

describe("les portées — lues dans la QUERY de l'URL du script, jamais cuites", () => {
  it('la racine est REFUSÉE : `/` dans la query ne devient jamais une portée servie', async () => {
    const monde = monteLeMonde({
      url: 'https://staging.meeshy.me/__v3/sw?portees=%2F',
    });
    const reponse = await dispatchFetch(
      monde,
      requete('https://staging.meeshy.me/l/abc', { mode: 'navigate' }),
    );
    expect(reponse).toBeNull();
  });

  it('sans query, le worker est INERTE — aucune navigation interceptée', async () => {
    const monde = monteLeMonde({ url: 'https://staging.meeshy.me/__v3/sw' });
    const reponse = await dispatchFetch(
      monde,
      requete('https://staging.meeshy.me/l/abc', { mode: 'navigate' }),
    );
    expect(reponse).toBeNull();
  });
});

describe('les navigations — la lecture PARTAGÉE seule est mise en cache', () => {
  it('`/l/:token` déjà visitée est servie DU CACHE sans attendre le réseau (SWR)', async () => {
    const monde = monteLeMonde();
    const cache = await monde.caches.open('meeshy-v3-sw-__V3_SW_EMPREINTE__');
    await cache.put('https://staging.meeshy.me/l/abc', { corps: 'document connu' });
    let resoudre: ((valeur: unknown) => void) | undefined;
    monde.fetchImpl = () =>
      new Promise((resolve) => {
        resoudre = resolve;
      });
    const reponse = await dispatchFetch(
      monde,
      requete('https://staging.meeshy.me/l/abc', { mode: 'navigate' }),
    );
    expect(reponse).toEqual({ corps: 'document connu' });
    expect(resoudre).toBeDefined();
  });

  it("`/chat/:lien` — l'espace INVITÉ, où la 302 de `/l` atterrit — est en SWR : la place invitée vit dans CE navigateur, le cache aussi", async () => {
    const monde = monteLeMonde();
    const cache = await monde.caches.open('meeshy-v3-sw-__V3_SW_EMPREINTE__');
    await cache.put('https://staging.meeshy.me/chat/lagos-q1', { corps: 'fil invité connu' });
    monde.fetchImpl = () => new Promise(() => {});
    const reponse = await dispatchFetch(
      monde,
      requete('https://staging.meeshy.me/chat/lagos-q1', { mode: 'navigate' }),
    );
    expect(reponse).toEqual({ corps: 'fil invité connu' });
  });

  it('une navigation PRIVÉE (`/chats/x`) passe au navigateur — un document par lecteur ne se met pas en cache sans segmentation par cookie', async () => {
    const monde = monteLeMonde();
    const reponse = await dispatchFetch(
      monde,
      requete('https://staging.meeshy.me/chats/abc', { mode: 'navigate' }),
    );
    expect(reponse).toBeNull();
  });

  it('une navigation HORS des portées passe au navigateur, même sous une portée-préfixe de chaîne (`/chatsfoo`)', async () => {
    const monde = monteLeMonde();
    const reponse = await dispatchFetch(
      monde,
      requete('https://staging.meeshy.me/chatsfoo', { mode: 'navigate' }),
    );
    expect(reponse).toBeNull();
  });
});

describe("l'API — réseau d'abord, repli hors-ligne SEULEMENT, clé segmentée par jeton", () => {
  it('en ligne, la réponse rendue est TOUJOURS celle du réseau, et elle entre au cache', async () => {
    const monde = monteLeMonde();
    const cache = await monde.caches.open('meeshy-v3-sw-__V3_SW_EMPREINTE__');
    await cache.put('https://gate.staging.meeshy.me/api/v1/conversations', { corps: 'n-1' });
    const duReseau = { ok: true, clone: () => ({ corps: 'fraiche' }), corps: 'fraiche' };
    monde.fetchImpl = () => Promise.resolve(duReseau);
    const reponse = await dispatchFetch(
      monde,
      requete('https://gate.staging.meeshy.me/api/v1/conversations', {
        entetes: { authorization: 'Bearer jeton-a' },
      }),
    );
    expect(reponse).toBe(duReseau);
  });

  it('hors ligne, le dernier corps connu DU MÊME jeton est rendu ; celui d’un autre jeton, jamais', async () => {
    const monde = monteLeMonde();
    const duReseau = { ok: true, clone: () => ({ corps: 'de-a' }), corps: 'de-a' };
    monde.fetchImpl = () => Promise.resolve(duReseau);
    await dispatchFetch(
      monde,
      requete('https://gate.staging.meeshy.me/api/v1/conversations', {
        entetes: { authorization: 'Bearer jeton-a' },
      }),
    );
    monde.fetchImpl = () => Promise.reject(new TypeError('Failed to fetch'));
    const memeJeton = await dispatchFetch(
      monde,
      requete('https://gate.staging.meeshy.me/api/v1/conversations', {
        entetes: { authorization: 'Bearer jeton-a' },
      }),
    );
    expect(memeJeton).toEqual({ corps: 'de-a' });
    const autreJeton = await dispatchFetch(
      monde,
      requete('https://gate.staging.meeshy.me/api/v1/conversations', {
        entetes: { authorization: 'Bearer jeton-b' },
      }),
    );
    expect(autreJeton).toEqual({ estUneErreur: true });
  });

  it('le jeton lui-même ne sert JAMAIS de clé en clair', () => {
    const monde = monteLeMonde();
    expect(monde).toBeDefined();
    expect(SOURCE).not.toMatch(/put\([^)]*jeton[^)]*\)/);
    expect(SOURCE).toContain('0x811c9dc5');
  });
});

describe('ce que le worker ne touche JAMAIS', () => {
  it.each([
    ['un POST vers l’API', 'https://gate.staging.meeshy.me/api/v1/messages', { method: 'POST' }],
    ['le flux socket.io', 'https://staging.meeshy.me/socket.io/?EIO=4', {}],
    ['une pièce jointe', 'https://gate.staging.meeshy.me/api/v1/attachments/file/2026/a.jpg', {}],
  ])('%s passe au navigateur', async (_nom, url, options) => {
    const monde = monteLeMonde();
    const reponse = await dispatchFetch(monde, requete(url, options as never));
    expect(reponse).toBeNull();
  });
});

describe('les actifs immuables — cache-first, le retour instantané que le hash autorise', () => {
  it.each([
    ['un bundle', 'https://staging.meeshy.me/__v3/_next/static/chunks/app.js'],
    ['un module de participation', 'https://staging.meeshy.me/__v3/rt/participate.abc123.js'],
  ])('%s déjà en cache ne repart pas au réseau', async (_nom, url) => {
    const monde = monteLeMonde();
    const cache = await monde.caches.open('meeshy-v3-sw-__V3_SW_EMPREINTE__');
    await cache.put(url, { corps: 'actif connu' });
    const reponse = await dispatchFetch(monde, requete(url, { destination: 'script' }));
    expect(reponse).toEqual({ corps: 'actif connu' });
    expect(monde.fetchAppels).toHaveLength(0);
  });
});
