import type { NotificationRowCatalogSlice } from './catalog-fr-notification-row';

/** Ce qu'une notification dit (#8727) — voir `catalog-fr-notification-row.ts`. */
const enNotificationRow = {
  'notifications.row.replyTo': 'In reply to “{text}”',
  'notifications.row.kind.story': 'Story',
  'notifications.row.kind.reel': 'Reel',
  'notifications.row.kind.mood': 'Mood',
  'notifications.row.kind.status': 'Status',
  'notifications.row.kind.post': 'Post',
  'notifications.row.media.photo': '📷 Photo',
  'notifications.row.media.video': '🎥 Video',
  'notifications.row.media.audio': '🎵 Audio',
  'notifications.row.expired': 'expired',
  'notifications.row.milestone.level': 'Level {level}',
  'notifications.row.milestone.streak': '{days} days in a row',
  'notifications.row.milestone.badgeReason': 'Badge unlocked · milestone {threshold}',
  'notifications.row.milestone.inviteJoined': '{name} joined Meeshy thanks to you',
  'notifications.quick.write': 'Message',
  'notifications.quick.connect': 'Connect',
  'notifications.quick.connect.sent': 'Request sent',
  'notifications.quick.failed': 'The request couldn’t be sent. Try again in a moment.',
  'notifications.banner.label': 'New notification',
  'notifications.banner.dismiss': 'Dismiss notification',
} as const satisfies NotificationRowCatalogSlice;

export default enNotificationRow;
