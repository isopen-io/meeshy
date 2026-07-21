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
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { NotificationService } from '../../services/notifications/NotificationService';
import { CommentReactionService } from '../../services/CommentReactionService';
import { getConnectedUser, type SocketUser } from '../utils/socket-helpers';
import { sliceCodePoints } from '@meeshy/shared/utils/text-truncate';
import type { SocketIOResponse } from '@meeshy/shared/types/socketio-events';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { validateSocketEvent } from '../../middleware/validation.js';
import {
  SocketCommentReactionAddSchema,
  SocketCommentReactionRemoveSchema,
} from '../../validation/socket-event-schemas.js';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { SocketRateLimiter } from '../../utils/socket-rate-limiter.js';
import { canUserViewPost } from '../../services/posts/postVisibility.js';

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

      // Contrat ACK == broadcast : on renvoie l'`updateEvent` (commentId, postId,
      // userId, emoji, action, aggregation, timestamp) — le MÊME objet que le
      // broadcast `comment:reaction-added`. Le web ignore `data`, l'iOS le décode en
      // `SocketCommentReactionUpdateEvent`. La `reaction` brute cassait le décodage iOS.
      const successResponse: SocketIOResponse<unknown> = {
        success: true,
        data: updateEvent,
      };
      if (callback) callback(successResponse);

      this.io.to(ROOMS.post(validated.postId)).emit(SERVER_EVENTS.COMMENT_REACTION_ADDED, updateEvent);

      // Fire-and-forget: notification errors must not reach the outer catch after
      // success was already confirmed to the client.
      this._createCommentReactionNotification(
        validated.commentId,
        validated.postId,
        validated.emoji,
        userId
      ).catch(err => this.logger.error('comment reaction notification failed', err, { commentId: validated.commentId }));
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
        // Idempotent: the reaction is already absent — the caller's desired
        // end-state is achieved. Reply success (no broadcast, nothing changed)
        // instead of an error, which the client would treat as a failed un-react
        // and roll the optimistic removal back, re-showing a reaction that is
        // gone. Mirrors ReactionHandler.handleReactionRemove (message reactions).
        if (callback) callback({ success: true, data: { message: 'Reaction already absent' } });
        return;
      }

      const updateEvent = await this.commentReactionService.createUpdateEvent(
        validated.commentId,
        validated.emoji,
        'remove',
        userId,
        validated.postId
      );

      // Contrat ACK == broadcast (voir handleAddReaction) : on renvoie l'`updateEvent`,
      // identique au broadcast `comment:reaction-removed`, au lieu d'un simple {message}.
      const successResponse: SocketIOResponse<unknown> = {
        success: true,
        data: updateEvent,
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

      const syncAllowed = await reactionRateLimiter.checkLimit(userId, COMMENT_REACTION_RATE_LIMIT);
      if (!syncAllowed) {
        if (callback) callback({ success: false, error: 'Rate limit exceeded' });
        return;
      }

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
   * Crée une notification de réaction sur commentaire
   */
  private async _createCommentReactionNotification(
    commentId: string,
    postId: string,
    emoji: string,
    reactorUserId: string
  ): Promise<void> {
    // Fetch comment + post in parallel pour récupérer le contexte nécessaire
    // à un body riche : "[reactor] a réagi [emoji] à votre commentaire sur la
    // story de [story_author]" (spec user 2026-05-28 — la notif sommaire
    // actuelle « XXX » + emoji nu n'expose pas le contexte du commentaire).
    const [comment, post] = await Promise.all([
      this.prisma.postComment.findUnique({
        where: { id: commentId },
        select: { authorId: true, content: true },
      }),
      this.prisma.post.findUnique({
        where: { id: postId },
        select: {
          type: true,
          author: { select: { displayName: true, username: true } },
        },
      }),
    ]);

    if (!comment?.authorId) return;

    const postAuthorName = post?.author?.displayName?.trim()
      || post?.author?.username?.trim()
      || '';

    this.notificationService
      .createCommentReactionNotification({
        commentAuthorId: comment.authorId,
        reactorUserId,
        commentId,
        postId,
        reactionEmoji: emoji,
        commentPreview: comment.content ? sliceCodePoints(comment.content, 80) : '',
        postAuthorName,
        // Forward the real post type (mirror PostReactionHandler) so a reaction on a
        // comment under a REEL/STATUS keeps its entity typing instead of collapsing to POST.
        postType: post?.type,
      })
      .catch((error) => {
        this.logger.error('[CommentReactionHandler] Failed to create comment reaction notification', error, { reactorUserId, commentId, postId, emoji });
      });
  }

  private async _canUserViewPost(
    post: {
      authorId: string;
      visibility: import('@meeshy/shared/prisma/client').PostVisibility;
      visibilityUserIds: string[];
    },
    userId: string
  ): Promise<boolean> {
    return canUserViewPost(this.prisma, post, userId);
  }
}
