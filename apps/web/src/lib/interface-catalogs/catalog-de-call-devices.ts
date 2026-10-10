/**
 * CONTINUER À DISCUTER PENDANT L'APPEL (lot 4 des appels — #8046) — tranche
 * du catalogue, RÉPANDUE par `catalog-de.ts` comme `catalog-de-call.ts` :
 * la bulle déplaçable (`call-bubble.tsx`), l'image dans l'image et le choix
 * des périphériques (`call-devices-sheet.tsx`). Libellés repris d'iOS
 * (`CallBubbleView.swift`, `PiPCallController.swift`).
 */
const deCallDevices = {
  'call.bubble.collapse': 'Zur Blase verkleinern',
  'call.bubble.ongoing': 'Anruf läuft',
  'call.bubble.moveHint': 'Die Pfeiltasten bewegen die Blase',
  'call.bubble.resizeHint': '+ und − ändern ihre Größe, ebenso Strg + Mausrad oder das Aufziehen mit zwei Fingern',
  'call.pip.enter': 'Bild-im-Bild',
  'call.devices.open': 'Geräte auswählen',
  'call.devices.title': 'Geräte',
  'call.devices.camera': 'Kamera',
  'call.devices.microphone': 'Mikrofon',
  'call.devices.default': 'Standard',
  'call.devices.none': 'Kein Gerät erkannt',
  'call.devices.failed': 'Dieses Gerät antwortet nicht',
} as const;

export default deCallDevices;
