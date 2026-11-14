/**
 * Les noms du PARTAGE TEMPORAIRE DE POSITION à des personnes (#14109, #16980) — une
 * PARTIE de `SERVER_EVENTS` et de `CLIENT_EVENTS` (`event-names.ts`), qui les
 * répandent. Charges : `../shared-location.ts`. Le partage DANS une conversation garde
 * `location:live-*`.
 *
 * Audience : la room `user:<destinataire>`, destinataire par destinataire, chacun avec
 * SA projection — jamais une room partagée.
 */

export const SHARED_LOCATION_CLIENT_EVENTS = {
  /** Destinataires, précisions, durée et première position ; l'accusé rend le terme. */
  SHARED_LOCATION_START: 'location:share-start',
  /** Une nouvelle position du partage en cours. */
  SHARED_LOCATION_UPDATE: 'location:share-update',
  /** L'émetteur arrête son partage. */
  SHARED_LOCATION_STOP: 'location:share-stop',
} as const;

export const SHARED_LOCATION_SERVER_EVENTS = {
  /** À un destinataire : la position d'un lien, à SA précision. */
  SHARED_LOCATION_CHANGED: 'location:share-changed',
  /** À un destinataire : le partage est arrêté, ou ne lui est plus servi. */
  SHARED_LOCATION_ENDED: 'location:share-ended',
  /** À chacun de deux Sangs consentants proches l'un de l'autre : « X est près de toi », sans coordonnée (#13937). */
  BLOOD_PROXIMITY: 'location:blood-proximity',
} as const;
