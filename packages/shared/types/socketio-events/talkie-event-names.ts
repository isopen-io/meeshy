/**
 * Les noms du TALKIE (#13935, D-4) — une PARTIE de `SERVER_EVENTS` et de
 * `CLIENT_EVENTS` (`event-names.ts`), qui les répandent. Charges : `../talkie.ts`.
 *
 * Le son se lit DÈS SA RÉCEPTION : le serveur relaie chaque fragment à
 * l'instant où il le reçoit, vers la room `user:<destinataire>`, sans rien
 * stocker. Les noms client et serveur sont DISTINCTS (`send-chunk` / `chunk`).
 */

export const TALKIE_CLIENT_EVENTS = {
  /** Ouvrir une prise de parole vers un Proche ou un Sang ; l'accusé rend `talkieId` ou un refus codé. */
  TALKIE_START: 'talkie:start',
  /** Un fragment audio (~200 à 500 ms), relayé tel quel et aussitôt. */
  TALKIE_SEND_CHUNK: 'talkie:send-chunk',
  /** Fin de la prise de parole (bouton relâché). */
  TALKIE_END: 'talkie:end',
} as const;

export const TALKIE_SERVER_EVENTS = {
  /** Au destinataire : une prise de parole commence. */
  TALKIE_INCOMING: 'talkie:incoming',
  /** Au destinataire : un fragment, à jouer dès son arrivée. */
  TALKIE_CHUNK: 'talkie:chunk',
  /** Au destinataire (et aux autres appareils de l'émetteur) : la prise de parole est finie ou coupée. */
  TALKIE_ENDED: 'talkie:ended',
} as const;
