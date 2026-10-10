import type { SoundsMineCatalog } from '@/lib/i18n-sounds-mine-catalog';

/** « MES SONS » (#9848) — voir le doc-comment de `catalog-sounds-mine-fr.ts`. */
const en = {
  'soundsMine.title': 'My sounds',
  'soundsMine.back': 'Back to settings',
  'soundsMine.empty.title': 'No sounds in your library',
  'soundsMine.empty.subtitle': 'Sounds you upload or that are extracted from your videos will appear here.',
  'soundsMine.error.title': 'Couldn’t load your sounds',
  'soundsMine.untitled': 'Original sound',
  'soundsMine.posts.one': '{count} post',
  'soundsMine.posts.other': '{count} posts',
  'soundsMine.action.remove': 'Remove from my library',
  'soundsMine.remove.title': 'Remove this sound from your library?',
  'soundsMine.remove.confirm': 'Remove',
  'soundsMine.remove.body.unused': 'This sound will disappear from your library and can no longer be added to a post.',
  'soundsMine.remove.body.one': '{count} post still uses it and will keep playing it. It will disappear from your library and can no longer be added to a new post.',
  'soundsMine.remove.body.other': '{count} posts still use it and will keep playing it. It will disappear from your library and can no longer be added to a new post.',
  'soundsMine.remove.success': 'Sound removed from your library',
  'soundsMine.remove.failure': 'The sound couldn’t be removed. Try again.',
  'soundsMine.offline': 'Offline — you can remove it once you’re back online.',
} satisfies SoundsMineCatalog;

export default en;
