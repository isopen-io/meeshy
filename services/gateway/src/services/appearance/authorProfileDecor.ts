/**
 * Le contour ÉQUIPÉ d'une PERSONNE servie (#10713, #10945), à ÉTALER dans le
 * résumé : `{ profileDecor: { avatarRing } }`, ou RIEN — sans contour, sans
 * compte, ou contour sorti du registre, la clé n'existe pas (charge additive :
 * un ancien client n'y voit rien de neuf). La colonne brute ne part jamais.
 *
 * La résolution est celle des participants (`participantProfileDecor`) : un
 * contour n'est équipé qu'après la loi de possession (`validateProfileDecorWrite`),
 * et il se sert au registre — la forme est celle de `/me`.
 *
 * La colonne se lit dans la jointure que le résumé fait DÉJÀ
 * (`AVATAR_RING_COLUMN`, à étaler dans son `select`) : aucune lecture de plus.
 */
import type { PersonProfileDecor } from '@meeshy/shared/types/profile-decor';

import { startupPackIndex } from '../packs/PackIndex';
import { participantProfileDecor } from './profileDecor';

export { AVATAR_RING_COLUMN } from './profileDecor';

export type AuthorAccount = { readonly equippedAvatarRing?: string | null } | null | undefined;

export function authorProfileDecor(account: AuthorAccount): { readonly profileDecor?: PersonProfileDecor } {
  const profileDecor = participantProfileDecor(startupPackIndex(), account);
  return profileDecor === undefined ? {} : { profileDecor };
}

/**
 * Le résumé d'une personne TEL QU'IL PART : la colonne brute retirée, le
 * contour résolu étalé. Identité pour `null` / `undefined`.
 */
export function servedPerson<T extends { readonly equippedAvatarRing?: string | null }>(
  user: T,
): Omit<T, 'equippedAvatarRing'> & { readonly profileDecor?: PersonProfileDecor };
export function servedPerson<T extends { readonly equippedAvatarRing?: string | null }>(
  user: T | null | undefined,
): (Omit<T, 'equippedAvatarRing'> & { readonly profileDecor?: PersonProfileDecor }) | null | undefined;
export function servedPerson<T extends { readonly equippedAvatarRing?: string | null }>(user: T | null | undefined) {
  if (user === null || user === undefined) return user;
  const { equippedAvatarRing, ...rest } = user;
  return { ...rest, ...authorProfileDecor({ equippedAvatarRing }) };
}
