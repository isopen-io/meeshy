import type { CommunitySettingsCatalog } from '../i18n-community-settings-catalog';

/**
 * RÉGLER SA COMMUNAUTÉ (#6377) — tranche arabe du catalogue, chargée
 * avec l'écran des réglages (`i18n-community-settings-catalog.ts`). Libellés
 * repris d'iOS (`CommunitySettingsScreen.swift`).
 */
const arCommunitySettings = {
  'community.settings.title': "الإعدادات",
  'community.settings.section.info': "المعلومات",
  'community.settings.field.name': "الاسم",
  'community.settings.field.name.placeholder': "اسم المجتمع",
  'community.settings.field.description': "الوصف",
  'community.settings.field.description.placeholder': "عمّ يدور الحديث هنا؟",
  'community.settings.section.privacy': "الخصوصية",
  'community.settings.avatar.change': "تغيير الصورة الرمزية",
  'community.settings.banner.edit': "تعديل",
  'community.settings.banner.change': "تغيير صورة الغلاف",
  'community.settings.image.uploading': "جارٍ رفع الصورة…",
  'community.settings.avatar.uploaded': "الصورة الرمزية جاهزة: احفظ لنشرها.",
  'community.settings.banner.uploaded': "صورة الغلاف جاهزة: احفظ لنشرها.",
  'community.settings.image.error': "تعذّر رفع الصورة. حاول مرة أخرى.",
  'community.settings.privacy.confirm.title': "هل تريد جعل المجتمع خاصًا؟",
  'community.settings.privacy.confirm.body': "سيغادر الأعضاء السابقون والحسابات المحظورة محادثاته نهائيًا.",
  'community.settings.privacy.confirm.action': "جعله خاصًا",
  'community.settings.section.danger': "منطقة الخطر",
  'community.settings.save': "حفظ",
  'community.settings.saving': "جارٍ الحفظ…",
  'community.settings.saved': "تم تحديث المجتمع.",
  'community.settings.error.name': "امنحه اسمًا لا يتجاوز 100 حرف.",
  'community.settings.error.description': "يتسع الوصف لـ 500 حرف.",
  'community.settings.error.refused': "وحده منشئ المجتمع يستطيع تعديل إعداداته.",
  'community.settings.error.gone': "لم يعد هذا المجتمع موجودًا.",
  'community.settings.error.offline': "غير متصل: لم يُرسل شيء.",
  'community.settings.error.default': "فشل. حاول مجددًا.",
  'community.settings.delete.label': "حذف المجتمع",
  'community.settings.delete.confirm.title': "حذف «{name}»؟",
  'community.settings.delete.confirm.body': "يغادره أعضاؤه ويختفي. تبقى محادثاته خارج المجتمع. هذا نهائي.",
  'community.settings.delete.confirm.action': "حذف",
  'community.settings.refused.title': "للمنشئ فقط",
  'community.settings.refused.body': "وحده منشئ هذا المجتمع يستطيع تعديل إعداداته.",
} as const satisfies CommunitySettingsCatalog;

export default arCommunitySettings;
