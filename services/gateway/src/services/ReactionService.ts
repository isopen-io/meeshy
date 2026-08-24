/**
 * Service de gestion des réactions emoji sur les messages
 *
 * Unified Participant model: all reactions use participantId
 */

import { PrismaClient, Reaction } from '@meeshy/shared/prisma/client';
import type {
  ReactionData,
  ReactionAggregation,
  ReactionBroadcastAggregation,
  ReactionSync,
  ReactionUpdateEvent
} from '@meeshy/shared/types';
import { sanitizeEmoji, isValidEmoji } from '@meeshy/shared/types/reaction';
import { assertReactionAllowed } from '../utils/reaction-limit-guard.js';
import { isConversationClosed } from './messaging/conversationWriteAdmission.js';
import { ConflictError } from '../errors/custom-errors.js';
import { assertValidObjectId } from '../utils/object-id.js';

/**
 * Le motif « le conteneur est terminé », sous forme de CONSTANTE et non de
 * littéral dispersé.
 *
 * `routes/reactions.ts` trie les erreurs de ce service par comparaison de
 * chaînes, et tout motif qu'il ne reconnaît pas retombe sur un **500**. Un refus
 * légitime annoncé comme une panne serveur ferait réessayer le client
 * indéfiniment — et un littéral recopié des deux côtés diverge au premier
 * reformulage. La constante rend la paire indissociable.
 */
export const CLOSED_CONVERSATION_REACTION_ERROR = 'Cannot react in a closed conversation';

export interface AddReactionOptions {
  messageId: string;
  participantId: string;
  emoji: string;
}

export interface RemoveReactionOptions {
  messageId: string;
  participantId: string;
  emoji: string;
}

export interface GetReactionsOptions {
  messageId: string;
  currentParticipantId?: string;
}

export interface AddReactionResult {
  reaction: ReactionData;
  /**
   * True when the participant already had exactly this emoji on this message,
   * so addReaction made no DB change. Callers MUST skip the REACTION_ADDED
   * broadcast and the author notification — nothing changed, and re-emitting
   * both spams every participant in the room and (once the anti-spam window
   * has elapsed) double-notifies the author for a single logical reaction.
   * Mirrors `removeReaction`'s `false` return, which every consumer already
   * respects to avoid a no-op REACTION_REMOVED broadcast.
   */
  unchanged: boolean;
}

export class ReactionService {
  private validateMessageId(messageId: string): void {
    assertValidObjectId(messageId, 'message');
  }

  constructor(private readonly prisma: PrismaClient) {}

  async addReaction(options: AddReactionOptions): Promise<AddReactionResult | null> {
    const { messageId, participantId, emoji } = options;

    this.validateMessageId(messageId);

    const sanitized = sanitizeEmoji(emoji);
    if (!sanitized) {
      throw new Error('Invalid emoji format');
    }

    if (!participantId) {
      throw new Error('participantId must be provided');
    }

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: {
            participants: { where: { isActive: true } }
          }
        }
      }
    });

    if (!message) {
      throw new Error('Message not found');
    }

    // A soft-deleted message (deletedAt set) still exists as a row, so !message
    // does not catch it — but it is no longer reactable. Every sibling write
    // path guards this identically (message edit/delete filter deletedAt: null);
    // reactions were the outlier. Without this, the reaction would persist and
    // the handler would broadcast REACTION_ADDED for a message clients have
    // already rendered as deleted.
    if (message.deletedAt) {
      throw new Error('Cannot react to a deleted message');
    }

    if (message.messageType === 'system') {
      throw new Error('Cannot react to a system message');
    }

    // L'état TERMINAL du CONTENEUR — la garde qui manquait à une liste qui
    // couvrait déjà tout le reste.
    //
    // `packages/shared/prisma/schema.prisma` documente `Conversation.closedAt`
    // par « Conversation closed for all — **no one can write**, messages stay
    // readable ». Le cycle 31 a fait respecter cette phrase sur UN verbe,
    // *envoyer* (`conversationWriteAdmission`, câblé au point de convergence des
    // envois). Réagir est un verbe d'écriture comme un autre : il crée une
    // ligne, il diffuse `reaction:added`, il notifie l'auteur. Aucun des QUATRE
    // transports de réaction — socket `reaction:add`, `POST /conversations/:id/
    // messages/:mid/reactions`, `POST /reactions`, chemin agent — ne posait la
    // question, et tous la posent maintenant en un seul point puisque tous
    // convergent ici.
    //
    // **Ce que ça coûtait.** `GET /conversations` filtre `isActive: true` et les
    // clients retirent la conversation de leur cache sur `conversation:closed` :
    // la réaction partait donc vers une room que plus personne n'écoute, et sa
    // notification vers un fil introuvable dans la liste — exactement le
    // symptôme que le cycle 31 a corrigé pour l'envoi.
    //
    // **Coût de la garde : ZÉRO lecture.** L'`include` ci-dessus ramenait déjà
    // la conversation entière ; son état terminal était en main à chaque appel,
    // et personne ne le regardait. Les DEUX colonnes sont lues
    // (`isConversationClosed`) parce que `leave.ts` a posé pendant trente-sept
    // cycles `isActive: false` SEUL : ces lignes existent et rien ne les
    // rétro-remplit.
    //
    // Le RETRAIT reste ouvert, délibérément — voir `removeReaction`.
    if (isConversationClosed(message.conversation)) {
      throw new Error(CLOSED_CONVERSATION_REACTION_ERROR);
    }

    const isParticipant = message.conversation.participants.some(p => p.id === participantId);
    if (!isParticipant) {
      throw new Error('User is not a participant of this conversation');
    }

    const existingReaction = await this.prisma.reaction.findFirst({
      where: { messageId, participantId, emoji: sanitized }
    });
    if (existingReaction) {
      return { reaction: this.mapReactionToData(existingReaction), unchanged: true };
    }

    // Plafond des cinq réactions (2026-08-20) : la règle est déclarée UNE
    // SEULE FOIS dans `packages/shared/utils/reaction-limit.ts` — ici on ne
    // fait que compter et décider. Ce comptage n'a lieu QUE lorsqu'on sait
    // déjà (bloc ci-dessus) qu'il s'agit d'une création réelle : un `upsert`
    // qui ne ferait que confirmer un emoji déjà posé ne consomme aucune place,
    // donc ne doit jamais être bloqué par ce garde-fou, sous peine de rendre
    // impossible de reposer un emoji déjà présent une fois au plafond.
    const existingReactionCount = await this.prisma.reaction.count({
      where: { messageId, participantId }
    });
    // `assertReactionAllowed` jette `ConflictError` (jamais une `Error` nue) : les
    // routes REST qui exposent ce service (`routes/reactions.ts`,
    // `routes/conversations/messages-advanced.ts`) trient sur `instanceof
    // ConflictError` pour répondre 409 (refus légitime) plutôt que de laisser
    // leur catch générique retomber sur un 500.
    assertReactionAllowed(existingReactionCount);

    // Multi-réactions (2026-08-18) : la clé unique DB porte le TRIPLET
    // (messageId, participantId, emoji) — poser un second emoji EMPILE, il
    // ne remplace plus jamais. L'upsert reste atomique par triplet : deux
    // adds concurrents du MÊME emoji convergent sur le même document (le
    // perdant retombe en no-op), deux emojis différents créent chacun le
    // leur — c'est le modèle. Le toggle vit chez les clients : re-taper un
    // emoji déjà posé appelle removeReaction.
    const reaction = await this.prisma.reaction.upsert({
      where: { participant_reaction_unique: { messageId, participantId, emoji: sanitized } },
      update: {},
      create: { messageId, participantId, emoji: sanitized }
    });

    await this.updateMessageReactionSummary(messageId);

    return { reaction: this.mapReactionToData(reaction), unchanged: false };
  }

  /**
   * **Pas de garde de clôture ici, et c'est une DÉCISION.**
   *
   * `addReaction` refuse un fil terminé ; ce jumeau l'accepte. Un conteneur mort
   * n'admet plus de contenu NEUF, il continue d'admettre le RETRAIT de ce qu'il
   * porte déjà. La clôture étant IRRÉVERSIBLE — aucun écrivain du dépôt ne
   * rallume `Conversation.isActive` —, refuser la rétraction enfermerait
   * quelqu'un dans une réaction qu'il ne pourrait plus jamais reprendre.
   *
   * La règle vaut pour la famille entière : `admitMessageDelete` n'est pas gardé
   * non plus, pour la même raison. Le témoin qui gèle ce choix vit dans
   * `__tests__/unit/services/messaging/conversationClosedWriteVerbs.test.ts` § 3 —
   * s'il rougit, c'est qu'on a étendu la garde au retrait, ce qui demande un
   * arbitrage produit et non un correctif.
   */
  async removeReaction(options: RemoveReactionOptions): Promise<boolean> {
    const { messageId, participantId, emoji } = options;

    this.validateMessageId(messageId);

    const sanitized = sanitizeEmoji(emoji);
    if (!sanitized) {
      throw new Error('Invalid emoji format');
    }

    const result = await this.prisma.reaction.deleteMany({
      where: {
        messageId,
        participantId,
        emoji: sanitized
      }
    });

    if (result.count > 0) {
      await this.updateMessageReactionSummary(messageId);
    }

    return result.count > 0;
  }

  async getMessageReactions(options: GetReactionsOptions): Promise<ReactionSync> {
    const { messageId, currentParticipantId } = options;

    this.validateMessageId(messageId);

    const reactions = await this.prisma.reaction.findMany({
      where: { messageId },
      orderBy: { createdAt: 'asc' }
    });

    const aggregationMap = new Map<string, ReactionAggregation>();

    reactions.forEach(reaction => {
      const existing = aggregationMap.get(reaction.emoji);

      if (existing) {
        const participantIds = [...existing.participantIds];
        participantIds.push(reaction.participantId);

        let hasCurrentUser = existing.hasCurrentUser;
        if (currentParticipantId && reaction.participantId === currentParticipantId) {
          hasCurrentUser = true;
        }

        aggregationMap.set(reaction.emoji, {
          emoji: reaction.emoji,
          count: existing.count + 1,
          participantIds,
          hasCurrentUser
        });
      } else {
        const hasCurrentUser = !!(currentParticipantId && reaction.participantId === currentParticipantId);

        aggregationMap.set(reaction.emoji, {
          emoji: reaction.emoji,
          count: 1,
          participantIds: [reaction.participantId],
          hasCurrentUser
        });
      }
    });

    const aggregations = Array.from(aggregationMap.values());

    const allParticipantIds = new Set<string>();
    aggregations.forEach(a => a.participantIds.forEach((pid: string) => allParticipantIds.add(pid)));

    const participants = allParticipantIds.size > 0
      ? await this.prisma.participant.findMany({
          where: { id: { in: Array.from(allParticipantIds) } },
          select: { id: true, displayName: true, avatar: true, userId: true }
        })
      : [];

    const participantMap = new Map(participants.map(p => [p.id, p]));

    const enrichedReactions = aggregations.map(agg => ({
      ...agg,
      users: agg.participantIds.map((pid: string) => {
        const participant = participantMap.get(pid);
        const reaction = reactions.find(r => r.emoji === agg.emoji && r.participantId === pid);
        return {
          participantId: pid,
          username: participant?.displayName ?? 'Anonymous',
          avatar: participant?.avatar ?? null,
          createdAt: reaction?.createdAt?.toISOString() ?? new Date().toISOString()
        };
      })
    }));

    const userReactions = reactions
      .filter(r => currentParticipantId && r.participantId === currentParticipantId)
      .map(r => r.emoji);

    return {
      messageId,
      reactions: enrichedReactions,
      totalCount: reactions.length,
      userReactions: Array.from(new Set(userReactions))
    };
  }

  /**
   * L'état ABSOLU d'un emoji sur un message : ce qui est vrai pour tout le monde.
   *
   * C'est la seule forme qu'une DIFFUSION peut porter — elle n'a pas de lecteur,
   * donc pas de « moi » à résoudre. La résolution par-lecteur est un étage
   * au-dessus (`getEmojiAggregation`), et elle n'est appelable que là où l'on
   * sait à qui l'on répond.
   */
  async getBroadcastAggregation(
    messageId: string,
    emoji: string
  ): Promise<ReactionBroadcastAggregation> {
    this.validateMessageId(messageId);

    const sanitized = sanitizeEmoji(emoji);
    if (!sanitized) {
      throw new Error('Invalid emoji format');
    }

    const reactions = await this.prisma.reaction.findMany({
      where: {
        messageId,
        emoji: sanitized
      }
    });

    return {
      emoji: sanitized,
      count: reactions.length,
      participantIds: reactions.map(r => r.participantId)
    };
  }

  /**
   * L'agrégation absolue, RÉSOLUE pour un lecteur nommé.
   *
   * Chemin REST uniquement : `currentParticipantId` y est le lecteur de la
   * requête, ce qui donne à `hasCurrentUser` un sens. Ne pas rappeler cette
   * méthode pour construire une charge diffusée — l'id qu'on aurait à lui passer
   * serait celui de l'ACTEUR, et sa réponse partirait à toute la room.
   */
  async getEmojiAggregation(
    messageId: string,
    emoji: string,
    currentParticipantId?: string
  ): Promise<ReactionAggregation> {
    const aggregation = await this.getBroadcastAggregation(messageId, emoji);

    return {
      ...aggregation,
      hasCurrentUser: aggregation.participantIds.some(
        participantId => !!currentParticipantId && participantId === currentParticipantId
      )
    };
  }

  async getParticipantReactions(participantId: string): Promise<ReactionData[]> {
    const reactions = await this.prisma.reaction.findMany({
      where: { participantId },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    return reactions.map(r => this.mapReactionToData(r));
  }

  // A user has a distinct Participant.id per conversation, and reactions are
  // keyed by Participant.id — never by User.id (they are ObjectIds from
  // different collections and never collide). Resolving the user's reactions
  // therefore requires expanding userId → their participant ids first, then
  // filtering reactions across all of them. Passing a User.id straight into
  // `getParticipantReactions` (the previous route behaviour) matched zero rows.
  async getUserReactions(userId: string): Promise<ReactionData[]> {
    const participants = await this.prisma.participant.findMany({
      where: { userId },
      select: { id: true }
    });

    const participantIds = participants.map(p => p.id);
    if (participantIds.length === 0) {
      return [];
    }

    const reactions = await this.prisma.reaction.findMany({
      where: { participantId: { in: participantIds } },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    return reactions.map(r => this.mapReactionToData(r));
  }

  async hasParticipantReacted(
    messageId: string,
    emoji: string,
    participantId: string
  ): Promise<boolean> {
    const sanitized = sanitizeEmoji(emoji);
    if (!sanitized) return false;

    const reaction = await this.prisma.reaction.findFirst({
      where: {
        messageId,
        emoji: sanitized,
        participantId
      }
    });

    return reaction !== null;
  }

  async deleteMessageReactions(messageId: string): Promise<number> {
    const result = await this.prisma.reaction.deleteMany({
      where: { messageId }
    });

    if (result.count > 0) {
      await this.prisma.message.update({
        where: { id: messageId },
        data: {
          reactionSummary: {},
          reactionCount: 0
        }
      });
    }

    return result.count;
  }

  async createUpdateEvent(
    messageId: string,
    emoji: string,
    action: 'add' | 'remove',
    participantId: string,
    conversationId: string,
    userId: string
  ): Promise<ReactionUpdateEvent> {
    // `getBroadcastAggregation`, PAS `getEmojiAggregation(…, participantId)` :
    // cet événement part vers toute la room. Résoudre « moi » ici ne pouvait le
    // résoudre que pour l'ACTEUR, et le résultat était de surcroît sans
    // information — l'agrégat étant relu APRÈS la mutation, il valait `true`
    // sur tout `add` et `false` sur tout `remove`, soit `action` réécrit une
    // couche plus bas. Chaque destinataire dérive le sien de `userId`.
    const aggregation = await this.getBroadcastAggregation(messageId, emoji);

    return {
      messageId,
      conversationId,
      participantId,
      userId,
      emoji,
      action,
      aggregation,
      timestamp: new Date()
    };
  }

  private async updateMessageReactionSummary(messageId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const message = await tx.message.findUnique({
        where: { id: messageId },
        select: { id: true }
      });

      if (!message) return;

      // Ventilation par emoji ET total recalculés depuis la table `Reaction`
      // (source de vérité), au lieu d'appliquer un delta add/remove sur une carte
      // dénormalisée. La lecture du "previousReaction" dans addReaction se fait hors
      // transaction, donc deux addReaction concurrents pour le même participant avec
      // des emojis différents peuvent tous deux la croire absente et incrémenter
      // chacun leur propre delta — laissant un emoji fantôme dans reactionSummary
      // sans ligne `Reaction` derrière. Recalculer depuis groupBy est auto-réparant,
      // quel que soit l'état après la course.
      const grouped = await tx.reaction.groupBy({
        by: ['emoji'],
        where: { messageId },
        _count: { emoji: true }
      });

      const reactionSummary = grouped.reduce<Record<string, number>>((summary, group) => {
        summary[group.emoji] = group._count.emoji;
        return summary;
      }, {});
      const total = grouped.reduce((sum, group) => sum + group._count.emoji, 0);

      await tx.message.update({
        where: { id: messageId },
        data: { reactionSummary, reactionCount: total }
      });
    });
  }

  private mapReactionToData(reaction: Reaction): ReactionData {
    return {
      id: reaction.id,
      messageId: reaction.messageId,
      participantId: reaction.participantId,
      emoji: reaction.emoji,
      createdAt: reaction.createdAt,
      updatedAt: reaction.updatedAt
    };
  }

  validateAddReactionOptions(options: AddReactionOptions): void {
    if (!options.messageId) {
      throw new Error('messageId is required');
    }

    if (!options.participantId) {
      throw new Error('participantId must be provided');
    }

    if (!options.emoji) {
      throw new Error('emoji is required');
    }

    if (!isValidEmoji(options.emoji)) {
      throw new Error('Invalid emoji format');
    }
  }

  validateRemoveReactionOptions(options: RemoveReactionOptions): void {
    if (!options.messageId) {
      throw new Error('messageId is required');
    }

    if (!options.participantId) {
      throw new Error('participantId must be provided');
    }

    if (!options.emoji) {
      throw new Error('emoji is required');
    }

    if (!isValidEmoji(options.emoji)) {
      throw new Error('Invalid emoji format');
    }
  }
}

export const createReactionService = (prisma: PrismaClient) => {
  return new ReactionService(prisma);
};
