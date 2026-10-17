import type { SignInLinkCatalog } from '@/lib/i18n-sign-in-link-catalog';

/** La confirmation d'un lien de connexion (8da83d255f) — voir `catalog-sign-in-link-fr.ts`. */
const ar = {
  'signInLink.confirm.title': 'تسجيل الدخول باسم ‎@{username}؟',
  'signInLink.confirm.lead': 'لم يُطلب هذا الرابط من هذا الجهاز. لا تتابع إلا إذا كان هذا الحساب حسابك.',
  'signInLink.confirm.leadSignedIn': 'أنت مسجّل الدخول باسم ‎@{current}. سيفتح هذا الرابط الحساب أدناه بدلًا منه، وسيبقى ‎@{current} ضمن حساباتك على هذا الجهاز.',
  'signInLink.confirm.accept': 'تسجيل الدخول',
  'signInLink.confirm.cancel': 'إلغاء',
} satisfies SignInLinkCatalog;

export default ar;
