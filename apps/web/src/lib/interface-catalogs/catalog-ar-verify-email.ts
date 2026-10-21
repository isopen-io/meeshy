/**
 * L'ÉCRAN DU CODE REÇU PAR E-MAIL — tranche du catalogue `catalog-ar.ts`,
 * extraite pour tenir le budget de taille (CLAUDE.md) : le catalogue la
 * RÉPAND. `/auth/verify-email` (code à 6 chiffres, lien de l'e-mail) et la
 * saisie du code sur l'étape « e-mail envoyé » de la connexion par e-mail
 * (#8034, contrat #8033).
 */
const arVerifyEmail = {
  'verifyEmail.backToLogin': 'العودة إلى تسجيل الدخول',
  'verifyEmail.verified': 'تم التحقق من البريد الإلكتروني!',
  'verifyEmail.code.label': 'رمز التحقق',
  'verifyEmail.submit': 'تحقق',
  'verifyEmail.submit.busy': 'جارٍ التحقق…',
  'verifyEmail.error.invalid': 'رمز غير صالح أو منتهي الصلاحية',
  'verifyEmail.error.offline': 'لا يوجد اتصال. تحقق من شبكتك وحاول مرة أخرى.',
  'verifyEmail.error.rateLimited': 'محاولات كثيرة جدًا — حاول مرة أخرى بعد بضع دقائق.',
  'verifyEmail.link.checking': 'جارٍ التحقق من الرابط…',
  'verifyEmail.proven': 'تم تأكيد العنوان ✓ — أدخل الرمز الذي تلقيته لتسجيل الدخول هنا.',
  'emailSent.codeOrLink': 'أدخل الرمز المكوّن من 6 أرقام المرسل إلى {email}، أو افتح الرابط في البريد نفسه.',
  'signInLink.switchAccount.title': 'فتح حساب آخر؟',
  'signInLink.switchAccount.lead': 'أنت مسجّل الدخول باسم @{current}، لكن ما فتحته للتو يقود إلى حساب آخر:',
  'signInLink.switchAccount.warning': 'إن لم تطلب هذا الرابط أو الرمز بنفسك، فألغِ: تبقى جلستك مفتوحة ولا يتغيّر شيء.',
  'signInLink.switchAccount.cancel': 'إلغاء والبقاء على @{current}',
  'signInLink.switchAccount.confirm': 'فتح هذا الحساب الآخر',
  'signInLink.switchAccount.kept': 'سيبقى @{current} ضمن حساباتك على هذا الجهاز.',
  'signInLink.switchAccount.busy': 'لحظة…',
  'signInLink.switchAccount.failed': 'تعذّر فتح هذا الحساب الآخر حاليًا. تبقى جلستك مفتوحة، وقد أُغلق الرابط.',
  'signInLink.switchAccount.expired': 'انتهت صلاحية هذا الرابط: اطلب رابطًا جديدًا. تبقى جلستك مفتوحة.',
  'signInLink.switchAccount.leave': 'العودة إلى الصفحة الرئيسية',
  'emailSent.title': 'تم إرسال البريد الإلكتروني',
  'emailSent.openLink': 'افتح الرابط المُرسَل إلى {email}',
  'emailSent.nothingReceived': 'لم يصلك شيء؟',
  'emailSent.nothingReceived.text': 'تحقّق من مجلد الرسائل غير المرغوب فيها (spam): قد تكون الرسالة وصلت إليه.',
};

export default arVerifyEmail;
