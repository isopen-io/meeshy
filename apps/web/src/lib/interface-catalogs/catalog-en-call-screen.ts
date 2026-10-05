/**
 * LE PARTAGE D'ÉCRAN PENDANT UN APPEL (#8063) — tranche du catalogue,
 * RÉPANDUE par `catalog-en.ts` comme `catalog-en-call-devices.ts` : le
 * bouton Écran de l'écran d'appel, la pastille de celui qui partage et la
 * bannière de celui qui regarde (`call-screen.tsx`).
 */
const enCallScreen = {
  'call.screen.share': 'Share screen',
  'call.screen.stop': 'Stop sharing screen',
  'call.screen.sharing': 'You are sharing your screen',
  'call.screen.peerSharing': '{name} is sharing their screen',
  'call.more': 'More actions',
  'call.section.mine': 'My video',
  'call.section.call': 'Call',
  'call.flip': 'Flip',
  'call.screen.short': 'Screen',
  'call.record.short': 'Record',
  'call.conversation.open': 'Open the conversation',
  'call.flip.label': 'Flip camera',
  'call.fullscreen.enter': 'Full screen',
  'call.fullscreen.exit': 'Exit full screen',
  'call.screen.of': '{name}’s screen',
  'call.effects': 'Effects',
  'call.effects.open': 'My video effects',
  'call.effects.close': 'Close effects',
  'call.effects.presets': 'Presets',
  'call.effects.preset.natural': 'Natural',
  'call.effects.preset.warm': 'Warm',
  'call.effects.preset.cool': 'Cool',
  'call.effects.preset.vivid': 'Vivid',
  'call.effects.preset.muted': 'Soft',
  'call.effects.brightness': 'Brightness',
  'call.effects.blur': 'Background blur',
  'call.zoom': 'My camera zoom',
  'call.zoom.in': 'Zoom in',
  'call.zoom.out': 'Zoom out',
} as const;

export default enCallScreen;
