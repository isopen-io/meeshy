/**
 * Comment Reaction Handler
 * Gère les réactions emoji sur les commentaires de posts (ajout, suppression, synchronisation)
 *
 * Mirrors ReactionHandler exactly, substituting:
 *   messageId       → commentId
 *   conversationId  → postId
 *   participantId   → userId
 *   ROOMS.conversation → ROOMS.post
 *   ReactionService → CommentReactionService
 *   Anonymous users are rejected (comments require registered users to react)
 */

import type { Socket } from 'socket.io';
import type { Server as SocketIOServer } from 'socket.io';
import { PrismaClient, PostVisibility } from '@meeshy/shared/prisma/client';
import { NotificationService } from '../../services/notifications/NotificationService';
import { CommentReactionService } from '../../services/CommentReactionService';
import { getConnectedUser, type SocketUser } from '../utils/socket-helpers';
import type { SocketIOResponse } from '@meeshy/shared/types/socketio-events';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { validateSocketEvent } from '../../middleware/validation.js';
import {
  SocketCommentReactionAddSchema,
  SocketCommentReactionRemoveSchema,
  SocketPostRoomActionSchema,
} from '../../validation/socket-event-schemas.js';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { SocketRateLimiter, SOCKET_RATE_LIMITS } from '../../utils/socket-rate-limiter.js';

const logger = enhancedLogger.child({ module: 'CommentReactionHandler' });

/** Per-user token bucket: 30 reactions/min across add + remove. */
const COMMENT_REACTION_RATE_LIMIT = {
  maxRequests: 30,
  windowMs: 60_000,
  keyPrefix: 'socket:comment:reaction',
} as const;

const reactionRateLimiter = new SocketRateLimiter();

export interface CommentReactionHandlerDependencies {
  io: SocketIOServer;
  prisma: PrismaClient;
  notificationService: NotificationService;
  commentReactionService: CommentReactionService;
  connectedUsers: Map<string, SocketUser>;
  socketToUser: Map<string, string>;
}

export class CommentReactionHandler {
  private io: SocketIOServer;
  private prisma: PrismaClient;
  private notificationService: NotificationService;
  private commentReactionService: CommentReactionService;
  private connectedUsers: Map<string, SocketUser>;
  private socketToUser: Map<string, string>;
  private readonly logger = logger;

  constructor(deps: CommentReactionHandlerDependencies) {
    this.io = deps.io;
    this.prisma = deps.prisma;
    this.notificationService = deps.notificationService;
    this.commentReactionService = deps.commentReactionService;
    this.connectedUsers = deps.connectedUsers;
    this.socketToUser = deps.socketToUser;
  }

  /**
   * Ajoute une réaction à un commentaire
   */
  async handleAddReaction(
    socket: Socket,
    data: { commentId: string; postId: string; emoji: string },
    callback?: (response: SocketIOResponse<unknown>) => void
  ): Promise<void> {
    try {
      const schemaValidation = validateSocketEvent(SocketCommentReactionAddSchema, data);
      if (schemaValidation.success === false) {
        if (callback) callback({ success: false, error: schemaValidation.error });
        return;
      }
      const validated = schemaValidation.data;

      const userIdOrToken = this.socketToUser.get(socket.id);
      if (!userIdOrToken) {
        const errorResponse: SocketIOResponse<unknown> = {
          success: false,
          error: 'User not authenticated',
        };
        if (callback) callback(errorResponse);
        return;
      }

      const userResult = getConnectedUser(userIdOrToken, this.connectedUsers);
      const user = userResult?.user;
      const userId = userResult?.realUserId || userIdOrToken;
      const isAnonymous = user?.isAnonymous || false;

      if (isAnonymous) {
        const errorResponse: SocketIOResponse<unknown> = {
          success: false,
          error: 'Only registered users can react',
        };
        if (callback) callback(errorResponse);
        return;
      }

      const rateLimitAllowed = await reactionRateLimiter.checkLimit(userId, COMMENT_REACTION_RATE_LIMIT);
      if (!rateLimitAllowed) {
        this.logger.warn('[CommentReactionHandler] comment:reaction-add rate limit exceeded', { userId, commentId: validated.commentId });
        if (callback) callback({ success: false, error: 'Rate limit exceeded' });
        return;
      }

      const reaction = await this.commentReactionService.addReaction({
        commentId: validated.commentId,
        userId,
        emoji: validated.emoji,
      });

      if (!reaction) {
        const errorResponse: SocketIOResponse<unknown> = {
          success: false,
          error: 'Failed to add reaction',
        };
        if (callback) callback(errorResponse);
        return;
      }

      const updateEvent = await this.commentReactionService.createUpdateEvent(
        validated.commentId,
        validated.emoji,
        'add',
        userId,
        validated.postId
      );

      const successResponse: SocketIOResponse<unknown> = {
        success: true,
        data: reaction,
      };
      if (callback) callback(successResponse);

      this.io.to(ROOMS.post(validated.postId)).emit(SERVER_EVENTS.COMMENT_REACTION_ADDED, updateEvent);

      await this._createCommentReactionNotification(
        validated.commentId,
        validated.postId,
        validated.emoji,
        userId
      );
    } catch (error: unknown) {
      this.logger.error('Failed to add comment reaction', error, { userId: this.socketToUser.get(socket.id) });
      const errorResponse: SocketIOResponse<unknown> = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add reaction',
      };
      if (callback) callback(errorResponse);
    }
  }

  /**
   * Supprime une réaction d'un commentaire
   */
  async handleRemoveReaction(
    socket: Socket,
    data: { commentId: string; postId: string; emoji: string },
    callback?: (response: SocketIOResponse<unknown>) => void
  ): Promise<void> {
    try {
      const schemaValidation = validateSocketEvent(SocketCommentReactionRemoveSchema, data);
      if (schemaValidation.success === false) {
        if (callback) callback({ success: false, error: schemaValidation.error });
        return;
      }
      const validated = schemaValidation.data;

      const userIdOrToken = this.socketToUser.get(socket.id);
      if (!userIdOrToken) {
        const errorResponse: SocketIOResponse<unknown> = {
          success: false,
          error: 'User not authenticated',
        };
        if (callback) callback(errorResponse);
        return;
      }

      const userResult = getConnectedUser(userIdOrToken, this.connectedUsers);
      const user = userResult?.user;
      const userId = userResult?.realUserId || userIdOrToken;
      const isAnonymous = user?.isAnonymous || false;

      if (isAnonymous) {
        const errorResponse: SocketIOResponse<unknown> = {
          success: false,
          error: 'Only registered users can react',
        };
        if (callback) callback(errorResponse);
        return;
      }

      const rateLimitAllowed = await reactionRateLimiter.checkLimit(userId, COMMENT_REACTION_RATE_LIMIT);
      if (!rateLimitAllowed) {
        this.logger.warn('[CommentReactionHandler] comment:reaction-remove rate limit exceeded', { userId, commentId: validated.commentId });
        if (callback) callback({ success: false, error: 'Rate limit exceeded' });
        return;
      }

      const removed = await this.commentReactionService.removeReaction({
        commentId: validated.commentId,
        userId,
        emoji: validated.emoji,
      });

      if (!removed) {
        const errorResponse: SocketIOResponse<unknown> = {
          success: false,
          error: 'Reaction not found',
        };
        if (callback) callback(errorResponse);
        return;
      }

      const updateEvent = await this.commentReactionService.createUpdateEvent(
        validated.commentId,
        validated.emoji,
        'remove',
        userId,
        validated.postId
      );

      const successResponse: SocketIOResponse<unknown> = {
        success: true,
        data: { message: 'Reaction removed successfully' },
      };
      if (callback) callback(successResponse);

      this.io.to(ROOMS.post(validated.postId)).emit(SERVER_EVENTS.COMMENT_REACTION_REMOVED, updateEvent);
    } catch (error: unknown) {
      this.logger.error('Failed to remove comment reaction', error, { userId: this.socketToUser.get(socket.id) });
      const errorResponse: SocketIOResponse<unknown> = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove reaction',
      };
      if (callback) callback(errorResponse);
    }
  }

  /**
   * Synchronise les réactions d'un commentaire
   */
  async handleRequestSync(
    socket: Socket,
    data: { commentId: string },
    callback?: (response: SocketIOResponse<unknown>) => void
  ): Promise<void> {
    try {
      const userIdOrToken = this.socketToUser.get(socket.id);
      if (!userIdOrToken) {
        const errorResponse: SocketIOResponse<unknown> = {
          success: false,
          error: 'User not authenticated',
        };
        if (callback) callback(errorResponse);
        return;
      }

      const userResult = getConnectedUser(userIdOrToken, this.connectedUsers);
      const userId = userResult?.realUserId || userIdOrToken;

      const reactionSync = await this.commentReactionService.getCommentReactions({
        commentId: data.commentId,
        currentUserId: userId,
      });

      const successResponse: SocketIOResponse<unknown> = {
        success: true,
        data: reactionSync,
      };
      if (callback) callback(successResponse);
    } catch (error: unknown) {
      this.logger.error('Failed to sync comment reactions', error, { userId: this.socketToUser.get(socket.id) });
      const errorResponse: SocketIOResponse<unknown> = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sync reactions',
      };
      if (callback) callback(errorResponse);
    }
  }

  /**
   * Rejoint la room d'un post pour recevoir les événements de réactions.
   * Requires authentication — anonymous sockets cannot subscribe to post rooms.
   */
  async handleJoinPost(
    socket: Socket,
    data: { postId: string },
    callback?: (response: SocketIOResponse<unknown>) => void
  ): Promise<void> {
    try {
      const schemaValidation = validateSocketEvent(SocketPostRoomActionSchema, data);
      if (schemaValidation.success === false) {
        if (callback) callback({ success: false, error: schemaValidation.error });
        return;
      }
      const validated = schemaValidation.data;

      const userIdOrToken = this.socketToUser.get(socket.id);
      if (!userIdOrToken) {
        if (callback) callback({ success: false, error: 'User not authenticated' });
        return;
      }

      const userResult = getConnectedUser(userIdOrToken, this.connectedUsers);
      const userId = userResult?.realUserId || userIdOrToken;

      const post = await this.prisma.post.findUnique({
        where: { id: validated.postId },
        select: { id: true, authorId: true, visibility: true, visibilityUserIds: true, deletedAt: true },
      });

      if (!post || post.deletedAt !== null) {
        return callback?.({ success: false, error: 'Post not found' });
      }

      const canView = await this._canUserViewPost(post, userId);
      if (!canView) {
        this.logger.warn('[CommentReactionHandler] post:join denied (visibility)', { userId, postId: validated.postId });
        return callback?.({ success: false, error: 'Forbidden' });
      }

      socket.join(ROOMS.post(validated.postId));
      callback?.({ success: true });
    } catch (error: unknown) {
      this.logger.error('Failed to join post room', error, { postId: (data as { postId?: string }).postId });
      const errorResponse: SocketIOResponse<unknown> = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to join post room',
      };
      if (callback) callback(errorResponse);
    }
  }

  /**
   * Quitte la room d'un post.
   * Requires authentication — mirrors handleJoinPost guards.
   */
  async handleLeavePost(
    socket: Socket,
    data: { postId: string },
    callback?: (response: SocketIOResponse<unknown>) => void
  ): Promise<void> {
    try {
      const schemaValidation = validateSocketEvent(SocketPostRoomActionSchema, data);
      if (schemaValidation.success === false) {
        if (callback) callback({ success: false, error: schemaValidation.error });
        return;
      }
      const validated = schemaValidation.data;

      const userIdOrToken = this.socketToUser.get(socket.id);
      if (!userIdOrToken) {
        if (callback) callback({ success: false, error: 'User not authenticated' });
        return;
      }

      socket.leave(ROOMS.post(validated.postId));
      if (callback) callback({ success: true });
    } catch (error: unknown) {
      this.logger.error('Failed to leave post room', error, { postId: (data as { postId?: string }).postId });
      const errorResponse: SocketIOResponse<unknown> = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to leave post room',
      };
      if (callback) callback(errorResponse);
    }
  }

  /**
   * Crée une notification de réaction sur commentaire
   */
  private async _createCommentReactionNotification(
    commentId: string,
    postId: string,
    emoji: string,
    reactorUserId: string
  ): Promise<void> {
    const comment = await this.prisma.postComment.findUnique({
      where: { id: commentId },
      select: { authorId: true },
    });

    if (!comment?.authorId) return;

    this.notificationService
      .createCommentReactionNotification({
        commentAuthorId: comment.authorId,
        reactorUserId,
        commentId,
        postId,
        reactionEmoji: emoji,
      })
      .catch((error) => {
        this.logger.error('[CommentReactionHandler] Failed to create comment reaction notification', error, { reactorUserId, commentId, postId, emoji });
      });
  }

  /**
   * Checks whether `userId` is allowed to see `post` based on its visibility setting.
   *
   * PUBLIC  → everyone
   * FRIENDS → post author can see; friends of author resolved via friendRequest
   * PRIVATE → author only
   * ONLY    → userId must be in visibilityUserIds
   * EXCEPT  → userId must NOT be in visibilityUserIds, AND must be a friend
   */
  private async _canUserViewPost(
    post: {
      authorId: string;
      visibility: PostVisibility;
      visibilityUserIds: string[];
    },
    userId: string
  ): Promise<boolean> {
    if (post.authorId === userId) return true;

    switch (post.visibility) {
      case PostVisibility.PUBLIC:
        return true;

      case PostVisibility.PRIVATE:
        return false;

      case PostVisibility.ONLY:
        return post.visibilityUserIds.includes(userId);

      case PostVisibility.FRIENDS:
      case PostVisibility.EXCEPT: {
        const friendship = await this.prisma.friendRequest.findFirst({
          where: {
            status: 'accepted',
            OR: [
              { senderId: post.authorId, receiverId: userId },
              { senderId: userId, receiverId: post.authorId },
            ],
          },
          select: { id: true },
        });
        const isFriend = friendship !== null;
        if (post.visibility === PostVisibility.FRIENDS) return isFriend;
        // EXCEPT: friends who are NOT blocked by visibilityUserIds
        return isFriend && !post.visibilityUserIds.includes(userId);
      }

      default:
        return false;
    }
  }
}
