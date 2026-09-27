/**
 * LE BOUTON D'ENREGISTREMENT D'UN APPEL (#8064) — tranche du catalogue,
 * RÉPANDUE par `catalog-es.ts` comme `catalog-es-call-captions.ts`. Le
 * reste du parcours (consentement, indicateur, mot de fin) vit dans
 * `catalog-call-recording-es.ts`, chargé avec sa couche seulement.
 */
const esCallRecording = {
  'callRecording.start': 'Grabar la llamada',
  'callRecording.stop': 'Detener la grabación',
} as const;

export default esCallRecording;
