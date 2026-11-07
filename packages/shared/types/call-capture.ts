/**
 * Ce que le journal d'un appel garde d'une capture (#16665, loi 13 de
 * `docs/product/appels-vue-finale.md`).
 *
 * Deux familles partagent une seule ligne persistée (`CallCaptureEvent`) :
 *  - une capture d'ÉCRAN signalée par le client (`call:screen-capture-detected`) :
 *    `recording` (enregistrement d'écran, vrai puis faux) ou `screenshot`
 *    (capture ponctuelle, vrai seul) ;
 *  - les deux moments de l'enregistrement CONSENTI de l'appel, écrits par la
 *    passerelle là où elle diffuse `call:recording-started` / `-stopped`.
 *
 * Fichier à part : le web le lit sans tirer `video-call.ts`.
 */

export const CALL_SCREEN_CAPTURE_KINDS = ['recording', 'screenshot'] as const;

export type CallScreenCaptureKind = typeof CALL_SCREEN_CAPTURE_KINDS[number];

export const CALL_CAPTURE_EVENT_KINDS = [...CALL_SCREEN_CAPTURE_KINDS, 'call-recording-started', 'call-recording-stopped'] as const;

export type CallCaptureEventKind = typeof CALL_CAPTURE_EVENT_KINDS[number];

/** Au plus une ligne par participant, par sorte de capture d'écran et par fenêtre. */
export const CALL_SCREEN_CAPTURE_DEDUPE_MS = 5_000;

/** Un `kind` absent (client d'avant #16665) ou inconnu se lit `recording`. */
export const screenCaptureKindOf = (value: unknown): CallScreenCaptureKind =>
  value === 'screenshot' ? 'screenshot' : 'recording';

export const isCallCaptureEventKind = (value: unknown): value is CallCaptureEventKind =>
  CALL_CAPTURE_EVENT_KINDS.some((kind) => kind === value);

/**
 * Une ligne de capture servie par `GET /calls/:callId/transcript`, à côté des
 * segments. `participantId`, `userId` et `displayName` sont nuls pour un arrêt
 * d'enregistrement que personne n'a demandé (fin d'appel, délai, arrivée).
 */
export type CallTranscriptCapture = {
  readonly id: string;
  readonly participantId: string | null;
  readonly userId: string | null;
  readonly displayName: string | null;
  readonly kind: CallCaptureEventKind;
  /** Millisecondes depuis le début de l'appel. */
  readonly offsetMs: number;
  /** Horodatage ISO 8601 de l'événement. */
  readonly at: string;
};
