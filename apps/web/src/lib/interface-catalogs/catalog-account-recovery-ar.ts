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
} satisfies AccountRecoveryCatalog;

export default ar;
