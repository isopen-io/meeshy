import type { MoodComposeCatalog } from '../i18n-mood-compose-catalog';

/** LA CRÉATION D'UNE HUMEUR, ALLEMAND (#10527) — les clés du français. */
const de = {
  'status.compose.more': 'Weitere Emojis',
  'status.compose.bare.ask': 'Deine Stimmung ohne ein paar Worte veröffentlichen?',
  'status.compose.bare.add': 'Ein Wort hinzufügen',
  'status.compose.bare.publish': 'Trotzdem veröffentlichen',
} as const satisfies MoodComposeCatalog;

export default de;
