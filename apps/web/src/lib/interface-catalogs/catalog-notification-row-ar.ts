import type { NotificationRowCatalog } from '@/lib/i18n-notification-row-catalog';

/** Ce qu'une notification dit (#8727) — voir `catalog-notification-row-fr.ts`. */
const arNotificationRow = {
  'notifications.row.replyTo': 'ردًا على «{text}»',
  'notifications.row.kind.story': 'قصة',
  'notifications.row.kind.reel': 'مقطع',
  'notifications.row.kind.mood': 'حالة مزاجية',
  'notifications.row.kind.status': 'حالة',
  'notifications.row.kind.post': 'منشور',
  'notifications.row.media.photo': '📷 صورة',
  'notifications.row.media.video': '🎥 فيديو',
  'notifications.row.media.audio': '🎵 صوت',
  'notifications.row.expired': 'منتهية',
  'notifications.row.milestone.level': 'المستوى {level}',
  'notifications.row.milestone.streak': '{days} يومًا متتاليًا',
  'notifications.row.milestone.badgeReason': 'تم فتح شارة · المرحلة {threshold}',
  'notifications.row.milestone.inviteJoined': 'انضم {name} إلى Meeshy بفضلك',
  'notifications.quick.write': 'راسل',
  'notifications.quick.connect': 'تواصل',
  'notifications.quick.connect.sent': 'تم إرسال الطلب',
  'notifications.quick.failed': 'تعذّر إرسال الطلب. أعد المحاولة بعد لحظات.',
  'notifications.banner.label': 'إشعار جديد',
  'notifications.banner.dismiss': 'إغلاق الإشعار',
  'notifications.banner.previewHint': 'اسحب للأسفل أو اضغط السهم السفلي للمعاينة',
  'notifications.preview.label': 'معاينة المحادثة',
  'notifications.preview.close': 'إغلاق المعاينة',
  'notifications.preview.open': 'فتح المحادثة',
} as const satisfies NotificationRowCatalog;

export default arNotificationRow;
