import type { GlobalSearchCatalog } from '../i18n-global-search-catalog';

/** LA RECHERCHE GÉNÉRALE, ITALIEN (#14619, #14620). */
const it = {
  'section.messages': 'Messaggi',
  'search.title': 'Cerca',
  'search.placeholder': 'Messaggi, post, persone',
  'search.label': 'Cerca ovunque',
  'search.clear': 'Cancella la ricerca',
  'search.back': 'Indietro',
  'search.everywhere': 'Cerca ovunque',
  'search.hint': 'Digita almeno due caratteri',
  'search.loading': 'Ricerca in corso',
  'search.loadMore': 'Mostra altro',
  'search.retry': 'Riprova',
  'search.error': 'La ricerca non è riuscita',
  'search.offline': 'Offline — la ricerca riprenderà con la rete',
  'tab.messages': 'Messaggi',
  'tab.posts': 'Post',
  'tab.people': 'Persone',
  'messages.empty': 'Nessun messaggio corrisponde',
  'posts.empty': 'Nessun post corrisponde',
  'people.empty': 'Nessuno corrisponde',
  'type.post': 'Post',
  'type.reel': 'Reel',
  'type.story': 'Storia',
  'translated': 'Tradotto',
  'message.blurred': 'Messaggio sfocato',
} as const satisfies GlobalSearchCatalog;

export default it;
