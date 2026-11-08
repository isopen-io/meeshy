import { PrismaClient } from '@meeshy/shared/prisma/client';
import { sanitizeEmoji } from '@meeshy/shared/types/reaction';
import { assertReactionAllowed } from '../utils/reaction-limit-guard.js';
import { isConversationClosed } from './messaging/conversationWriteAdmission.js';
import { CLOSED_CONVERSATION_REACTION_ERROR } from './ReactionService.js';
import { conversationRefusesPlainSignal, E2eeSignalChannelRequiredError } from './e2ee/e2ee-signal-channel';
import { recordConversationActivity } from './conversations/conversationActivity';

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

  /**
   * #9026 — réagir est une ACTIVITÉ, et cette porte-ci ne l'enregistrait pas.
   *
   * La jumelle (`ReactionService.addReaction`) appelle
   * `recordConversationActivity` juste après son `upsert`, sous le commentaire
   * qui énonce la directive : « une réaction posée est une ACTIVITÉ : la
   * conversation remonte en tête pour TOUS ses participants, au rechargement
   * comme en direct ». Le rang de la liste est
   * max(`lastMessageAt`, `lastActivityAt`) — ni l'un ni l'autre ne bougeait
   * ici, donc réagir à la PHOTO d'un message ne remontait AUCUNE liste, quand
   * réagir au message lui-même les remontait toutes.
   *
   * Ce qui l'a tenu invisible est une phrase VRAIE : `announceConversationActivity`
   * documente « Pour les activités dont aucun autre événement de liste ne porte
   * le rang : appel, épingle. La réaction, elle, le porte avec `lastReaction` ».
   * C'est exact de la réaction de MESSAGE — `lastReaction` se résout par
   * `prisma.reaction.findUnique` — et faux d'une réaction de pièce jointe, qui
   * n'a aucune ligne dans cette table. Elle appartient donc à la première
   * catégorie, celle de l'appel et de l'épingle, et c'est le gestionnaire qui
   * sert son rang (`rank: true`).
   *
   * > **Un lot ferme une classe dans SA langue.** #9026 a fermé « une réaction
   * > posée » ; la réaction de pièce jointe en est une, dans une autre table,
   * > et n'est dans aucune des deux énumérations qui décident du rang.
   *
   * La date rendue est celle de la LIGNE, pas `new Date()` : c'est elle que le
   * rang durable porte, donc c'est elle que le gestionnaire doit servir, sans
   * quoi les deux moitiés annonceraient deux rangs.
   *
   * Le RETRAIT n'enregistre rien — la directive dit « une réaction POSÉE », et
   * la jumelle ne le fait pas davantage (elle n'y OUBLIE que `lastReaction`).
   */
  async addAttachmentReaction(o: AddAttachmentReactionOptions): Promise<{ changed: boolean; at?: Date }> {
    // Miroir EXACT de `ReactionService.addReaction` (la jumelle) : `sanitizeEmoji`
    // rend `null` pour un non-emoji, et `null` est la seule preuve d'invalidité —
    // le repasser à `isValidEmoji(emoji: string)` faisait `null.trim()`, donc un
    // `TypeError` interne remontait au client à la place du refus propre, et la
    // branche `throw` était morte.
    const emoji = sanitizeEmoji(o.emoji);
    if (!emoji) throw new Error('Invalid emoji format');

    // L'état TERMINAL du conteneur — la CINQUIÈME porte de réaction, et la
    // seule qui ne converge pas vers `ReactionService.addReaction`.
    //
    // `packages/shared/prisma/schema.prisma` documente `Conversation.closedAt`
    // par « Conversation closed for all — **no one can write**, messages stay
    // readable ». Les quatre transports message-level posent la question en un
    // seul point parce qu'ils convergent chez la jumelle ; celui-ci a son
    // propre point d'écriture, donc sa propre garde.
    //
    // **Ce que ça coûtait.** `GET /conversations` filtre `isActive: true` et les
    // clients retirent la conversation de leur cache en recevant
    // `conversation:closed` : la ligne était écrite et `ATTACHMENT_REACTION_ADDED`
    // diffusé vers une room que plus personne n'écoute — le symptôme exact que
    // le cycle 31 a corrigé pour l'ENVOI.
    //
    // **La garde se relit CHEZ ELLE.** Le service charge lui-même l'état
    // terminal au lieu de le recevoir de son appelant : un paramètre dont
    // l'absence désactive une garde est un demi-correctif, et le gestionnaire
    // socket n'est pas le seul chemin possible vers ce service.
    //
    // **Coût : une lecture, et une seule** — contrairement à la jumelle, ce
    // service n'avait aucun `include` à recycler. Le témoin
    // `conversationClosedWriteVerbs.test.ts` gèle ce prix.
    //
    // Les DEUX colonnes sont lues (`isConversationClosed`) parce que `leave.ts`
    // a posé pendant trente-sept cycles `isActive: false` SEUL : ces lignes
    // existent et rien ne les rétro-remplit.
    //
    // Le RETRAIT reste ouvert, délibérément — voir `removeAttachmentReaction`,
    // et le § 3 du témoin.
    const host = await this.prisma.message.findUnique({
      where: { id: o.messageId },
      // `conversationId` rejoint une lecture qui existait déjà : le rang durable
      // s'écrit sur la conversation, et le service n'avait aucun autre chemin
      // vers son id. Une colonne de plus sur une requête en vol, jamais un
      // aller-retour supplémentaire.
      select: { conversationId: true, conversation: { select: { isActive: true, closedAt: true, encryptionMode: true } } },
    });
    if (isConversationClosed(host?.conversation)) {
      throw new Error(CLOSED_CONVERSATION_REACTION_ERROR);
    }
    // #13802 — la jumelle refuse l'emoji en clair d'une conversation e2ee
    // (#13142) ; cette porte-ci ne converge pas vers elle, donc elle refuse
    // aussi, sur la MÊME lecture que l'état terminal. Le gestionnaire a déjà
    // résolu le membre : un étranger n'apprend pas le régime.
    if (conversationRefusesPlainSignal(host?.conversation)) {
      throw new E2eeSignalChannelRequiredError();
    }

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
    const reaction = await this.prisma.attachmentReaction.upsert({
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

    // Le rang DURABLE, dans le service plutôt que chez le gestionnaire : c'est
    // le seul point d'écriture de cette famille, et une règle posée au
    // transport est une règle qu'un second transport finira par ne pas avoir.
    // `recordConversationActivity` est MONOTONE et ne lève jamais.
    const at = reaction.createdAt;
    if (host?.conversationId) {
      await recordConversationActivity({ prisma: this.prisma, conversationId: host.conversationId, at });
    }
    return { changed: true, at };
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

    // #13802 — le retrait ne juge PAS le régime : il efface une ligne dont
    // l'emoji est déjà connu du serveur, et le passé en clair doit rester
    // supprimable (`e2ee-signal-channel.ts`, comme `ReactionService.removeReaction`).
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
