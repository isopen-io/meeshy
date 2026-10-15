import * as affiliateEndpoints from '@meeshy/shared/api/endpoints/affiliate';

import { httpTransport } from './client';
import type { ApiResult, HttpTransport } from './http';

/**
 * LE PORT DU PARRAINAGE (#6584, #8058) — ce que l'écran d'inscription demande
 * à la passerelle AVANT de créer le compte, et rien de plus.
 *
 * ## Où la relation se noue
 *
 * Dans la création du compte elle-même (#8058) : le code part en
 * `affiliateToken` dans le corps de `POST /auth/register`
 * (`composeRegisterBody`, `lib/signup-form.ts`), et la passerelle rattache le
 * compte à son parrain, activé ou non. L'appel AUTHENTIFIÉ
 * `POST /affiliate/register` d'après-inscription a disparu du web : depuis
 * #8055, une inscription sans numéro ne rend aucune session, il ne pouvait
 * plus partir.
 *
 * ## Ce qui reste ici
 *
 * `GET /affiliate/validate/:token`, à la saisie du code, pour NOMMER qui
 * invite. S'il échoue, l'écran reste muet et l'inscription continue : **un code
 * d'invitation n'est jamais une condition d'entrée.** Ce serait refuser un
 * utilisateur pour la défaillance de celui qui l'a invité.
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
    /** La bannière de profil de l'invitant (#10559) — absente d'une passerelle plus ancienne. */
    readonly banner?: string | null;
  };
};

export type AffiliateDeps = { readonly transport: HttpTransport };

const defaultDeps: AffiliateDeps = { transport: httpTransport };

export function validateReferralCode(code: string, deps: AffiliateDeps = defaultDeps): Promise<ApiResult<ReferralValidation>> {
  return deps.transport.request<ReferralValidation>({
    method: 'GET',
    path: affiliateEndpoints.validateByToken(code),
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

/**
 * CE QUE LE CADRE « QUI M'INVITE » MONTRE (#10559) — et rien de plus : ni
 * identifiant, ni présence. `username` est `null` quand le pseudo EST déjà le
 * nom montré : il ne se répète pas sous lui-même.
 */
export type InviterCard = {
  readonly name: string;
  readonly username: string | null;
  readonly avatar: string | null;
  readonly banner: string | null;
};

const presentOrNull = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
};

/** La carte d'un jeton VALIDE qui nomme quelqu'un — `null` sinon. Le nom suit
 * `inviterName` : nom affiché, sinon prénom et nom, sinon le pseudo. */
export function inviterCardOf(validation: ReferralValidation): InviterCard | null {
  const user = validation.affiliateUser;
  if (!validation.isValid || user === undefined) return null;
  const name = inviterName(validation).trim();
  if (name === '') return null;
  const username = presentOrNull(user.username);
  return {
    name,
    username: username === name ? null : username,
    avatar: presentOrNull(user.avatar),
    banner: presentOrNull(user.banner),
  };
}
