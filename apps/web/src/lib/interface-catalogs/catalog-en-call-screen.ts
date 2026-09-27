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
  'call.messages': 'Messages',
  'call.messages.open': 'Open messages',
  'call.flip.label': 'Flip camera',
  'call.fullscreen.enter': 'Full screen',
  'call.fullscreen.exit': 'Exit full screen',
  'call.screen.of': '{name}’s screen',
} as const;

export default enCallScreen;
