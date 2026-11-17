import type { ContentCardCatalogSlice } from './catalog-fr-content-card';

/** La carte d'un contenu (#19334) — voir `catalog-fr-content-card.ts`. */
const arContentCard = {
  'content.card.loading': 'جارٍ تحميل المحتوى',
  'content.card.unavailable': 'هذا المحتوى لم يعد متاحًا',
  'content.card.hint': 'يفتح المحتوى',
  'content.card.of.post': 'منشور {author}',
  'content.card.of.story': 'قصة {author}',
  'content.card.favorites.one': '{count} مفضلة',
  'content.card.favorites.other': '{count} مفضلات',
  'content.card.saved': 'محفوظ',
} satisfies ContentCardCatalogSlice;

export default arContentCard;
