import type { ConversationStatsCatalog } from '@/lib/i18n-conversation-stats-catalog';

/** LES STATISTIQUES D'UNE CONVERSATION (#7835) — voir le doc-comment de `catalog-conversation-stats-fr.ts`. */
const en = {
  'conversationStats.section': 'Statistics',
  'conversationStats.messages': 'Messages',
  'conversationStats.words': 'Words',
  'conversationStats.photos': 'Photos',
  'conversationStats.audio': 'Audio',
  'conversationStats.videos': 'Videos',
  'conversationStats.documents': 'Documents',
  'conversationStats.activity': 'Activity',
  'conversationStats.periods.label': 'Period',
  'conversationStats.period.week.short': '7d',
  'conversationStats.period.month.short': '30d',
  'conversationStats.period.all.short': 'All',
  'conversationStats.period.week': 'Last 7 days',
  'conversationStats.period.month': 'Last 30 days',
  'conversationStats.period.all': 'All time',
  'conversationStats.activity.summary.one': '{count} message — {period}',
  'conversationStats.activity.summary.other': '{count} messages — {period}',
  'conversationStats.participants': 'Activity by participant',
  'conversationStats.words_count': '{count} words',
  'conversationStats.languages': 'Languages',
  'conversationStats.loading': 'Loading statistics',
  'conversationStats.error': 'Couldn’t load the statistics.',
  'conversationStats.retry': 'Try again',
  'conversationStats.empty': 'No messages yet — statistics will come with the conversation.',
  'conversationStats.offline': 'Offline — last known statistics.',
  'conversationStats.offline_empty': 'Offline — the statistics haven’t been loaded yet.',
} satisfies ConversationStatsCatalog;

export default en;
