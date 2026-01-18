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
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

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
      const sessionToken = user?.sessionToken;

      const { ReactionService } = await import('../../services/ReactionService.js');
      const reactionService = new ReactionService(this.prisma);

      const reaction = await reactionService.addReaction({
        messageId: data.messageId,
        emoji: data.emoji,
        userId: !isAnonymous ? userId : undefined,
        anonymousId: isAnonymous && sessionToken ? sessionToken : undefined
      });

      if (!reaction) {
        const errorResponse: SocketIOResponse<unknown> = {
          success: false,
          error: 'Failed to add reaction'
        };
        if (callback) callback(errorResponse);
        return;
      }

      const updateEvent = await reactionService.createUpdateEvent(
        data.messageId,
        data.emoji,
        'add',
        !isAnonymous ? userId : undefined,
        isAnonymous && sessionToken ? sessionToken : undefined
      );

      const successResponse: SocketIOResponse<unknown> = {
        success: true,
        data: reaction
      };
      if (callback) callback(successResponse);

      // Broadcaster l'événement
      await this._broadcastReactionEvent(data.messageId, updateEvent, SERVER_EVENTS.REACTION_ADDED);

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
      const sessionToken = user?.sessionToken;

      const { ReactionService } = await import('../../services/ReactionService.js');
      const reactionService = new ReactionService(this.prisma);

      const removed = await reactionService.removeReaction({
        messageId: data.messageId,
        emoji: data.emoji,
        userId: !isAnonymous ? userId : undefined,
        anonymousId: isAnonymous && sessionToken ? sessionToken : undefined
      });

      if (!removed) {
        const errorResponse: SocketIOResponse<unknown> = {
          success: false,
          error: 'Reaction not found'
        };
        if (callback) callback(errorResponse);
        return;
      }

      const updateEvent = await reactionService.createUpdateEvent(
        data.messageId,
        data.emoji,
        'remove',
        !isAnonymous ? userId : undefined,
        isAnonymous && sessionToken ? sessionToken : undefined
      );

      const successResponse: SocketIOResponse<unknown> = {
        success: true,
        data: { message: 'Reaction removed successfully' }
      };
      if (callback) callback(successResponse);

      await this._broadcastReactionEvent(data.messageId, updateEvent, SERVER_EVENTS.REACTION_REMOVED);
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
      const sessionToken = user?.sessionToken;

      const { ReactionService } = await import('../../services/ReactionService.js');
      const reactionService = new ReactionService(this.prisma);

      const reactionSync = await reactionService.getMessageReactions({
        messageId,
        currentUserId: !isAnonymous ? userId : undefined,
        currentAnonymousUserId: isAnonymous && sessionToken ? sessionToken : undefined
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
   * Broadcaster un événement de réaction
   */
  private async _broadcastReactionEvent(
    messageId: string,
    updateEvent: unknown,
    eventType: typeof SERVER_EVENTS.REACTION_ADDED | typeof SERVER_EVENTS.REACTION_REMOVED
  ): Promise<void> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { conversationId: true }
    });

    if (message) {
      const normalizedConversationId = await normalizeConversationId(
        message.conversationId,
        (where) => this.prisma.conversation.findUnique({ where, select: { id: true, identifier: true } })
      );
      this.io.to(normalizedConversationId).emit(eventType, updateEvent);
    }
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
        content: true,
        senderId: true,
        conversationId: true,
        conversation: {
          select: { title: true }
        }
      }
    });

    if (!message || !message.senderId || message.senderId === reactorId) {
      return; // Pas de notification si l'auteur réagit à son propre message
    }

    this.notificationService
      .createReactionNotification({
        messageAuthorId: message.senderId,
        reactorId,
        reactorUsername: '',
        reactorAvatar: undefined,
        emoji,
        messageContent: message.content,
        conversationId: message.conversationId,
        conversationTitle: message.conversation.title || undefined,
        messageId,
        reactionId
      })
      .catch((error) => {
        console.error('❌ [REACTION_NOTIFICATION] Erreur création notification:', error);
      });
  }
}
