/**
 * LE LIEN « CE N'ÉTAIT PAS MOI » — tranche du catalogue `catalog-ar.ts`, que le
 * catalogue RÉPAND. `/auth/revoke-sessions` (#10859) : la page que l'alerte de
 * nouvelle connexion ouvre, et qui ferme toutes les sessions au clic.
 */
const arRevokeSessions = {
  'revokeSessions.title': 'لم تكن أنت؟',
  'revokeSessions.body': 'سجّل خروج حسابك من جميع الأجهزة، بما فيها الجهاز الذي سجّل الدخول للتو. ستحتاج بعد ذلك إلى تسجيل الدخول من جديد.',
  'revokeSessions.action': 'تسجيل الخروج من جميع الأجهزة',
  'revokeSessions.working': 'جارٍ تسجيل الخروج…',
  'revokeSessions.done.title': 'تم تسجيل الخروج من جميع الأجهزة',
  'revokeSessions.done.body': 'غيّر كلمة المرور عند تسجيل دخولك القادم.',
  'revokeSessions.invalid': 'انتهت صلاحية رابط الأمان هذا أو سبق استخدامه. سجّل الدخول لإدارة جلساتك.',
  'revokeSessions.dismiss': 'كنت أنا',
} as const;

export default arRevokeSessions;
