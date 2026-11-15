import type { PackPreviewCatalog } from '@/lib/i18n-pack-preview-catalog';

/** LE CATALOGUE DE LA FICHE ET DU PLEIN ÉCRAN D'UNE DÉCORATION (#16267), langue `ar` — mêmes clés que le français. */
const arPackPreview = {
  'packs.sheet.items': "عناصر الحزمة",
  'packs.sheet.publisher': "الناشر: {author}",
  'packs.sheet.state.embedded': "مدمجة في Meeshy",
  'packs.sheet.state.installed': "مثبّتة",
  'packs.sheet.state.download': "للتنزيل",
  'packs.sheet.size': "الحجم: {size}",
  'packs.sheet.loading': "جارٍ تحميل العناصر…",
  'packs.sheet.failed': "تعذّر تحميل عناصر هذه الحزمة",
  'packs.preview.title': "معاينة",
  'packs.preview.position': "{index} من {count}",
  'packs.preview.previous': "العنصر السابق",
  'packs.preview.next': "العنصر التالي",
  'packs.preview.zoomIn': "تكبير",
  'packs.preview.zoomOut': "تصغير",
  'packs.preview.close': "العودة إلى المتجر",
  'packs.preview.others': "اقتراحات أخرى",
  'packs.preview.equip': "تجهيز",
  'packs.preview.equipped': "مُجهّز",
  'packs.preview.equipFailed': "تعذّر تجهيز العنصر — أعد المحاولة",
  'packs.preview.animated': "متحرّك",
  'packs.preview.wallpaperHint': "تُختار الخلفية في كل محادثة من «الخلفية واللون».",
  'packs.preview.bubble.in1': "هل رأيت هذه الخلفية الجديدة؟",
  'packs.preview.bubble.out': "نعم، تبدو رائعة!",
  'packs.preview.bubble.in2': "سأعتمدها 😍",
} satisfies PackPreviewCatalog;

export default arPackPreview;
