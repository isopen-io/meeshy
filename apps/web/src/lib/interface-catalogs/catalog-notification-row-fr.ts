/**
 * CE QU'UNE NOTIFICATION DIT, FRANÇAIS (#8727, jumelle web de #8723 / #8724) —
 * la SOURCE des clés du catalogue de la cloche et de la bannière in-app
 * (`i18n-notification-row-catalog.ts`), chargé avec elles : le pied de CONTEXTE d'une ligne (le
 * contenu visé), le palier nommé, les gestes d'un ami parrainé et la bannière
 * in-app. Les mots sont ceux d'iOS (`Localizable.xcstrings`, clés
 * `content.kind.*`, `media.summary.*`, `notification.milestone.*`,
 * `notifications.quick.*`) : même geste, même mot.
 */
const frNotificationRow = {
  'notifications.row.replyTo': 'En réponse à « {text} »',
  'notifications.row.kind.story': 'Story',
  'notifications.row.kind.reel': 'Réel',
  'notifications.row.kind.mood': 'Humeur',
  'notifications.row.kind.status': 'Statut',
  'notifications.row.kind.post': 'Publication',
  'notifications.row.media.photo': '📷 Photo',
  'notifications.row.media.video': '🎥 Vidéo',
  'notifications.row.media.audio': '🎵 Audio',
  'notifications.row.expired': 'expirée',
  'notifications.row.milestone.level': 'Niveau {level}',
  'notifications.row.milestone.streak': '{days} jours d’affilée',
  'notifications.row.milestone.badgeReason': 'Badge débloqué · palier {threshold}',
  'notifications.row.milestone.inviteJoined': '{name} a rejoint Meeshy grâce à vous',
  'notifications.quick.write': 'Écrire',
  'notifications.quick.connect': 'Se connecter',
  'notifications.quick.connect.sent': 'Demande envoyée',
  'notifications.quick.failed': 'La demande n’a pas pu partir. Réessayez dans un instant.',
  'notifications.banner.label': 'Nouvelle notification',
  'notifications.banner.dismiss': 'Fermer la notification',
} as const;

export default frNotificationRow;
