/**
 * LES SOUS-TITRES D'UN APPEL ET SA TRANSCRIPTION (#8048) — tranche du catalogue,
 * RÉPANDUE par `catalog-ar.ts` comme `catalog-ar-call-quality.ts` : le bouton
 * Sous-titres de l'écran d'appel, le panneau et son journal
 * (`call-captions-panel.tsx`), la transcription d'après l'appel dans la bulle
 * du fil (`call-transcript-panel.tsx`).
 */
const arCallCaptions = {
  'call.captions.original': 'إظهار الترجمة النصية الأصلية',
  'call.captions.invited': 'إظهار الترجمة النصية — محاورك يقرؤها بالفعل',
  'callCaptions.region': 'الترجمة النصية',
  'callCaptions.waiting': 'تظهر الترجمة النصية هنا بمجرد أن يتحدث أحد',
  'callCaptions.mode.translated': 'مترجمة إلى لغتك',
  'callCaptions.mode.original': 'باللغة الأصلية',
  'callCaptions.listening': 'يتم تحويل صوتك إلى نص',
  'callCaptions.unsupported': 'هذا المتصفح لا يحوّل صوتك إلى نص: يمكنك قراءة الآخرين',
  'callCaptions.denied': 'تم رفض التعرف على الكلام: يمكنك قراءة الآخرين',
  'callCaptions.journal.title': 'سجل المكالمة',
  'callCaptions.participant': 'مشارك',
  'callTranscript.show': 'النص المكتوب',
  'callTranscript.hide': 'إخفاء النص المكتوب',
  'callTranscript.title': 'النص المكتوب للمكالمة',
  'callTranscript.loading': 'جارٍ تحميل النص المكتوب…',
  'callTranscript.empty': 'لا يوجد نص مكتوب لهذه المكالمة',
  'callTranscript.error': 'النص المكتوب غير متاح',
  'callTranscript.retry': 'إعادة المحاولة',
  'callTranscript.showOriginal': 'عرض الأصل',
  'callTranscript.showTranslated': 'عرض الترجمة',
} as const;

export default arCallCaptions;
