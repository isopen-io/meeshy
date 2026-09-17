import { QueryClient, dehydrate, hydrate, type DehydratedState } from '@tanstack/react-query';

import { SW_RUNTIME_CACHE_NAMES } from '@/lib/sw-caches';

import { ApiError } from './client';
import { reactionStore } from './reaction-store';
/* `souverain.ts` n'a AUCUNE dépendance — c'est ce qui le rend importable
   depuis le socle sans y tirer les décodeurs d'administration (#6862). */
import { estClefSouveraine } from './souverain';
import { sessionStore, type SessionStoreApi, type SessionStoreState } from './session';

/**
 * LE SOCLE DE TANSTACK QUERY (#5650, F5/F9) — ce module N'IMPORTE NI
 * `fixtures.ts` NI AUCUN PORT : le poids de la première peinture est un gate
 * (`budgets.json`), et les ports vivent dans les chunks de route.
 *
 * PERSISTANCE PAR `dehydrate`/`hydrate` (F5, réexports de `@tanstack/query-core`,
 * eux-mêmes déjà dans le chunk `data` du socle) — restauration SYNCHRONE
 * avant `createRoot` : zéro dépendance nouvelle, zéro squelette sur un cache
 * non vide au premier rendu (les paquets `persist-client` restaurent en
 * ASYNCHRONE, ce qui laisse passer un rendu `pending`).
 */

const CACHE_KEY = 'meeshy.query-cache';
const DEBOUNCE_MS = 250;

/**
 * `shouldRetry` — LES DEUX MOITIÉS d'une même règle (§7.2, README) :
 *  - un `ApiError` 401/403/404 est un REFUS, jamais transitoire — retenter ne
 *    changera rien tant que l'identité ou le droit ne bougent pas ⇒ FAUX dès
 *    le premier échec ;
 *  - tout le reste (réseau, 5xx, `TIMEOUT`) EST transitoire ⇒ retenté jusqu'à
 *    DEUX fois (trois tentatives au total — même borne que le `retry: 2`
 *    numérique qu'il remplace dans `main.tsx`).
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403 || error.status === 404)) {
    return false;
  }
  return failureCount < 2;
}

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

function browserStorage(): StorageLike {
  try {
    const probe = '__meeshy_query_cache_probe__';
    globalThis.localStorage.setItem(probe, '1');
    globalThis.localStorage.removeItem(probe);
    return globalThis.localStorage;
  } catch {
    const memory = new Map<string, string>();
    return {
      getItem: (key) => memory.get(key) ?? null,
      setItem: (key, value) => {
        memory.set(key, value);
      },
      removeItem: (key) => {
        memory.delete(key);
      },
    };
  }
}

type PersistedCache = {
  readonly buster: string;
  readonly state: DehydratedState;
  /**
   * « MES RÉACTIONS » (revue #5814, défaut majeur 5) — miroir de
   * `reactionStore.mine` (`reaction-store.ts`). AVANT ce champ, le compte
   * optimiste d'une réaction (`Message.reactionSummary`, dans `state`
   * ci-dessus) survivait à un rechargement alors que « qui a posé cet
   * emoji » (`reactionStore`, zustand vanilla, hors de ce cache) repartait
   * TOUJOURS à vide : à CHAQUE relance de la PWA ou de la coque, un lecteur
   * qui avait réagi voyait son propre emoji sans « la vôtre », un second tap
   * le RE-comptait (double-comptage définitif, capture `K1-reaction-double-
   * comptee.png`), et le retrait devenait INERTE (loi 4). Les deux moitiés
   * d'un même fait — « combien » et « qui » — doivent vivre sur la MÊME
   * horloge : celle-ci, le même `buster`, la même purge à la déconnexion
   * (D-6). `optional` : un cache écrit AVANT ce correctif n'en porte pas —
   * `hydrateReactions` traite son absence comme « aucune réaction connue »,
   * jamais comme une erreur.
   */
  readonly reactions?: Readonly<Record<string, readonly string[]>>;
};

function isPersistedCache(value: unknown): value is PersistedCache {
  return typeof value === 'object' && value !== null && typeof (value as { buster?: unknown }).buster === 'string';
}

export type AppQueryClient = QueryClient & {
  persist: () => void;
  /**
   * JETER LE CACHE PERSISTÉ, ET NE PLUS RIEN ÉCRIRE (#6936).
   *
   * Appelée juste avant un rechargement de MISE À JOUR : la version qui s'en va
   * ne doit pas laisser derrière elle le cache de ses propres formes de données.
   *
   * « Ne plus rien écrire » n'est pas un détail : `persist` est câblée sur
   * `pagehide` et `visibilitychange` (§ AUTO-PERSISTANCE ci-dessous), tous deux
   * déclenchés PAR le rechargement. Sans ce verrou, la clé effacée serait
   * réécrite dans la milliseconde qui suit, avec le même `buster` — la purge
   * n'aurait rien purgé. Le cache EN MÉMOIRE reste intact : la page qui part
   * n'a aucune raison de se vider à l'écran avant de partir.
   */
  discardPersisted: () => void;
};

/**
 * **CE QUI A LE DROIT D'ÊTRE ÉCRIT SUR LE DISQUE** (#6862) — le prédicat de
 * déshydratation, NOMMÉ et EXPORTÉ plutôt qu'écrit en ligne dans `persist`.
 *
 * `dehydrate` écrivait TOUTE requête réussie. Le contenu d'une conversation
 * privée, lu par un BIGBOSS sous motif écrit et geste tracé, y atterrissait
 * donc comme le reste — et **survivait à la session**, sur le poste de
 * l'administrateur. `AdminAuditLog` dit « il a lu » ; il ne dit pas « il en
 * garde une copie depuis six jours », et personne ne peut révoquer celle-là.
 *
 * Le prédicat de reconnaissance vient de `souverain.ts` — un module sans
 * dépendance — précisément pour que ce fichier, qui est dans le SOCLE de la
 * première peinture, n'ait pas à importer les décodeurs d'administration et à
 * les faire payer à tous les lecteurs (`budgets.json`).
 *
 * **Il est EXPORTÉ pour qu'un témoin puisse le jouer.** Écrit en ligne, la
 * seule façon de le mesurer était de relire `localStorage` après un
 * `persist()` — c'est-à-dire de mesurer aussi le STOCKAGE, qui sous `bun test`
 * n'existe pas encore au moment où ce module est chargé : le `try/catch` de
 * `persist` avalait alors l'écriture, et le témoin verdissait que la garde
 * soit posée ou RETIRÉE. Un témoin vert des deux côtés d'une mutation ne
 * mesure pas la règle, il mesure la machine.
 *
 * Ce prédicat ne couvre que le cache de REQUÊTES. Le service worker écrivait la
 * même charge par un autre chemin — `caches.open('api')`, la réponse HTTP
 * entière, sept jours sur le disque — et ce doc-comment l'AVOUAIT sans que rien
 * ne le ferme. C'est fait : `API_RESPONSE_CACHE_PATTERN`
 * (`lib/net/api-runtime-cache.ts`) sort tout `/api/v1/admin/` du
 * `runtimeCaching`. Deux seaux, deux gardes, la même règle — et une VALEUR
 * plutôt qu'un prédicat, parce que Workbox stringifie ce champ dans
 * `dist/sw.js` : un prédicat importé s'y serait perdu, comme il l'a fait.
 */
export function persistableQuery(query: {
  readonly state: { readonly status: string };
  readonly queryKey: readonly unknown[];
}): boolean {
  return query.state.status === 'success' && !estClefSouveraine(query.queryKey);
}

export type CreateAppQueryClientOptions = {
  readonly storage?: StorageLike;
  readonly buster: string;
  /** Le magasin de session — sa souscription PURGE le cache dès que
   * l'identité change (déconnexion, ou changement de compte sur le même
   * navigateur, D-6). Optionnel : un témoin qui ne teste que la
   * persistance n'en a pas besoin. */
  readonly session?: SessionStoreApi;
  /**
   * LE STOCKAGE DU SERVICE WORKER — injecté pour être TÉMOIGNABLE ; le
   * défaut est `globalThis.caches`, absent hors navigateur (et hors coque
   * Capacitor, où aucun service worker n'est enregistré : `keys()` rend
   * alors une liste vide, et la purge ne fait rien).
   */
  readonly cacheStorage?: CacheStorageLike;
};

export type CacheStorageLike = {
  keys(): Promise<readonly string[]>;
  delete(cacheName: string): Promise<boolean>;
};

/**
 * LES SEAUX DU SERVICE WORKER QUI PORTENT DE LA DONNÉE DE LECTEUR — les
 * noms de `runtimeCaching` (`vite.config.ts` § VitePWA) : `api` (les
 * réponses `/api/**` en NetworkFirst, 200 entrées, SEPT JOURS) et `medias`
 * (les images en CacheFirst, TRENTE jours). Le seau de PRÉCACHE
 * (`workbox-precache-*`) n'y est PAS : il ne contient que le shell, le même
 * pour tout le monde.
 *
 * **LU, jamais recopié** (#6936) : les mêmes noms sont créés par
 * `vite.config.ts` et purgés par la mise à jour de l'application
 * (`lib/app-update/service-worker.ts`). Trois littéraux auraient divergé au
 * premier seau ajouté — et une purge qui ne nomme plus un seau existant est
 * silencieuse.
 */
const READER_SCOPED_SW_CACHES = SW_RUNTIME_CACHE_NAMES;

/**
 * `purgeReaderCaches` — CE QUI PART À CÔTÉ DU CACHE DE REQUÊTES (#5650,
 * revue-correction).
 *
 * Câbler la passerelle a fait entrer, pour la PREMIÈRE fois, des réponses
 * d'API dans le `runtimeCaching` du service worker : la liste des
 * conversations et les pages de messages d'un lecteur vivent désormais dans
 * `caches.open('api')`, sur le DISQUE, sept jours durant. Le `buster` par
 * identité ci-dessous protégeait soigneusement le cache TanStack et le
 * `localStorage` — et laissait ce seau-là intact : sur un réseau lent
 * (`networkTimeoutSeconds: 3`) ou hors ligne, le NetworkFirst du service
 * worker aurait resservi la liste du compte PRÉCÉDENT au compte suivant sur
 * le même appareil.
 *
 * « Une protection de contenu se mesure sur tout ce que la charge
 * TRANSPORTE » (CLAUDE.md § Prisme, cycle 125) : la purge se pose sur TOUS
 * les seaux à portée de lecteur, jamais sur celui qu'on vient d'écrire.
 * Best-effort et silencieuse : une purge qui échoue ne doit pas empêcher la
 * déconnexion, qui a déjà retiré le jeton.
 */
export function purgeReaderCaches(storage?: CacheStorageLike): void {
  const store = storage ?? (globalThis as { caches?: CacheStorageLike }).caches;
  if (store === undefined) return;
  void store
    .keys()
    .then((names) =>
      Promise.all(
        names.filter((name) => READER_SCOPED_SW_CACHES.some((c) => name === c)).map((name) => store.delete(name)),
      ),
    )
    .catch(() => undefined);
}

/**
 * `createAppQueryClient` — FABRIQUE testable (motif `createSessionStore`) :
 * `storage` INJECTABLE, `buster` EXPLICITE (jamais recalculé en cachette).
 */
export function createAppQueryClient(options: CreateAppQueryClientOptions): AppQueryClient {
  const storage = options.storage ?? browserStorage();
  const { buster } = options;

  const client = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 24 * 60 * 60 * 1000,
        retry: shouldRetry,
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
    },
  }) as AppQueryClient;

  // RESTAURATION SYNCHRONE — avant que le premier composant ne s'abonne.
  try {
    const raw = storage.getItem(CACHE_KEY);
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw);
      if (isPersistedCache(parsed) && parsed.buster === buster) {
        hydrate(client, parsed.state);
        // « MES RÉACTIONS », SUR LA MÊME HORLOGE (revue #5814, défaut
        // majeur 5) — restaurée dans le MÊME bloc, sous la MÊME garde de
        // `buster`, pour que les deux moitiés d'un même fait naissent et
        // meurent ensemble. `?? {}` : un cache antérieur à ce correctif
        // n'a pas ce champ.
        reactionStore.setState({ mine: parsed.reactions ?? {} });
      } else {
        storage.removeItem(CACHE_KEY);
      }
    }
  } catch {
    // JSON corrompu, ou storage qui lance à la lecture : on repart d'un
    // cache vide plutôt que de faire échouer le démarrage de l'application.
    try {
      storage.removeItem(CACHE_KEY);
    } catch {
      /* rien de plus à faire */
    }
  }

  let persistenceHalted = false;

  const persist = (): void => {
    if (persistenceHalted) return;
    try {
      const state = dehydrate(client, { shouldDehydrateQuery: persistableQuery });
      const reactions = reactionStore.getState().mine;
      storage.setItem(CACHE_KEY, JSON.stringify({ buster, state, reactions }));
    } catch {
      /* Stockage refusé (quota, navigation privée) : le cache tient pour
       * l'onglet, sans se souvenir — même doctrine que `session.ts`. */
    }
  };
  client.persist = persist;

  // AUTO-PERSISTANCE, DÉBOUNCÉE — chaque écriture réussie du cache déclenche
  // une écriture différée, jamais synchrone (un défilement qui met à jour
  // vingt rangées ne doit pas écrire vingt fois `localStorage`).
  let debounceHandle: ReturnType<typeof setTimeout> | undefined;
  const schedulePersist = () => {
    if (debounceHandle !== undefined) clearTimeout(debounceHandle);
    debounceHandle = setTimeout(persist, DEBOUNCE_MS);
  };
  client.discardPersisted = (): void => {
    persistenceHalted = true;
    if (debounceHandle !== undefined) clearTimeout(debounceHandle);
    try {
      storage.removeItem(CACHE_KEY);
    } catch {
      /* Stockage refusé : il n'y a rien de persisté à jeter. */
    }
  };

  client.getQueryCache().subscribe(schedulePersist);
  // `reactionStore` DÉCLENCHE AUSSI (revue #5814, défaut majeur 5) — chaque
  // écriture de `performReaction` pose déjà un delta sur le cache des
  // messages DANS LE MÊME GESTE (`applyDelta`), ce qui suffirait à planifier
  // une écriture ; cette ligne rend le couplage EXPLICITE plutôt que de
  // reposer sur une coïncidence d'ordonnancement entre deux fichiers.
  reactionStore.subscribe(schedulePersist);

  if (typeof document !== 'undefined') {
    // FORCÉ à la fermeture / mise en arrière-plan — le débounce ci-dessus ne
    // doit jamais faire perdre la dernière minute d'activité.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') persist();
    });
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', persist);
  }

  if (options.session !== undefined) {
    const session = options.session;
    const identityOf = (state: SessionStoreState): string | null => {
      const s = state.session;
      return s.status === 'authenticated' ? s.user.id : null;
    };
    let lastIdentity = identityOf(session.getState());
    session.subscribe((state) => {
      const identity = identityOf(state);
      if (identity === lastIdentity) return;
      lastIdentity = identity;
      client.clear();
      // « MES RÉACTIONS » DE L'IDENTITÉ PRÉCÉDENTE (revue #5814, défaut
      // majeur 5, D-6) — sans cette ligne, `reactionStore` restait en
      // MÉMOIRE (module-level, jamais démonté) au-delà de la purge du
      // cache : un compte SUIVANT sur le même navigateur aurait hérité des
      // emojis « miens » du compte PRÉCÉDENT tant qu'aucune réaction
      // nouvelle n'écrasait la carte.
      reactionStore.setState({ mine: {} });
      try {
        storage.removeItem(CACHE_KEY);
      } catch {
        /* rien de plus à faire */
      }
      purgeReaderCaches(options.cacheStorage);
    });
  }

  return client;
}

/**
 * L'INSTANCE UNIQUE — `buster` composé de la VERSION applicative (littéral de
 * construction) et de l'identité courante, résolue UNE FOIS ici plutôt que
 * relue à chaque composant : c'est la garde D-6 contre une liste lue par le
 * compte SUIVANT sur le même navigateur (une session restaurée AVANT la
 * construction de ce client change déjà `sessionStore` par `restoreSession()`,
 * appelée avant ce module dans `main.tsx`).
 */
/**
 * `CACHE_SCHEMA` (#6195) — bumpé quand la FORME PERSISTÉE d'une requête
 * change, ici `['conversations']` : `readonly Conversation[]` → `InfiniteData`.
 * Un cache écrit AVANT ce lot et restauré APRÈS ferait lever `select`
 * (`flattenConversationPages`) sur `.pages` d'un tableau qui n'en porte pas —
 * le buster par IDENTITÉ (`currentBuster`) ne protège pas de ÇA, il protège
 * du compte SUIVANT sur le même navigateur (D-6). Les deux causes de purge
 * sont INDÉPENDANTES : celle-ci n'a pas besoin d'un changement d'identité
 * pour se déclencher, une seule fois, au premier chargement qui suit ce lot.
 */
export const CACHE_SCHEMA = 2;

function currentBuster(): string {
  const session = sessionStore.getState().session;
  const userId = session.status === 'authenticated' ? session.user.id : 'anonymous';
  return `${__APP_VERSION__}:${CACHE_SCHEMA}:${userId}`;
}

/**
 * ORDRE CRITIQUE — restaurer la session AVANT de composer le `buster` :
 * les imports ES sont évalués AVANT le corps du module qui les demande
 * (`main.tsx`), donc écrire `restoreSession()` dans `main.tsx` seul
 * n'aurait aucun effet ici — cette ligne s'exécuterait déjà, sur une
 * session encore `anonymous`. Sans elle, un lecteur AUTHENTIFIÉ rechargeant
 * la page verrait son cache persisté rejeté (buster `…:anonymous` construit
 * ici ≠ buster `…:<son id>` du cache écrit à la session précédente) — la
 * garde D-6 se déclencherait à tort. `restoreSession()` est IDEMPOTENTE :
 * l'appel explicite de `main.tsx` (§ « LA SESSION EST TENUE ») reste, sans
 * effet de bord supplémentaire.
 */
sessionStore.getState().restoreSession();

export const appQueryClient: AppQueryClient = createAppQueryClient({ buster: currentBuster(), session: sessionStore });
