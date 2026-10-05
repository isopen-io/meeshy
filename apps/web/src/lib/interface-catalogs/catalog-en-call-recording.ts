/**
 * LE BOUTON D'ENREGISTREMENT D'UN APPEL (#8064) — tranche du catalogue,
 * RÉPANDUE par `catalog-en.ts` comme `catalog-en-call-captions.ts`. Le
 * reste du parcours (consentement, indicateur, mot de fin) vit dans
 * `catalog-call-recording-en.ts`, chargé avec sa couche seulement.
 */
const enCallRecording = {
  'callRecording.start': 'Record the call',
  'callRecording.stop': 'Stop recording',
} as const;

export default enCallRecording;
