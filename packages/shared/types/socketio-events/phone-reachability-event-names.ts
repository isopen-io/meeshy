/**
 * Les noms du TÉLÉPHONE INJOIGNABLE (#18737, TEL-01). Charges : `../phone-reachability.ts`.
 *
 * Audience : la room `user:<lecteur>`, lecteur par lecteur, chacun avec SON canal
 * (`phoneReachabilityReaderChannel`) — jamais une room partagée. Aucun événement montant : le
 * signe de vie du téléphone est sa connexion, son relevé de batterie ou `POST /me/device/alive`.
 *
 * Émis par `services/gateway/src/services/phoneReachability/phoneReachabilityRelay.ts`.
 */

export const PHONE_REACHABILITY_SERVER_EVENTS = {
  /** À un lecteur : le téléphone est injoignable depuis…, et l'annonce quand son canal est la SyncPill. */
  PHONE_UNREACHABLE: 'phone:unreachable',
  /** À un lecteur : le téléphone répond de nouveau, ou ne lui est plus servi — l'état disparaît. */
  PHONE_REACHABLE: 'phone:reachable',
} as const;
