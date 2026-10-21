import type { GameFrappeCatalog } from '@/lib/i18n-game-catalog';

/** LA CÉRÉMONIE DE LA FRAPPE (#11177, épopée § 7) — `game.frappe.*`. Chargé par la scène elle-même, au toucher. Mêmes clés et mêmes paramètres que le français. */
const ar = {
  'game.frappe.light': 'نورك',
  'game.frappe.tchak': 'طَق!',
  'game.frappe.tchak_final': 'طَقّ!',
  'game.frappe.ancestors.title': 'أجدادك يتجلّون',
  'game.frappe.ancestors.gold': 'كل قطعة مئوية تحمل نورهم',
  'game.frappe.ancestors.prism': 'كل قطعة ألفية تجمع كل اللغات',
  'game.frappe.say.silver': 'Meesh رقم {number} تنضمّ إلى إرثك.',
  'game.frappe.say.gold': 'Meesh رقم {number} ذهبية. رآها أجدادك.',
  'game.frappe.say.prism': 'Meesh رقم {number} موشورية: كل اللغات تسطع فيها.',
  'game.frappe.glory': '\u2066+{glory}\u2069 من المجد',
  'game.frappe.refused.shadow': 'ظلّ يحجب نورك. شراراتك القادمة ستبدّده، ثم نسكّ.',
  'game.frappe.refused.locked': 'إرثك ينتظر رتبة أعلى. مجدك سيفتحه، ثم نسكّ.',
  'game.frappe.refused.light': 'نورك لا يكفي بعد. شراراتك القادمة ستغذّيه.',
  'game.frappe.refused.offline': 'لا اتصال الآن. حين يعود، نسكّ.',
  'game.frappe.refused.unknown': 'لم يتمّ السكّ. لا شيء ضاع: نورك سليم.',
  'game.frappe.skip': 'المس للتخطّي',
} as const satisfies GameFrappeCatalog;

export default ar;
