/**
 * Les noms du consentement à l'enregistrement d'un appel (#8064) — une PARTIE
 * des deux cartes de `event-names.ts`, qui les répandent.
 *
 * À part pour la raison de `viewing-event-names.ts` (#9966) : le web les lit
 * dès sa première peinture (`lib/calls/call-recording.ts`), et y importer
 * `SERVER_EVENTS` tirait la carte entière.
 */

export const CALL_RECORDING_SERVER_EVENTS = {
  /** Demande diffusée, démarrage après l'accord de TOUS, arrêt. */
  CALL_RECORDING_REQUESTED: 'call:recording-requested',
  CALL_RECORDING_STARTED: 'call:recording-started',
  CALL_RECORDING_STOPPED: 'call:recording-stopped',
} as const;

export const CALL_RECORDING_CLIENT_EVENTS = {
  /** Demander, accepter ou refuser, arrêter l'enregistrement d'un appel. */
  CALL_RECORDING_REQUEST: 'call:recording-request',
  CALL_RECORDING_CONSENT: 'call:recording-consent',
  CALL_RECORDING_STOP: 'call:recording-stop',
} as const;
