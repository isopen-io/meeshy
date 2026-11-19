/**
 * Les noms du LIEN entre deux personnes : un niveau monté, et le rituel du Sang —
 * une PARTIE de `SERVER_EVENTS` (`event-names.ts`), qui les répand (#13933, cercles).
 *
 * Tous serveur -> client, tous adressés à la room `user:<id>` : le rituel et le
 * Bring se pilotent par REST (`POST /relations/:userId/ritual`,
 * `POST|DELETE /bring/…`), le serveur n'a besoin que de PRÉVENIR. Charges du
 * Bring : `../bring.ts` (#13936).
 *
 * Une baisse, une sortie, un blocage restent des gestes SILENCIEUX pour celui qui
 * les subit (RG-07) : un événement « baissé » vers lui serait une notification.
 * Les trois événements « by-me » (#19366) ne partent donc que vers la room de
 * L'ACTEUR — ses autres appareils, qui gardaient sinon l'ancien niveau et un
 * profil non réduit jusqu'à une relecture. Jamais vers l'autre.
 */

export const RELATION_SERVER_EVENTS = {
  /** Le niveau effectif de la paire a monté : aux DEUX, chacun avec l'identifiant de l'autre. */
  RELATION_LEVEL_RAISED: 'relation:level-raised',
  /** L'autre a ouvert (ou rejoint) le rituel du Sang. */
  RELATION_RITUAL_STARTED: 'relation:ritual-started',
  /** L'autre a tenu l'écran, confirmé, ou lâché. */
  RELATION_RITUAL_PROGRESS: 'relation:ritual-progress',
  /** Les deux ont confirmé : le lien est Sang. */
  RELATION_RITUAL_COMPLETED: 'relation:ritual-completed',
  /** Un Bring sonne : au DESTINATAIRE seulement. */
  BRING_RING: 'bring:ring',
  /** Un Bring s'arrête : aux deux, sauf quand un blocage l'arrête (le bloqué n'en apprend rien). */
  BRING_STOPPED: 'bring:stopped',
  /** J'ai baissé mon accord (ou quitté le cercle) : à MES appareils seulement, jamais à l'autre (#19366). */
  RELATION_LEVEL_LOWERED: 'relation:level-lowered',
  /** J'ai bloqué quelqu'un : à MES appareils seulement, jamais au bloqué (#19366). */
  USER_BLOCKED_BY_ME: 'user:blocked-by-me',
  /** J'ai débloqué quelqu'un : à MES appareils seulement, jamais au débloqué (#19366). */
  USER_UNBLOCKED_BY_ME: 'user:unblocked-by-me',
} as const;
