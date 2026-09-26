/**
 * CONTINUER À DISCUTER PENDANT L'APPEL (lot 4 des appels — #8046) — tranche
 * du catalogue, RÉPANDUE par `catalog-es.ts` comme `catalog-es-call.ts` :
 * la bulle déplaçable (`call-bubble.tsx`), l'image dans l'image et le choix
 * des périphériques (`call-devices-sheet.tsx`). Libellés repris d'iOS
 * (`CallBubbleView.swift`, `PiPCallController.swift`).
 */
const esCallDevices = {
  'call.bubble.collapse': 'Reducir a burbuja',
  'call.bubble.ongoing': 'Llamada en curso',
  'call.bubble.moveHint': 'Las flechas mueven la burbuja',
  'call.pip.enter': 'Imagen en imagen',
  'call.devices.open': 'Elegir dispositivos',
  'call.devices.title': 'Dispositivos',
  'call.devices.camera': 'Cámara',
  'call.devices.microphone': 'Micrófono',
  'call.devices.default': 'Predeterminado',
  'call.devices.none': 'No se detectó ningún dispositivo',
  'call.devices.failed': 'Este dispositivo no responde',
} as const;

export default esCallDevices;
