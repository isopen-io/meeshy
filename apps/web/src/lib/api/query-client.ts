import { QueryClient, dehydrate, hydrate, type DehydratedState } from '@tanstack/react-query';

import { createAccountCacheShelf } from './account-caches';
import { ApiError } from './client';
import { apiConfig } from './config';
import { resetAbsentMedia } from './media-absent';
import { reactionStore } from './reaction-store';
/* `souverain.ts` n'a AUCUNE dépendance — c'est ce qui le rend importable
   depuis le socle sans y tirer les décodeurs d'administration (#6862). */
import { estClefNonPersistable } from './souverain';
import { sessionIdentityKey, sessionStore, type SessionState, type SessionStoreApi } from './session';

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
 * (`lib/net/api-runtime-cache.ts`) sort tout le groupe `admin` du catalogue du
 * `runtimeCaching`. Deux seaux, deux gardes, la même règle — et une VALEUR
 * plutôt qu'un prédicat, parce que Workbox stringifie ce champ dans
 * `dist/sw.js` : un prédicat importé s'y serait perdu, comme il l'a fait.
 */
export function persistableQuery(query: {
  readonly state: { readonly status: string };
  readonly queryKey: readonly unknown[];
}): boolean {
  return query.state.status === 'success' && !estClefNonPersistable(query.queryKey);
}

export type CreateAppQueryClientOptions = {
  readonly storage?: StorageLike;
  /** Le `buster` de l'identité COURANTE à la création. */
  readonly buster: string;
  /**
   * Le `buster` d'un compte (`null` = aucun compte) — relu à chaque
   * changement d'identité (#8674) : c'est lui qui scelle le cache RANGÉ d'un
   * compte quitté et qui le revérifie à son retour. Défaut : le `buster`
   * initial suffixé du compte.
   */
  readonly busterOf?: (userId: string | null) => string;
  /** Le magasin de session — sa souscription VIDE le cache en mémoire dès
   * que l'identité change (D-6), RANGE celui du compte quitté et REPREND
   * celui du compte qui revient (#8674). Optionnel : un témoin qui ne teste
   * que la persistance n'en a pas besoin. */
  readonly session?: SessionStoreApi;
};

export { purgeReaderCaches, type CacheStorageLike } from './account-caches';

/** Le compte d'une session — `null` pour un invité ou personne : seul un
 * COMPTE a un cache rangé (un invité quitté est oublié, comme avant). */
const accountOf = (session: SessionState): string | null =>
  session.status === 'authenticated' ? session.user.id : null;

/**
 * `createAppQueryClient` — FABRIQUE testable (motif `createSessionStore`) :
 * `storage` INJECTABLE, `buster` EXPLICITE (jamais recalculé en cachette).
 */
export function createAppQueryClient(options: CreateAppQueryClientOptions): AppQueryClient {
  const storage = options.storage ?? browserStorage();
  const busterOf = options.busterOf ?? ((userId: string | null) => `${options.buster}|${userId ?? 'anonymous'}`);
  const shelf = createAccountCacheShelf(storage);
  let buster = options.buster;

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

  /** Hydrate depuis une entrée SÉRIALISÉE si elle porte le `buster` attendu —
   * `false` sinon (absente, périmée, corrompue) : rien n'est alors restauré. */
  const restoreFrom = (raw: string | null, expected: string): boolean => {
    if (raw === null) return false;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isPersistedCache(parsed) || parsed.buster !== expected) return false;
      hydrate(client, parsed.state);
      // « MES RÉACTIONS », SUR LA MÊME HORLOGE (revue #5814, défaut
      // majeur 5) — restaurée dans le MÊME bloc, sous la MÊME garde de
      // `buster`, pour que les deux moitiés d'un même fait naissent et
      // meurent ensemble. `?? {}` : un cache antérieur à ce correctif
      // n'a pas ce champ.
      reactionStore.setState({ mine: parsed.reactions ?? {} });
      return true;
    } catch {
      return false;
    }
  };

  const serialize = (sealedWith: string): string => {
    const state = dehydrate(client, { shouldDehydrateQuery: persistableQuery });
    const reactions = reactionStore.getState().mine;
    return JSON.stringify({ buster: sealedWith, state, reactions });
  };

  const removeActive = (): void => {
    try {
      storage.removeItem(CACHE_KEY);
    } catch {
      /* rien de plus à faire */
    }
  };

  // RESTAURATION SYNCHRONE — avant que le premier composant ne s'abonne.
  // JSON corrompu, `buster` étranger ou storage qui lance : on repart d'un
  // cache vide plutôt que de faire échouer le démarrage de l'application.
  const initial = ((): string | null => {
    try {
      return storage.getItem(CACHE_KEY);
    } catch {
      return null;
    }
  })();
  if (initial !== null && !restoreFrom(initial, buster)) removeActive();

  let persistenceHalted = false;

  const persist = (): void => {
    if (persistenceHalted) return;
    try {
      storage.setItem(CACHE_KEY, serialize(buster));
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
    removeActive();
    // L'ÉTAGÈRE AUSSI (#8674) : les caches rangés des autres comptes portent
    // les formes de données de la version qui s'en va.
    shelf.forgetAll();
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
    let lastIdentity = sessionIdentityKey(session.getState().session);
    let lastAccount = accountOf(session.getState().session);
    /*
     * LE CHANGEMENT D'IDENTITÉ (D-6, #8674) — SYNCHRONE : `establish(B)`
     * notifie ici avant de rendre la main, donc avant que le moindre écran de
     * B ne lise le cache. Dans l'ordre :
     *  1. le cache d'A (encore seul en mémoire) est RANGÉ sous la clé d'A —
     *     jamais sous celle de B ; un invité quitté n'est pas rangé ;
     *  2. la mémoire est VIDÉE (cache, « mes réactions », médias absents) ;
     *  3. le cache rangé de B, s'il existe et porte son `buster`, est REPRIS
     *     et redevient le cache actif — périmé, donc relu au montage : B voit
     *     sa liste à l'instant, le réseau ne resynchronise que l'écart.
     * Une requête d'A encore en vol ne peut plus rien y écrire : le transport
     * ne la résout jamais (`http.ts`, `identity`). Les seaux du service worker
     * ne sont plus purgés ici : le seau `api` range chaque réponse sous
     * l'identité qui l'a demandée (`net/api-cache-identity.ts`), et ce qui les
     * vide est la FIN d'un compte (`account-caches.ts#forgetAccountCaches`).
     */
    session.subscribe((state) => {
      const identity = sessionIdentityKey(state.session);
      if (identity === lastIdentity) return;
      const leaving = lastAccount;
      const arriving = accountOf(state.session);
      lastIdentity = identity;
      lastAccount = arriving;

      if (debounceHandle !== undefined) clearTimeout(debounceHandle);
      if (leaving !== null && !persistenceHalted) {
        try {
          shelf.put(leaving, serialize(busterOf(leaving)));
        } catch {
          /* Déshydratation impossible : le compte quitté repartira du réseau. */
        }
      }
      removeActive();

      client.clear();
      // « MES RÉACTIONS » DE L'IDENTITÉ PRÉCÉDENTE (revue #5814, défaut
      // majeur 5, D-6) — `reactionStore` vit en MÉMOIRE (module-level,
      // jamais démonté) au-delà du cache : sans cette ligne, le compte
      // SUIVANT hériterait des emojis « miens » du compte PRÉCÉDENT.
      reactionStore.setState({ mine: {} });
      // LE REGISTRE DES MÉDIAS ABSENTS DE L'IDENTITÉ PRÉCÉDENTE (#7022 suivi)
      // — un média REFUSÉ (403) à A ne doit pas rester gravé absent pour B,
      // qui a peut-être le droit de le voir.
      resetAbsentMedia();

      buster = busterOf(arriving);
      if (arriving === null || persistenceHalted) return;
      if (restoreFrom(shelf.take(arriving), buster)) persist();
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
 * `CACHE_SCHEMA` — bumpé quand la FORME PERSISTÉE d'une requête change.
 *
 *  - **2** (#6195) — `['conversations']` : `readonly Conversation[]` →
 *    `InfiniteData`.
 *  - **3** (#6972) — `['conversations', <id>, 'messages']` :
 *    `{ messages, hasOlder }` → `InfiniteData<MessagesPage>`.
 *
 * Un cache écrit AVANT un de ces lots et restauré APRÈS ferait lever `select`
 * (`flattenConversationPages`, `flattenMessagePages`) sur un `.pages` que la
 * donnée ne porte pas — le buster par IDENTITÉ (`currentBuster`) ne protège
 * pas de ÇA, il protège du compte SUIVANT sur le même navigateur (D-6). Les
 * deux causes de purge sont INDÉPENDANTES : celle-ci n'a pas besoin d'un
 * changement d'identité pour se déclencher, une seule fois, au premier
 * chargement qui suit le lot.
 *
 * **C'est un défaut qui ne se voit pas en développement** : un cache vide n'a
 * pas d'ancienne forme à restaurer. Il ne serait apparu que chez les
 * utilisateurs EXISTANTS, au premier chargement, sur l'écran le plus visité.
 */
export const CACHE_SCHEMA = 3;

/**
 * Le `buster` d'un compte — la VERSION, le SCHÉMA, l'ORIGINE de l'API (#8674 :
 * un même identifiant sur une autre passerelle n'est pas le même compte) et
 * le compte. Scelle le cache actif ET le cache rangé d'un compte quitté.
 */
function busterFor(userId: string | null): string {
  return `${__APP_VERSION__}:${CACHE_SCHEMA}:${apiConfig.base}:${userId ?? 'anonymous'}`;
}

function currentBuster(): string {
  const session = sessionStore.getState().session;
  return busterFor(session.status === 'authenticated' ? session.user.id : null);
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

export const appQueryClient: AppQueryClient = createAppQueryClient({
  buster: currentBuster(),
  busterOf: busterFor,
  session: sessionStore,
});
