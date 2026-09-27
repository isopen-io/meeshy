/**
 * LE PARTAGE D'ÉCRAN PENDANT UN APPEL (#8063) — tranche du catalogue,
 * RÉPANDUE par `catalog-es.ts` comme `catalog-es-call-devices.ts` : le
 * bouton Écran de l'écran d'appel, la pastille de celui qui partage et la
 * bannière de celui qui regarde (`call-screen.tsx`).
 */
const esCallScreen = {
  'call.screen.share': 'Compartir pantalla',
  'call.screen.stop': 'Dejar de compartir pantalla',
  'call.screen.sharing': 'Estás compartiendo tu pantalla',
  'call.screen.peerSharing': '{name} está compartiendo su pantalla',
  'call.more': 'Más acciones',
  'call.section.mine': 'Mi imagen',
  'call.section.call': 'La llamada',
  'call.flip': 'Girar',
  'call.screen.short': 'Pantalla',
  'call.record.short': 'Grabar',
  'call.conversation.open': 'Abrir la conversación',
  'call.flip.label': 'Girar la cámara',
  'call.fullscreen.enter': 'Pantalla completa',
  'call.fullscreen.exit': 'Salir de pantalla completa',
  'call.screen.of': 'Pantalla de {name}',
} as const;

export default esCallScreen;
