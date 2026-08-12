import { PrismaClient } from '@meeshy/shared/prisma/client';
import { sanitizeEmoji, isValidEmoji } from '@meeshy/shared/types/reaction';

export interface AddAttachmentReactionOptions {
  attachmentId: string;
  messageId: string;
  participantId: string;
  emoji: string;
}
export interface RemoveAttachmentReactionOptions {
  attachmentId: string;
  participantId: string;
  emoji: string;
}

/**
 * BUG2 A' — réactions par-image. Miroir de `ReactionService`, substituant la clé
 * `(attachmentId, participantId)`. La résolution de conversation se fait
 * via `messageId`. Le modèle de réaction suit exactement les réactions
 * message-level : `reactionSummary` (emoji→count) + `currentUserReactions` (liste
 * d'emojis du user courant).
 */
export class AttachmentReactionService {
  constructor(private readonly prisma: PrismaClient) {}

  async addAttachmentReaction(o: AddAttachmentReactionOptions): Promise<{ changed: boolean }> {
    const emoji = sanitizeEmoji(o.emoji);
    if (!isValidEmoji(emoji)) throw new Error('Invalid emoji');

    // Idempotency: the participant already holding exactly this emoji on this
    // attachment (optimistic double-fire, a socket retry after a lost ACK, or a
    // second device echoing the same tap) is a no-op — report `changed: false`
    // so the handler can skip the ATTACHMENT_REACTION_ADDED broadcast. Mirrors
    // ReactionService.addReaction's `unchanged` contract (iter 134).
    const previous = await this.prisma.attachmentReaction.findUnique({
      where: {
        attachment_participant_reaction: {
          attachmentId: o.attachmentId,
          participantId: o.participantId,
        },
      },
      select: { emoji: true },
    });
    if (previous?.emoji === emoji) return { changed: false };

    // Single-reaction-per-user model: the DB unique key is (attachmentId,
    // participantId) — no emoji — so this upsert is atomic at the Mongo level.
    // Two concurrent addAttachmentReaction calls for different emojis now race
    // on the SAME document instead of each inserting their own row (the prior
    // find/deleteMany/upsert sequence let both pass the "no existing reaction"
    // check before either committed — see 2026-07-04-attachment-reaction-
    // duplicate-race-fix.md).
    await this.prisma.attachmentReaction.upsert({
      where: {
        attachment_participant_reaction: {
          attachmentId: o.attachmentId,
          participantId: o.participantId,
        },
      },
      create: {
        attachmentId: o.attachmentId,
        messageId: o.messageId,
        participantId: o.participantId,
        emoji,
      },
      update: { emoji },
    });
    return { changed: true };
  }

  async removeAttachmentReaction(o: RemoveAttachmentReactionOptions): Promise<boolean> {
    // Return whether a row was actually deleted so the handler can stay
    // idempotent: an already-absent reaction (retry, double-tap, second device)
    // reports `false` and skips the ATTACHMENT_REACTION_REMOVED broadcast.
    // Mirrors ReactionService.removeReaction's `count > 0` contract.
    const result = await this.prisma.attachmentReaction.deleteMany({
      where: {
        attachmentId: o.attachmentId,
        participantId: o.participantId,
        emoji: sanitizeEmoji(o.emoji),
      },
    });
    return result.count > 0;
  }

  /** Comptes agrégés par emoji pour une pièce jointe. */
  async getReactionSummary(attachmentId: string): Promise<Record<string, number>> {
    const rows = await this.prisma.attachmentReaction.findMany({
      where: { attachmentId },
      select: { emoji: true },
    });
    const summary: Record<string, number> = {};
    for (const r of rows) summary[r.emoji] = (summary[r.emoji] ?? 0) + 1;
    return summary;
  }

  /** Emojis posés par un participant donné sur une pièce jointe. */
  async getCurrentUserReactions(attachmentId: string, participantId: string): Promise<string[]> {
    const rows = await this.prisma.attachmentReaction.findMany({
      where: { attachmentId, participantId },
      select: { emoji: true },
    });
    return rows.map((r) => r.emoji);
  }

  async resolveConversationId(messageId: string): Promise<string | null> {
    const m = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { conversationId: true },
    });
    return m?.conversationId ?? null;
  }
}
