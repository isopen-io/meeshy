import type { ThreadSearchCatalogSlice } from './catalog-fr-thread-search';

/** La recherche dans la conversation — tranche du catalogue, miroir de `catalog-fr-thread-search.ts`. */
const esThreadSearch = {
  'thread.search.open': 'Buscar en la conversación',
  'thread.search.placeholder': 'Buscar en la conversación…',
  'thread.search.close': 'Cerrar la búsqueda',
  'thread.search.hint': 'Escribe al menos dos caracteres',
  'thread.search.searching': 'Buscando…',
  'thread.search.empty': 'Sin resultados',
  'thread.search.count.one': '{count} resultado',
  'thread.search.count.other': '{count} resultados',
  'thread.search.failed': 'La búsqueda no se completó',
  'thread.search.retry': 'Reintentar',
  'thread.search.more': 'Más resultados',
  'thread.search.translated': 'Encontrado en una traducción',
} satisfies ThreadSearchCatalogSlice;

export default esThreadSearch;
