import type { ConversationStatsCatalog } from '@/lib/i18n-conversation-stats-catalog';

/** LES STATISTIQUES D'UNE CONVERSATION (#7835) — voir le doc-comment de `catalog-conversation-stats-fr.ts`. */
const pt = {
  'conversationStats.section': 'Estatísticas',
  'conversationStats.messages': 'Mensagens',
  'conversationStats.words': 'Palavras',
  'conversationStats.photos': 'Fotos',
  'conversationStats.audio': 'Áudio',
  'conversationStats.videos': 'Vídeos',
  'conversationStats.documents': 'Documentos',
  'conversationStats.activity': 'Atividade',
  'conversationStats.periods.label': 'Período',
  'conversationStats.period.week.short': '7d',
  'conversationStats.period.month.short': '30d',
  'conversationStats.period.all.short': 'Tudo',
  'conversationStats.period.week': 'Últimos 7 dias',
  'conversationStats.period.month': 'Últimos 30 dias',
  'conversationStats.period.all': 'Desde o início',
  'conversationStats.activity.summary.one': '{count} mensagem — {period}',
  'conversationStats.activity.summary.other': '{count} mensagens — {period}',
  'conversationStats.participants': 'Atividade por participante',
  'conversationStats.words_count': '{count} palavras',
  'conversationStats.languages': 'Idiomas',
  'conversationStats.loading': 'Carregando estatísticas',
  'conversationStats.error': 'Não foi possível carregar as estatísticas.',
  'conversationStats.retry': 'Tentar novamente',
  'conversationStats.empty': 'Ainda não há mensagens — as estatísticas virão com a conversa.',
  'conversationStats.offline': 'Offline — últimas estatísticas conhecidas.',
  'conversationStats.offline_empty': 'Offline — as estatísticas ainda não foram carregadas.',
} satisfies ConversationStatsCatalog;

export default pt;
