import type { NotificationRowCatalogSlice } from './catalog-fr-notification-row';

/** Ce qu'une notification dit (#8727) — voir `catalog-fr-notification-row.ts`. */
const ptNotificationRow = {
  'notifications.row.replyTo': 'Em resposta a “{text}”',
  'notifications.row.kind.story': 'Story',
  'notifications.row.kind.reel': 'Reel',
  'notifications.row.kind.mood': 'Humor',
  'notifications.row.kind.status': 'Status',
  'notifications.row.kind.post': 'Publicação',
  'notifications.row.media.photo': '📷 Foto',
  'notifications.row.media.video': '🎥 Vídeo',
  'notifications.row.media.audio': '🎵 Áudio',
  'notifications.row.expired': 'expirada',
  'notifications.row.milestone.level': 'Nível {level}',
  'notifications.row.milestone.streak': '{days} dias seguidos',
  'notifications.row.milestone.badgeReason': 'Emblema desbloqueado · nível {threshold}',
  'notifications.row.milestone.inviteJoined': '{name} entrou no Meeshy graças a você',
  'notifications.quick.write': 'Escrever',
  'notifications.quick.connect': 'Conectar',
  'notifications.quick.connect.sent': 'Pedido enviado',
  'notifications.quick.failed': 'Não foi possível enviar o pedido. Tente de novo em instantes.',
  'notifications.banner.label': 'Nova notificação',
  'notifications.banner.dismiss': 'Fechar a notificação',
} as const satisfies NotificationRowCatalogSlice;

export default ptNotificationRow;
