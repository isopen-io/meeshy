import type { MoodComposeCatalog } from '../i18n-mood-compose-catalog';

/** LA CRÉATION D'UNE HUMEUR, ARABE (#10527) — les clés du français. */
const ar = {
  'status.compose.more': 'رموز تعبيرية أخرى',
  'status.compose.bare.ask': 'هل تريد نشر مزاجك دون كلمة قصيرة؟',
  'status.compose.bare.add': 'إضافة كلمة',
  'status.compose.bare.publish': 'النشر على أي حال',
} as const satisfies MoodComposeCatalog;

export default ar;
