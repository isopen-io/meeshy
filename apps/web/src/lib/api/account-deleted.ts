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
 *    la réponse — une bascule de compte a pu se faire pendant le vol.
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

/** Le geste, chargé au signal : ni le transport ni le socle n'embarquent le coffre ni le carnet. */
export function retireDeletedAccountLater(accountId: string): void {
  void import('./account-deleted-retire')
    .then(({ retireDeletedAccount }) => retireDeletedAccount(accountId))
    .catch(() => undefined);
}
