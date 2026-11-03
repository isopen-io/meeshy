import type { GlobalSearchCatalog } from '../i18n-global-search-catalog';

/** LA RECHERCHE GÉNÉRALE, ALLEMAND (#14619, #14620). */
const de = {
  'section.messages': 'Nachrichten',
  'search.title': 'Suchen',
  'search.placeholder': 'Nachrichten, Beiträge, Personen',
  'search.label': 'Überall suchen',
  'search.clear': 'Suche löschen',
  'search.back': 'Zurück',
  'search.everywhere': 'Überall suchen',
  'search.hint': 'Gib mindestens zwei Zeichen ein',
  'search.loading': 'Suche läuft',
  'search.loadMore': 'Mehr anzeigen',
  'search.retry': 'Erneut versuchen',
  'search.error': 'Die Suche ist fehlgeschlagen',
  'search.offline': 'Offline — die Suche wird fortgesetzt, sobald du online bist',
  'tab.messages': 'Nachrichten',
  'tab.posts': 'Beiträge',
  'tab.people': 'Personen',
  'messages.empty': 'Keine Nachricht gefunden',
  'posts.empty': 'Kein Beitrag gefunden',
  'people.empty': 'Niemand gefunden',
  'type.post': 'Beitrag',
  'type.reel': 'Reel',
  'type.story': 'Story',
  'translated': 'Übersetzt',
} as const satisfies GlobalSearchCatalog;

export default de;
