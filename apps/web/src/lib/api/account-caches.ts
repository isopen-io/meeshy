import { forgetCallJournal } from '../calls/call-network-journal-keys';
import { SW_RUNTIME_CACHE_NAMES } from '../sw-caches';
import { safeLocalStorage, type SafeStorage } from '../storage';

import type { SessionStoreApi } from './session';

/**
 * L'ÉTAGÈRE DES CACHES DE COMPTE (#8674) — le cache de requêtes d'un compte
 * QUITTÉ, rangé sous SA clé, pour qu'y revenir repeigne ses écrans à
 * l'instant puis ne resynchronise que l'écart.
 *
 * Même partage que le coffre des jetons (`accounts.ts`, D-142) : le cache
 * ACTIF vit seul sous `meeshy.query-cache` (`query-client.ts`) ; l'étagère ne
 * porte que les comptes NON actifs. Quitter un compte y RANGE son cache, y
 * revenir le REPREND (et l'en retire). Aucun compte ne lit donc jamais la clé
 * d'un autre : l'identité est dans le NOM de la clé, et le `buster` de
 * l'entrée (version, schéma, origine de l'API, compte) la revérifie.
 *
 * BORNÉE : {@link MAX_SHELVED_ACCOUNTS} comptes, le moins récemment quitté
 * part le premier ; un stockage plein fait de la place en retirant les
 * autres plutôt que d'échouer à ranger le compte qu'on quitte. Effacée à la
 * DÉCONNEXION du compte et à la RÉVOCATION de sa session
 * ({@link forgetAccountCaches}) — changer de compte, lui, la garde.
 */

export const ACCOUNT_CACHE_PREFIX = 'meeshy.query-cache.u_';
const INDEX_KEY = 'meeshy.query-cache.accounts';
export const MAX_SHELVED_ACCOUNTS = 3;

export const shelfKeyOf = (userId: string): string => `${ACCOUNT_CACHE_PREFIX}${userId}`;

export type AccountCacheShelf = {
  /** Range le cache sérialisé d'un compte qu'on quitte — le plus récent en tête. */
  put(userId: string, payload: string): void;
  /** Reprend le cache d'un compte qui redevient actif, et l'en retire. */
  take(userId: string): string | null;
  forget(userId: string): void;
  forgetAll(): void;
  /** Du plus récemment quitté au plus ancien. */
  list(): readonly string[];
};

function readIndex(storage: SafeStorage): readonly string[] {
  try {
    const raw = storage.getItem(INDEX_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string' && id !== '') : [];
  } catch {
    return [];
  }
}

function writeIndex(storage: SafeStorage, ids: readonly string[]): void {
  try {
    if (ids.length === 0) storage.removeItem(INDEX_KEY);
    else storage.setItem(INDEX_KEY, JSON.stringify(ids));
  } catch {
    /* Stockage refusé : l'étagère vaut pour l'onglet. */
  }
}

function remove(storage: SafeStorage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    /* rien à effacer */
  }
}

function tryWrite(storage: SafeStorage, key: string, value: string): boolean {
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function createAccountCacheShelf(storage: SafeStorage): AccountCacheShelf {
  const drop = (userId: string): void => {
    remove(storage, shelfKeyOf(userId));
    writeIndex(storage, readIndex(storage).filter((id) => id !== userId));
  };

  return {
    put: (userId, payload) => {
      const others = readIndex(storage).filter((id) => id !== userId);
      /* Stockage plein : on fait de la place en retirant les comptes quittés
         depuis le plus longtemps, plutôt que de perdre celui qu'on quitte. */
      const evicted: string[] = [];
      let written = tryWrite(storage, shelfKeyOf(userId), payload);
      for (const victim of [...others].reverse()) {
        if (written) break;
        remove(storage, shelfKeyOf(victim));
        evicted.push(victim);
        written = tryWrite(storage, shelfKeyOf(userId), payload);
      }
      const remaining = others.filter((id) => !evicted.includes(id));
      const next = written ? [userId, ...remaining] : remaining;
      next.slice(MAX_SHELVED_ACCOUNTS).forEach((id) => remove(storage, shelfKeyOf(id)));
      writeIndex(storage, next.slice(0, MAX_SHELVED_ACCOUNTS));
    },
    take: (userId) => {
      let raw: string | null = null;
      try {
        raw = storage.getItem(shelfKeyOf(userId));
      } catch {
        raw = null;
      }
      drop(userId);
      return raw;
    },
    forget: drop,
    forgetAll: () => {
      readIndex(storage).forEach((id) => remove(storage, shelfKeyOf(id)));
      writeIndex(storage, []);
    },
    list: () => readIndex(storage),
  };
}

export type CacheStorageLike = {
  keys(): Promise<readonly string[]>;
  delete(cacheName: string): Promise<boolean>;
};

/**
 * `purgeReaderCaches` — LES SEAUX DU SERVICE WORKER QUI PORTENT DE LA DONNÉE
 * DE LECTEUR (`api`, `medias`, `sw-caches.ts`) ; le précache (le shell, le même
 * pour tous) n'y est pas.
 *
 * Le seau `api` range désormais chaque réponse sous l'identité qui l'a
 * demandée (`net/api-cache-identity.ts`) : un compte ne peut plus y lire la
 * réponse d'un autre, et changer de compte ne le purge donc plus. Ce qui le
 * purge est la FIN d'un compte sur l'appareil — sa déconnexion, la révocation
 * de sa session ({@link forgetAccountCaches}). Best-effort et silencieuse :
 * une purge qui échoue ne doit pas empêcher la déconnexion, qui a déjà retiré
 * le jeton.
 */
export function purgeReaderCaches(storage?: CacheStorageLike): void {
  const store = storage ?? (globalThis as { caches?: CacheStorageLike }).caches;
  if (store === undefined) return;
  void store
    .keys()
    .then((names) =>
      Promise.all(names.filter((name) => SW_RUNTIME_CACHE_NAMES.includes(name)).map((name) => store.delete(name))),
    )
    .catch(() => undefined);
}

/**
 * LA FIN D'UN COMPTE SUR L'APPAREIL (#8674) — déconnexion, session révoquée ou
 * expirée : son cache rangé part, son journal réseau d'appels (#8698) aussi,
 * et les seaux du service worker avec eux.
 * Changer de compte n'appelle jamais ceci.
 */
export function forgetAccountCaches({
  userId,
  storage,
  cacheStorage,
}: {
  readonly userId: string;
  readonly storage?: SafeStorage;
  readonly cacheStorage?: CacheStorageLike;
}): void {
  const local = storage ?? safeLocalStorage();
  createAccountCacheShelf(local).forget(userId);
  forgetCallJournal(local, userId);
  purgeReaderCaches(cacheStorage);
}

/**
 * LA SESSION COURANTE EST REFUSÉE (401 sur son jeton, `auth:session-revoked`
 * du socket) — elle finit, et ce que l'appareil gardait d'elle part avec.
 * L'ordre compte : `clearSession()` fait d'abord ranger le cache du compte
 * par `query-client.ts`, que l'oubli retire aussitôt.
 */
export function endRevokedSession(
  store: SessionStoreApi,
  deps: { readonly storage?: SafeStorage; readonly cacheStorage?: CacheStorageLike } = {},
): void {
  const current = store.getState().session;
  /* Sous une identité anonyme TENUE par un compte (#8816), le 401 a refusé
     le jeton de l'INVITÉ : c'est lui qui finit, le compte reste. */
  if (current.status === 'guest' && current.account !== undefined) {
    store.getState().dropAnonymous(current.guest.conversationId);
    return;
  }
  const userId = current.status === 'authenticated' ? current.user.id : null;
  store.getState().clearSession();
  if (userId !== null) forgetAccountCaches({ userId, ...deps });
}
