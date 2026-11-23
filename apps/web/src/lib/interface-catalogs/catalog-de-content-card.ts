import type { ContentCardCatalogSlice } from './catalog-fr-content-card';

/** La carte d'un contenu (#19334) — voir `catalog-fr-content-card.ts`. */
const deContentCard = {
  'content.card.loading': 'Inhalt wird geladen',
  'content.card.unavailable': 'Dieser Inhalt ist nicht mehr verfügbar',
  'content.card.hint': 'Öffnet den Inhalt',
  'content.card.of.post': 'Beitrag von {author}',
  'content.card.of.story': 'Story von {author}',
  'content.card.favorites.one': '{count} Favorit',
  'content.card.favorites.other': '{count} Favoriten',
  'content.card.saved': 'gespeichert',
} satisfies ContentCardCatalogSlice;

export default deContentCard;
