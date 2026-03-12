/**
 * Reaction Handler
 * Gère les réactions aux messages (ajout, suppression, synchronisation)
 */

import type { Socket } from 'socket.io';
import type { Server as SocketIOServer } from 'socket.io';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { NotificationService } from '../../services/NotificationService';
import { getConnectedUser, normalizeConversationId, type SocketUser } from '../utils/socket-helpers';
import type { SocketIOResponse } from '@meeshy/shared/types/socketio-events';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { invalidateConversationCacheAsync } from '../../services/ConversationListCache';

export interface ReactionHandlerDependencies {
  io: SocketIOServer;
  prisma: PrismaClient;
  notificationService: NotificationService;
  connectedUsers: Map<string, SocketUser>;
  socketToUser: Map<string, string>;
}

export class ReactionHandler {
  private io: SocketIOServer;
  private prisma: PrismaClient;
  private notificationService: NotificationService;
  private connectedUsers: Map<string, SocketUser>;
  private socketToUser: Map<string, string>;

  constructor(deps: ReactionHandlerDependencies) {
    this.io = deps.io;
    this.prisma = deps.prisma;
    this.notificationService = deps.notificationService;
    this.connectedUsers = deps.connectedUsers;
    this.socketToUser = deps.socketToUser;
  }

  /**
   * Ajoute une réaction à un message
   */
  async handleReactionAdd(
    socket: Socket,
    data: { messageId: string; emoji: string },
    callback?: (response: SocketIOResponse<unknown>) => void
  ): Promise<void> {
    try {
      const userIdOrToken = this.socketToUser.get(socket.id);
      if (!userIdOrToken) {
        console.error('❌ [REACTION_ADD] No userId found for socket:', socket.id);
        const errorResponse: SocketIOResponse<unknown> = {
          success: false,
          error: 'User not authenticated'
        };
        if (callback) callback(errorResponse);
        return;
      }

      const userResult = getConnectedUser(userIdOrToken, this.connectedUsers);
      const user = userResult?.user;
      const userId = userResult?.realUserId || userIdOrToken;
      const isAnonymous = user?.isAnonymous || false;

      const participantId = await this._resolveParticipantId(user, userId, isAnonymous, data.messageId);
      if (!participantId) {
        const errorResponse: SocketIOResponse<unknown> = { success: false, error: 'Could not resolve participant' };
        if (callback) callback(errorResponse);
        return;
      }

      const { ReactionService } = await import('../../services/ReactionService.js');
      const reactionService = new ReactionService(this.prisma);

      const reaction = await reactionService.addReaction({
        messageId: data.messageId,
        emoji: data.emoji,
        participantId
      });

      if (!reaction) {
        const errorResponse: SocketIOResponse<unknown> = {
          success: false,
          error: 'Failed to add reaction'
        };
        if (callback) callback(errorResponse);
        return;
      }

      const message = await this.prisma.message.findUnique({
        where: { id: data.messageId },
        select: { conversationId: true }
      });

      const updateEvent = await reactionService.createUpdateEvent(
        data.messageId,
        data.emoji,
        'add',
        participantId,
        message?.conversationId ?? ''
      );

      const successResponse: SocketIOResponse<unknown> = {
        success: true,
        data: reaction
      };
      if (callback) callback(successResponse);

      // Broadcaster l'événement
      if (message) {
        await this._broadcastReactionEventWithConversationId(message.conversationId, updateEvent, SERVER_EVENTS.REACTION_ADDED);
        await invalidateConversationCacheAsync(message.conversationId, this.prisma);
      }

      // Créer une notification
      await this._createReactionNotification(data.messageId, data.emoji, userId, isAnonymous, reaction.id);
    } catch (error: unknown) {
      console.error('❌ Erreur lors de l\'ajout de réaction:', error);
      const errorResponse: SocketIOResponse<unknown> = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add reaction'
      };
      if (callback) callback(errorResponse);
    }
  }

  /**
   * Supprime une réaction d'un message
   */
  async handleReactionRemove(
    socket: Socket,
    data: { messageId: string; emoji: string },
    callback?: (response: SocketIOResponse<unknown>) => void
  ): Promise<void> {
    try {
      const userIdOrToken = this.socketToUser.get(socket.id);
      if (!userIdOrToken) {
        const errorResponse: SocketIOResponse<unknown> = {
          success: false,
          error: 'User not authenticated'
        };
        if (callback) callback(errorResponse);
        return;
      }

      const userResult = getConnectedUser(userIdOrToken, this.connectedUsers);
      const user = userResult?.user;
      const userId = userResult?.realUserId || userIdOrToken;
      const isAnonymous = user?.isAnonymous || false;

      const participantId = await this._resolveParticipantId(user, userId, isAnonymous, data.messageId);
      if (!participantId) {
        const errorResponse: SocketIOResponse<unknown> = { success: false, error: 'Could not resolve participant' };
        if (callback) callback(errorResponse);
        return;
      }

      const { ReactionService } = await import('../../services/ReactionService.js');
      const reactionService = new ReactionService(this.prisma);

      const removed = await reactionService.removeReaction({
        messageId: data.messageId,
        emoji: data.emoji,
        participantId
      });

      if (!removed) {
        const errorResponse: SocketIOResponse<unknown> = {
          success: false,
          error: 'Reaction not found'
        };
        if (callback) callback(errorResponse);
        return;
      }

      const message = await this.prisma.message.findUnique({
        where: { id: data.messageId },
        select: { conversationId: true }
      });

      const updateEvent = await reactionService.createUpdateEvent(
        data.messageId,
        data.emoji,
        'remove',
        participantId,
        message?.conversationId ?? ''
      );

      const successResponse: SocketIOResponse<unknown> = {
        success: true,
        data: { message: 'Reaction removed successfully' }
      };
      if (callback) callback(successResponse);

      if (message) {
        await this._broadcastReactionEventWithConversationId(message.conversationId, updateEvent, SERVER_EVENTS.REACTION_REMOVED);
        await invalidateConversationCacheAsync(message.conversationId, this.prisma);
      }
    } catch (error: unknown) {
      console.error('❌ Erreur lors de la suppression de réaction:', error);
      const errorResponse: SocketIOResponse<unknown> = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove reaction'
      };
      if (callback) callback(errorResponse);
    }
  }

  /**
   * Synchronise les réactions d'un message
   */
  async handleReactionSync(
    socket: Socket,
    messageId: string,
    callback?: (response: SocketIOResponse<unknown>) => void
  ): Promise<void> {
    try {
      const userIdOrToken = this.socketToUser.get(socket.id);
      if (!userIdOrToken) {
        console.error(`❌ [REACTION_SYNC] Utilisateur non authentifié pour socket ${socket.id}`);
        const errorResponse: SocketIOResponse<unknown> = {
          success: false,
          error: 'User not authenticated'
        };
        if (callback) callback(errorResponse);
        return;
      }

      const userResult = getConnectedUser(userIdOrToken, this.connectedUsers);
      const user = userResult?.user;
      const userId = userResult?.realUserId || userIdOrToken;
      const isAnonymous = user?.isAnonymous || false;

      const participantId = await this._resolveParticipantId(user, userId, isAnonymous, messageId);
      if (!participantId) {
        const errorResponse: SocketIOResponse<unknown> = { success: false, error: 'Could not resolve participant' };
        if (callback) callback(errorResponse);
        return;
      }

      const { ReactionService } = await import('../../services/ReactionService.js');
      const reactionService = new ReactionService(this.prisma);

      const reactionSync = await reactionService.getMessageReactions({
        messageId,
        currentParticipantId: participantId
      });

      const successResponse: SocketIOResponse<unknown> = {
        success: true,
        data: reactionSync
      };
      if (callback) callback(successResponse);
    } catch (error: unknown) {
      console.error('❌ Erreur lors de la synchronisation des réactions:', error);
      const errorResponse: SocketIOResponse<unknown> = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sync reactions'
      };
      if (callback) callback(errorResponse);
    }
  }

  /**
   * Résout le Participant.id pour un utilisateur enregistré via le messageId → conversationId.
   * Pour les anonymes, retourne directement user.participantId.
   */
  private async _resolveParticipantId(
    user: SocketUser | undefined,
    userId: string,
    isAnonymous: boolean,
    messageId: string
  ): Promise<string | undefined> {
    if (isAnonymous) return user?.participantId;

    const msg = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { conversationId: true }
    });
    if (!msg) return undefined;

    const participant = await this.prisma.participant.findFirst({
      where: { userId, conversationId: msg.conversationId, isActive: true },
      select: { id: true }
    });
    return participant?.id;
  }

  /**
   * Broadcaster un événement de réaction
   */
  private async _broadcastReactionEventWithConversationId(
    conversationId: string,
    updateEvent: unknown,
    eventType: typeof SERVER_EVENTS.REACTION_ADDED | typeof SERVER_EVENTS.REACTION_REMOVED
  ): Promise<void> {
    const normalizedConversationId = await normalizeConversationId(
      conversationId,
      (where) => this.prisma.conversation.findUnique({ where, select: { id: true, identifier: true } })
    );
    this.io.to(ROOMS.conversation(normalizedConversationId)).emit(eventType, updateEvent);
  }

  /**
   * Créer une notification de réaction
   */
  private async _createReactionNotification(
    messageId: string,
    emoji: string,
    reactorId: string,
    isAnonymous: boolean,
    reactionId: string
  ): Promise<void> {
    if (isAnonymous) return; // Pas de notifications pour les anonymes

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        senderId: true,
        conversationId: true,
      }
    });

    if (!message || !message.senderId) return;

    // Résoudre senderId (Participant.id) → User.id pour la notification
    const [authorParticipant, reactorParticipant] = await Promise.all([
      this.prisma.participant.findUnique({
        where: { id: message.senderId },
        select: { userId: true }
      }),
      this.prisma.participant.findUnique({
        where: { id: reactorId },
        select: { userId: true }
      })
    ]);

    const authorUserId = authorParticipant?.userId;
    const reactorUserId = reactorParticipant?.userId;

    if (!authorUserId || !reactorUserId || authorUserId === reactorUserId) return;

    this.notificationService
      .createReactionNotification({
        messageAuthorId: authorUserId,
        reactorUserId,
        messageId,
        conversationId: message.conversationId,
        reactionEmoji: emoji,
      })
      .catch((error) => {
        console.error('❌ [REACTION_NOTIFICATION] Erreur création notification:', error);
      });
  }
}
