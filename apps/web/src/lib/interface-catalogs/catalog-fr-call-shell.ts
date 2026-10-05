/**
 * L'APPEL NATIF DE LA COQUE ANDROID (#8049) — tranche du catalogue
 * `catalog-fr.ts`, qui la RÉPAND : les sorties audio d'un appel
 * (`src/lib/calls/shell-call.ts` § audioRouteLabelKey).
 */
const frCallShell = {
  'call.audioRoute.menu': 'Sortie audio',
  'call.audioRoute.earpiece': 'Écouteur',
  'call.audioRoute.speaker': 'Haut-parleur',
  'call.audioRoute.wired': 'Casque filaire',
  'call.audioRoute.bluetooth': 'Bluetooth',
} as const;

export default frCallShell;
