/**
 * LE PARTAGE D'ÉCRAN PENDANT UN APPEL (#8063) — tranche du catalogue,
 * RÉPANDUE par `catalog-fr.ts` comme `catalog-fr-call-devices.ts` : le
 * bouton Écran de l'écran d'appel, la pastille de celui qui partage et la
 * bannière de celui qui regarde (`call-screen.tsx`).
 *
 * Et la vue d'appel « C adapté » (#8391, #8392) : le `(…)` de la pilule, les
 * légendes des rangées de groupe, la mise à la une d'un écran partagé. Ici
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
} as const;

export default frCallScreen;
