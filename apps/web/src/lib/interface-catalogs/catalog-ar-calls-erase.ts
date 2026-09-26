/**
 * EFFACER ET CHERCHER DANS LE JOURNAL D'APPELS (#8066) — tranche du catalogue,
 * RÉPANDUE par `catalog-ar.ts` comme `catalog-ar-call-feedback.ts`.
 */
const arCallsErase = {
  'calls.edit': 'تعديل',
  'calls.editDone': 'تم',
  'calls.hide.named': 'إزالة المكالمة مع {name} من السجل',
  'calls.clearAll': 'مسح الكل',
  'calls.clearAll.confirm': 'مسح سجل مكالماتك بالكامل؟ يحتفظ المشاركون الآخرون بسجلاتهم.',
  'calls.clearAll.confirmAction': 'مسح',
  'calls.clearAll.cancel': 'إلغاء',
  'calls.erase.failed': 'تعذّر المسح. حاول مرة أخرى.',
  'calls.search': 'ابحث عن اسم',
  'calls.search.clear': 'مسح البحث',
  'calls.search.empty': 'لا توجد مكالمة تطابق «{query}»',
} as const;

export default arCallsErase;
