import type { ThreadSearchCatalogSlice } from './catalog-fr-thread-search';

/** La recherche dans la conversation — tranche du catalogue, miroir de `catalog-fr-thread-search.ts`. */
const enThreadSearch = {
  'thread.search.open': 'Search in conversation',
  'thread.search.placeholder': 'Search in conversation…',
  'thread.search.close': 'Close search',
  'thread.search.hint': 'Type at least two characters',
  'thread.search.searching': 'Searching…',
  'thread.search.empty': 'No results',
  'thread.search.count.one': '{count} result',
  'thread.search.count.other': '{count} results',
  'thread.search.failed': 'The search didn’t go through',
  'thread.search.retry': 'Try again',
  'thread.search.more': 'More results',
  'thread.search.translated': 'Found in a translation',
} satisfies ThreadSearchCatalogSlice;

export default enThreadSearch;
