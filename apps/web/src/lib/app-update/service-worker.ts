import { appQueryClient } from '@/lib/api/query-client';
import { isAppOwnedCache } from '@/lib/sw-caches';

import { SW_UPDATE_AVAILABLE_EVENT } from './event';

/**
 * LA MISE À JOUR DE L'APPLICATION — LE COMPORTEMENT ET L'API DU LEGACY (#6936).
 *
 * Directive porteur 2026-09-17 : « réutilise le même COMPORTEMENT et API que le
 * legacy pour afficher une bannière mise à jour de l'application lorsqu'une
 * nouvelle mise à jour est distribuée afin d'invalider tout le cache de
 * l'application en cours (en préservant la session) ».
 *
 * CE QUE LE LEGACY FAIT, et que ce module rejoue
 * (`apps/web/utils/service-worker.ts`, `apps/web/public/sw.js:233-238`) :
 *
 *  1. inscription de `/sw.js` à la racine, `updateViaCache: 'none'` — le script
 *     qui porte la révision de tout le reste ne se lit jamais dans le cache HTTP ;
 *  2. `registration.waiting` au chargement, puis `updatefound` → `installed`
 *     avec un contrôleur ⇒ `CustomEvent('sw-update-available')` sur la fenêtre :
 *     l'ÉVÉNEMENT est l'API, c'est la bannière qui écoute ;
 *  3. vérifications : au démarrage, au retour au premier plan, et au battement
 *     horaire (`service-worker-registration.ts:217-223`) ;
 *  4. au clic : purge des caches POSSÉDÉS, purge du cache de requêtes persisté,
 *     `postMessage({ type: 'SKIP_WAITING' })` au worker en attente, puis UN
 *     rechargement au `controllerchange` — et un rechargement quand même si
 *     quelque chose échoue.
 *
 * LA SESSION N'EST JAMAIS TOUCHÉE. `meeshy.session` (et les préférences, les
 * brouillons, le schéma, la langue d'interface) vivent dans le `localStorage`,
 * que ce module ne lit pas : la purge nomme ce qu'elle efface — deux seaux du
 * service worker, le namespace du legacy, une clé de cache de requêtes — plutôt
 * que d'effacer largement puis de restaurer ce qu'elle regrette.
 *
 * TROIS ÉCARTS ASSUMÉS avec le legacy, chacun pour un défaut mesuré chez lui :
 *
 *  · **Le rechargement au `controllerchange` est conditionné à une page DÉJÀ
 *    contrôlée.** Le legacy recharge sur tout changement de contrôleur, y
 *    compris celui de la PREMIÈRE installation (`clients.claim()`) : un premier
 *    visiteur voit donc sa page se recharger sous lui. Ici, une page que
 *    personne ne contrôlait ne recharge pas ; une page contrôlée recharge, ce
 *    qui garde les AUTRES onglets d'accord avec le worker qui les sert — le
 *    précache de la version neuve n'a plus les chunks de l'ancienne.
 *  · **Un rechargement de secours** si le `controllerchange` n'arrive pas
 *    (worker en attente devenu redondant entre l'annonce et le clic) : un
 *    bouton sans effet serait un contrôle mort (loi 4).
 *  · **Le socket n'est pas déconnecté avant le rechargement.** Le legacy le
 *    fait pour empêcher `handleAuthenticationFailure → logout` de purger sa
 *    session ; la v2 n'efface la session que sur `auth:token-expired` /
 *    `auth:session-revoked` servis par le serveur (`lib/api/socket.ts:415-416`),
 *    jamais sur une coupure de transport — et le rechargement ferme le socket.
 */

export const SW_SCRIPT_URL = '/sw.js';

/* RÉEXPORTÉ pour que ce module reste l'API lisible du legacy ; il VIT dans
   `event.ts`, sans dépendance — voir son doc-comment (chunks séparés). */
export { SW_UPDATE_AVAILABLE_EVENT };

/** Le message que le service worker généré par Workbox attend pour `skipWaiting()`. */
export const SKIP_WAITING_MESSAGE = { type: 'SKIP_WAITING' } as const;

/** Le battement du legacy (`service-worker-registration.ts:222`). */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Le délai au-delà duquel on recharge sans avoir vu le `controllerchange`.
 * Assez long pour qu'une activation normale gagne toujours la course, assez
 * court pour qu'un clic reste un geste qui aboutit.
 */
export const CONTROLLER_CHANGE_FALLBACK_MS = 4_000;

export type WorkerLike = {
  readonly state: string;
  postMessage(message: unknown): void;
  addEventListener(type: 'statechange', listener: () => void): void;
};

export type RegistrationLike = {
  readonly installing: WorkerLike | null;
  readonly waiting: WorkerLike | null;
  addEventListener(type: 'updatefound', listener: () => void): void;
  update(): Promise<unknown>;
};

export type ContainerLike = {
  readonly controller: unknown;
  /**
   * **`undefined` EST UNE RÉPONSE POSSIBLE, et la signature du DOM le nie.**
   * Sous une politique qui REFUSE les service workers — celle que quatre gates
   * du dépôt posent (`serviceWorkers: 'block'`, `check-story-scene.mjs` en
   * tête), et que des navigateurs appliquent aussi en navigation privée —
   * `register()` ne rejette pas : il résout SANS inscription. Lire `.waiting`
   * sur cette valeur levait un `TypeError` sur chaque page (mesuré : 4 gates
   * rouges, 16 erreurs de page). Le type dit donc la vérité plutôt que le
   * contrat officiel.
   */
  register(
    url: string,
    options: { readonly scope: string; readonly updateViaCache: 'none' },
  ): Promise<RegistrationLike | undefined>;
  addEventListener(type: 'controllerchange', listener: () => void): void;
};

export type CacheStorageLike = {
  keys(): Promise<readonly string[]>;
  delete(cacheName: string): Promise<boolean>;
};

export type VisibilityHost = {
  readonly visibilityState: string;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
};

export type EventHost = {
  addEventListener(type: 'focus', listener: () => void): void;
  dispatchEvent(event: Event): boolean;
};

export type AppUpdateEnvironment = {
  /** `navigator.serviceWorker` — ABSENT sur un navigateur qui n'en a pas, et dans la coque. */
  readonly container: ContainerLike | undefined;
  readonly host: EventHost;
  readonly document: VisibilityHost;
  readonly caches: CacheStorageLike | undefined;
  readonly reload: () => void;
  readonly discardPersistedCache: () => void;
  readonly setInterval: (handler: () => void, ms: number) => void;
  readonly setTimeout: (handler: () => void, ms: number) => void;
  readonly onError: (error: unknown) => void;
};

export type AppUpdateController = {
  /** L'inscription plus les trois déclencheurs de vérification. */
  register(): Promise<RegistrationLike | null>;
  /** `registration.update()` à la demande — le legacy l'appelle `triggerManualUpdateCheck`. */
  checkForUpdate(): Promise<void>;
  /** Le clic « Mettre à jour » : purge, activation, UN rechargement. */
  applyUpdate(registration: RegistrationLike): Promise<void>;
};

/**
 * Efface les seaux du Cache Storage que l'application POSSÈDE, et eux seuls
 * (`lib/sw-caches.ts` porte la frontière et la raison). Best-effort : un
 * stockage qui refuse la lecture ne doit pas empêcher la suite.
 */
export async function purgeOwnedCacheStorage(storage: CacheStorageLike | undefined): Promise<void> {
  if (storage === undefined) return;
  try {
    const names = await storage.keys();
    await Promise.allSettled(names.filter(isAppOwnedCache).map((name) => storage.delete(name)));
  } catch {
    /* Stockage indisponible (navigation privée, quota, permission) : rien à purger. */
  }
}

function announce(env: AppUpdateEnvironment, registration: RegistrationLike): void {
  env.host.dispatchEvent(new CustomEvent(SW_UPDATE_AVAILABLE_EVENT, { detail: { registration } }));
}

export function createAppUpdateController(env: AppUpdateEnvironment): AppUpdateController {
  let registration: RegistrationLike | null = null;
  /** La page repart-elle ? Un seul rechargement, quel que soit le signal qui l'ordonne. */
  let leaving = false;
  let discarded = false;

  /**
   * Le cache de requêtes de la version qui s'en va, jeté UNE fois — appelé au
   * clic (avec la purge des seaux) et sur le `controllerchange` d'un autre
   * onglet. Il ferme la porte que `query-client.ts` laisse ouverte : sa
   * persistance est câblée sur `pagehide` et `visibilitychange`, tous deux
   * déclenchés PAR le rechargement.
   */
  const discardPersisted = (): void => {
    if (discarded) return;
    discarded = true;
    env.discardPersistedCache();
  };

  const leave = (): void => {
    if (leaving) return;
    leaving = true;
    discardPersisted();
    env.reload();
  };

  const check = async (): Promise<void> => {
    if (registration === null) return;
    try {
      await registration.update();
    } catch (error) {
      env.onError(error);
    }
  };

  const watchInstalling = (worker: WorkerLike, owner: RegistrationLike): void => {
    worker.addEventListener('statechange', () => {
      /* `controller` NON NUL : sans lui, c'est la PREMIÈRE installation — il n'y
         a aucune version précédente à remplacer, donc rien à annoncer. */
      if (worker.state === 'installed' && env.container?.controller != null) announce(env, owner);
    });
  };

  return {
    async register(): Promise<RegistrationLike | null> {
      const container = env.container;
      if (container === undefined) return null;
      /* LU AVANT TOUT : après l'inscription, la première installation peut déjà
         avoir réclamé la page, et « cette page était-elle contrôlée ? » n'aurait
         plus de réponse fiable. */
      const wasControlled = container.controller != null;

      let inscrite: RegistrationLike | undefined;
      try {
        inscrite = await container.register(SW_SCRIPT_URL, { scope: '/', updateViaCache: 'none' });
      } catch (error) {
        env.onError(error);
        return null;
      }
      /* PAS une erreur, PAS une inscription : la politique du navigateur a
         refusé (voir `ContainerLike.register`). Rien à surveiller, rien à
         annoncer, et surtout rien à journaliser — ce n'est pas un défaut. */
      if (inscrite === undefined) return null;
      registration = inscrite;
      const active = inscrite;

      if (active.waiting !== null && wasControlled) announce(env, active);

      active.addEventListener('updatefound', () => {
        const installing = active.installing;
        if (installing === null) return;
        watchInstalling(installing, active);
      });

      container.addEventListener('controllerchange', () => {
        /* Une page que personne ne contrôlait vient d'être réclamée par une
           PREMIÈRE installation : il n'y a pas de version à remplacer. Une page
           déjà contrôlée, elle, est servie par un worker qui n'a plus ses
           chunks — elle repart, qu'elle ait cliqué ou qu'un autre onglet l'ait
           fait pour elle. */
        if (!wasControlled) return;
        leave();
      });

      env.host.addEventListener('focus', () => void check());
      env.document.addEventListener('visibilitychange', () => {
        if (env.document.visibilityState === 'visible') void check();
      });
      env.setInterval(() => {
        /* Zéro requête depuis un onglet caché : le retour au premier plan
           vérifie déjà, et un onglet en arrière-plan ne peut rien montrer. */
        if (env.document.visibilityState !== 'visible') return;
        void check();
      }, UPDATE_CHECK_INTERVAL_MS);

      await check();
      return active;
    },

    checkForUpdate: check,

    async applyUpdate(target: RegistrationLike): Promise<void> {
      await purgeOwnedCacheStorage(env.caches);
      discardPersisted();

      const waiting = target.waiting;
      if (waiting === null) {
        /* Aucun worker en attente (devenu redondant, ou déjà activé ailleurs) :
           il n'y a rien à réveiller, la version neuve est déjà celle du worker
           actif — on va la chercher par un rechargement. */
        leave();
        return;
      }

      try {
        waiting.postMessage(SKIP_WAITING_MESSAGE);
      } catch (error) {
        env.onError(error);
        leave();
        return;
      }
      env.setTimeout(leave, CONTROLLER_CHANGE_FALLBACK_MS);
    },
  };
}

/**
 * L'ENVIRONNEMENT RÉEL — la seule fonction de ce module qui touche aux globales.
 */
export function browserAppUpdateEnvironment(): AppUpdateEnvironment {
  return {
    container: 'serviceWorker' in navigator ? (navigator.serviceWorker as unknown as ContainerLike) : undefined,
    host: window,
    document,
    caches: 'caches' in globalThis ? (globalThis.caches as unknown as CacheStorageLike) : undefined,
    reload: () => window.location.reload(),
    discardPersistedCache: () => appQueryClient.discardPersisted(),
    setInterval: (handler, ms) => {
      window.setInterval(handler, ms);
    },
    setTimeout: (handler, ms) => {
      window.setTimeout(handler, ms);
    },
    onError: (error) => {
      console.warn('[app-update]', error);
    },
  };
}

let shared: AppUpdateController | null = null;

/**
 * LE CONTRÔLEUR DE LA PAGE — un seul, pour que « cette page repart » reste UN
 * fait. `main.tsx` l'inscrit, la bannière lui applique la mise à jour.
 */
export function appUpdateController(): AppUpdateController {
  shared ??= createAppUpdateController(browserAppUpdateEnvironment());
  return shared;
}
