import * as z from 'zod/mini';

import type { SessionStorage, SessionStoreApi, SessionUser } from './session';

/**
 * PLUSIEURS COMPTES SUR L'APPAREIL (#8286, D-142) — le COFFRE des comptes et
 * la BASCULE, miroir de `SavedAccount` + `AuthManager+Accounts.swift`.
 *
 * Le coffre LISTE les comptes connus de l'appareil (avatar, nom, @pseudo) et
 * garde les jetons des comptes GARDÉS qui ne sont pas actifs. Le magasin de
 * session (`session.ts`) reste l'UNIQUE porteur de la session active : ses
 * jetons ne dorment jamais ici. D'où les deux gestes qui les font passer d'un
 * côté à l'autre — quitter un compte les RANGE (s'il est gardé), y revenir les
 * REPREND. Aucun abonnement au magasin : une session qui meurt (déconnexion,
 * 401) ne laisse donc aucun jeton derrière elle dans le coffre.
 */

export type PreservedSession = {
  readonly token: string;
  readonly sessionToken: string;
  readonly expiresAt: number;
};

export type DeviceAccount = {
  readonly user: SessionUser;
  /** La session de ce compte survit-elle quand on le quitte ? `true` pour le
   * premier compte ; au-delà, la case « Rester connecté sur cet appareil ». */
  readonly keepsSession: boolean;
  readonly lastActiveAt: number;
  /** Les jetons RANGÉS — toujours `null` pour le compte actif. */
  readonly session: PreservedSession | null;
};

const STORAGE_KEY = 'meeshy.accounts';

const userSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.optional(z.string()),
  avatar: z.optional(z.string()),
  systemLanguage: z.optional(z.string()),
  regionalLanguage: z.optional(z.string()),
  customDestinationLanguage: z.optional(z.nullable(z.string())),
});

const accountSchema = z.object({
  user: userSchema,
  keepsSession: z.boolean(),
  lastActiveAt: z.number(),
  session: z.nullable(z.object({ token: z.string(), sessionToken: z.string(), expiresAt: z.number() })),
});

const vaultSchema = z.object({ accounts: z.array(accountSchema) });

/** La MÊME projection que `session.ts#pickSessionUser` : un objet neuf, rien
 * de ce que la charge de connexion transporte à côté (e-mail, rôle…). */
function projectUser(user: z.infer<typeof userSchema>): SessionUser {
  return {
    id: user.id,
    username: user.username,
    ...(user.displayName !== undefined ? { displayName: user.displayName } : {}),
    ...(user.avatar !== undefined ? { avatar: user.avatar } : {}),
    ...(user.systemLanguage !== undefined ? { systemLanguage: user.systemLanguage } : {}),
    ...(user.regionalLanguage !== undefined ? { regionalLanguage: user.regionalLanguage } : {}),
    ...(user.customDestinationLanguage !== undefined ? { customDestinationLanguage: user.customDestinationLanguage } : {}),
  };
}

function readAccounts(storage: SessionStorage): readonly DeviceAccount[] {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed = vaultSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.accounts.map((account) => ({ ...account, user: projectUser(account.user) })) : [];
  } catch {
    return [];
  }
}

function writeAccounts(storage: SessionStorage, accounts: readonly DeviceAccount[]): void {
  try {
    if (accounts.length === 0) storage.removeItem(STORAGE_KEY);
    else storage.setItem(STORAGE_KEY, JSON.stringify({ accounts }));
  } catch {
    /* Stockage refusé : la liste vaut pour l'onglet (doctrine de `session.ts`). */
  }
}

export type AccountVault = {
  /** Du plus récemment actif au plus ancien. */
  list(): readonly DeviceAccount[];
  /** Le compte ACTIF entre (ou reste) dans la liste. `keepsSession` absent
   * garde le choix déjà fait, et vaut `true` pour un compte neuf. */
  noteActive(user: SessionUser, keepsSession?: boolean): void;
  /** Range les jetons du compte qu'on QUITTE. */
  stash(userId: string, session: PreservedSession): void;
  /** Reprend les jetons d'un compte, s'ils sont encore valables — et les
   * retire du coffre dans tous les cas : ils deviennent la session active. */
  take(userId: string): PreservedSession | null;
  hasPreservedSession(userId: string): boolean;
  forget(userId: string): void;
};

export function createAccountVault({ storage, now }: { readonly storage: SessionStorage; readonly now: () => number }): AccountVault {
  const sorted = (accounts: readonly DeviceAccount[]) =>
    [...accounts].sort((a, b) => b.lastActiveAt - a.lastActiveAt || a.user.id.localeCompare(b.user.id));

  const update = (userId: string, change: (account: DeviceAccount) => DeviceAccount | null): void => {
    const accounts = readAccounts(storage);
    writeAccounts(
      storage,
      accounts.flatMap((account) => {
        if (account.user.id !== userId) return [account];
        const next = change(account);
        return next === null ? [] : [next];
      }),
    );
  };

  const live = (session: PreservedSession | null): session is PreservedSession => session !== null && session.expiresAt > now();

  return {
    list: () => sorted(readAccounts(storage)),
    noteActive: (user, keepsSession) => {
      const accounts = readAccounts(storage);
      const known = accounts.find((account) => account.user.id === user.id);
      const entry: DeviceAccount = {
        user: projectUser(user),
        keepsSession: keepsSession ?? known?.keepsSession ?? true,
        lastActiveAt: now(),
        session: null,
      };
      writeAccounts(storage, [entry, ...accounts.filter((account) => account.user.id !== user.id)]);
    },
    stash: (userId, session) => update(userId, (account) => ({ ...account, session })),
    take: (userId) => {
      const session = readAccounts(storage).find((account) => account.user.id === userId)?.session ?? null;
      update(userId, (account) => ({ ...account, session: null }));
      return live(session) ? session : null;
    },
    hasPreservedSession: (userId) => live(readAccounts(storage).find((account) => account.user.id === userId)?.session ?? null),
    forget: (userId) => update(userId, () => null),
  };
}

export type SwitchOutcome = 'switched' | 'needs-password';

export type AccountSwitcher = {
  /** Passe à un compte gardé, sans mot de passe — ou dit qu'il en faut un. */
  switchTo(userId: string): SwitchOutcome;
  /** Quitte le compte actif sans l'oublier : l'appareil revient à l'écran de
   * connexion, qui liste les comptes (« Ajouter un compte »). */
  suspend(): void;
  /** Un AUTRE compte que l'actif garde-t-il sa session ? C'est ce qui fait
   * proposer « Rester connecté sur cet appareil » à la connexion. */
  offersKeepSignedIn(): boolean;
};

export function createAccountSwitcher({
  vault,
  store,
  now,
  endServerSession,
}: {
  readonly vault: AccountVault;
  readonly store: SessionStoreApi;
  readonly now: () => number;
  /** Ferme côté passerelle la session d'un compte qu'on quitte SANS la garder. */
  readonly endServerSession: (session: PreservedSession) => void;
}): AccountSwitcher {
  const leaveActive = (): void => {
    const current = store.getState().session;
    if (current.status !== 'authenticated') return;
    const known = vault.list().find((account) => account.user.id === current.user.id);
    if (known === undefined) vault.noteActive(current.user);
    const held: PreservedSession = { token: current.token, sessionToken: current.sessionToken, expiresAt: current.expiresAt };
    if (known?.keepsSession ?? true) vault.stash(current.user.id, held);
    else endServerSession(held);
  };

  return {
    switchTo: (userId) => {
      const target = vault.list().find((account) => account.user.id === userId);
      if (target === undefined || !vault.hasPreservedSession(userId)) {
        if (target !== undefined) vault.take(userId);
        return 'needs-password';
      }
      leaveActive();
      const session = vault.take(userId);
      if (session === null) return 'needs-password';
      store.getState().establish({
        user: target.user,
        token: session.token,
        sessionToken: session.sessionToken,
        expiresIn: (session.expiresAt - now()) / 1000,
      });
      vault.noteActive(target.user);
      return 'switched';
    },
    suspend: () => {
      leaveActive();
      store.getState().clearSession();
    },
    offersKeepSignedIn: () => {
      const current = store.getState().session;
      const activeId = current.status === 'authenticated' ? current.user.id : null;
      return vault.list().some((account) => account.user.id !== activeId && vault.hasPreservedSession(account.user.id));
    },
  };
}

/**
 * CE QU'UN COMPTE LAISSE SUR L'APPAREIL, hors session et cache de requêtes
 * (que l'identité suivante purge déjà, `query-client.ts`) : ses brouillons de
 * message et de story, son audience de studio, ses modes de lecture et ses
 * dernières ouvertures. La DÉCONNEXION l'efface ; changer de compte le garde,
 * chaque clé portant l'identité (`u_<id>`, `<id>`) : aucun autre compte ne la lit.
 */
export function purgeAccountLocalData({
  storage,
  userId,
  keys,
}: {
  readonly storage: Pick<SessionStorage, 'removeItem'>;
  readonly userId: string;
  readonly keys: readonly string[];
}): void {
  const scope = `u_${userId}`;
  const prefixes = [`meeshy.draft.${scope}.`, `meeshy.reading-mode.${scope}.`, `meeshy.last-opened.${scope}.`, `meeshy.composer-protection.${scope}.`];
  const exact = new Set([`meeshy.draft.story.${userId}`, `meeshy.studio.audience.${userId}`]);
  keys
    .filter((key) => exact.has(key) || prefixes.some((prefix) => key.startsWith(prefix)))
    .forEach((key) => {
      try {
        storage.removeItem(key);
      } catch {
        /* stockage refusé : rien à effacer */
      }
    });
}
