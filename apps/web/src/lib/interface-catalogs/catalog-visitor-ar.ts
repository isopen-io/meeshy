import type { VisitorCatalog } from '@/lib/i18n-visitor-catalog';

/** L'invitation du visiteur (#9149) — voir `catalog-visitor-fr.ts`. */
const ar = {
  'visitor.title': 'انضم إلى Meeshy',
  'visitor.sharedBy.reel': 'شارك {name} معك هذا الريل',
  'visitor.sharedBy.post': 'شارك {name} معك هذا المنشور',
  'visitor.sharedBy.story': 'شارك {name} معك هذه القصة',
  'visitor.sharedBy.mood': 'شارك {name} معك هذه الحالة المزاجية',
  'visitor.body': 'أنشئ حسابك أو سجّل الدخول للتفاعل والتعليق وقراءة كل شيء بلغتك.',
  'visitor.signup': 'إنشاء حساب',
  'visitor.login': 'تسجيل الدخول',
  'visitor.later': 'متابعة المشاهدة',
  'visitor.refused.title': 'هذا المحتوى غير متاح',
  'visitor.refused.body': 'لم يعد موجودًا، أو أنه مخصص لجمهوره فقط. سجّل الدخول لمشاهدته إن كان موجّهًا إليك.',
} satisfies VisitorCatalog;

export default ar;
