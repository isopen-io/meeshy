import type { ContentCardCatalogSlice } from './catalog-fr-content-card';

/** La carte d'un contenu (#19334) — voir `catalog-fr-content-card.ts`. */
const enContentCard = {
  'content.card.loading': 'Loading the content',
  'content.card.unavailable': 'This content is no longer available',
  'content.card.hint': 'Opens the content',
  'content.card.of.post': 'Post by {author}',
  'content.card.of.story': 'Story by {author}',
  'content.card.favorites.one': '{count} favorite',
  'content.card.favorites.other': '{count} favorites',
  'content.card.saved': 'saved',
} satisfies ContentCardCatalogSlice;

export default enContentCard;
