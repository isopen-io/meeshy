import type { RevokeSessionsCatalog } from '@/lib/i18n-revoke-sessions-catalog';

/** Le lien « ce n'était pas moi » — voir `catalog-revoke-sessions-fr.ts`. */
const ar = {
  'revokeSessions.title': 'لم تكن أنت؟',
  'revokeSessions.body': 'سجّل خروج حسابك من جميع الأجهزة، بما فيها الجهاز الذي سجّل الدخول للتو. ستحتاج بعد ذلك إلى تسجيل الدخول من جديد.',
  'revokeSessions.action': 'تسجيل الخروج من جميع الأجهزة',
  'revokeSessions.working': 'جارٍ تسجيل الخروج…',
  'revokeSessions.done.title': 'تم تسجيل الخروج من جميع الأجهزة',
  'revokeSessions.done.body': 'غيّر كلمة المرور عند تسجيل دخولك القادم.',
  'revokeSessions.invalid': 'انتهت صلاحية رابط الأمان هذا أو سبق استخدامه. سجّل الدخول لإدارة جلساتك.',
  'revokeSessions.dismiss': 'كنت أنا',
} as const satisfies RevokeSessionsCatalog;

export default ar;
