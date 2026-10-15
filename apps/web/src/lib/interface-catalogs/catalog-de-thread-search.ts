import type { ThreadSearchCatalogSlice } from './catalog-fr-thread-search';

/** La recherche dans la conversation — tranche du catalogue, miroir de `catalog-fr-thread-search.ts`. */
const deThreadSearch = {
  'thread.search.open': 'In der Unterhaltung suchen',
  'thread.search.placeholder': 'In der Unterhaltung suchen…',
  'thread.search.close': 'Suche schließen',
  'thread.search.hint': 'Mindestens zwei Zeichen eingeben',
  'thread.search.searching': 'Suche läuft…',
  'thread.search.empty': 'Keine Ergebnisse',
  'thread.search.count.one': '{count} Ergebnis',
  'thread.search.count.other': '{count} Ergebnisse',
  'thread.search.failed': 'Die Suche ist fehlgeschlagen',
  'thread.search.retry': 'Erneut versuchen',
  'thread.search.more': 'Weitere Ergebnisse',
  'thread.search.translated': 'In einer Übersetzung gefunden',
} satisfies ThreadSearchCatalogSlice;

export default deThreadSearch;
