import type { SignInLinkCatalog } from '@/lib/i18n-sign-in-link-catalog';

/** La confirmation d'un lien de connexion (8da83d255f) — voir `catalog-sign-in-link-fr.ts`. */
const ar = {
  'signInLink.confirm.title': 'تسجيل الدخول باسم ‎@{username}؟',
  'signInLink.confirm.lead': 'لم يُطلب هذا الرابط من هذا الجهاز. لا تتابع إلا إذا كان هذا الحساب حسابك.',
  'signInLink.confirm.leadSignedIn': 'أنت مسجّل الدخول باسم ‎@{current}. سيفتح هذا الرابط الحساب أدناه بدلًا منه، وسيبقى ‎@{current} ضمن حساباتك على هذا الجهاز.',
  'signInLink.confirm.accept': 'تسجيل الدخول',
  'signInLink.confirm.cancel': 'إلغاء',
  'signInLink.confirm.claim': 'سيُربط هذا العنوان بـ ‎@{username}‎ ويُزال من أي حساب Meeshy آخر.',
  'signInLink.confirm.acceptClaim': 'ربط العنوان وتسجيل الدخول',
  'verifyEmail.bar.title': 'التحقق من البريد الإلكتروني',
  'verifyEmail.noAddress': 'لا يحتوي هذا الرابط على أي عنوان بريد إلكتروني للتحقق منه. افتحه من البريد الذي أرسلته إليك Meeshy.',
  'verifyEmail.continue': 'متابعة',
  'verifyEmail.title': 'تحقق من بريدك الإلكتروني',
  'verifyEmail.subtitle': 'أدخل الرمز المكوّن من 6 أرقام المرسل إلى {email}',
  'verifyEmail.subtitle.created': 'أنشأنا حسابك وأرسلنا رمزًا ورابطًا إلى {email}. أدخل الرمز أو افتح الرابط.',
  'verifyEmail.subtitle.pending': 'كلمة المرور صحيحة، لكن يجب أولًا تفعيل حسابك بإثبات أن هذا العنوان لك. أرسلنا للتو رمزًا ورابطًا إلى {email}.',
  'verifyEmail.subtitle.pending.inbox': 'افتح بريدك الوارد، ولا تنسَ التحقق من مجلد الرسائل غير المرغوب فيها.',
  'verifyEmail.resend.prompt': 'لم يصلك الرمز؟',
  'verifyEmail.resend': 'إعادة إرسال الرمز',
  'verifyEmail.resend.busy': 'جارٍ الإرسال…',
  'verifyEmail.resend.locked': 'إعادة إرسال الرمز ({seconds}ث)',
  'verifyEmail.resend.done': 'تمت إعادة إرسال الرمز!',
  'verifyEmail.link.invalid': 'لم يعد هذا الرابط صالحًا. أدخل الرمز الوارد في البريد نفسه.',
  'verifyEmail.handoff.opened': 'تم فتح الرابط في تطبيق Meeshy.',
  'verifyEmail.handoff.stay': 'المتابعة في المتصفح',
  'verifyEmail.arrival.title': 'تم تأكيد العنوان!',
  'verifyEmail.arrival.lead': 'نُجهّز محادثاتك…',
  'verifyEmail.arrival.status': 'تم تأكيد العنوان — جارٍ تسجيل الدخول…',
} satisfies SignInLinkCatalog;

export default ar;
