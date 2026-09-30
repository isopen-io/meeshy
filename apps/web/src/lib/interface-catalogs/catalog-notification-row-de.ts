import type { NotificationRowCatalog } from '@/lib/i18n-notification-row-catalog';

/** Ce qu'une notification dit (#8727) — voir `catalog-notification-row-fr.ts`. */
const deNotificationRow = {
  'notifications.row.replyTo': 'Als Antwort auf „{text}“',
  'notifications.row.kind.story': 'Story',
  'notifications.row.kind.reel': 'Reel',
  'notifications.row.kind.mood': 'Stimmung',
  'notifications.row.kind.status': 'Status',
  'notifications.row.kind.post': 'Beitrag',
  'notifications.row.media.photo': '📷 Foto',
  'notifications.row.media.video': '🎥 Video',
  'notifications.row.media.audio': '🎵 Audio',
  'notifications.row.expired': 'abgelaufen',
  'notifications.row.milestone.level': 'Stufe {level}',
  'notifications.row.milestone.streak': '{days} Tage in Folge',
  'notifications.row.milestone.badgeReason': 'Abzeichen freigeschaltet · Stufe {threshold}',
  'notifications.row.milestone.inviteJoined': '{name} ist dank dir Meeshy beigetreten',
  'notifications.quick.write': 'Schreiben',
  'notifications.quick.connect': 'Verbinden',
  'notifications.quick.connect.sent': 'Anfrage gesendet',
  'notifications.quick.failed': 'Die Anfrage konnte nicht gesendet werden. Versuch es gleich noch einmal.',
  'notifications.banner.label': 'Neue Benachrichtigung',
  'notifications.banner.dismiss': 'Benachrichtigung schließen',
} as const satisfies NotificationRowCatalog;

export default deNotificationRow;
