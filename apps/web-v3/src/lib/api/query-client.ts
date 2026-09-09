import { QueryClient, dehydrate, hydrate, type DehydratedState } from '@tanstack/react-query';

import { ApiError } from './client';
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
  return failureCount <= 2;
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
};

function isPersistedCache(value: unknown): value is PersistedCache {
  return typeof value === 'object' && value !== null && typeof (value as { buster?: unknown }).buster === 'string';
}

export type AppQueryClient = QueryClient & { persist: () => void };

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
 */
const READER_SCOPED_SW_CACHES = ['api', 'medias'] as const;

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

  const persist = (): void => {
    try {
      const state = dehydrate(client, { shouldDehydrateQuery: (q) => q.state.status === 'success' });
      storage.setItem(CACHE_KEY, JSON.stringify({ buster, state }));
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
  client.getQueryCache().subscribe(() => {
    if (debounceHandle !== undefined) clearTimeout(debounceHandle);
    debounceHandle = setTimeout(persist, DEBOUNCE_MS);
  });

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
function currentBuster(): string {
  const session = sessionStore.getState().session;
  const userId = session.status === 'authenticated' ? session.user.id : 'anonymous';
  return `${__APP_VERSION__}:${userId}`;
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
