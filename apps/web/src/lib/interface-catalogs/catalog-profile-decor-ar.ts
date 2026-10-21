import type { ProfileDecorCatalog } from '@/lib/i18n-profile-decor-catalog';

/** LE CATALOGUE DU DÉCOR DE PROFIL (#10632), langue `ar` — mêmes clés que le français. */
const arProfileDecor = {
  'profileDecor.banner.entry': "اللافتة",
  'profileDecor.ring.entry': "الإطار",
  'profileDecor.frame.entry': "إطار اللافتة",
  'profileDecor.banner.title': "لافتة الملف الشخصي",
  'profileDecor.ring.title': "إطار الصورة الرمزية",
  'profileDecor.frame.title': "إطار اللافتة",
  'profileDecor.none': "بدون",
  'profileDecor.photo': "صورة",
  'profileDecor.shop': "المزيد في المتجر",
  'profileDecor.refused': "هذا الخيار غير متاح لحسابك. يبقى كما كان.",
  'profileDecor.error': "تعذّر الحفظ. تم الاحتفاظ باختيارك السابق.",
} satisfies ProfileDecorCatalog;

export default arProfileDecor;
