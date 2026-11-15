/**
 * Les noms de la séance « ENSEMBLE » (#17011, #17012) — une PARTIE de `SERVER_EVENTS` et
 * de `CLIENT_EVENTS` (`event-names.ts`), qui les répandent. Charges : `../together.ts`.
 *
 * Audience : les rooms `user:<hôte>` et `user:<invité>` seulement — jamais la room de la
 * conversation, dont les autres membres n'apprennent rien.
 */

export const TOGETHER_CLIENT_EVENTS = {
  /** Inviter un Proche à lire ensemble une pièce jointe audio ou vidéo d'une conversation commune. */
  TOGETHER_INVITE: 'together:invite',
  /** Accepter une invitation : la séance démarre chez les deux. */
  TOGETHER_JOIN: 'together:join',
  /** Lecture, pause ou déplacement : l'état complet de lecture. */
  TOGETHER_SYNC: 'together:sync',
  /** Quitter la séance, ou refuser l'invitation. */
  TOGETHER_LEAVE: 'together:leave',
} as const;

export const TOGETHER_SERVER_EVENTS = {
  /** À l'invité : une invitation à lire ensemble. */
  TOGETHER_INVITED: 'together:invited',
  /** Aux deux : la séance démarre. */
  TOGETHER_STARTED: 'together:started',
  /** Aux deux : l'état de lecture, horodaté par le serveur. */
  TOGETHER_SYNCED: 'together:synced',
  /** Aux deux : la séance est finie, refusée, remplacée ou coupée. */
  TOGETHER_ENDED: 'together:ended',
} as const;
