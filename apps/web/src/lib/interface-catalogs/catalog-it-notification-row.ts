import type { NotificationRowCatalogSlice } from './catalog-fr-notification-row';

/** Ce qu'une notification dit (#8727) — voir `catalog-fr-notification-row.ts`. */
const itNotificationRow = {
  'notifications.row.replyTo': 'In risposta a “{text}”',
  'notifications.row.kind.story': 'Storia',
  'notifications.row.kind.reel': 'Reel',
  'notifications.row.kind.mood': 'Stato d’animo',
  'notifications.row.kind.status': 'Stato',
  'notifications.row.kind.post': 'Post',
  'notifications.row.media.photo': '📷 Foto',
  'notifications.row.media.video': '🎥 Video',
  'notifications.row.media.audio': '🎵 Audio',
  'notifications.row.expired': 'scaduta',
  'notifications.row.milestone.level': 'Livello {level}',
  'notifications.row.milestone.streak': '{days} giorni di fila',
  'notifications.row.milestone.badgeReason': 'Badge sbloccato · livello {threshold}',
  'notifications.row.milestone.inviteJoined': '{name} si è unito a Meeshy grazie a te',
  'notifications.quick.write': 'Scrivi',
  'notifications.quick.connect': 'Collegati',
  'notifications.quick.connect.sent': 'Richiesta inviata',
  'notifications.quick.failed': 'Non è stato possibile inviare la richiesta. Riprova tra un attimo.',
  'notifications.banner.label': 'Nuova notifica',
  'notifications.banner.dismiss': 'Chiudi la notifica',
} as const satisfies NotificationRowCatalogSlice;

export default itNotificationRow;
