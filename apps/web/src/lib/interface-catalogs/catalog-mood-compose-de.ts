import type { MoodComposeCatalog } from '../i18n-mood-compose-catalog';

/** LA CRÉATION D'UNE HUMEUR, ALLEMAND (#10527) — les clés du français. */
const de = {
  'status.compose.more': 'Weitere Emojis',
  'status.compose.bare.ask': 'Deine Stimmung ohne ein paar Worte veröffentlichen?',
  'status.compose.bare.add': 'Ein Wort hinzufügen',
  'status.compose.bare.publish': 'Trotzdem veröffentlichen',
  'mood.page.label': 'Die aktuelle Stimmung',
  'mood.page.close': 'Schließen',
  'mood.page.reply.placeholder': 'Privat antworten…',
  'mood.page.reply.send': 'Senden',
  'mood.page.reply.sent': 'Antwort gesendet',
  'mood.page.reply.open': 'Unterhaltung öffnen',
  'mood.page.reply.failed': 'Die Antwort wurde nicht gesendet. Versuche es erneut.',
  'mood.page.reply.offline': 'Offline: Versuche es erneut, sobald du verbunden bist.',
  'mood.page.gone': 'Diese Stimmung ist nicht mehr verfügbar.',
  'mood.page.loading': 'Stimmung wird geladen',
} as const satisfies MoodComposeCatalog;

export default de;
