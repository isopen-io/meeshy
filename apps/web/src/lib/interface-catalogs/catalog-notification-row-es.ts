import type { NotificationRowCatalog } from '@/lib/i18n-notification-row-catalog';

/** Ce qu'une notification dit (#8727) — voir `catalog-notification-row-fr.ts`. */
const esNotificationRow = {
  'notifications.row.replyTo': 'En respuesta a «{text}»',
  'notifications.row.kind.story': 'Historia',
  'notifications.row.kind.reel': 'Reel',
  'notifications.row.kind.mood': 'Estado de ánimo',
  'notifications.row.kind.status': 'Estado',
  'notifications.row.kind.post': 'Publicación',
  'notifications.row.media.photo': '📷 Foto',
  'notifications.row.media.video': '🎥 Vídeo',
  'notifications.row.media.audio': '🎵 Audio',
  'notifications.row.expired': 'caducada',
  'notifications.row.milestone.level': 'Nivel {level}',
  'notifications.row.milestone.streak': '{days} días seguidos',
  'notifications.row.milestone.badgeReason': 'Insignia desbloqueada · nivel {threshold}',
  'notifications.row.milestone.inviteJoined': '{name} se unió a Meeshy gracias a ti',
  'notifications.quick.write': 'Escribir',
  'notifications.quick.connect': 'Conectar',
  'notifications.quick.connect.sent': 'Solicitud enviada',
  'notifications.quick.failed': 'No se pudo enviar la solicitud. Inténtalo de nuevo en un momento.',
  'notifications.banner.label': 'Nueva notificación',
  'notifications.banner.dismiss': 'Cerrar la notificación',
  'notifications.banner.previewHint': 'Desliza hacia abajo o pulsa Flecha abajo para una vista previa',
  'notifications.preview.label': 'Vista previa de la conversación',
  'notifications.preview.close': 'Cerrar la vista previa',
  'notifications.preview.open': 'Abrir la conversación',
} as const satisfies NotificationRowCatalog;

export default esNotificationRow;
