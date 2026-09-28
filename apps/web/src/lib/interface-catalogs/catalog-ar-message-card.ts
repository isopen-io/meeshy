import type { MessageCardCatalogSlice } from './catalog-fr-message-card';

/** Message export as image — see `catalog-fr-message-card.ts`. */
const arMessageCard = {
  'message.menu.export': 'تصدير كصورة',
  'export.card.title': 'تصدير كصورة',
  'export.card.footer': 'صدّرها {name}',
  'export.card.styles': 'النمط',
  'export.card.style.aurore': 'الشفق',
  'export.card.style.editorial': 'تحريري',
  'export.card.style.manuscrit': 'بخط اليد',
  'export.card.preview': 'معاينة الصورة',
  'export.card.rendering': 'جارٍ تجهيز الصورة…',
  'export.card.save': 'حفظ الصورة',
  'export.card.truncated': 'رسالة طويلة: نهايتها مقطوعة في الصورة.',
  'export.announce.gallery': 'حُفظت الصورة في المعرض',
  'export.announce.shared': 'الصورة جاهزة',
  'export.announce.cancelled': 'أُلغي التصدير',
  'export.announce.expired': 'اضغط مجددًا للحفظ',
  'export.announce.failed': 'تعذّر إنشاء الصورة',
  'export.announce.unavailable': 'لا يستطيع هذا الجهاز حفظ الصورة',
} satisfies MessageCardCatalogSlice;

export default arMessageCard;
