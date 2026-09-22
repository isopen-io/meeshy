import type { FeedPage, FeedPost } from './feed-pages';
import { POST_HERO, POST_IMAGE_FR, POST_LONG_TEXT, REEL_PORTRAIT, pageOfFeed } from './fixtures-feed';

/**
 * **LE CORPUS ENREGISTRÉ DES FIXTURES** (#7286) — un SOUS-ENSEMBLE du Flux,
 * déclaré ici plutôt qu'en posant `isBookmarkedByMe: true` sur les
 * publications de `fixtures-feed.ts`.
 *
 * La raison est un défaut évité : ces publications servent AUSSI le Flux, les
 * Réels et la fiche, où une demi-douzaine de témoins mesurent l'état du
 * signet — les marquer à la source aurait fait rougir ces témoins pour une
 * raison sans rapport avec ce qu'ils gardent.
 *
 * DEUX NATURES, délibérément : un post et un réel au moins, sans quoi le
 * sélecteur de facette d'iOS ne se montrerait jamais en fixtures
 * (`offersBookmarkFilter`) et la capture de l'écran ne dirait pas ce que
 * l'écran fait.
 *
 * `isBookmarkedByMe: true` est posé ici comme la passerelle le pose : sans
 * condition (`PostFeedService.getBookmarks`). Le POC ne devine pas ce que le
 * serveur affirme.
 */

const enregistre = (post: FeedPost): FeedPost => ({ ...post, isBookmarkedByMe: true });

export const BOOKMARKED_POSTS: readonly FeedPost[] = [POST_HERO, REEL_PORTRAIT, POST_IMAGE_FR, POST_LONG_TEXT].map(
  enregistre,
);

/** Même keyset que le Flux, le corpus en moins — jamais une seconde
 * pagination à faire diverger. */
export function pageOfBookmarks(params: { readonly cursor?: string; readonly limit: number }): FeedPage {
  return pageOfFeed(BOOKMARKED_POSTS, params);
}
