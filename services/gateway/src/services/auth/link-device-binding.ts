/**
 * LE LIEN DE CONNEXION EST LIÉ À L'APPAREIL QUI L'A DEMANDÉ (#10872).
 *
 * L'attaque fermée est la « Login CSRF » (OWASP, *Cross-Site Request Forgery
 * Prevention Cheat Sheet* § Login CSRF ; Barth, Jackson & Mitchell, *Robust
 * Defenses for Cross-Site Request Forgery*, CCS 2008) appliquée au lien
 * magique : un tiers demande un lien pour SON compte et le fait ouvrir sur
 * l'appareil d'une victime (lien universel, App Link forgé, page web). Le jeton
 * est valide, il appartient au tiers, et la victime se retrouve connectée à un
 * compte qui n'est pas le sien — tout ce qu'elle y écrit, le tiers le lit.
 *
 * La parade est celle des connexions sans mot de passe « liées au navigateur »
 * (même principe que PKCE, RFC 7636 : celui qui CONCLUT doit prouver qu'il est
 * celui qui a COMMENCÉ) :
 *
 * - à la DEMANDE, l'appareil tire un secret (≥ 128 bits), le garde chez lui et
 *   n'envoie que son EMPREINTE SHA-256, attachée au jeton ;
 * - à la CONSOMMATION, il présente le secret ; correspondance (en temps
 *   constant) ⇒ connexion directe, invisible ;
 * - sinon — autre appareil, lien forgé, ancien client, lien du digest — AUCUNE
 *   session n'est ouverte sans le OUI explicite de l'utilisateur, à qui l'on
 *   montre le compte cible.
 *
 * Le secret ne protège pas le jeton (il voyage déjà par la boîte mail) : il
 * prouve seulement que l'appareil qui conclut est celui qui a demandé.
 *
 * @module services/auth/link-device-binding
 */

import crypto from 'crypto';

import { maskEmail } from '../PhonePasswordResetService';

export type LinkDeviceVerdict = 'same-device' | 'confirmed' | 'confirmation-required';

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const SECRET_PATTERN = /^[A-Za-z0-9_-]{22,256}$/;

/** L'empreinte d'un secret : SHA-256 de sa chaîne UTF-8, en hexadécimal minuscule. */
export const linkDeviceHashOf = (secret: string): string =>
  crypto.createHash('sha256').update(secret, 'utf8').digest('hex');

/** L'empreinte remise à la demande ; `null` si absente ou mal formée (le lien naît non lié). */
export function parseLinkDeviceHash(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const hash = value.trim().toLowerCase();
  return HASH_PATTERN.test(hash) ? hash : null;
}

/** Le secret présenté à la consommation ; `undefined` s'il est absent ou mal formé. */
export function parseLinkDeviceSecret(value: unknown): string | undefined {
  return typeof value === 'string' && SECRET_PATTERN.test(value) ? value : undefined;
}

function sameDevice(boundHash: string, presentedSecret: string): boolean {
  if (!HASH_PATTERN.test(boundHash)) return false;
  const expected = Buffer.from(boundHash, 'hex');
  const presented = Buffer.from(linkDeviceHashOf(presentedSecret), 'hex');
  return crypto.timingSafeEqual(expected, presented);
}

/**
 * Le verdict d'une consommation. `confirmed` l'emporte (l'utilisateur a vu le
 * compte et dit oui) ; sans lui, seule une empreinte liée qui correspond au
 * secret présenté ouvre la session.
 */
export function linkDeviceVerdict(input: {
  readonly boundHash: string | null | undefined;
  readonly presentedSecret: string | undefined;
  readonly confirmed: boolean;
}): LinkDeviceVerdict {
  if (input.confirmed) return 'confirmed';
  if (!input.boundHash || !input.presentedSecret) return 'confirmation-required';
  return sameDevice(input.boundHash, input.presentedSecret) ? 'same-device' : 'confirmation-required';
}

/** Ce que l'écran de confirmation montre du compte cible — rien de plus. */
export type LinkAccountIdentity = {
  readonly id: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatar: string | null;
};

export const LINK_ACCOUNT_IDENTITY_SELECT = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
} as const;

export const linkAccountIdentity = (row: {
  readonly id: string;
  readonly username: string;
  readonly displayName?: string | null;
  readonly avatar?: string | null;
}): LinkAccountIdentity => ({
  id: row.id,
  username: row.username,
  displayName: row.displayName ?? null,
  avatar: row.avatar ?? null,
});

/**
 * CE QUE LE OUI FERA (#10879). `sign-in` : il ouvre le compte. `claim-email` :
 * il ouvre le compte ET lui rattache l'adresse revendiquée (#8214) — l'écran
 * doit le dire, sinon un tiers fait revendiquer l'adresse d'une victime par
 * un clic qu'elle croit être une connexion.
 */
export type LinkConfirmationIntent = 'sign-in' | 'claim-email';

/**
 * La question complète : le compte, la nature du oui, et l'adresse en jeu —
 * MASQUÉE ici, côté serveur (`maskEmail`), jamais en clair. Le masque est un
 * repère, pas une preuve (une adresse au même masque s'enregistre) : ce qui
 * identifie le compte reste son `@username`.
 */
export type LinkConfirmation = {
  readonly account: LinkAccountIdentity;
  readonly intent: LinkConfirmationIntent;
  readonly maskedEmail: string;
};

export const linkConfirmation = (
  row: Parameters<typeof linkAccountIdentity>[0],
  question: { readonly intent: LinkConfirmationIntent; readonly email: string },
): LinkConfirmation => ({
  account: linkAccountIdentity(row),
  intent: question.intent,
  maskedEmail: maskEmail(question.email),
});
