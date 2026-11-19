/**
 * Les noms de la VÉRIFICATION D'INACTIVITÉ (#18738, TEL-02). Charges : `../inactivity-check.ts`.
 *
 * Audience : la room `user:<Sang>`, lecteur par lecteur — jamais une room partagée. Aucun événement
 * montant : l'activité est la socket du téléphone suivi, et la réponse `POST /me/wellness/ok`.
 *
 * Émis par `services/gateway/src/services/inactivityCheck/inactivityRelay.ts`.
 */

export const INACTIVITY_SERVER_EVENTS = {
  /** À un Sang : le téléphone n'a montré aucune activité depuis…, et la personne n'a pas répondu. */
  INACTIVITY_ALERT: 'inactivity:alert',
  /** À un Sang : la personne a répondu, ou l'alerte ne lui est plus servie — l'état disparaît. */
  INACTIVITY_CLEARED: 'inactivity:cleared',
} as const;
