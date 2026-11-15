import type { AppearanceCatalog } from '@/lib/i18n-appearance-catalog';

/**
 * LE FOND ET L'ACCENT D'UNE CONVERSATION (#10631), AR — les libellés
 * `appearance.*` du sélecteur « Fond et couleur ». Hors du catalogue
 * d'interface, à son plafond : chargé par la feuille (`i18n-appearance-catalog.ts`),
 * jamais au démarrage. Les NOMS des modèles, des packs et des couleurs viennent
 * des chaînes partagées que lit aussi iOS (`design/appearance/strings/`).
 */
const ar = {
  'appearance.title': 'الخلفية واللون',
  'appearance.preview': 'معاينة',
  'appearance.background': 'الخلفية',
  'appearance.signature': 'Signature',
  'appearance.solid': 'لون موحّد',
  'appearance.photo': 'صورة المحادثة',
  'appearance.photo_empty': 'لم تُرسَل أي صورة في هذه المحادثة',
  'appearance.photo_unavailable': 'تعذّر تحميل الصور حاليًا',
  'appearance.photo_more': 'المزيد من الصور',
  'appearance.photo_item': 'الصورة {index}',
  'appearance.veil': 'طبقة التعتيم',
  'appearance.blur': 'التمويه',
  'appearance.accent': 'اللون المميّز',
  'appearance.auto': 'تلقائي',
  'appearance.animate': 'الحركات',
  'appearance.shop': 'المزيد في المتجر',
  'appearance.reset': 'العودة إلى الإعداد الأصلي',
  'appearance.err_generic': 'تعذّر حفظ هذا الاختيار وتم التراجع عنه.',
  'appearance.err_not_owned': 'هذه الخلفية ليست ضمن حزمك.',
  'appearance.err_photo': 'هذه الصورة لم تعد متاحة.',
  'appearance.pack_group': 'حزمة {name}',
  'appearance.picked': 'محدّد',
} satisfies AppearanceCatalog;

export default ar;
