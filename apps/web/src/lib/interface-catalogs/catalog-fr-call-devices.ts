/**
 * CONTINUER À DISCUTER PENDANT L'APPEL (lot 4 des appels — #8046) — tranche
 * du catalogue, RÉPANDUE par `catalog-fr.ts` comme `catalog-fr-call.ts` :
 * la bulle déplaçable (`call-bubble.tsx`), l'image dans l'image et le choix
 * des périphériques (`call-devices-sheet.tsx`). Libellés repris d'iOS
 * (`CallBubbleView.swift`, `PiPCallController.swift`).
 */
const frCallDevices = {
  'call.bubble.collapse': 'Réduire en bulle',
  'call.bubble.ongoing': 'Appel en cours',
  'call.bubble.moveHint': 'Les flèches déplacent la bulle',
  'call.pip.enter': 'Image dans l’image',
  'call.devices.open': 'Choisir les périphériques',
  'call.devices.title': 'Périphériques',
  'call.devices.camera': 'Caméra',
  'call.devices.microphone': 'Micro',
  'call.devices.default': 'Par défaut',
  'call.devices.none': 'Aucun appareil détecté',
  'call.devices.failed': 'Cet appareil ne répond pas',
} as const;

export default frCallDevices;
