import { profileShareUrl } from '@/lib/feed/share-url';
import type { SendSheetRequest } from '@/lib/send/send-sheet-store';

/**
 * « ENVOYER LE PROFIL » (D15, #10949) — depuis la fiche d'une personne, la
 * MÊME porte que tout le reste : l'écran de partage. La carte profil part dans
 * la conversation par l'adresse canonique (`/u/<pseudo>`, que les trois clients
 * ouvrent), et « Copier le lien » / « Partager hors de Meeshy » la donnent au
 * reste du monde. Pur, sans réseau.
 */
export function profileSendRequest(person: { readonly id: string; readonly username: string; readonly name: string; readonly avatar: string | null }): SendSheetRequest {
  const url = profileShareUrl(person.username);
  return {
    intent: 'share',
    payload: { kind: 'profile', userId: person.id, url, name: person.name, ...(person.avatar === null || person.avatar === '' ? {} : { avatarUrl: person.avatar }) },
    moreOptions: { url },
  };
}
