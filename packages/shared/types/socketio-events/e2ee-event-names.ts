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
  /**
   * Un message de COMPARAISON (confirmation d'un appareil par code, #19156, spec
   * 2026-11-17 § 5.2), vers la room de la génération destinataire (`ROOMS.device`) :
   * `{ id, relayedFrom, message, answeredBy? }`. Une émission perdue ne perd rien :
   * `GET /e2ee/devices/self/verifications` relit.
   */
  E2EE_VERIFICATION: 'e2ee:verification',
  /**
   * Un appareil a rejoint mon compte, ou une génération retirée y revient (§ 5.3) —
   * vers les rooms de mes AUTRES appareils capables. Données du serveur : elles
   * déclenchent un affichage, jamais une approbation.
   */
  E2EE_OWN_DEVICE_ENROLLED: 'e2ee:own-device-enrolled',
  /** Une génération de mon compte a été retirée (§ 5.3), vers les rooms de mes autres appareils capables. */
  E2EE_OWN_DEVICE_RETIRED: 'e2ee:own-device-retired',
} as const;

/**
 * L'événement UNIQUE par lequel un appareil remet un signal chiffré (#13142) :
 * réaction, frappe, accusé, modification, suppression, vue unique, épinglage.
 * Le type du signal est dans le chiffré ; la charge ne porte que des
 * enveloppes (`e2eeSignalSocketPayloadSchema`), l'accusé rend `signalId`.
 */
export const E2EE_CLIENT_EVENTS = {
  E2EE_SEND_SIGNAL: 'e2ee:send-signal',
  /**
   * Un message de comparaison remis au relais (#19156) : même charge et même juge que
   * `POST /e2ee/devices/self/verifications` ; l'accusé rend `{ ids, recipients }`.
   */
  E2EE_SEND_VERIFICATION: 'e2ee:send-verification',
} as const;
