/**
 * LE BOUTON D'ENREGISTREMENT D'UN APPEL (#8064) — tranche du catalogue,
 * RÉPANDUE par `catalog-de.ts` comme `catalog-de-call-captions.ts`. Le
 * reste du parcours (consentement, indicateur, mot de fin) vit dans
 * `catalog-call-recording-de.ts`, chargé avec sa couche seulement.
 */
const deCallRecording = {
  'callRecording.start': 'Anruf aufnehmen',
  'callRecording.stop': 'Aufnahme beenden',
} as const;

export default deCallRecording;
