/**
 * L'APPEL NATIF DE LA COQUE ANDROID (#8049) — tranche du catalogue
 * `catalog-it.ts`, qui la RÉPAND : les sorties audio d'un appel
 * (`src/lib/calls/shell-call.ts` § audioRouteLabelKey).
 */
const itCallShell = {
  'call.audioRoute.menu': 'Uscita audio',
  'call.audioRoute.earpiece': 'Auricolare',
  'call.audioRoute.speaker': 'Altoparlante',
  'call.audioRoute.wired': 'Cuffie con filo',
  'call.audioRoute.bluetooth': 'Bluetooth',
} as const;

export default itCallShell;
