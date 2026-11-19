/**
 * LA VÉRIFICATION D'INACTIVITÉ (#18738, TEL-02), langue « ar » — chargée à la demande
 * (`i18n-inactivity-catalog.ts`), jamais au démarrage.
 */
import type { InactivityCatalog } from '../i18n-inactivity-catalog';

const ar = {
  'inactivity.announce.alert': 'لم يردّ {name} على «هل كل شيء بخير؟»',
  'inactivity.announce.alertSomeone': 'أحد أفراد عائلتك لم يردّ على «هل كل شيء بخير؟»',
  'inactivity.announce.responded': '{name} بخير',
  'inactivity.announce.respondedSomeone': 'أحد أفراد عائلتك بخير',
  'inactivity.detail.title': 'عدم النشاط',
  'inactivity.detail.since': 'لا نشاط منذ {time}',
  'inactivity.detail.battery': 'آخر بطارية: {value}',
  'inactivity.detail.map': 'آخر موقع',
  'inactivity.share.title': 'التنبيه إذا لم أردّ',
  'inactivity.share.explain': 'إذا بقي هاتفك دون نشاط ولم تردّ على «هل كل شيء بخير؟»، يتم تنبيه {name}.',
  'inactivity.global.title': 'التحقق من عدم النشاط',
  'inactivity.global.off': 'متوقف',
  'inactivity.global.hours': '{count} س',
  'inactivity.settings.failed': 'تعذّر حفظ الإعداد.',
  'inactivity.settings.offline': 'غير متصل: لم يتم حفظ الإعداد.',
} as const satisfies InactivityCatalog;

export default ar;
