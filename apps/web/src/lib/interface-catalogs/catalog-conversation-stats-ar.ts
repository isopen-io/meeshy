import type { ConversationStatsCatalog } from '@/lib/i18n-conversation-stats-catalog';

/** LES STATISTIQUES D'UNE CONVERSATION (#7835) — voir le doc-comment de `catalog-conversation-stats-fr.ts`. */
const ar = {
  'conversationStats.section': 'الإحصاءات',
  'conversationStats.messages': 'الرسائل',
  'conversationStats.words': 'الكلمات',
  'conversationStats.photos': 'الصور',
  'conversationStats.audio': 'صوت',
  'conversationStats.videos': 'مقاطع الفيديو',
  'conversationStats.documents': 'المستندات',
  'conversationStats.activity': 'النشاط',
  'conversationStats.periods.label': 'الفترة',
  'conversationStats.period.week.short': '7ي',
  'conversationStats.period.month.short': '30ي',
  'conversationStats.period.all.short': 'الكل',
  'conversationStats.period.week': 'آخر 7 أيام',
  'conversationStats.period.month': 'آخر 30 يومًا',
  'conversationStats.period.all': 'منذ البداية',
  'conversationStats.activity.summary.one': '{count} رسالة — {period}',
  'conversationStats.activity.summary.other': '{count} رسائل — {period}',
  'conversationStats.participants': 'النشاط حسب المشارك',
  'conversationStats.words_count': '{count} كلمة',
  'conversationStats.languages': 'اللغات',
  'conversationStats.loading': 'جارٍ تحميل الإحصاءات',
  'conversationStats.error': 'تعذّر تحميل الإحصاءات.',
  'conversationStats.retry': 'إعادة المحاولة',
  'conversationStats.empty': 'لا توجد رسائل بعد — ستظهر الإحصاءات مع المحادثة.',
  'conversationStats.offline': 'غير متصل — آخر إحصاءات معروفة.',
  'conversationStats.offline_empty': 'غير متصل — لم يتم تحميل الإحصاءات بعد.',
} satisfies ConversationStatsCatalog;

export default ar;
