import { createStore, type StoreApi } from 'zustand/vanilla';

import type { User } from '@meeshy/shared/types/user';

/**
 * LE MAGASIN DE SESSION (#5605, T3) — UNE source, motif `conversation-store.ts`
 * (`zustand/vanilla` : observable HORS de tout composant, sans DOM).
 *
 * Miroir `AuthManager`/`SessionSnapshotStore` (Swift), adapté au web : pas de
 * Keychain — `localStorage`, assumé (README § 9 Q7). `clearSession()` est le
 * miroir de `SessionSnapshotStore.wipe()` : idempotent, et — comme lui — la
 * PREMIÈRE opération d'un logout (`auth.ts#logout`), jamais une conséquence
 * du réseau.
 *
 * `storage` ET `now` INJECTABLES : les défauts réels (`localStorage`,
 * `Date.now`) ne sont résolus QU'À LA CRÉATION du magasin
 * (`createSessionStore()`, sans argument), jamais relus par un témoin qui
 * passe les siens.
 *
 * DEUX RÈGLES QUE LE TYPE NE SUFFIT PAS À TENIR :
 *
 * 1. LA PROJECTION. `SessionUser` déclare quatre champs, mais TypeScript est
 *    STRUCTUREL : il n'en RETIRE aucun à l'exécution. La charge servie par
 *    `login.ts:206` est `formatUserResponse(user, permissions)`
 *    (`services/gateway/src/routes/auth/types.ts:131-165`) — vingt-sept
 *    champs, dont `email`, `phoneNumber`, `role`, `lastLoginIp`,
 *    `lastLoginLocation`, `permissions`. Persister l'objet REÇU écrirait tout
 *    cela dans le `localStorage` du lecteur, durablement. Ce module PROJETTE
 *    donc à l'entrée, une fois, pour les deux états qui portent un
 *    utilisateur — c'est la doctrine du cycle 125 (« une protection se mesure
 *    sur tout ce que la charge TRANSPORTE ») appliquée au stockage.
 *
 * 2. L'ÉCHÉANCE. Le jeton servi porte sa durée (`expiresIn`, `login.ts:211` —
 *    24 h, ou 365 j sous `rememberDevice`). Restaurer une session périmée
 *    présenterait un écran authentifié que le premier 401 défait aussitôt :
 *    « la session est tenue » deviendrait un état de plus, pas une session.
 *    Une entrée SANS échéance est CORROMPUE — jamais « valide pour toujours ».
 */

export type SessionUser = Pick<User, 'id' | 'username' | 'displayName' | 'avatar'>;

/** La branche « second facteur attendu » ne porte AUCUN jeton d'accès —
 * seuls les champs que `login.ts:145-158` sert avant vérification. */
export type PendingUser = Pick<User, 'id' | 'username' | 'email' | 'firstName' | 'lastName' | 'displayName' | 'avatar'>;

export type SessionState =
  | { readonly status: 'anonymous' }
  | { readonly status: 'pending2fa'; readonly twoFactorToken: string; readonly user: PendingUser }
  | {
      readonly status: 'authenticated';
      readonly user: SessionUser;
      readonly token: string;
      readonly sessionToken: string;
      /** Horodatage epoch ms — `Date.now() + expiresIn × 1000` au moment où
       * la passerelle a servi le jeton. Lu par la restauration, et par le
       * rafraîchissement proactif quand il viendra (miroir
       * `AuthManager.swift:741`). */
      readonly expiresAt: number;
    };

export type SessionStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type SessionStoreState = {
  readonly session: SessionState;
  establish(payload: {
    readonly user: SessionUser;
    readonly token: string;
    readonly sessionToken: string;
    /** Secondes, tel que la passerelle le sert (`login.ts:211`,
     * `login.ts:339-346`) — jamais une échéance déjà calculée : deux sites
     * qui la calculent divergeraient. */
    readonly expiresIn: number;
  }): void;
  beginTwoFactor(payload: { readonly user: PendingUser; readonly twoFactorToken: string }): void;
  restoreSession(): void;
  clearSession(): void;
};

export type SessionStoreApi = StoreApi<SessionStoreState>;

const STORAGE_KEY = 'meeshy.session';

type PersistedSession = {
  readonly token: string;
  readonly sessionToken: string;
  readonly user: SessionUser;
  readonly expiresAt: number;
};

/** La PROJECTION — un objet NEUF, jamais celui reçu du réseau : les champs
 * absents ne deviennent pas des clés `undefined`, et rien d'autre ne suit. */
function pickSessionUser(user: SessionUser): SessionUser {
  return {
    id: user.id,
    username: user.username,
    ...(user.displayName !== undefined ? { displayName: user.displayName } : {}),
    ...(user.avatar !== undefined ? { avatar: user.avatar } : {}),
  };
}

/** Idem pour la branche « second facteur » — les sept champs de
 * `login.ts:145-158`, pas un de plus. */
function pickPendingUser(user: PendingUser): PendingUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    ...(user.displayName !== undefined ? { displayName: user.displayName } : {}),
    ...(user.avatar !== undefined ? { avatar: user.avatar } : {}),
  };
}

/** FAIL-CLOSED : toute forme qui ne correspond pas exactement à l'attendu
 * (JSON non-objet, jeton manquant, utilisateur non identifiable) rend
 * `false` — jamais une exception, jamais une session à moitié restaurée
 * (même doctrine que `preferenceEntryOf`, `api/preferences.ts:40-48`). */
function isPersistedSession(value: unknown): value is PersistedSession {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.token !== 'string' || typeof v.sessionToken !== 'string') return false;
  if (typeof v.expiresAt !== 'number' || !Number.isFinite(v.expiresAt)) return false;
  if (typeof v.user !== 'object' || v.user === null) return false;
  const user = v.user as Record<string, unknown>;
  return typeof user.id === 'string' && typeof user.username === 'string';
}

function readPersisted(storage: SessionStorage): PersistedSession | 'absent' | 'corrupted' {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return 'absent';
  }
  if (raw === null) return 'absent';
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return 'corrupted';
  }
  return isPersistedSession(parsed) ? parsed : 'corrupted';
}

function persist(storage: SessionStorage, session: PersistedSession): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* Stockage refusé : la session tient pour l'onglet, sans se souvenir
     * (même doctrine que `scheme.ts#setScheme`). */
  }
}

function purge(storage: SessionStorage): void {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* idem */
  }
}

/**
 * `localStorage` réel — seul point d'accès au global, résolu paresseusement
 * pour qu'un contexte sans DOM (bun test import d'un consommateur, rendu
 * institutionnel préchauffé) ne fasse jamais échouer l'IMPORT du module :
 * seule la création SANS storage explicite le sollicite, et elle retombe en
 * mémoire si l'accès échoue (navigation privée stricte, `localStorage`
 * absent).
 */
function browserStorage(): SessionStorage {
  try {
    const probe = '__meeshy_session_probe__';
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

export type SessionStoreOptions = {
  readonly storage?: SessionStorage;
  readonly now?: () => number;
};

export function createSessionStore(options: SessionStoreOptions = {}): SessionStoreApi {
  const storage = options.storage ?? browserStorage();
  const now = options.now ?? (() => Date.now());

  return createStore<SessionStoreState>((set) => ({
    session: { status: 'anonymous' },
    establish: ({ user, token, sessionToken, expiresIn }) => {
      const projected = pickSessionUser(user);
      const expiresAt = now() + expiresIn * 1000;
      persist(storage, { user: projected, token, sessionToken, expiresAt });
      set({ session: { status: 'authenticated', user: projected, token, sessionToken, expiresAt } });
    },
    beginTwoFactor: ({ user, twoFactorToken }) => {
      set({ session: { status: 'pending2fa', user: pickPendingUser(user), twoFactorToken } });
    },
    restoreSession: () => {
      const persisted = readPersisted(storage);
      if (persisted === 'absent') return;
      if (persisted === 'corrupted' || persisted.expiresAt <= now()) {
        purge(storage);
        return;
      }
      set({
        session: {
          status: 'authenticated',
          user: pickSessionUser(persisted.user),
          token: persisted.token,
          sessionToken: persisted.sessionToken,
          expiresAt: persisted.expiresAt,
        },
      });
    },
    clearSession: () => {
      purge(storage);
      set({ session: { status: 'anonymous' } });
    },
  }));
}

/** L'UNIQUE instance que l'application partage — `auth.ts`, `dev-harness.ts`
 * et, demain, le socket temps réel (#5494) et tout écran. */
export const sessionStore = createSessionStore();
