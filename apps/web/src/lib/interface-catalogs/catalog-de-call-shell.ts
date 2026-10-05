/**
 * L'APPEL NATIF DE LA COQUE ANDROID (#8049) — tranche du catalogue
 * `catalog-de.ts`, qui la RÉPAND : les sorties audio d'un appel
 * (`src/lib/calls/shell-call.ts` § audioRouteLabelKey).
 */
const deCallShell = {
  'call.audioRoute.menu': 'Audioausgabe',
  'call.audioRoute.earpiece': 'Hörmuschel',
  'call.audioRoute.speaker': 'Lautsprecher',
  'call.audioRoute.wired': 'Kabel-Headset',
  'call.audioRoute.bluetooth': 'Bluetooth',
} as const;

export default deCallShell;
