/**
 * Le contour ÉQUIPÉ de l'AUTEUR d'un message (#10713), à ÉTALER dans l'auteur
 * servi : `{ profileDecor: { avatarRing } }`, ou RIEN — sans contour, sans
 * compte, ou contour sorti du registre, la clé n'existe pas (charge additive :
 * un ancien client n'y voit rien de neuf). La colonne brute ne part jamais.
 *
 * Une fonction pour les deux producteurs qui servent un auteur : la liste des
 * messages (`messages-list-query.ts`) et `message:new`
 * (`socketio/messageNewPayload.ts`). La résolution est celle des participants
 * (`participantProfileDecor`), donc la forme est celle de `/me`.
 */
import type { ServedProfileDecorItem } from '@meeshy/shared/types/profile-decor';

import { startupPackIndex } from '../packs/PackIndex';
import { participantProfileDecor } from './profileDecor';

export type AuthorAccount = { readonly equippedAvatarRing?: string | null } | null | undefined;

export function authorProfileDecor(account: AuthorAccount): { readonly profileDecor?: { readonly avatarRing: ServedProfileDecorItem } } {
  const profileDecor = participantProfileDecor(startupPackIndex(), account);
  return profileDecor === undefined ? {} : { profileDecor };
}
