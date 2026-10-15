import type { ThreadSearchCatalogSlice } from './catalog-fr-thread-search';

/** La recherche dans la conversation — tranche du catalogue, miroir de `catalog-fr-thread-search.ts`. */
const itThreadSearch = {
  'thread.search.open': 'Cerca nella conversazione',
  'thread.search.placeholder': 'Cerca nella conversazione…',
  'thread.search.close': 'Chiudi la ricerca',
  'thread.search.hint': 'Digita almeno due caratteri',
  'thread.search.searching': 'Ricerca in corso…',
  'thread.search.empty': 'Nessun risultato',
  'thread.search.count.one': '{count} risultato',
  'thread.search.count.other': '{count} risultati',
  'thread.search.failed': 'La ricerca non è riuscita',
  'thread.search.retry': 'Riprova',
  'thread.search.more': 'Altri risultati',
  'thread.search.translated': 'Trovato in una traduzione',
} satisfies ThreadSearchCatalogSlice;

export default itThreadSearch;
