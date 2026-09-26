/**
 * CONTINUER À DISCUTER PENDANT L'APPEL (lot 4 des appels — #8046) — tranche
 * du catalogue, RÉPANDUE par `catalog-en.ts` comme `catalog-en-call.ts` :
 * la bulle déplaçable (`call-bubble.tsx`), l'image dans l'image et le choix
 * des périphériques (`call-devices-sheet.tsx`). Libellés repris d'iOS
 * (`CallBubbleView.swift`, `PiPCallController.swift`).
 */
const enCallDevices = {
  'call.bubble.collapse': 'Collapse to bubble',
  'call.bubble.ongoing': 'Call in progress',
  'call.bubble.moveHint': 'Arrow keys move the bubble',
  'call.pip.enter': 'Picture in picture',
  'call.devices.open': 'Choose devices',
  'call.devices.title': 'Devices',
  'call.devices.camera': 'Camera',
  'call.devices.microphone': 'Microphone',
  'call.devices.default': 'Default',
  'call.devices.none': 'No device detected',
  'call.devices.failed': 'This device is not responding',
} as const;

export default enCallDevices;
