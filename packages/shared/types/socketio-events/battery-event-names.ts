/**
 * Les noms de la BATTERIE DES PROCHES (#14147). Charges : `../battery.ts`.
 *
 * Audience : la room `user:<lecteur>`, lecteur par lecteur, chacun avec SA projection et
 * SON canal (`batteryReaderChannel`) — jamais une room partagée.
 *
 * PAS ENCORE répandus dans `SERVER_EVENTS` / `CLIENT_EVENTS` : les gardes
 * `socket-event-emitter-gate`, `socket-event-handler-gate` et `socket-event-orphan-gate`
 * exigent émetteur, écouteur et lecteur dès qu'un nom entre dans les cartes. Le lot
 * passerelle les y répand dans le commit qui pose `socket.on` et l'émission
 * (`docs/superpowers/specs/2026-11-15-batterie-proches-design.md` § 1).
 */

export const BATTERY_CLIENT_EVENTS = {
  /** Le téléphone de l'émetteur envoie un relevé ; l'accusé dit s'il est suivi. */
  BATTERY_REPORT: 'battery:report',
  /** Un Sang demande un relevé maintenant (1 toutes les 5 min par paire). */
  BATTERY_PULL: 'battery:pull',
} as const;

export const BATTERY_SERVER_EVENTS = {
  /** À un lecteur : l'état servi, et l'annonce quand son canal est la SyncPill. */
  BATTERY_CHANGED: 'battery:changed',
  /** À un lecteur : l'épisode est clos, ou ne lui est plus servi — l'icône disparaît. */
  BATTERY_CLEARED: 'battery:cleared',
  /** À l'émetteur : relever maintenant. */
  BATTERY_PULL_REQUESTED: 'battery:pull-requested',
} as const;
