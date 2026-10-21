/**
 * LES STATISTIQUES D'UNE CONVERSATION (#7835), FRANÇAIS — la SOURCE des clés
 * `conversationStats.*` : la section « Statistiques » de la feuille de détails,
 * avec les mots de l'onglet Stats d'iOS (`dashboard.*`). Hors du catalogue
 * d'interface, arrivé à son plafond : chargé par la section
 * (`i18n-conversation-stats-catalog.ts`), jamais au démarrage.
 */
const fr = {
  'conversationStats.section': 'Statistiques',
  'conversationStats.messages': 'Messages',
  'conversationStats.words': 'Mots',
  'conversationStats.photos': 'Photos',
  'conversationStats.audio': 'Audio',
  'conversationStats.videos': 'Vidéos',
  'conversationStats.documents': 'Documents',
  'conversationStats.activity': 'Activité',
  'conversationStats.periods.label': 'Période',
  'conversationStats.period.week.short': '7j',
  'conversationStats.period.month.short': '30j',
  'conversationStats.period.all.short': 'Tout',
  'conversationStats.period.week': '7 derniers jours',
  'conversationStats.period.month': '30 derniers jours',
  'conversationStats.period.all': 'Depuis le début',
  'conversationStats.activity.summary.one': '{count} message — {period}',
  'conversationStats.activity.summary.other': '{count} messages — {period}',
  'conversationStats.participants': 'Activité par participant',
  'conversationStats.words_count': '{count} mots',
  'conversationStats.languages': 'Langues',
  'conversationStats.loading': 'Chargement des statistiques',
  'conversationStats.error': 'Impossible de charger les statistiques.',
  'conversationStats.retry': 'Réessayer',
  'conversationStats.empty': 'Aucun message pour l’instant — les statistiques viendront avec la conversation.',
  'conversationStats.offline': 'Hors ligne — dernières statistiques connues.',
  'conversationStats.offline_empty': 'Hors ligne — les statistiques n’ont pas encore été chargées.',
} as const;

export default fr;
