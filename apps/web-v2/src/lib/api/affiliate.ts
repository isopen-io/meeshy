import { httpTransport } from './client';
import type { ApiResult, HttpTransport } from './http';

/**
 * LE PORT DU PARRAINAGE (#6584) — les DEUX appels que l'inscription fait, et
 * rien de plus.
 *
 * ## Ce que la passerelle offre déjà, et pourquoi `/auth/register` n'est pas
 * touché
 *
 * `POST /auth/register` ne porte AUCUN champ de parrainage, et n'a pas à en
 * porter : `POST /affiliate/register` noue la relation sur l'APPELANT
 * AUTHENTIFIÉ (`routes/affiliate.ts:658-666` — le `referredUserId` du corps
 * est explicitement IGNORÉ, c'est la garde qui empêche de forger une relation
 * vers un tiers). Or l'inscription authentifie déjà (#4264, `auth.register`
 * établit la session). La relation se noue donc APRÈS le compte, sans qu'une
 * seule ligne de la passerelle change.
 *
 * ## Les deux appels
 *
 * | appel | quand | ce qu'il coûte s'il échoue |
 * |---|---|---|
 * | `GET /affiliate/validate/:token` | à la saisie du code, pour NOMMER qui invite | rien : l'écran reste muet et l'inscription continue |
 * | `POST /affiliate/register` | après la création du compte | un parrainage perdu, JAMAIS une inscription perdue |
 *
 * Cette asymétrie est la décision de fond de ce port : **un code d'invitation
 * n'est jamais une condition d'entrée.** Un jeton expiré, une limite d'usage
 * atteinte, une passerelle qui répond 500 — aucun de ces cas ne doit empêcher
 * quelqu'un de créer son compte. Ce serait refuser un utilisateur pour la
 * défaillance de celui qui l'a invité.
 */

/** `GET /affiliate/validate/:token` (`routes/affiliate.ts:449`) — rend TOUJOURS
 * 200, `isValid` portant le verdict (le jeton inconnu n'est pas un 404 : la
 * route ne révèle pas ce qui existe). */
export type ReferralValidation = {
  readonly isValid: boolean;
  readonly affiliateUser?: {
    readonly id: string;
    readonly username: string;
    readonly displayName?: string | null;
    readonly firstName?: string | null;
    readonly lastName?: string | null;
    readonly avatar?: string | null;
  };
};

export type AffiliateDeps = { readonly transport: HttpTransport };

const defaultDeps: AffiliateDeps = { transport: httpTransport };

export function validateReferralCode(code: string, deps: AffiliateDeps = defaultDeps): Promise<ApiResult<ReferralValidation>> {
  return deps.transport.request<ReferralValidation>({
    method: 'GET',
    path: `/api/v1/affiliate/validate/${encodeURIComponent(code)}`,
  });
}

/**
 * `POST /affiliate/register` (`routes/affiliate.ts:658`) — AUTHENTIFIÉ, donc
 * appelé après que l'inscription a établi la session.
 *
 * `referredUserId` est dans le schéma REQUIS de la route alors qu'elle
 * l'ignore (le champ « reste accepté pour ne pas casser les clients
 * existants », dit son commentaire) : la clé part donc, vide de sens et de
 * conséquence, parce qu'un corps sans elle serait refusé par la validation
 * AVANT d'atteindre le code qui l'ignore.
 */
export function convertReferral(
  params: { readonly code: string; readonly userId: string },
  deps: AffiliateDeps = defaultDeps,
): Promise<ApiResult<{ readonly id?: string; readonly status?: string }>> {
  return deps.transport.request<{ readonly id?: string; readonly status?: string }>({
    method: 'POST',
    path: '/api/v1/affiliate/register',
    body: { token: params.code, referredUserId: params.userId },
  });
}

/** Le nom à MONTRER de celui qui invite — le plus humain d'abord, le pseudo en
 * dernier recours (jamais un identifiant : personne ne se reconnaît dedans). */
export function inviterName(validation: ReferralValidation): string {
  const user = validation.affiliateUser;
  if (user === undefined) return '';
  const displayName = (user.displayName ?? '').trim();
  if (displayName !== '') return displayName;
  const full = [user.firstName ?? '', user.lastName ?? ''].map((part) => part.trim()).filter((part) => part !== '').join(' ');
  return full !== '' ? full : user.username;
}
