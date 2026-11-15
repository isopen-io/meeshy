/**
 * L'APPEL NATIF DE LA COQUE ANDROID (#8049) — tranche du catalogue
 * `catalog-en.ts`, qui la RÉPAND : les sorties audio d'un appel
 * (`src/lib/calls/shell-call.ts` § audioRouteLabelKey).
 */
const enCallShell = {
  'call.audioRoute.menu': 'Audio output',
  'call.audioRoute.earpiece': 'Earpiece',
  'call.audioRoute.speaker': 'Speaker',
  'call.audioRoute.wired': 'Wired headset',
  'call.audioRoute.bluetooth': 'Bluetooth',
} as const;

export default enCallShell;
