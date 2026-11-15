import type { MoodComposeCatalog } from '../i18n-mood-compose-catalog';

/** LA CRÉATION D'UNE HUMEUR, ANGLAIS (#10527) — les clés du français. */
const en = {
  'status.compose.more': 'More emojis',
  'status.compose.bare.ask': 'Publish your mood without a few words?',
  'status.compose.bare.add': 'Add a word',
  'status.compose.bare.publish': 'Publish anyway',
  'mood.page.label': 'Current mood',
  'mood.page.close': 'Close',
  'mood.page.reply.placeholder': 'Reply privately…',
  'mood.page.reply.send': 'Send',
  'mood.page.reply.sent': 'Reply sent',
  'mood.page.reply.open': 'Open the conversation',
  'mood.page.reply.failed': 'Your reply wasn’t sent. Try again.',
  'mood.page.reply.offline': 'Offline: try again once you’re connected.',
  'mood.page.gone': 'This mood is no longer available.',
  'mood.page.loading': 'Loading the mood',
} as const satisfies MoodComposeCatalog;

export default en;
