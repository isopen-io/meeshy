/**
 * CONTINUER À DISCUTER PENDANT L'APPEL (lot 4 des appels — #8046) — tranche
 * du catalogue, RÉPANDUE par `catalog-it.ts` comme `catalog-it-call.ts` :
 * la bulle déplaçable (`call-bubble.tsx`), l'image dans l'image et le choix
 * des périphériques (`call-devices-sheet.tsx`). Libellés repris d'iOS
 * (`CallBubbleView.swift`, `PiPCallController.swift`).
 */
const itCallDevices = {
  'call.bubble.collapse': 'Riduci a bolla',
  'call.bubble.ongoing': 'Chiamata in corso',
  'call.bubble.moveHint': 'Le frecce spostano la bolla',
  'call.pip.enter': 'Picture-in-picture',
  'call.devices.open': 'Scegli i dispositivi',
  'call.devices.title': 'Dispositivi',
  'call.devices.camera': 'Fotocamera',
  'call.devices.microphone': 'Microfono',
  'call.devices.default': 'Predefinito',
  'call.devices.none': 'Nessun dispositivo rilevato',
  'call.devices.failed': 'Questo dispositivo non risponde',
} as const;

export default itCallDevices;
