import type { ThreadSearchCatalogSlice } from './catalog-fr-thread-search';

/** La recherche dans la conversation — tranche du catalogue, miroir de `catalog-fr-thread-search.ts`. */
const arThreadSearch = {
  'thread.search.open': 'البحث في المحادثة',
  'thread.search.placeholder': 'البحث في المحادثة…',
  'thread.search.close': 'إغلاق البحث',
  'thread.search.hint': 'اكتب حرفين على الأقل',
  'thread.search.searching': 'جارٍ البحث…',
  'thread.search.empty': 'لا توجد نتائج',
  'thread.search.count.one': '{count} نتيجة',
  'thread.search.count.other': '{count} نتائج',
  'thread.search.failed': 'تعذّر إتمام البحث',
  'thread.search.retry': 'إعادة المحاولة',
  'thread.search.more': 'المزيد من النتائج',
  'thread.search.translated': 'وُجد في ترجمة',
} satisfies ThreadSearchCatalogSlice;

export default arThreadSearch;
