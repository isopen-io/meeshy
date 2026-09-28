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
  'call.effects': 'Efectos',
  'call.effects.open': 'Efectos de mi vídeo',
  'call.effects.close': 'Cerrar los efectos',
  'call.effects.presets': 'Ajustes predefinidos',
  'call.effects.preset.natural': 'Natural',
  'call.effects.preset.warm': 'Cálido',
  'call.effects.preset.cool': 'Frío',
  'call.effects.preset.vivid': 'Vivo',
  'call.effects.preset.muted': 'Suave',
  'call.effects.brightness': 'Brillo',
  'call.effects.blur': 'Desenfoque de fondo',
  'call.zoom': 'Zoom de mi cámara',
  'call.zoom.in': 'Acercar',
  'call.zoom.out': 'Alejar',
} as const;

export default esCallScreen;
