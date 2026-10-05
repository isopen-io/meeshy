/**
 * LE RANG D'UNE LIGNE DE LA LISTE DE CONVERSATIONS (#9026).
 *
 * rang = max(`lastMessageAt`, `lastActivityAt`) — le MÊME pour TOUS les
 * participants. Directive porteur du 2026-10-01, qui remplace la règle PAR
 * LECTEUR de #7592 (« une réaction ne remonte que la ligne de l'auteur
 * réagi ») : toute activité dans une conversation la remonte en tête pour tout
 * le monde — un message (`lastMessageAt`), une réaction posée, un appel
 * (début, fin, manqué), un message épinglé ou dépinglé (`lastActivityAt`,
 * écrit monotone par `recordConversationActivity` côté passerelle).
 *
 * **Le serveur l'applique et la SERT.** `GET /conversations` trie sur ce rang
 * et pose `listRankAt` sur chaque ligne ; `conversation:updated` le pose pour
 * chaque participant quand une activité survient. Les clients trient sur
 * `listRankAt` quand il est servi — ils ne recalculent pas. Les deux formes
 * ci-dessous (la charge servie et les colonnes dénormalisées de
 * `Conversation`) passent par la MÊME comparaison, `maxRank`.
 *
 * Un document antérieur (`lastActivityAt` absent) retombe sur `lastMessageAt` :
 * aucun rattrapage n'est nécessaire.
 */

export type RankInstant = Date | string;

export interface ReactionTarget {
  readonly targetSenderUserId?: string | null;
  readonly targetSenderId?: string | null;
}

export interface ConversationListRankInput {
  readonly lastMessageAt?: RankInstant | null;
  readonly lastActivityAt?: RankInstant | null;
}

export interface ConversationListRankColumns {
  readonly lastMessageAt?: Date | null;
  readonly lastActivityAt?: Date | null;
}

/**
 * La clé de l'auteur du message réagi : `User.id`, ou `Participant.id` pour un
 * invité. Elle qualifie la dernière réaction (`lastReactionTargetKey`) ; elle
 * ne participe plus au rang.
 */
export function reactionTargetKey(target: ReactionTarget): string | null {
  return target.targetSenderUserId ?? target.targetSenderId ?? null;
}

function toMillis(instant: RankInstant | null | undefined): number | null {
  if (instant === null || instant === undefined) return null;
  const ms = instant instanceof Date ? instant.getTime() : Date.parse(instant);
  return Number.isNaN(ms) ? null : ms;
}

function maxRank(
  messageAt: RankInstant | null | undefined,
  activityAt: RankInstant | null | undefined,
): number | null {
  const message = toMillis(messageAt);
  const activity = toMillis(activityAt);
  if (message === null) return activity;
  if (activity === null) return message;
  return Math.max(message, activity);
}

/** Le rang servi (`listRankAt`), en chaîne ISO — `null` sans message ni activité. */
export function conversationListRank(input: ConversationListRankInput): string | null {
  const rank = maxRank(input.lastMessageAt, input.lastActivityAt);
  return rank === null ? null : new Date(rank).toISOString();
}

/** La même règle lue sur les colonnes dénormalisées de `Conversation` (tri serveur). */
export function listRankFromColumns(columns: ConversationListRankColumns): Date | null {
  const rank = maxRank(columns.lastMessageAt, columns.lastActivityAt);
  return rank === null ? null : new Date(rank);
}
