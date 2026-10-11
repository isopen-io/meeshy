/**
 * Ce qu'un `select` d'AUTEUR demande en plus pour qu'un invité porte le nom
 * qu'il a DONNÉ à l'entrée (#10120) — les deux noms du profil de session, et
 * rien d'autre (ni e-mail, ni date de naissance, ni la session). Résolu puis
 * retiré par `servedMessageSender` avant de partir vers un client.
 */
export const ANONYMOUS_SENDER_NAME_SELECT = {
  anonymousSession: { select: { profile: { select: { firstName: true, lastName: true } } } },
} as const;
