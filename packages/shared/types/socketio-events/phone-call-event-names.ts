/**
 * Les noms d'« EN APPEL » (#18753, ACT-01). Charges : `../phone-call.ts`.
 *
 * Audience : la room `user:<Sang>`, lecteur par lecteur — jamais une room partagée. Aucun événement
 * montant : le téléphone rapporte par `POST /me/device/call`.
 *
 * Émis par `services/gateway/src/services/phoneCall/phoneCallRelay.ts`.
 */

export const PHONE_CALL_SERVER_EVENTS = {
  /** À un Sang : l'émetteur est en appel depuis…, et l'annonce quand il est en conversation avec lui. */
  PHONE_CALL_STARTED: 'phone-call:started',
  /** À un Sang : l'appel est fini, ou ne lui est plus servi — l'état disparaît. */
  PHONE_CALL_ENDED: 'phone-call:ended',
} as const;
