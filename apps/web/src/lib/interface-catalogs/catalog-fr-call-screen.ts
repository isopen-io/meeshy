/**
 * LE PARTAGE D'ÉCRAN PENDANT UN APPEL (#8063) — tranche du catalogue,
 * RÉPANDUE par `catalog-fr.ts` comme `catalog-fr-call-devices.ts` : le
 * bouton Écran de l'écran d'appel, la pastille de celui qui partage et la
 * bannière de celui qui regarde (`call-screen.tsx`).
 *
 * Et la vue d'appel « C adapté » (#8391, #8392) : le `(…)` de la pilule, les
 * légendes des rangées de groupe, la mise à la une d’un écran partagé ; les
 * effets de ma vidéo (#8442), le zoom de ma caméra (#8441) et le bouton
 * « Conversation » de l’en-tête (#8436). Ici
 * plutôt qu'une tranche de plus : `catalog-fr.ts` est au plafond du budget.
 */
const frCallScreen = {
  'call.screen.share': 'Partager l’écran',
  'call.screen.stop': 'Arrêter le partage d’écran',
  'call.screen.sharing': 'Vous partagez votre écran',
  'call.screen.peerSharing': '{name} partage son écran',
  'call.more': 'Plus d’actions',
  'call.section.mine': 'Mon image',
  'call.section.call': 'L’appel',
  'call.flip': 'Retourner',
  'call.screen.short': 'Écran',
  'call.record.short': 'Enregistrer',
  'call.conversation.open': 'Ouvrir la conversation',
  'call.flip.label': 'Retourner la caméra',
  'call.fullscreen.enter': 'Plein écran',
  'call.fullscreen.exit': 'Quitter le plein écran',
  'call.screen.of': 'Écran de {name}',
  'call.effects': 'Effets',
  'call.effects.open': 'Effets de ma vidéo',
  'call.effects.close': 'Fermer les effets',
  'call.effects.presets': 'Préréglages',
  'call.effects.preset.natural': 'Naturel',
  'call.effects.preset.warm': 'Chaud',
  'call.effects.preset.cool': 'Froid',
  'call.effects.preset.vivid': 'Vif',
  'call.effects.preset.muted': 'Doux',
  'call.effects.brightness': 'Luminosité',
  'call.effects.blur': 'Flou d’arrière-plan',
  'call.zoom': 'Zoom de ma caméra',
  'call.zoom.in': 'Zoomer',
  'call.zoom.out': 'Dézoomer',
} as const;

export default frCallScreen;
