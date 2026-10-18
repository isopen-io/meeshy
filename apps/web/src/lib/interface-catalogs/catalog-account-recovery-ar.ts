import type { AccountRecoveryCatalog } from '@/lib/i18n-account-recovery-catalog';

/** Le mot de passe oublié et sa réinitialisation (#10823) — voir `catalog-account-recovery-fr.ts`. */
const ar = {
  'recovery.forgot.lead': 'استلم عبر البريد الإلكتروني رابطًا لاختيار كلمة مرور جديدة.',
  'recovery.forgot.neverHad': 'لم تكن لديك كلمة مرور من قبل؟',
  'recovery.forgot.neverHad.text': 'يتيح لك الرابط نفسه إنشاء واحدة.',
  'recovery.reset.newPassword': 'كلمة مرور جديدة',
  'recovery.reset.lead': 'اختر كلمة مرور جديدة.',
  'recovery.reset.confirm': 'تأكيد كلمة المرور',
  'recovery.reset.tooShort': 'كلمة المرور قصيرة جدًا ({min} أحرف على الأقل)',
  'recovery.reset.mismatch': 'كلمتا المرور غير متطابقتين',
  'recovery.reset.submit': 'حفظ كلمة المرور',
  'recovery.reset.submit.busy': 'جارٍ الحفظ…',
  'recovery.reset.invalid.title': 'رابط غير صالح أو منتهي الصلاحية',
  'recovery.reset.invalid.text': 'اطلب رابطًا جديدًا لاختيار كلمة المرور.',
  'recovery.reset.invalid.action': 'طلب رابط جديد',
  'recovery.reset.done.title': 'تم حفظ كلمة المرور',
  'recovery.reset.done.text': 'يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.',
  'recovery.reset.code': 'رمز التحقق',
  'recovery.reset.code.lead': 'أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة.',
  'recovery.reset.error.codeRequired': 'هذا الحساب محمي: أدخل رمز التحقق من تطبيق المصادقة.',
  'recovery.reset.error.codeInvalid': 'رمز التحقق غير صحيح.',
  'recovery.reset.error.weak': 'كلمة المرور هذه سهلة التخمين. اختر كلمة أطول أو أقل قابلية للتوقع.',
  'recovery.reset.error.reused': 'استخدمت كلمة المرور هذه مؤخرًا. اختر كلمة أخرى.',
  'recovery.reset.error.rateLimited': 'محاولات كثيرة جدًا. انتظر بضع دقائق قبل إعادة المحاولة.',
  'recovery.reset.error.locked': 'هذا الحساب مقفل مؤقتًا. تواصل مع الدعم.',
  'recovery.reset.exhausted.title': 'رموز غير صحيحة كثيرة جدًا',
  'recovery.reset.exhausted.text': 'حفاظًا على أمانك، تم تعطيل هذا الرابط. اطلب رابطًا جديدًا.',
} satisfies AccountRecoveryCatalog;

export default ar;
