/**
 * L'APPEL NATIF DE LA COQUE ANDROID (#8049) — tranche du catalogue
 * `catalog-ar.ts`, qui la RÉPAND : les sorties audio d'un appel
 * (`src/lib/calls/shell-call.ts` § audioRouteLabelKey).
 */
const arCallShell = {
  'call.audioRoute.menu': 'مخرج الصوت',
  'call.audioRoute.earpiece': 'سماعة الأذن',
  'call.audioRoute.speaker': 'مكبر الصوت',
  'call.audioRoute.wired': 'سماعة سلكية',
  'call.audioRoute.bluetooth': 'بلوتوث',
} as const;

export default arCallShell;
