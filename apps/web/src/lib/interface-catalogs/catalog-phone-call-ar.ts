/**
 * « EN APPEL » (#18753, ACT-01), langue « ar » — chargée à la demande (`i18n-phone-call-catalog.ts`), jamais au
 * démarrage.
 */
import type { PhoneCallCatalog } from '../i18n-phone-call-catalog';

const ar = {
  'call.announce.started': '{name} في مكالمة',
  'call.announce.startedSomeone': 'أحد أفراد عائلتك في مكالمة',
  'call.announce.ended': '{name} أنهى المكالمة',
  'call.announce.endedSomeone': 'أحد أفراد عائلتك أنهى المكالمة',
  'call.detail.title': 'في مكالمة',
  'call.detail.sinceTime': 'في مكالمة منذ {time}',
  'call.detail.sinceMinutes': 'في مكالمة منذ {count} د',
  'call.share.title': 'إظهار أنني في مكالمة',
  'call.share.explain': 'يرى {name} أنك في مكالمة، دون أن يعرف مع من.',
  'call.share.globalOff': 'متوقف للجميع في ملفك الشخصي.',
  'call.global.short': 'إظهار لعائلتي أنني في مكالمة',
  'call.settings.failed': 'تعذّر حفظ الإعداد.',
  'call.settings.offline': 'غير متصل: لم يُحفظ الإعداد.',
} as const satisfies PhoneCallCatalog;

export default ar;
