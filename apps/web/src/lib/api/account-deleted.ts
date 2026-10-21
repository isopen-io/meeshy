/**
 * « CE COMPTE A ÉTÉ SUPPRIMÉ » (#10237, contrat passerelle #10264) — le seul
 * refus qui dise quelque chose du COMPTE plutôt que du jeton. L'appareil y
 * retire le compte NOMMÉ : du coffre des comptes, avec tout ce qu'il a laissé
 * sur l'appareil, carnet de progression du jeu compris (`retireAccountLocally`,
 * `device-accounts.ts`) — des photos qui n'ont pas d'autre exemplaire.
 *
 * D'où deux bornes :
 *  - le SIGNAL : `code === 'ACCOUNT_DELETED'` avec `accountId` (401 HTTP, refus
 *    de `/auth/refresh`, `error` du socket), ou `deletedAccountId`
 *    (`auth:session-revoked` à la purge, réponse de `resolve` action `purge`).
 *    Ni `AUTH_FAILED`, ni `SESSION_REVOKED`, ni un 401 sans code : un jeton
 *    expiré ou une session révoquée ne disent rien du compte ;
 *  - le COMPTE : celui que le signal NOMME, jamais le compte actif au moment de
 *    la réponse — une bascule de compte a pu se faire pendant le vol — et
 *    seulement s'il est le PROPRIÉTAIRE du jeton présenté (`ownDeletedAccount`).
 *
 * Ce module ne fait que LIRE le signal (le transport l'importe) ; le geste est
 * `account-deleted-retire.ts`.
 */

export const ACCOUNT_DELETED = 'ACCOUNT_DELETED';

const named = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

const fieldOf = (payload: unknown, field: string): unknown =>
  payload !== null && typeof payload === 'object' ? (payload as Record<string, unknown>)[field] : undefined;

/** Le compte supprimé que nomme un refus (`{ code: 'ACCOUNT_DELETED', accountId }`), ou `null`. */
export function deletedAccountOf(payload: unknown): string | null {
  if (fieldOf(payload, 'code') !== ACCOUNT_DELETED) return null;
  return named(fieldOf(payload, 'accountId'));
}

/** Le compte supprimé que nomme une révocation de session (`deletedAccountId`), ou `null`. */
export function deletedAccountOfRevocation(payload: unknown): string | null {
  return named(fieldOf(payload, 'deletedAccountId'));
}

/** Le compte d'une clé d'identité de session (`u:<id>`, `sessionIdentityKey`) ; un invité n'en a pas. */
export function accountOfIdentityKey(key: string | null): string | null {
  return key !== null && key.startsWith('u:') ? named(key.slice(2)) : null;
}

/**
 * Le compte nommé n'est retenu que s'il est le PROPRIÉTAIRE du jeton présenté
 * (audit #10237) : un refus qui nommerait un autre compte — réponse
 * détournée, relais fautif — n'efface rien d'autre que ce compte-là.
 */
export function ownDeletedAccount(namedAccount: string | null, owner: string | null | undefined): string | null {
  return namedAccount !== null && namedAccount === owner ? namedAccount : null;
}

/**
 * LE COMPTE À RETIRER EST NOTÉ AVANT LE GESTE (audit #10237) : le geste est un
 * module chargé au signal, et le signal ne repasse pas. Un chargement qui
 * échoue laisse la note ; le prochain démarrage la rejoue
 * (`replayPendingRetirements`, `account-deleted-retire.ts`) ; un geste abouti
 * l'efface. Une ligne par compte.
 */
export const PENDING_RETIREMENTS_KEY = 'meeshy.accountDeleted.pending';

export type MarkStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type RetireDeps = {
  readonly storage?: MarkStorage | null;
  readonly load?: () => Promise<{ readonly retireDeletedAccount: (accountId: string) => Promise<void> }>;
};

/** Les comptes notés « à retirer » ; ce qui n'a pas la forme d'un identifiant n'en nomme aucun. */
export function pendingRetirements(storage: MarkStorage | null): readonly string[] {
  try {
    return (storage?.getItem(PENDING_RETIREMENTS_KEY) ?? '').split('\n').filter((id) => /^[\w-]+$/.test(id));
  } catch {
    return [];
  }
}

function note(storage: MarkStorage | null, ids: readonly string[]): void {
  try {
    if (ids.length === 0) storage?.removeItem(PENDING_RETIREMENTS_KEY);
    else storage?.setItem(PENDING_RETIREMENTS_KEY, [...new Set(ids)].join('\n'));
  } catch {
    /* stockage plein ou refusé : le geste part quand même */
  }
}

const browserStorage = (): MarkStorage | null => {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
};

/** Le geste, chargé au signal : ni le transport ni le socle n'embarquent le coffre ni le carnet. */
export function retireDeletedAccountLater(accountId: string, deps: RetireDeps = {}): Promise<void> {
  const storage = deps.storage === undefined ? browserStorage() : deps.storage;
  note(storage, [...pendingRetirements(storage), accountId]);
  return (deps.load ?? (() => import('./account-deleted-retire')))()
    .then(({ retireDeletedAccount }) => retireDeletedAccount(accountId))
    .then(() => note(storage, pendingRetirements(storage).filter((id) => id !== accountId)))
    .catch(() => undefined);
}
