import type { ConversationStatsCatalog } from '@/lib/i18n-conversation-stats-catalog';

/** LES STATISTIQUES D'UNE CONVERSATION (#7835) — voir le doc-comment de `catalog-conversation-stats-fr.ts`. */
const de = {
  'conversationStats.section': 'Statistiken',
  'conversationStats.messages': 'Nachrichten',
  'conversationStats.words': 'Wörter',
  'conversationStats.photos': 'Fotos',
  'conversationStats.audio': 'Audio',
  'conversationStats.videos': 'Videos',
  'conversationStats.documents': 'Dokumente',
  'conversationStats.activity': 'Aktivität',
  'conversationStats.periods.label': 'Zeitraum',
  'conversationStats.period.week.short': '7T',
  'conversationStats.period.month.short': '30T',
  'conversationStats.period.all.short': 'Alle',
  'conversationStats.period.week': 'Letzte 7 Tage',
  'conversationStats.period.month': 'Letzte 30 Tage',
  'conversationStats.period.all': 'Gesamter Zeitraum',
  'conversationStats.activity.summary.one': '{count} Nachricht — {period}',
  'conversationStats.activity.summary.other': '{count} Nachrichten — {period}',
  'conversationStats.participants': 'Aktivität pro Teilnehmer',
  'conversationStats.words_count': '{count} Wörter',
  'conversationStats.languages': 'Sprachen',
  'conversationStats.loading': 'Statistiken werden geladen',
  'conversationStats.error': 'Die Statistiken konnten nicht geladen werden.',
  'conversationStats.retry': 'Erneut versuchen',
  'conversationStats.empty': 'Noch keine Nachrichten — die Statistiken kommen mit der Unterhaltung.',
  'conversationStats.offline': 'Offline — zuletzt bekannte Statistiken.',
  'conversationStats.offline_empty': 'Offline — die Statistiken wurden noch nicht geladen.',
} satisfies ConversationStatsCatalog;

export default de;
