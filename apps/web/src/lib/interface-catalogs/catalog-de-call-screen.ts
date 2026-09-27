/**
 * LE PARTAGE D'ÉCRAN PENDANT UN APPEL (#8063) — tranche du catalogue,
 * RÉPANDUE par `catalog-de.ts` comme `catalog-de-call-devices.ts` : le
 * bouton Écran de l'écran d'appel, la pastille de celui qui partage et la
 * bannière de celui qui regarde (`call-screen.tsx`).
 */
const deCallScreen = {
  'call.screen.share': 'Bildschirm teilen',
  'call.screen.stop': 'Bildschirmfreigabe beenden',
  'call.screen.sharing': 'Du teilst deinen Bildschirm',
  'call.screen.peerSharing': '{name} teilt den Bildschirm',
  'call.more': 'Weitere Aktionen',
  'call.section.mine': 'Mein Bild',
  'call.section.call': 'Anruf',
  'call.flip': 'Umdrehen',
  'call.screen.short': 'Bildschirm',
  'call.record.short': 'Aufnehmen',
  'call.conversation.open': 'Unterhaltung öffnen',
  'call.flip.label': 'Kamera umdrehen',
  'call.fullscreen.enter': 'Vollbild',
  'call.fullscreen.exit': 'Vollbild beenden',
  'call.screen.of': 'Bildschirm von {name}',
} as const;

export default deCallScreen;
