/**
 * L'APPEL NATIF DE LA COQUE ANDROID (#8049) — tranche du catalogue
 * `catalog-es.ts`, qui la RÉPAND : les sorties audio d'un appel
 * (`src/lib/calls/shell-call.ts` § audioRouteLabelKey).
 */
const esCallShell = {
  'call.audioRoute.menu': 'Salida de audio',
  'call.audioRoute.earpiece': 'Auricular',
  'call.audioRoute.speaker': 'Altavoz',
  'call.audioRoute.wired': 'Auriculares con cable',
  'call.audioRoute.bluetooth': 'Bluetooth',
} as const;

export default esCallShell;
