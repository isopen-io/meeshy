import type { ConversationStatsCatalog } from '@/lib/i18n-conversation-stats-catalog';

/** LES STATISTIQUES D'UNE CONVERSATION (#7835) — voir le doc-comment de `catalog-conversation-stats-fr.ts`. */
const es = {
  'conversationStats.section': 'Estadísticas',
  'conversationStats.messages': 'Mensajes',
  'conversationStats.words': 'Palabras',
  'conversationStats.photos': 'Fotos',
  'conversationStats.audio': 'Audio',
  'conversationStats.videos': 'Vídeos',
  'conversationStats.documents': 'Documentos',
  'conversationStats.activity': 'Actividad',
  'conversationStats.periods.label': 'Período',
  'conversationStats.period.week.short': '7d',
  'conversationStats.period.month.short': '30d',
  'conversationStats.period.all.short': 'Todo',
  'conversationStats.period.week': 'Últimos 7 días',
  'conversationStats.period.month': 'Últimos 30 días',
  'conversationStats.period.all': 'Todo el tiempo',
  'conversationStats.activity.summary.one': '{count} mensaje — {period}',
  'conversationStats.activity.summary.other': '{count} mensajes — {period}',
  'conversationStats.participants': 'Actividad por participante',
  'conversationStats.words_count': '{count} palabras',
  'conversationStats.languages': 'Idiomas',
  'conversationStats.loading': 'Cargando estadísticas',
  'conversationStats.error': 'No se pudieron cargar las estadísticas.',
  'conversationStats.retry': 'Reintentar',
  'conversationStats.empty': 'Aún no hay mensajes: las estadísticas llegarán con la conversación.',
  'conversationStats.offline': 'Sin conexión — últimas estadísticas conocidas.',
  'conversationStats.offline_empty': 'Sin conexión — las estadísticas aún no se han cargado.',
} satisfies ConversationStatsCatalog;

export default es;
