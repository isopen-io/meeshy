import type { NotificationRowCatalog } from '@/lib/i18n-notification-row-catalog';

/** Ce qu'une notification dit (#8727) — voir `catalog-notification-row-fr.ts`. */
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
  'notifications.banner.previewHint': 'Trascina verso il basso o premi Freccia giù per un’anteprima',
  'notifications.banner.openMap': 'Apri la mappa',
  'notifications.banner.join': 'Unisciti',
  'notifications.banner.reply': 'Rispondi',
  'notifications.banner.member': '1 membro',
  'notifications.banner.members': '{count} membri',
  'notifications.banner.play': 'Riproduci',
  'notifications.banner.pause': 'Metti in pausa',
  'notifications.banner.speed': 'Velocità di riproduzione',
  'notifications.preview.label': 'Anteprima della conversazione',
  'notifications.preview.close': 'Chiudi l’anteprima',
  'notifications.preview.open': 'Apri la conversazione',
} as const satisfies NotificationRowCatalog;

export default itNotificationRow;
