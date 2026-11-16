/**
 * هاتف المقرّبين وأهل الدم الذي يتعذّر الوصول إليه (#18737، TEL-01)، العربية — يُحمَّل عند الحاجة
 * (`i18n-phone-reachability-catalog.ts`)، لا عند البدء.
 */
import type { PhoneReachabilityCatalog } from '../i18n-phone-reachability-catalog';

const ar = {
  'phone.announce.unreachable': 'يتعذّر الوصول إلى هاتف {name} منذ {time}',
  'phone.announce.unreachableSomeone': 'يتعذّر الوصول إلى هاتف شخص مقرّب منذ {time}',
  'phone.announce.reachable': 'هاتف {name} يستجيب من جديد',
  'phone.announce.reachableSomeone': 'هاتف شخص مقرّب يستجيب من جديد',
  'phone.a11y.unreachable': 'يتعذّر الوصول إلى الهاتف منذ {time}',
  'phone.detail.title': 'الهاتف',
  'phone.detail.since': 'يتعذّر الوصول إلى الهاتف منذ {time}',
  'phone.cause.battery': 'البطارية فارغة على الأرجح',
  'phone.cause.network': 'بلا شبكة أو في وضع الطيران على الأرجح',
  'phone.share.title': 'إبلاغ {name} إذا تعذّر الوصول إلى هاتفي',
  'phone.share.explainClose': 'سيعرف {name} منذ متى لا يستجيب هاتفك والسبب المرجّح. لا تتم مشاركة أي شيء حتى تفعّل ذلك.',
  'phone.share.explainBlood': 'مفعّل افتراضيًا مع أهل دمك. يمكنك إلغاؤه في أي وقت.',
  'phone.share.globalOff': 'لم تعد تُبلغ أحدًا: الإعداد متوقّف للجميع من ملفك الشخصي.',
  'phone.global.title': 'إبلاغ مقرّبيّ إذا تعذّر الوصول إلى هاتفي',
  'phone.global.short': 'الهاتف غير متاح',
  'phone.global.explain': 'يعرف أهل دمك، والمقرّبون الذين سمحت لهم، منذ متى لا يستجيب هاتفك والسبب المرجّح. أبدًا داخل محادثة.',
  'phone.global.question': 'من يتم إبلاغه؟',
  'phone.consent.title': 'إبلاغ {name} إذا توقّف هاتفك عن الاستجابة؟',
  'phone.consent.body': 'سيعرف {name} أنه يتعذّر الوصول إلى هاتفك، ومنذ متى، وما إذا كان السبب على الأرجح البطارية أو الشبكة. يمكنك تغيير ذلك هنا متى شئت.',
  'phone.consent.confirm': 'متابعة',
  'phone.settings.failed': 'تعذّر حفظ الإعداد.',
  'phone.settings.offline': 'غير متصل: لم يتم حفظ الإعداد.',
  'phone.webNote': 'هذا المتصفح لا يُحتسب: تطبيق Meeshy على هاتفك وحده يخبر إن كان يمكن الوصول إليه.',
} as const satisfies PhoneReachabilityCatalog;

export default ar;
