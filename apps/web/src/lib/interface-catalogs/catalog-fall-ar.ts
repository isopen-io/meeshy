/**
 * LA CHUTE DÉTECTÉE (#18748, SAN-01), langue « ar » — chargée à la demande (`i18n-fall-catalog.ts`), jamais au
 * démarrage.
 */
import type { FallCatalog } from '../i18n-fall-catalog';

const ar = {
  'fall.announce.detected': 'تم رصد سقوط على ساعة {name}',
  'fall.announce.detectedSomeone': 'تم رصد سقوط على ساعة أحد أفراد عائلتك',
  'fall.announce.responded': '{name} بخير',
  'fall.announce.respondedSomeone': 'أحد أفراد عائلتك بخير',
  'fall.detail.title': 'تم رصد سقوط',
  'fall.detail.at': 'تم رصد سقوط عند {time}',
  'fall.detail.battery': 'آخر بطارية: {value}',
  'fall.detail.map': 'آخر موقع',
  'fall.share.title': 'التنبيه إذا رصدت ساعتي سقوطًا',
  'fall.share.explain': 'إذا رصدت ساعة Apple Watch سقوطًا، يتم تنبيه {name} فورًا.',
  'fall.me.title': 'رصد السقوط',
  'fall.me.source': 'Apple Watch',
  'fall.me.question': 'من أين يأتي الرصد؟',
  'fall.me.explain': 'يأتي من ساعة Apple Watch: تُمنح الموافقة في تطبيق iPhone، وليس هنا أبدًا. ثم يتم تنبيه أفراد عائلتك عند حدوث سقوط.',
  'fall.settings.failed': 'تعذّر حفظ الإعداد.',
  'fall.settings.offline': 'غير متصل: لم يتم حفظ الإعداد.',
} as const satisfies FallCatalog;

export default ar;
