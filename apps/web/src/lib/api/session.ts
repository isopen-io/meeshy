import { createStore, type StoreApi } from 'zustand/vanilla';

import type { User } from '@meeshy/shared/types/user';

import { safeLocalStorage } from '../storage';

import { claimLegacySession } from './legacy-session';

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

/**
 * `systemLanguage` / `regionalLanguage` / `customDestinationLanguage`
 * (#5650, F6) — les TROIS rangs du Prisme que la connexion SERT
 * (`formatUserResponse`, `services/gateway/src/routes/auth/types.ts:146-148`)
 * et que `resolveReaderLanguages()` (`lib/reader.ts`) consomme. Optionnels :
 * une session PERSISTÉE d'avant ce lot ne les porte pas (Q6, `staging.md`),
 * et `pickSessionUser` ne les écrit que quand ils sont PRÉSENTS — même garde
 * que `displayName`/`avatar`.
 */
export type SessionUser = Pick<User, 'id' | 'username' | 'displayName' | 'avatar'> &
  Partial<Pick<User, 'systemLanguage' | 'regionalLanguage'>> & {
    /** `string | null` — la charge servie porte `null` sur un compte sans
     * destination personnalisée (`formatUserResponse`, Prisma nullable) ;
     * `User.customDestinationLanguage` ne le déclare pas (optional string
     * seul), un écart déjà présent ailleurs dans le dépôt que ce fichier
     * n'a pas vocation à corriger — il se contente de ne pas y échouer. */
    readonly customDestinationLanguage?: string | null;
  };

/** La branche « second facteur attendu » ne porte AUCUN jeton d'accès —
 * seuls les champs que `login.ts:145-158` sert avant vérification. */
export type PendingUser = Pick<User, 'id' | 'username' | 'email' | 'firstName' | 'lastName' | 'displayName' | 'avatar'>;

/**
 * **QUI EST L'INVITÉ D'UN LIEN** (#5561) — tout ce que la v2 retient de
 * quelqu'un qui n'a pas de compte, et rien de plus.
 *
 * Pas de `SessionUser` : un invité n'a ni identifiant de compte, ni e-mail, ni
 * langues du Prisme à porter. Il a un pseudo affiché, un participant dans UNE
 * conversation, et le lien par lequel il est entré — ce dernier parce que la
 * session d'invité est liée à SON lien (`GET /links/:identifier/messages` rend
 * 403 pour la session d'un autre lien) : sans lui, on ne saurait pas quelle
 * porte rejouer.
 *
 * `mayWrite` est l'instantané SERVI à la jonction (`entry.rights.canSendMessages`).
 * Il gouverne ce que l'écran OFFRE ; la passerelle reste l'autorité, et le fil
 * relit les droits résolus (`PATCH /guest-sessions/me`).
 */
export type GuestIdentity = {
  readonly participantId: string | null;
  readonly nickname: string;
  readonly conversationId: string;
  readonly link: string;
  readonly mayWrite: boolean;
};

export type SessionState =
  | { readonly status: 'anonymous' }
  | { readonly status: 'pending2fa'; readonly twoFactorToken: string; readonly user: PendingUser }
  /**
   * L'INVITÉ D'UN LIEN — le régime `X-Session-Token`, jamais `Authorization`
   * (`http.ts § Credential` : présenter un jeton d'invité en Bearer fait
   * répondre « Invalid JWT token »). Il ne porte AUCUN `token`.
   */
  | {
      readonly status: 'guest';
      readonly sessionToken: string;
      readonly guest: GuestIdentity;
      readonly expiresAt: number;
    }
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

/**
 * LES CHAMPS DE SOI QU'UNE ÉDITION DE PROFIL FAIT VOYAGER JUSQU'À LA SESSION
 * (#6289) — exactement ceux que `SessionUser` porte au-delà de l'identité, et
 * rien d'autre : la bio, la bannière et les contacts vivent dans le cache du
 * profil, jamais dans le `localStorage` de la session (règle 1 ci-dessus).
 *
 * `undefined` = champ non touché ; `null` = champ EFFACÉ (une langue régionale
 * retirée quitte le Prisme). `customDestinationLanguage` garde son `null`, que
 * la connexion sert déjà sous cette forme.
 */
export type SessionProfileFields = {
  readonly displayName?: string | null;
  readonly avatar?: string | null;
  readonly systemLanguage?: string;
  readonly regionalLanguage?: string | null;
  readonly customDestinationLanguage?: string | null;
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
  /**
   * OUVRE UNE SESSION D'INVITÉ (#5561). Aucune `expiresIn` n'est servie par la
   * porte de jonction : l'horizon est posé ICI, côté client
   * ({@link GUEST_SESSION_HOURS}), et c'est une GARDE, jamais une vérité —
   * le serveur reste l'autorité, un 401 ferme la session avant l'échéance.
   * Sans horizon, l'entrée serait CORROMPUE au sens de ce module (règle 2).
   */
  establishGuest(payload: { readonly sessionToken: string; readonly guest: GuestIdentity }): void;
  beginTwoFactor(payload: { readonly user: PendingUser; readonly twoFactorToken: string }): void;
  /** Applique une édition de profil à la session TENUE, et la persiste —
   * projetée comme à l'`establish`. Sans effet hors d'une session
   * authentifiée : il n'y a pas de soi à modifier. */
  updateUser(fields: SessionProfileFields): void;
  restoreSession(): void;
  clearSession(): void;
};

export type SessionStoreApi = StoreApi<SessionStoreState>;

const STORAGE_KEY = 'meeshy.session';

/**
 * L'HORIZON D'UNE SESSION D'INVITÉ — la valeur du legacy
 * (`authManager.setAnonymousSession(token, id, 24)`), reprise pour que la
 * bascule ne raccourcisse ni n'allonge ce que les invités connaissaient.
 */
export const GUEST_SESSION_HOURS = 24;

/** Une entrée écrite AVANT #5561 ne porte pas `kind` : elle est un compte.
 * L'absence est donc la valeur par défaut, jamais une corruption. */
type PersistedAccount = {
  readonly kind?: 'account';
  readonly token: string;
  readonly sessionToken: string;
  readonly user: SessionUser;
  readonly expiresAt: number;
};

type PersistedGuest = {
  readonly kind: 'guest';
  readonly sessionToken: string;
  readonly guest: GuestIdentity;
  readonly expiresAt: number;
};

type PersistedSession = PersistedAccount | PersistedGuest;

/** La PROJECTION — un objet NEUF, jamais celui reçu du réseau : les champs
 * absents ne deviennent pas des clés `undefined`, et rien d'autre ne suit. */
function pickSessionUser(user: SessionUser): SessionUser {
  return {
    id: user.id,
    username: user.username,
    ...(user.displayName !== undefined ? { displayName: user.displayName } : {}),
    ...(user.avatar !== undefined ? { avatar: user.avatar } : {}),
    ...(user.systemLanguage !== undefined ? { systemLanguage: user.systemLanguage } : {}),
    ...(user.regionalLanguage !== undefined ? { regionalLanguage: user.regionalLanguage } : {}),
    ...(user.customDestinationLanguage !== undefined
      ? { customDestinationLanguage: user.customDestinationLanguage }
      : {}),
  };
}

/** La MÊME discipline pour l'invité (règle 1) : un objet NEUF, cinq champs, et
 * rien de ce que la charge de jonction transporte à côté. */
function pickGuest(guest: GuestIdentity): GuestIdentity {
  return {
    participantId: guest.participantId,
    nickname: guest.nickname,
    conversationId: guest.conversationId,
    link: guest.link,
    mayWrite: guest.mayWrite,
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
/** Un invité SANS conversation ni lien ne peut rien rejouer : l'entrée est
 * corrompue, jamais une session à moitié restaurée. */
function isGuestIdentity(value: unknown): value is GuestIdentity {
  if (typeof value !== 'object' || value === null) return false;
  const g = value as Record<string, unknown>;
  if (typeof g.nickname !== 'string') return false;
  if (typeof g.conversationId !== 'string' || g.conversationId === '') return false;
  if (typeof g.link !== 'string' || g.link === '') return false;
  if (typeof g.mayWrite !== 'boolean') return false;
  return g.participantId === null || typeof g.participantId === 'string';
}

function isPersistedSession(value: unknown): value is PersistedSession {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.sessionToken !== 'string') return false;
  if (typeof v.expiresAt !== 'number' || !Number.isFinite(v.expiresAt)) return false;
  /* Un invité EXIGE un jeton non vide : c'est sa seule créance. Un compte, lui,
     peut en porter un vide — la reprise du legacy en écrit un quand le legacy
     n'en avait pas (`legacy-session.ts:148`), et son `token` suffit. */
  if (v.kind === 'guest') return v.sessionToken !== '' && isGuestIdentity(v.guest);
  if (typeof v.token !== 'string') return false;
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
 * LA BASCULE DE meeshy.me NE DÉCONNECTE PERSONNE (#6702). Quand
 * `meeshy.session` est ABSENTE, la session laissée par le legacy
 * (`legacy-session.ts`) devient une entrée `meeshy.session`, projetée comme à
 * l'`establish` — puis passe par la MÊME restauration que toute autre : forme,
 * échéance, projection. Une entrée v2 présente a toujours le dernier mot.
 */
function adoptLegacySession(storage: SessionStorage, now: number): void {
  const legacy = claimLegacySession(storage, now);
  if (legacy !== null) persist(storage, { ...legacy, user: pickSessionUser(legacy.user) });
}

export type SessionStoreOptions = {
  readonly storage?: SessionStorage;
  readonly now?: () => number;
};

/** `undefined` garde la valeur tenue, `null` l'EFFACE — la clé disparaît
 * alors de l'utilisateur plutôt que d'y rester vide. */
const nextOptional = (value: string | null | undefined, current: string | undefined): string | undefined =>
  value === undefined ? current : (value ?? undefined);

function withProfileFields(user: SessionUser, fields: SessionProfileFields): SessionUser {
  const displayName = nextOptional(fields.displayName, user.displayName);
  const avatar = nextOptional(fields.avatar, user.avatar);
  const systemLanguage = fields.systemLanguage ?? user.systemLanguage;
  const regionalLanguage = nextOptional(fields.regionalLanguage, user.regionalLanguage);
  const customDestinationLanguage =
    fields.customDestinationLanguage === undefined ? user.customDestinationLanguage : fields.customDestinationLanguage;
  return {
    id: user.id,
    username: user.username,
    ...(displayName === undefined ? {} : { displayName }),
    ...(avatar === undefined ? {} : { avatar }),
    ...(systemLanguage === undefined ? {} : { systemLanguage }),
    ...(regionalLanguage === undefined ? {} : { regionalLanguage }),
    ...(customDestinationLanguage === undefined ? {} : { customDestinationLanguage }),
  };
}

export function createSessionStore(options: SessionStoreOptions = {}): SessionStoreApi {
  const storage = options.storage ?? safeLocalStorage();
  const now = options.now ?? (() => Date.now());

  return createStore<SessionStoreState>((set, get) => ({
    session: { status: 'anonymous' },
    establish: ({ user, token, sessionToken, expiresIn }) => {
      const projected = pickSessionUser(user);
      const expiresAt = now() + expiresIn * 1000;
      persist(storage, { user: projected, token, sessionToken, expiresAt });
      set({ session: { status: 'authenticated', user: projected, token, sessionToken, expiresAt } });
    },
    establishGuest: ({ sessionToken, guest }) => {
      const projected = pickGuest(guest);
      const expiresAt = now() + GUEST_SESSION_HOURS * 60 * 60 * 1000;
      persist(storage, { kind: 'guest', sessionToken, guest: projected, expiresAt });
      set({ session: { status: 'guest', sessionToken, guest: projected, expiresAt } });
    },
    beginTwoFactor: ({ user, twoFactorToken }) => {
      set({ session: { status: 'pending2fa', user: pickPendingUser(user), twoFactorToken } });
    },
    updateUser: (fields) => {
      const current = get().session;
      if (current.status !== 'authenticated') return;
      const user = pickSessionUser(withProfileFields(current.user, fields));
      persist(storage, { user, token: current.token, sessionToken: current.sessionToken, expiresAt: current.expiresAt });
      set({ session: { ...current, user } });
    },
    restoreSession: () => {
      if (readPersisted(storage) === 'absent') adoptLegacySession(storage, now());
      const persisted = readPersisted(storage);
      if (persisted === 'absent') return;
      if (persisted === 'corrupted' || persisted.expiresAt <= now()) {
        purge(storage);
        return;
      }
      if (persisted.kind === 'guest') {
        set({
          session: {
            status: 'guest',
            sessionToken: persisted.sessionToken,
            guest: pickGuest(persisted.guest),
            expiresAt: persisted.expiresAt,
          },
        });
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
