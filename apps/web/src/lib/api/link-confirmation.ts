import { heldAccountOf, type SessionState } from './session';

/**
 * LA QUESTION D'UN LIEN OUVERT AILLEURS (#10872) — la passerelle ne crée
 * aucune session et ne consomme pas le jeton quand le lien n'est pas présenté
 * par l'appareil qui l'a demandé : elle rend le compte que le lien ouvrirait,
 * et l'écran demande « Se connecter en tant que @x ? ». Le « oui » rejoue la
 * requête avec `confirm: true`.
 */

export type LinkAccount = {
  readonly id: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatar: string | null;
};

export type LinkConfirmationRequired = {
  readonly requiresConfirmation: true;
  readonly account: LinkAccount;
};

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

/** Le compte à confirmer, ou `null` quand la réponse n'est pas une question. */
export function linkConfirmationOf(data: unknown): LinkAccount | null {
  if (data === null || typeof data !== 'object') return null;
  const payload = data as { readonly requiresConfirmation?: unknown; readonly account?: unknown };
  if (payload.requiresConfirmation !== true || payload.account === null || typeof payload.account !== 'object') return null;
  const account = payload.account as Record<string, unknown>;
  const id = text(account.id);
  const username = text(account.username);
  if (id === null || username === null) return null;
  return { id, username, displayName: text(account.displayName), avatar: text(account.avatar) };
}

/** Le compte du lien EST le compte ouvert : rien à craindre, la question se tait. */
export function confirmsSilently(session: SessionState, account: LinkAccount): boolean {
  return heldAccountOf(session)?.user.id === account.id;
}
