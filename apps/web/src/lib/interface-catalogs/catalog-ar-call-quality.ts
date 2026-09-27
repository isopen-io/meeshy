/**
 * LA QUALITÉ D'UN APPEL (#8047) — tranche du catalogue, RÉPANDUE par
 * `catalog-ar.ts` comme `catalog-ar-call-screen.ts` : l'indicateur et le
 * détail de qualité, les pastilles de survie de la vidéo et les alertes d'un
 * pair (`call-quality-indicator.tsx`, `call-screen.tsx`).
 */
const arCallQuality = {
  'call.quality.indicator': 'جودة المكالمة: {level}',
  'call.quality.level.excellent': 'ممتازة',
  'call.quality.level.good': 'جيدة',
  'call.quality.level.fair': 'متوسطة',
  'call.quality.level.poor': 'ضعيفة',
  'call.quality.detail': 'جودة المكالمة',
  'call.quality.loss': 'فقدان الحزم',
  'call.quality.latency': 'زمن الاستجابة',
  'call.quality.jitter': 'التذبذب',
  'call.quality.audioRate': 'معدل الصوت',
  'call.quality.videoRate': 'معدل الفيديو',
  'call.quality.close': 'إغلاق تفاصيل الجودة',
  'call.video.frozen': 'شبكة ضعيفة: الفيديو الخاص بك أبطأ',
  'call.video.suspended': 'شبكة ضعيفة: الفيديو الخاص بك متوقف مؤقتًا، والصوت مستمر',
  'call.alert.weakNetwork': 'اتصال {name} غير مستقر',
  'call.alert.capturing': '{name} يلتقط شاشة المكالمة',
} as const;

export default arCallQuality;
