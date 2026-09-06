import * as fs from 'node:fs';
import * as path from 'node:path';

import { adresseDuFil, adresseDuMessage } from '../lib/api/adresses-du-fil';
import { SIGNAL_DE_DECONNEXION } from '../lib/sw/signal';

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

type FausseSubscription = {
  readonly unsubscribe: jest.Mock<Promise<boolean>, []>;
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
  readonly showNotification: jest.Mock<Promise<void>, [unknown, unknown]>;
  readonly openWindow: jest.Mock<unknown, [string]>;
  readonly matchAllRendu: { url: string; focus: jest.Mock<unknown, []> }[];
  readonly getSubscription: jest.Mock<Promise<FausseSubscription | null>, []>;
};

const monteLeMonde = (options?: {
  readonly url?: string;
  readonly nomsDeCaches?: readonly string[];
  /** Les clients fenêtre déjà ouverts, rendus par `clients.matchAll`. */
  readonly clientsOuverts?: readonly string[];
  /** La subscription push déjà posée sur CE navigateur — `null` par défaut (aucune). */
  readonly subscriptionExistante?: FausseSubscription | null;
}): Monde => {
  const ecouteurs: Ecouteurs = {};
  const ouverts = new Map<string, FauxCache>();
  const supprimes: string[] = [];
  const nomsExistants = [...(options?.nomsDeCaches ?? [])];
  const showNotification = jest.fn((_titre: unknown, _options: unknown) => Promise.resolve());
  const openWindow = jest.fn((url: string) => ({ url }));
  const matchAllRendu = (options?.clientsOuverts ?? []).map((url) => ({ url, focus: jest.fn(() => undefined) }));
  const getSubscription = jest.fn(() =>
    Promise.resolve(options?.subscriptionExistante === undefined ? null : options.subscriptionExistante),
  );
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
    showNotification,
    openWindow,
    matchAllRendu,
    getSubscription,
  };
  const self = {
    location: { href: options?.url ?? 'https://staging.meeshy.me/__v3/sw?portees=%2Fl%2F%2C%2Fchats%2C%2Fchat%2F' },
    addEventListener: (type: string, fn: (event: unknown) => unknown) => {
      (ecouteurs[type] ??= []).push(fn);
    },
    clients: {
      claim: () => Promise.resolve(),
      matchAll: () => Promise.resolve(matchAllRendu),
      openWindow,
    },
    skipWaiting: () => Promise.resolve(),
    registration: {
      showNotification,
      pushManager: { getSubscription },
    },
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

const dispatchMessage = async (monde: Monde, data: unknown): Promise<void> => {
  const attentes: Promise<unknown>[] = [];
  for (const fn of monde.ecouteurs['message'] ?? []) {
    fn({
      data,
      waitUntil: (p: Promise<unknown>) => {
        attentes.push(p);
      },
    });
  }
  await Promise.all(attentes);
};

/** Un `PushEvent` — `event.data.json()` rend la charge, ou jette si elle est illisible. */
const dispatchPush = async (monde: Monde, charge: unknown | (() => unknown)): Promise<void> => {
  const attentes: Promise<unknown>[] = [];
  for (const fn of monde.ecouteurs['push'] ?? []) {
    fn({
      data:
        typeof charge === 'function'
          ? { json: charge as () => unknown }
          : { json: () => charge },
      waitUntil: (p: Promise<unknown>) => {
        attentes.push(p);
      },
    });
  }
  await Promise.all(attentes);
};

const dispatchNotificationClick = async (
  monde: Monde,
  notification: { readonly data?: unknown },
): Promise<{ readonly fermee: boolean }> => {
  const attentes: Promise<unknown>[] = [];
  let fermee = false;
  for (const fn of monde.ecouteurs['notificationclick'] ?? []) {
    fn({
      notification: { ...notification, close: () => (fermee = true) },
      waitUntil: (p: Promise<unknown>) => {
        attentes.push(p);
      },
    });
  }
  await Promise.all(attentes);
  return { fermee };
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

/**
 * LA PURGE À LA DÉCONNEXION (#5095) — le lot que la décision 2 annonçait.
 * `lib/realtime/deconnexion.ts` poste ce message à chaque registration active ;
 * le travailleur purge alors TOUT le namespace v3, jamais le legacy.
 */
describe('la purge à la déconnexion — le lot que la décision 2 annonçait', () => {
  it('le signal purge TOUTES les entrées du namespace v3, et n’y laisse aucune entrée d’API', async () => {
    const monde = monteLeMonde({
      nomsDeCaches: [
        'meeshy-v3-sw-a1',
        'meeshy-v3-sw-__V3_SW_EMPREINTE__',
        'meeshy-cache-legacy',
        'tiers',
      ],
    });
    const cache = await monde.caches.open('meeshy-v3-sw-__V3_SW_EMPREINTE__');
    await cache.put(
      'https://gate.staging.meeshy.me/api/v1/conversations?__lecteur=abc',
      { corps: 'n-1' },
    );

    await dispatchMessage(monde, { type: SIGNAL_DE_DECONNEXION });

    expect(monde.caches.supprimes.sort()).toEqual(['meeshy-v3-sw-__V3_SW_EMPREINTE__', 'meeshy-v3-sw-a1']);
    expect(monde.caches.supprimes).not.toContain('meeshy-cache-legacy');
    expect(monde.caches.supprimes).not.toContain('tiers');
  });

  it('un message d’un autre type, ou sans forme reconnaissable, ne touche à rien', async () => {
    const monde = monteLeMonde({ nomsDeCaches: ['meeshy-v3-sw-__V3_SW_EMPREINTE__'] });

    await dispatchMessage(monde, { type: 'autre' });
    await dispatchMessage(monde, 'pas-un-objet');
    await dispatchMessage(monde, null);
    await dispatchMessage(monde, undefined);

    expect(monde.caches.supprimes).toEqual([]);
  });

  /**
   * LA PURGE DE L'ABONNEMENT PUSH (#5391) — le signal désabonne aussi le
   * NAVIGATEUR, en plus de purger les caches (le témoin ci-dessus reste vert :
   * on AJOUTE au `waitUntil`, on ne remplace pas).
   */
  it('le signal désabonne aussi la subscription push de CE navigateur — la purge des caches reste intacte', async () => {
    const unsubscribe = jest.fn(() => Promise.resolve(true));
    const monde = monteLeMonde({
      nomsDeCaches: ['meeshy-v3-sw-__V3_SW_EMPREINTE__'],
      subscriptionExistante: { unsubscribe },
    });

    await dispatchMessage(monde, { type: SIGNAL_DE_DECONNEXION });

    expect(monde.getSubscription).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(monde.caches.supprimes).toEqual(['meeshy-v3-sw-__V3_SW_EMPREINTE__']);
  });

  it('sans subscription posée, le signal ne jette rien — best-effort', async () => {
    const monde = monteLeMonde({ nomsDeCaches: ['meeshy-v3-sw-__V3_SW_EMPREINTE__'], subscriptionExistante: null });

    await expect(dispatchMessage(monde, { type: SIGNAL_DE_DECONNEXION })).resolves.toBeUndefined();
    expect(monde.getSubscription).toHaveBeenCalledTimes(1);
  });
});

/**
 * LE PUSH WEB (#5391) — un événement `push` affiche la notification avec le
 * corps SERVI, jamais recomposé : la passerelle a déjà résolu le Prisme
 * côté serveur (§ 2.4 de la spécification), ce worker ne fait que relayer.
 */
describe('le push — le corps SERVI, jamais recomposé', () => {
  it('une charge FCM complète affiche la notification avec le titre et le corps EXACTS, verbatim', async () => {
    const monde = monteLeMonde();

    await dispatchPush(monde, {
      notification: { title: 'Amina Diallo', body: 'Bonjour, comment vas-tu ?', icon: '/android-chrome-192x192.png', badge: '/badge-72x72.png' },
      data: { notificationId: 'notif-1', conversationId: 'conv-1' },
      fcmOptions: { link: '/conversations/conv-1' },
    });

    expect(monde.showNotification).toHaveBeenCalledTimes(1);
    const [titre, options] = monde.showNotification.mock.calls[0] as [string, Record<string, unknown>];
    expect(titre).toBe('Amina Diallo');
    expect(options.body).toBe('Bonjour, comment vas-tu ?');
    expect(options.icon).toBe('/android-chrome-192x192.png');
    expect(options.badge).toBe('/badge-72x72.png');
    expect(options.tag).toBe('notif-1');
  });

  it('une charge SANS bloc `notification` (data-only, silencieuse) ne montre JAMAIS de bannière', async () => {
    const monde = monteLeMonde();

    await dispatchPush(monde, { data: { type: 'call_cancel', conversationId: 'conv-1' } });

    expect(monde.showNotification).not.toHaveBeenCalled();
  });

  it('une charge illisible (`json()` qui jette) ne montre rien et ne jette pas', async () => {
    const monde = monteLeMonde();

    await expect(
      dispatchPush(monde, () => {
        throw new Error('JSON invalide');
      }),
    ).resolves.toBeUndefined();
    expect(monde.showNotification).not.toHaveBeenCalled();
  });
});

/**
 * LE CLIC — l'adresse portée par la charge, ouverte DANS LA ZONE. `cible` est
 * calculée au moment du `push` (`cibleDansLaZone`) et voyage dans
 * `notification.data.cible` — le clic ne la recalcule jamais, il l'ouvre.
 */
describe('le clic — l’adresse portée par la charge, ouverte dans la zone', () => {
  it('une charge `fcmOptions.link` au format legacy ouvre EXACTEMENT adresseDuMessage(adresseDuFil(id), messageId)', async () => {
    const monde = monteLeMonde();

    await dispatchPush(monde, {
      notification: { title: 'Réponse', body: 'D’accord !' },
      fcmOptions: { link: '/conversations/abc123?messageId=m9' },
    });
    const cible = (monde.showNotification.mock.calls[0]?.[1] as { data: { cible: string } }).data.cible;
    expect(cible).toBe(adresseDuMessage(adresseDuFil('abc123'), 'm9'));

    await dispatchNotificationClick(monde, { data: { cible } });

    expect(monde.openWindow).toHaveBeenCalledWith(cible);
  });

  it('un client fenêtre déjà ouvert sur ce chemin est FOCALISÉ — openWindow n’est pas appelé', async () => {
    const cible = adresseDuMessage(adresseDuFil('abc123'), 'm9');
    const monde = monteLeMonde({ clientsOuverts: [`https://staging.meeshy.me${cible}`] });

    const { fermee } = await dispatchNotificationClick(monde, { data: { cible } });

    expect(fermee).toBe(true);
    expect(monde.matchAllRendu[0]?.focus).toHaveBeenCalledTimes(1);
    expect(monde.openWindow).not.toHaveBeenCalled();
  });

  it('un `link` ABSOLU vers un autre hôte retombe sur /notifications — fail-closed', async () => {
    const monde = monteLeMonde();

    await dispatchPush(monde, {
      notification: { title: 'x', body: 'y' },
      fcmOptions: { link: 'https://ailleurs.test/vole-la-session' },
    });
    const cible = (monde.showNotification.mock.calls[0]?.[1] as { data: { cible: string } }).data.cible;

    expect(cible).toBe('/notifications');
  });

  it('un chemin HORS ZONE (ni /conversations/, ni un chemin de zone connu) retombe sur /notifications', async () => {
    const monde = monteLeMonde();

    await dispatchPush(monde, {
      notification: { title: 'x', body: 'y' },
      fcmOptions: { link: '/parametres/facturation' },
    });
    const cible = (monde.showNotification.mock.calls[0]?.[1] as { data: { cible: string } }).data.cible;

    expect(cible).toBe('/notifications');
  });

  it('`data.postId` sans lien ouvre /post/<id>', async () => {
    const monde = monteLeMonde();

    await dispatchPush(monde, { notification: { title: 'x', body: 'y' }, data: { postId: 'post-9' } });
    const cible = (monde.showNotification.mock.calls[0]?.[1] as { data: { cible: string } }).data.cible;

    expect(cible).toBe('/post/post-9');
  });

  it('rien du tout (ni lien, ni conversationId, ni postId) retombe sur /notifications', async () => {
    const monde = monteLeMonde();

    await dispatchPush(monde, { notification: { title: 'x', body: 'y' } });
    const cible = (monde.showNotification.mock.calls[0]?.[1] as { data: { cible: string } }).data.cible;

    expect(cible).toBe('/notifications');
  });

  it('un clic sans cible reconnaissable ferme la notification sans ouvrir ni focaliser', async () => {
    const monde = monteLeMonde();

    const { fermee } = await dispatchNotificationClick(monde, { data: {} });

    expect(fermee).toBe(true);
    expect(monde.openWindow).not.toHaveBeenCalled();
  });
});
