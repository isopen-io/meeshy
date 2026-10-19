import { parseServedProfileDecor, type ServedProfileDecorItem } from '@meeshy/shared/types/profile-decor';

/**
 * Le contour équipé qu'une personne PORTE sur le fil (#10713) — lecture pure,
 * sans React : la couche API (liste des membres) et le fil (auteurs) la
 * partagent. Tolérante : une forme illisible n'est jamais une erreur.
 */

export const recordOf = (value: unknown): Readonly<Record<string, unknown>> | null => (typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : null);

/** Le contour équipé que porte une personne (un participant, son `user`, ou un auteur) ; `null` si aucun n'est lisible. */
export function servedRingOf(person: unknown): ServedProfileDecorItem | null {
  const record = recordOf(person);
  if (record === null) return null;
  const own = parseServedProfileDecor(record['profileDecor']).avatarRing;
  return own ?? parseServedProfileDecor(recordOf(record['user'])?.['profileDecor']).avatarRing;
}

/** La référence de contour d'une personne, prête à RÉPANDRE (`{...ringRefOf(auteur)}`) : aucune clé sans contour. */
export function ringRefOf(person: unknown): { readonly ringRef?: ServedProfileDecorItem } {
  const ring = servedRingOf(person);
  return ring === null ? {} : { ringRef: ring };
}
