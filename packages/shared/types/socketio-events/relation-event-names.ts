/**
 * Les noms du LIEN entre deux personnes : un niveau monté, et le rituel du Sang —
 * une PARTIE de `SERVER_EVENTS` (`event-names.ts`), qui les répand (#13933, cercles).
 *
 * Six événements, tous serveur -> client, tous adressés à la room `user:<id>` :
 * le rituel et le Bring se pilotent par REST (`POST /relations/:userId/ritual`,
 * `POST|DELETE /bring/…`), le serveur n'a besoin que de PRÉVENIR. Charges du
 * Bring : `../bring.ts` (#13936). Il n'existe AUCUN événement de baisse, de sortie ni de
 * refus : ce sont des gestes silencieux (RG-07), et un événement « baissé » vers
 * celui qu'on baisse serait une notification.
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
} as const;
