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

/**
 * CE QUE LE OUI FERA (#10879) : `sign-in` ouvre le compte ; `claim-email` l'ouvre
 * ET lui rattache l'adresse revendiquée (#8214). Une passerelle d'avant #10879
 * ne le dit pas : c'est une connexion.
 */
export type LinkIntent = 'sign-in' | 'claim-email';

export type LinkConfirmationRequired = {
  readonly requiresConfirmation: true;
  readonly account: LinkAccount;
  readonly intent?: LinkIntent;
  readonly maskedEmail?: string;
};

/** La question à poser : le compte, la nature du oui, l'adresse MASQUÉE par la passerelle (ou rien). */
export type LinkQuestion = {
  readonly account: LinkAccount;
  readonly intent: LinkIntent;
  readonly maskedEmail: string | null;
};

const text = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

/** La question à poser, ou `null` quand la réponse n'en est pas une. */
export function linkConfirmationOf(data: unknown): LinkQuestion | null {
  if (data === null || typeof data !== 'object') return null;
  const payload = data as { readonly requiresConfirmation?: unknown; readonly account?: unknown; readonly intent?: unknown; readonly maskedEmail?: unknown };
  if (payload.requiresConfirmation !== true || payload.account === null || typeof payload.account !== 'object') return null;
  const account = payload.account as Record<string, unknown>;
  const id = text(account.id);
  const username = text(account.username);
  if (id === null || username === null) return null;
  return {
    account: { id, username, displayName: text(account.displayName), avatar: text(account.avatar) },
    intent: payload.intent === 'claim-email' ? 'claim-email' : 'sign-in',
    maskedEmail: text(payload.maskedEmail),
  };
}

/** Le compte du lien EST le compte ouvert : rien à craindre, la question se tait. */
export function confirmsSilently(session: SessionState, account: LinkAccount): boolean {
  return heldAccountOf(session)?.user.id === account.id;
}
