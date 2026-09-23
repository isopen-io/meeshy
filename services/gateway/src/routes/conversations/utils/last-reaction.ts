import { resolveParticipantDisplayName } from '@meeshy/shared/utils/participant-helpers';
import type { ConversationLastReaction } from '@meeshy/shared/types/conversation-preview';
import { buildLastMessagePreviewTranslations, truncateMessagePreview } from './last-message-preview';
import { isPreviewWithheld, resolvePreviewProtection } from './last-message-nature';

/**
 * La DERNIÈRE réaction d'une conversation, telle que la ligne de liste la dit
 * (#7545) — une fonction pour `GET /conversations` et pour la diffusion
 * `conversation:updated` qui suit une réaction.
 */

/** Ce que la résolution lit, chargé depuis `Conversation.lastReactionId`. */
export const LAST_REACTION_SELECT = {
  id: true,
  emoji: true,
  createdAt: true,
  participantId: true,
  participant: {
    select: { id: true, userId: true, displayName: true, user: { select: { displayName: true } } },
  },
  message: {
    select: {
      id: true,
      conversationId: true,
      senderId: true,
      createdAt: true,
      deletedAt: true,
      content: true,
      originalLanguage: true,
      translations: true,
      isViewOnce: true,
      isBlurred: true,
      isEncrypted: true,
      expiresAt: true,
      ephemeralDuration: true,
      sender: { select: { userId: true } },
    },
  },
} as const;

export interface LastReactionRow {
  readonly emoji: string;
  readonly createdAt: Date;
  readonly participantId: string;
  readonly participant?: {
    readonly userId?: string | null;
    readonly displayName?: string | null;
    readonly user?: { readonly displayName?: string | null } | null;
  } | null;
  readonly message: {
    readonly id: string;
    readonly senderId?: string | null;
    readonly createdAt: Date;
    readonly deletedAt?: Date | null;
    readonly content?: string | null;
    readonly originalLanguage?: string | null;
    readonly translations?: unknown;
    readonly isViewOnce?: boolean | null;
    readonly isBlurred?: boolean | null;
    readonly isEncrypted?: boolean | null;
    readonly expiresAt?: Date | string | null;
    readonly ephemeralDuration?: number | null;
    readonly sender?: { readonly userId?: string | null } | null;
  };
}

export interface LastReactionReader {
  /** La descente ordonnée du Prisme du lecteur (`resolveUserLanguagesOrdered`). */
  readonly viewerLanguages: readonly string[];
  /**
   * Le plancher d'historique du lecteur (arrivée tardive, historique effacé) :
   * une réaction sur un message qu'il n'a pas le droit de lire ne lui dit rien,
   * ni l'extrait ni même son existence.
   */
  readonly historyFloor: Date | null;
}

/**
 * `null` quand il n'y a rien à dire à CE lecteur : pas de réaction, message
 * réagi supprimé, ou antérieur à son plancher. L'extrait suit la protection du
 * message réagi — exactement celle de l'aperçu (`resolvePreviewProtection`).
 */
export function resolveConversationLastReaction(
  row: LastReactionRow | null | undefined,
  reader: LastReactionReader,
  now: Date = new Date(),
): ConversationLastReaction | null {
  if (!row || row.message.deletedAt) return null;
  if (reader.historyFloor && row.message.createdAt < reader.historyFloor) return null;

  const protection = resolvePreviewProtection(row.message, now);
  const withheld = isPreviewWithheld(protection);
  return {
    emoji: row.emoji,
    reactorId: row.participantId,
    reactorUserId: row.participant?.userId ?? null,
    reactorName: resolveParticipantDisplayName(row.participant ?? null),
    messageId: row.message.id,
    targetSenderId: row.message.senderId ?? null,
    targetSenderUserId: row.message.sender?.userId ?? null,
    excerpt: withheld ? null : truncateMessagePreview(row.message.content) ?? null,
    excerptOriginalLanguage: withheld ? null : row.message.originalLanguage ?? null,
    excerptTranslations: withheld
      ? null
      : buildLastMessagePreviewTranslations({
          translations: row.message.translations,
          originalLanguage: row.message.originalLanguage,
          viewerLanguages: reader.viewerLanguages,
        }),
    excerptProtection: withheld ? protection : null,
    createdAt: row.createdAt.toISOString(),
  };
}
