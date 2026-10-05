/**
 * L'APPEL NATIF DE LA COQUE ANDROID (#8049) — tranche du catalogue
 * `catalog-pt.ts`, qui la RÉPAND : les sorties audio d'un appel
 * (`src/lib/calls/shell-call.ts` § audioRouteLabelKey).
 */
const ptCallShell = {
  'call.audioRoute.menu': 'Saída de áudio',
  'call.audioRoute.earpiece': 'Auricular',
  'call.audioRoute.speaker': 'Alto-falante',
  'call.audioRoute.wired': 'Fone com fio',
  'call.audioRoute.bluetooth': 'Bluetooth',
} as const;

export default ptCallShell;
