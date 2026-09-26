/**
 * L'ÉCRAN DU CODE REÇU PAR E-MAIL — tranche du catalogue `catalog-ar.ts`,
 * extraite pour tenir le budget de taille (CLAUDE.md) : le catalogue la
 * RÉPAND. `/auth/verify-email` (code à 6 chiffres, lien de l'e-mail) et la
 * saisie du code sur l'étape « e-mail envoyé » de la connexion par e-mail
 * (#8034, contrat #8033).
 */
const arVerifyEmail = {
  'verifyEmail.bar.title': 'التحقق من البريد الإلكتروني',
  'verifyEmail.noAddress': 'لا يحتوي هذا الرابط على أي عنوان بريد إلكتروني للتحقق منه. افتحه من البريد الذي أرسلته إليك Meeshy.',
  'verifyEmail.backToLogin': 'العودة إلى تسجيل الدخول',
  'verifyEmail.verified': 'تم التحقق من البريد الإلكتروني!',
  'verifyEmail.continue': 'متابعة',
  'verifyEmail.title': 'تحقق من بريدك الإلكتروني',
  'verifyEmail.subtitle': 'أدخل الرمز المكوّن من 6 أرقام المرسل إلى {email}',
  'verifyEmail.subtitle.created': 'أنشأنا حسابك وأرسلنا رمزًا ورابطًا إلى {email}. أدخل الرمز أو افتح الرابط.',
  'verifyEmail.subtitle.pending': 'حسابك بانتظار التحقق: أعدنا إرسال رمز ورابط إلى {email}.',
  'verifyEmail.code.label': 'رمز التحقق',
  'verifyEmail.submit': 'تحقق',
  'verifyEmail.submit.busy': 'جارٍ التحقق…',
  'verifyEmail.error.invalid': 'رمز غير صالح أو منتهي الصلاحية',
  'verifyEmail.error.offline': 'لا يوجد اتصال. تحقق من شبكتك وحاول مرة أخرى.',
  'verifyEmail.error.rateLimited': 'محاولات كثيرة جدًا — حاول مرة أخرى بعد بضع دقائق.',
  'verifyEmail.resend.prompt': 'لم يصلك الرمز؟',
  'verifyEmail.resend': 'إعادة إرسال الرمز',
  'verifyEmail.resend.busy': 'جارٍ الإرسال…',
  'verifyEmail.resend.locked': 'إعادة إرسال الرمز ({seconds}ث)',
  'verifyEmail.resend.done': 'تمت إعادة إرسال الرمز!',
  'verifyEmail.link.checking': 'جارٍ التحقق من الرابط…',
  'verifyEmail.link.invalid': 'لم يعد هذا الرابط صالحًا. أدخل الرمز الوارد في البريد نفسه.',
  'verifyEmail.proven': 'تم تأكيد العنوان ✓ — أدخل الرمز الذي تلقيته لتسجيل الدخول هنا.',
  'verifyEmail.handoff.opened': 'تم فتح الرابط في تطبيق Meeshy.',
  'verifyEmail.handoff.stay': 'المتابعة في المتصفح',
  'verifyEmail.signingIn': 'جارٍ تسجيل الدخول…',
  'verifyEmail.arrival.title': 'تم تأكيد العنوان!',
  'verifyEmail.arrival.lead': 'نُجهّز محادثاتك…',
  'verifyEmail.arrival.status': 'تم تأكيد العنوان — جارٍ تسجيل الدخول…',
  'emailSent.codeOrLink': 'أدخل الرمز المكوّن من 6 أرقام المرسل إلى {email}، أو افتح الرابط في البريد نفسه.',
};

export default arVerifyEmail;
