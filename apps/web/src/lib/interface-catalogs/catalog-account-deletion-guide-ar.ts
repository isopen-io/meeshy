import type { AccountDeletionGuideCatalog } from '@/lib/i18n-account-deletion-guide';

/**
 * LA PAGE DE SUPPRESSION VUE DÉCONNECTÉ — ses libellés, importés par la seule page
 * qui les rend : les catalogues d'interface (budget `interface_catalogs`) n'en portent rien.
 * `routes/account-deletion-guide.tsx` (#9921).
 */
const arAccountDeletionGuide = {
  'accountDeletion.guide.title': 'احذف حسابك على Meeshy',
  'accountDeletion.guide.intro': 'تخص هذه الصفحة تطبيق Meeshy على Android وiOS والويب. توضح كيف تحذف حسابك وما يحدث لبياناتك.',
  'accountDeletion.guide.steps.title': 'طريقة الحذف',
  'accountDeletion.guide.step.signIn': 'سجّل الدخول بالزر أدناه. في التطبيق، تجد الطلب نفسه في الإعدادات، حذف الحساب.',
  'accountDeletion.guide.step.confirm': 'اكتب عبارة التأكيد وكلمة المرور، ثم اطلب الحذف.',
  'accountDeletion.guide.step.email': 'افتح البريد الإلكتروني الذي نرسله إليك وأكّد الحذف.',
  'accountDeletion.guide.step.wait': 'يُحذف حسابك بعد 30 يومًا. لا شيء آخر عليك فعله.',
  'accountDeletion.guide.signIn': 'سجّل الدخول لحذف حسابي',
  'accountDeletion.guide.deleted.title': 'ما يُحذف',
  'accountDeletion.guide.deleted.profile': 'ملفك الشخصي: الاسم واسم المستخدم والبريد الإلكتروني ورقم الهاتف والصورة والغلاف والنبذة وتاريخ الميلاد.',
  'accountDeletion.guide.deleted.access': 'كلمة المرور وجلساتك ومفاتيح التشفير.',
  'accountDeletion.guide.deleted.messages': 'نص رسائلك وترجماتها، وصورك ومقاطع الفيديو والرسائل الصوتية.',
  'accountDeletion.guide.deleted.other': 'ملفك الصوتي ودفتر العناوين وإشعاراتك وروابط المشاركة وتقدمك في اللعبة وملصقاتك.',
  'accountDeletion.guide.kept.title': 'ما يُحتفظ به',
  'accountDeletion.guide.kept.messages': 'في محادثات الآخرين، تبقى رسائلك في مكانها، فارغة ومعلَّمة بأنها محذوفة.',
  'accountDeletion.guide.kept.posts': 'يبقى نص منشوراتك وتعليقاتك ظاهرًا باسم «حساب محذوف». لإزالتها، احذفها من التطبيق قبل طلبك.',
  'accountDeletion.guide.kept.packs': 'تبقى حزم الملصقات التي نشرتها متاحة، من دون اسمك.',
  'accountDeletion.guide.kept.stats': 'معرّف حساب مجهول وإحصاءات استخدام لا تكشف هويتك.',
  'accountDeletion.guide.delay.title': 'المدة',
  'accountDeletion.guide.delay.body': 'يُحذف حسابك بعد 30 يومًا من تأكيدك. حتى ذلك الحين، يمكنك الإلغاء بالرابط الوارد في البريد الإلكتروني.',
  'accountDeletion.guide.noAccess.title': 'لم يعد بإمكانك تسجيل الدخول؟',
  'accountDeletion.guide.noAccess.body': 'راسلنا من البريد الإلكتروني لحسابك طالبًا حذفه. نرد خلال 30 يومًا.',
} as const satisfies AccountDeletionGuideCatalog;

export default arAccountDeletionGuide;
