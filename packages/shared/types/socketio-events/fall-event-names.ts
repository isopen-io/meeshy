/**
 * Les noms de la CHUTE DÉTECTÉE (#18748, SAN-01). Charges : `../fall-detection.ts`.
 *
 * Audience : la room `user:<Sang>`, lecteur par lecteur — jamais une room partagée. Aucun événement
 * montant : l'iPhone rapporte par `POST /me/health/fall`.
 *
 * Émis par `services/gateway/src/services/fallDetection/fallRelay.ts`.
 */

export const FALL_SERVER_EVENTS = {
  /** À un Sang : une chute a été détectée (instant à la minute), avec l'annonce quand elle vient de partir. */
  FALL_DETECTED: 'fall:detected',
  /** À un Sang : la personne a répondu, l'épisode a expiré, ou il ne lui est plus servi. */
  FALL_CLEARED: 'fall:cleared',
} as const;
