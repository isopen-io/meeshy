/**
 * L'ENREGISTREMENT D'UN APPEL, FRANÇAIS (#8064) — la SOURCE des clés de la
 * couche d'enregistrement (consentement, indicateur, mot de fin). Les six
 * autres langues portent exactement ces clés (`satisfies CallRecordingCatalog`,
 * `i18n-call-recording-catalog.test.ts`).
 */
const fr = {
  'callRecording.stop': 'Arrêter l’enregistrement',
  'callRecording.active': 'Enregistrement en cours',
  'callRecording.waiting': 'En attente de l’accord de tous…',
  'callRecording.ask': '{name} veut enregistrer l’appel',
  'callRecording.askVideo': '{name} veut enregistrer l’appel en vidéo',
  'callRecording.askDetail': 'L’enregistrement ne commence que si tout le monde accepte, puis il est ajouté à la conversation.',
  'callRecording.accept': 'Accepter',
  'callRecording.refuse': 'Refuser',
  'callRecording.cancel': 'Annuler',
  'callRecording.someone': 'Un participant',
  'callRecording.stopped.refused': 'Enregistrement refusé',
  'callRecording.stopped.timeout': 'Tout le monde n’a pas répondu : pas d’enregistrement',
  'callRecording.stopped.joined': 'Quelqu’un a rejoint l’appel : enregistrement arrêté',
  'callRecording.stopped.other': 'Enregistrement arrêté',
  'callRecording.unavailable': 'Enregistrement impossible pour le moment',
  'callRecording.saved': 'L’enregistrement a été ajouté à la conversation',
  'callRecording.saveFailed': 'L’enregistrement n’a pas pu être ajouté',
  'callRecording.close': 'Fermer',
} as const;

export default fr;
