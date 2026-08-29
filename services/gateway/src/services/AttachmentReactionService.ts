import { PrismaClient } from '@meeshy/shared/prisma/client';
import { sanitizeEmoji } from '@meeshy/shared/types/reaction';
import { assertReactionAllowed } from '../utils/reaction-limit-guard.js';
import { ConflictError } from '../errors/custom-errors';

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
    // Miroir EXACT de `ReactionService.addReaction` (la jumelle) : `sanitizeEmoji`
    // rend `null` pour un non-emoji, et `null` est la seule preuve d'invalidité —
    // le repasser à `isValidEmoji(emoji: string)` faisait `null.trim()`, donc un
    // `TypeError` interne remontait au client à la place du refus propre, et la
    // branche `throw` était morte.
    const emoji = sanitizeEmoji(o.emoji);
    if (!emoji) throw new Error('Invalid emoji format');

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
          emoji,
        },
      },
      select: { emoji: true },
    });
    if (previous) return { changed: false };

    // Plafond des cinq réactions (2026-08-20) : règle déclarée UNE SEULE
    // FOIS dans `packages/shared/utils/reaction-limit.ts`. Comptage effectué
    // uniquement ici, APRÈS avoir établi (bloc ci-dessus) qu'il s'agit d'une
    // création réelle — un upsert de confirmation (emoji déjà posé) ne
    // consomme aucune place et ne doit jamais être bloqué par ce plafond.
    const existingReactionCount = await this.prisma.attachmentReaction.count({
      where: { attachmentId: o.attachmentId, participantId: o.participantId },
    });
    // `assertReactionAllowed` jette `ConflictError` — même mécanisme que les autres
    // objets réagissables (messages, posts, commentaires) : un refus légitime, pas
    // une panne.
    assertReactionAllowed(existingReactionCount);

    // Multi-réactions (2026-08-18, « du multiple sur tout contenu à
    // réaction ») : la clé unique DB porte le TRIPLET (attachmentId,
    // participantId, emoji) — un participant empile plusieurs emojis
    // distincts par pièce jointe. L'upsert reste atomique par triplet :
    // deux adds concurrents du MÊME emoji convergent sur le même document,
    // deux emojis différents créent chacun le leur (voulu). Le toggle vit
    // chez les clients (remove sur un emoji déjà posé).
    await this.prisma.attachmentReaction.upsert({
      where: {
        attachment_participant_reaction: {
          attachmentId: o.attachmentId,
          participantId: o.participantId,
          emoji,
        },
      },
      create: {
        attachmentId: o.attachmentId,
        messageId: o.messageId,
        participantId: o.participantId,
        emoji,
      },
      update: {},
    });
    return { changed: true };
  }

  async removeAttachmentReaction(o: RemoveAttachmentReactionOptions): Promise<boolean> {
    // Return whether a row was actually deleted so the handler can stay
    // idempotent: an already-absent reaction (retry, double-tap, second device)
    // reports `false` and skips the ATTACHMENT_REACTION_REMOVED broadcast.
    // Mirrors ReactionService.removeReaction's `count > 0` contract.
    // Comme la jumelle `ReactionService.removeReaction` : on refuse un emoji
    // invalide AVANT le `deleteMany`. Passer `sanitizeEmoji(o.emoji)` (donc
    // possiblement `null`) directement dans le `where` faisait « réussir » un
    // remove malformé — et, l'`emoji: null` ne ciblant plus un emoji précis,
    // risquait d'emporter les autres réactions du participant.
    const emoji = sanitizeEmoji(o.emoji);
    if (!emoji) throw new Error('Invalid emoji format');

    const result = await this.prisma.attachmentReaction.deleteMany({
      where: {
        attachmentId: o.attachmentId,
        participantId: o.participantId,
        emoji,
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
