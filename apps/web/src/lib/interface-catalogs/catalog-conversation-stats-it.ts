import type { ConversationStatsCatalog } from '@/lib/i18n-conversation-stats-catalog';

/** LES STATISTIQUES D'UNE CONVERSATION (#7835) — voir le doc-comment de `catalog-conversation-stats-fr.ts`. */
const it = {
  'conversationStats.section': 'Statistiche',
  'conversationStats.messages': 'Messaggi',
  'conversationStats.words': 'Parole',
  'conversationStats.photos': 'Foto',
  'conversationStats.audio': 'Audio',
  'conversationStats.videos': 'Video',
  'conversationStats.documents': 'Documenti',
  'conversationStats.activity': 'Attività',
  'conversationStats.periods.label': 'Periodo',
  'conversationStats.period.week.short': '7g',
  'conversationStats.period.month.short': '30g',
  'conversationStats.period.all.short': 'Tutto',
  'conversationStats.period.week': 'Ultimi 7 giorni',
  'conversationStats.period.month': 'Ultimi 30 giorni',
  'conversationStats.period.all': 'Dall’inizio',
  'conversationStats.activity.summary.one': '{count} messaggio — {period}',
  'conversationStats.activity.summary.other': '{count} messaggi — {period}',
  'conversationStats.participants': 'Attività per partecipante',
  'conversationStats.words_count': '{count} parole',
  'conversationStats.languages': 'Lingue',
  'conversationStats.loading': 'Caricamento delle statistiche',
  'conversationStats.error': 'Impossibile caricare le statistiche.',
  'conversationStats.retry': 'Riprova',
  'conversationStats.empty': 'Ancora nessun messaggio — le statistiche arriveranno con la conversazione.',
  'conversationStats.offline': 'Offline — ultime statistiche note.',
  'conversationStats.offline_empty': 'Offline — le statistiche non sono ancora state caricate.',
} satisfies ConversationStatsCatalog;

export default it;
