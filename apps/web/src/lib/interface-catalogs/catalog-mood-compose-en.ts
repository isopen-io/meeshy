import type { MoodComposeCatalog } from '../i18n-mood-compose-catalog';

/** LA CRÉATION D'UNE HUMEUR, ANGLAIS (#10527) — les clés du français. */
const en = {
  'status.compose.more': 'More emojis',
  'status.compose.bare.ask': 'Publish your mood without a few words?',
  'status.compose.bare.add': 'Add a word',
  'status.compose.bare.publish': 'Publish anyway',
} as const satisfies MoodComposeCatalog;

export default en;
