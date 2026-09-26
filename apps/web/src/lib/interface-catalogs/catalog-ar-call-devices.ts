/**
 * CONTINUER À DISCUTER PENDANT L'APPEL (lot 4 des appels — #8046) — tranche
 * du catalogue, RÉPANDUE par `catalog-ar.ts` comme `catalog-ar-call.ts` :
 * la bulle déplaçable (`call-bubble.tsx`), l'image dans l'image et le choix
 * des périphériques (`call-devices-sheet.tsx`). Libellés repris d'iOS
 * (`CallBubbleView.swift`, `PiPCallController.swift`).
 */
const arCallDevices = {
  'call.bubble.collapse': 'تصغير إلى فقاعة',
  'call.bubble.ongoing': 'مكالمة جارية',
  'call.bubble.moveHint': 'الأسهم تحرّك الفقاعة',
  'call.pip.enter': 'صورة داخل صورة',
  'call.devices.open': 'اختيار الأجهزة',
  'call.devices.title': 'الأجهزة',
  'call.devices.camera': 'الكاميرا',
  'call.devices.microphone': 'الميكروفون',
  'call.devices.default': 'الافتراضي',
  'call.devices.none': 'لم يُكتشف أي جهاز',
  'call.devices.failed': 'هذا الجهاز لا يستجيب',
} as const;

export default arCallDevices;
