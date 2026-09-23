/**
 * LE RANG D'UNE LIGNE DE LA LISTE DE CONVERSATIONS, PAR LECTEUR (#7592).
 *
 * rang = max(`lastMessageAt`, heure de la dernière réaction QUAND elle vise un
 * message du lecteur). Une réaction à MON message remonte ma ligne ; une
 * réaction entre tiers s'affiche sans la réordonner (directive porteur du
 * 2026-09-23, qui inverse le contrat #7545 : la règle n'est plus « de client »).
 *
 * **Le serveur l'applique et la SERT.** `GET /conversations` trie sur ce rang
 * et pose `listRankAt` sur chaque ligne ; `conversation:updated` le pose pour
 * l'auteur du message réagi. Les clients trient sur `listRankAt` quand il est
 * servi — ils ne recalculent pas. Les deux formes ci-dessous (la charge servie
 * et les colonnes dénormalisées de `Conversation`) passent par la MÊME
 * comparaison, `maxRank`.
 *
 * La clé du lecteur est celle des rooms `user:<clé>` : `User.id` d'un compte,
 * `Participant.id` d'un invité — exactement ce que `reactionTargetKey` rend
 * pour l'auteur d'un message.
 */

export type RankInstant = Date | string;

export interface ReactionTarget {
  readonly targetSenderUserId?: string | null;
  readonly targetSenderId?: string | null;
}

export interface ConversationListRankInput {
  readonly lastMessageAt?: RankInstant | null;
  readonly lastReaction?: (ReactionTarget & { readonly createdAt: RankInstant }) | null;
}

export interface ConversationListRankColumns {
  readonly lastMessageAt?: Date | null;
  readonly lastReactionAt?: Date | null;
  readonly lastReactionTargetKey?: string | null;
}

/** La clé de l'auteur du message réagi : `User.id`, ou `Participant.id` pour un invité. */
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
  reactionAt: RankInstant | null | undefined,
  reactionTarget: string | null | undefined,
  viewerKey: string | null | undefined,
): number | null {
  const message = toMillis(messageAt);
  const lifts = !!viewerKey && reactionTarget === viewerKey;
  const reaction = lifts ? toMillis(reactionAt) : null;
  if (message === null) return reaction;
  if (reaction === null) return message;
  return Math.max(message, reaction);
}

/** Le rang servi (`listRankAt`), en chaîne ISO — `null` sans message ni réaction qui compte. */
export function conversationListRank(
  input: ConversationListRankInput,
  viewerKey: string | null | undefined,
): string | null {
  const reaction = input.lastReaction ?? null;
  const rank = maxRank(
    input.lastMessageAt,
    reaction?.createdAt,
    reaction ? reactionTargetKey(reaction) : null,
    viewerKey,
  );
  return rank === null ? null : new Date(rank).toISOString();
}

/** La même règle lue sur les colonnes dénormalisées de `Conversation` (tri serveur). */
export function listRankFromColumns(
  columns: ConversationListRankColumns,
  viewerKey: string | null | undefined,
): Date | null {
  const rank = maxRank(columns.lastMessageAt, columns.lastReactionAt, columns.lastReactionTargetKey, viewerKey);
  return rank === null ? null : new Date(rank);
}
