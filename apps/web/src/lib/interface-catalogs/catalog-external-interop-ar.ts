import type { ExternalInteropCatalog } from '@/lib/i18n-external-interop-catalog';

/** L'information sur ce qui part chez Meta et le signalement d'un contenu WhatsApp (#17120) — voir `catalog-external-interop-fr.ts`. */
const ar = {
  'externalInterop.notice.title': 'الكتابة إلى صديق على واتساب',
  'externalInterop.notice.lead': 'للوصول إلى صديقك على واتساب، يرسل Meeshy إلى Meta، الشركة المشغّلة لواتساب:',
  'externalInterop.disclosure.phone-number': 'رقم هاتفك الموثَّق، الذي يعرّف بك على واتساب؛',
  'externalInterop.disclosure.profile-name': 'اسمك المعروض؛',
  'externalInterop.disclosure.public-keys': 'مفاتيح التشفير العامة لأجهزتك؛',
  'externalInterop.disclosure.encrypted-content': 'رسائلك ووسائطك، مشفّرة من طرف إلى طرف: لا تستطيع Meta قراءتها؛',
  'externalInterop.disclosure.delivery-metadata': 'من يكتب إلى من، ومتى، وحجم المرسَلات، وإشعارات الاستلام.',
  'externalInterop.notice.retention': 'يحتفظ Meeshy برقم صديقك لمدة {days} يومًا بعد آخر مرة تفتح فيها المحادثة، ثم يحذفه.',
  'externalInterop.notice.retention.unknown': 'يحتفظ Meeshy برقم صديقك لمدة محدودة، ثم يحذفه.',
  'externalInterop.notice.translation': 'تتم الترجمة على جهازك: لا يرى Meeshy محتوى هذه المحادثة أبدًا.',
  'externalInterop.notice.withdraw': 'يمكنك سحب هذه الموافقة في أي وقت: يحذف Meeshy عندها أرقام أصدقائك على واتساب.',
  'externalInterop.notice.accept': 'أوافق وأتابع',
  'externalInterop.notice.accept.busy': 'جارٍ الحفظ…',
  'externalInterop.notice.cancel': 'إلغاء',
  'externalInterop.notice.outdated': 'تغيّرت هذه المعلومات: حدِّث Meeshy لقراءتها مجددًا قبل الموافقة.',
  'externalInterop.notice.unavailable': 'الكتابة إلى صديق على واتساب غير متاحة هنا بعد.',
  'externalInterop.notice.error': 'تعذّر حفظ موافقتك. أعد المحاولة.',
  'externalInterop.report.title': 'الإبلاغ عن محتوى واتساب هذا',
  'externalInterop.report.lead': 'لا يستطيع Meeshy قراءة هذه المحادثة: لا يُرسَل إلى فريق الإشراف إلا ما تختار إرفاقه.',
  'externalInterop.report.reason': 'السبب',
  'externalInterop.report.attach': 'إرفاق نص الرسالة',
  'externalInterop.report.attach.hint': 'يُرسَل النص المرفق دون تشفير إلى فريق الإشراف في Meeshy.',
  'externalInterop.report.block': 'حظر جهة الاتصال هذه على Meeshy',
  'externalInterop.report.submit': 'إرسال البلاغ',
  'externalInterop.report.submit.busy': 'جارٍ الإرسال…',
  'externalInterop.report.cancel': 'إلغاء',
  'externalInterop.report.done.title': 'تم إرسال البلاغ',
  'externalInterop.report.done.blocked': 'جهة الاتصال هذه محظورة: لن تتلقى رسائلها بعد الآن على Meeshy.',
  'externalInterop.report.done.orientation': 'لا يستطيع Meeshy التصرف في حسابها على واتساب. لإزالة هذا المحتوى من واتساب، استخدم أداة الإبلاغ التي توفرها Meta.',
  'externalInterop.report.done.close': 'إغلاق',
  'externalInterop.report.error': 'تعذّر إرسال البلاغ. أعد المحاولة.',
} satisfies ExternalInteropCatalog;

export default ar;
