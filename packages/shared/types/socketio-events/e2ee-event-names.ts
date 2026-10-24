/**
 * Les noms du RELAIS D'ENVELOPPES libsignal (#3706) — une PARTIE de
 * `SERVER_EVENTS` (`event-names.ts`), qui les répand.
 *
 * `e2ee:envelope` part vers la room de l'APPAREIL destinataire
 * (`ROOMS.device(userId, deviceId, registrationId)`, sa génération), jamais vers celle de l'utilisateur ni de
 * la conversation : chaque appareil ne reçoit que son enveloppe. `message:new`
 * continue de partir sans enveloppe vers les rooms habituelles.
 */

export const E2EE_SERVER_EVENTS = {
  E2EE_ENVELOPE: 'e2ee:envelope',
} as const;
