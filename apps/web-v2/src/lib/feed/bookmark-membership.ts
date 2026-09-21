import type { FeedInfiniteData, FeedPage, FeedPost } from '@/lib/api/feed-pages';

import { dropCardPost } from './interactions';

/**
 * **LE CORPUS DES ENREGISTRÉES EST UNE APPARTENANCE, PAS UN DRAPEAU** (#7286).
 *
 * `togglePost` (`interactions.ts`) bascule `isBookmarkedByMe` là où la
 * publication est DÉJÀ servie. C'est la bonne loi pour le Flux, les Réels et
 * la fiche : retirer un signet y laisse la carte en place, éteinte. Sur
 * l'écran des publications ENREGISTRÉES, la même bascule rendrait une ligne
 * qui n'a plus de raison d'y être — le corpus est défini par l'appartenance.
 *
 * D'où ce module, voisin de `interactions.ts` et jamais fondu dedans : ses
 * fonctions ne changent pas un champ, elles changent la COMPOSITION des pages.
 * Les confondre est exactement ce qui ferait d'une publication retirée une
 * ligne éteinte qui reste.
 *
 * **LE RETOUR EN ARRIÈRE REND SA PLACE**, il ne remet pas en tête. La liste
 * est ordonnée par date d'ENREGISTREMENT (`PostBookmark.createdAt desc`,
 * `PostFeedService.getBookmarks`) : une restauration en tête mentirait sur cet
 * ordre à chaque panne réseau. C'est pour cela que `BookmarkSlot` porte la
 * page ET l'index, et pas seulement la publication.
 *
 * **ET C'EST PAR LIGNE, JAMAIS PAR INSTANTANÉ DE LA LISTE.** `performPostGesture`
 * autorise deux gestes simultanés sur deux publications différentes ; rendre
 * une photographie de la liste entière rejouerait le retrait de l'autre.
 * iOS restaure l'instantané complet (`BookmarksViewModel.removeBookmark`) —
 * c'est l'écart assumé, et il est dans le sens de la correction.
 */

export type BookmarkSlot = { readonly post: FeedPost; readonly page: number; readonly index: number };

/** Où vit cette publication dans le corpus enregistré — `null` si absente. */
export function bookmarkSlotOf(data: FeedInfiniteData | undefined, postId: string): BookmarkSlot | null {
  const pages = data?.pages ?? [];
  for (const [page, contenu] of pages.entries()) {
    const index = contenu.posts.findIndex((post) => post.id === postId);
    if (index !== -1) return { post: contenu.posts[index] as FeedPost, page, index };
  }
  return null;
}

/** La MÊME référence quand rien ne change — aucun rendu inutile (§ Zero
 * Unnecessary Re-render), et aucune caisse fabriquée depuis un cache absent. */
const rebuilt = (
  data: FeedInfiniteData | undefined,
  pages: FeedPage[] | undefined,
): FeedInfiniteData | undefined => {
  if (data === undefined || pages === undefined) return data;
  return pages.every((page, i) => page === data.pages[i]) ? data : { ...data, pages };
};

/** RETIRER — la ligne part de TOUTES les pages, par le parcours UNIQUE des
 * caisses de cartes (`dropCardPost`) : un curseur qui chevauche peut servir
 * la même publication deux fois, et n'en ôter qu'une la ferait réapparaître au
 * premier aplatissement. */
export function withoutBookmark(data: FeedInfiniteData | undefined, postId: string): FeedInfiniteData | undefined {
  return dropCardPost(data, postId);
}

/**
 * REMETTRE — à sa place si on la connaît (retour en arrière d'un retrait), en
 * TÊTE sinon (un enregistrement neuf est le plus récent).
 *
 * La ligne posée porte TOUJOURS son signet : une carte éteinte dans la liste
 * des enregistrées serait un mensonge — et `getBookmarks` sert d'ailleurs
 * `isBookmarkedByMe: true` sans condition, pour cette raison exacte.
 *
 * Une page hors bornes (le corpus a rétréci pendant l'aller-retour) pose en
 * tête plutôt que de PERDRE la ligne : le pire rendu possible ici est une
 * ligne au mauvais rang, jamais une ligne disparue.
 */
export function withBookmark(data: FeedInfiniteData | undefined, slot: BookmarkSlot): FeedInfiniteData | undefined {
  if (data === undefined) return data;
  if (bookmarkSlotOf(data, slot.post.id) !== null) return data;

  const post: FeedPost = { ...slot.post, isBookmarkedByMe: true };
  /* La page hors bornes retombe en TÊTE — page 0, rang 0 : garder son index y
     poserait la ligne à un rang qui n'a plus de sens dans une autre page. */
  const connue = slot.page >= 0 && slot.page < data.pages.length;
  const cible = connue ? slot.page : 0;
  const rang = connue ? slot.index : 0;
  const pages = data.pages.map((page, i) => {
    if (i !== cible) return page;
    const index = Math.max(0, Math.min(rang, page.posts.length));
    return { ...page, posts: [...page.posts.slice(0, index), post, ...page.posts.slice(index)] };
  });
  return rebuilt(data, pages);
}
