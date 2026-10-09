/** La feuille « Vues » enrichie (#9727), ARABE — voir `catalog-viewer-engagement-fr.ts`. */
import type { ViewerEngagementCatalog } from '@/lib/i18n-viewer-engagement-catalog';

const ar = {
  'viewerEngagement.shares.one': 'مشاركة واحدة ({count})',
  'viewerEngagement.shares.other': '{count} مشاركات',
  'viewerEngagement.reposts.one': 'إعادة نشر واحدة ({count})',
  'viewerEngagement.reposts.other': '{count} إعادات نشر',
  'viewerEngagement.comments.one': 'تعليق واحد ({count})',
  'viewerEngagement.comments.other': '{count} تعليقات',
  'viewerEngagement.replies.one': 'رد واحد ({count})',
  'viewerEngagement.replies.other': '{count} ردود',
  'viewerEngagement.reactions': 'التفاعلات: {emojis}',
  'viewerEngagement.viewedAt': 'شوهد في {time}',
  'viewerEngagement.onlyViewed': 'شاهد دون أي تفاعل آخر',
  'viewerEngagement.openProfile': 'عرض الملف الشخصي',
  'viewerEngagement.back': 'العودة إلى المشاهدات',
  'viewerEngagement.openDetail': 'عرض ما فعله {name}',
  'viewerEngagement.empty.subtitle': 'سيظهر هنا الأشخاص الذين يشاهدون هذا المنشور.',
  'viewerEngagement.forbidden': 'المؤلف وحده يمكنه رؤية من شاهد هذا المنشور.',
  'viewerEngagement.unavailable': 'تفاصيل النشاط غير متاحة مؤقتًا.',
} satisfies ViewerEngagementCatalog;

export default ar;
