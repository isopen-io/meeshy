import type { GlobalSearchCatalog } from '../i18n-global-search-catalog';

/** LA RECHERCHE GÉNÉRALE, ANGLAIS (#14619, #14620). */
const en = {
  'section.messages': 'Messages',
  'search.title': 'Search',
  'search.placeholder': 'Messages, posts, people',
  'search.label': 'Search everywhere',
  'search.clear': 'Clear search',
  'search.back': 'Back',
  'search.everywhere': 'Search everywhere',
  'search.hint': 'Type at least two characters',
  'search.loading': 'Searching',
  'search.loadMore': 'Show more',
  'search.retry': 'Retry',
  'search.error': 'The search didn’t go through',
  'search.offline': 'Offline — search will resume when you’re back online',
  'tab.messages': 'Messages',
  'tab.posts': 'Posts',
  'tab.people': 'People',
  'messages.empty': 'No message matches',
  'posts.empty': 'No post matches',
  'people.empty': 'Nobody matches',
  'type.post': 'Post',
  'type.reel': 'Reel',
  'type.story': 'Story',
  'translated': 'Translated',
} as const satisfies GlobalSearchCatalog;

export default en;
