import type { MoodComposeCatalog } from '../i18n-mood-compose-catalog';

/** LA CRÉATION D'UNE HUMEUR, ARABE (#10527) — les clés du français. */
const ar = {
  'status.compose.more': 'رموز تعبيرية أخرى',
  'status.compose.bare.ask': 'هل تريد نشر مزاجك دون كلمة قصيرة؟',
  'status.compose.bare.add': 'إضافة كلمة',
  'status.compose.bare.publish': 'النشر على أي حال',
  'mood.page.label': 'المزاج الحالي',
  'mood.page.close': 'إغلاق',
  'mood.page.reply.placeholder': 'الرد بشكل خاص…',
  'mood.page.reply.send': 'إرسال',
  'mood.page.reply.sent': 'تم إرسال الرد',
  'mood.page.reply.open': 'فتح المحادثة',
  'mood.page.reply.failed': 'لم يُرسل الرد. حاول مرة أخرى.',
  'mood.page.reply.offline': 'غير متصل: حاول مرة أخرى عند الاتصال.',
  'mood.page.gone': 'لم يعد هذا المزاج متاحًا.',
  'mood.page.loading': 'جارٍ تحميل المزاج',
} as const satisfies MoodComposeCatalog;

export default ar;
