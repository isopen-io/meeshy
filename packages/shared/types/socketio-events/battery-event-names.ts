/**
 * Les noms de la BATTERIE DES PROCHES (#14147). Charges : `../battery.ts`.
 *
 * Audience : la room `user:<lecteur>`, lecteur par lecteur, chacun avec SA projection et
 * SON canal (`batteryReaderChannel`) — jamais une room partagée.
 *
 * Répandus dans `SERVER_EVENTS` / `CLIENT_EVENTS` par le lot passerelle, qui pose
 * `socket.on` (`BatteryHandler.ts`) et l'émission (`services/battery/batteryRelay.ts`).
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
