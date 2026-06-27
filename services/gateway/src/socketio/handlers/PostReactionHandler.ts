/**
 * Post Reaction Handler
 * Gère les réactions emoji sur les posts (ajout, suppression, synchronisation)
 *
 * Mirrors CommentReactionHandler exactly, substituting:
 *   commentId       → postId
 *   ROOMS.post      → ROOMS.post (same room — post reactions live in the same room as comment reactions)
 *   CommentReactionService → PostReactionService
 *   Anonymous users are rejected (posts require registered users to react)
 *
 * join/leave post room handlers are owned by this handler (PostReactionHandler)
 * since posts are the natural semantic owner of the post room.
 * CommentReactionHandler delegates join/leave to the same shared room.
 */

import type { Socket } from 'socket.io';
import type { Server as SocketIOServer } from 'socket.io';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { NotificationService } from '../../services/notifications/NotificationService';
import { PostReactionService } from '../../services/PostReactionService';
import { getConnectedUser, type SocketUser } from '../utils/socket-helpers';
import type { SocketIOResponse } from '@meeshy/shared/types/socketio-events';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { validateSocketEvent } from '../../middleware/validation.js';
import {
  SocketPostReactionAddSchema,
  SocketPostReactionRemoveSchema,
  SocketPostRoomActionSchema,
} from '../../validation/socket-event-schemas.js';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { SocketRateLimiter } from '../../utils/socket-rate-limiter.js';
import { canUserViewPost } from '../../services/posts/postVisibility.js';
import { SocialEventsHandler } from './SocialEventsHandler';

/** Emoji canonique du "like" — aligné REST (`interactions.ts`) + web (`HEART_EMOJI`). */
const HEART_EMOJI = '❤️';

const logger = enhancedLogger.child({ module: 'PostReactionHandler' });

/** Per-user token bucket: 30 reactions/min across add + remove. */
const POST_REACTION_RATE_LIMIT = {
  maxRequests: 30,
  windowMs: 60_000,
  keyPrefix: 'socket:post:reaction',
} as const;

const reactionRateLimiter = new SocketRateLimiter();

export interface PostReactionHandlerDependencies {
  io: SocketIOServer;
  prisma: PrismaClient;
  notificationService: NotificationService;
  postReactionService: PostReactionService;
  connectedUsers: Map<string, SocketUser>;
  socketToUser: Map<string, string>;
  socialEvents: SocialEventsHandler;
}

export class PostReactionHandler {
  private io: SocketIOServer;
  private prisma: PrismaClient;
  private notificationService: NotificationService;
  private postReactionService: PostReactionService;
  private connectedUsers: Map<string, SocketUser>;
  private socketToUser: Map<string, string>;
  private socialEvents: SocialEventsHandler;
  private readonly logger = logger;

  constructor(deps: PostReactionHandlerDependencies) {
    this.io = deps.io;
    this.prisma = deps.prisma;
    this.notificationService = deps.notificationService;
    this.postReactionService = deps.postReactionService;
    this.connectedUsers = deps.connectedUsers;
    this.socketToUser = deps.socketToUser;
    this.socialEvents = deps.socialEvents;
  }

  /**
   * Émet l'événement de réaction UNIFIÉ.
   *
   * Pour le "like" (❤️) sur un POST/REEL, émet l'événement CANONIQUE ABSOLU
   * `post:liked`/`post:unliked` (via `SocialEventsHandler`) vers les feed rooms
   * des amis ET la post room — UN SEUL événement par like, reçu par les 3 surfaces
   * (feed, détail, reel viewer) avec un payload absolu `{likeCount, reactionSummary}`.
   * On NE ré-émet PAS `post:reaction-added/removed` pour le ❤️ (évite le double-
   * comptage sur un client présent dans les deux rooms).
   *
   * Pour les autres emojis (ou stories/statuses), conserve l'événement par-emoji
   * `post:reaction-added/removed` vers la post room (comportement historique).
   */
  private async broadcastReactionChange(
    postId: string,
    emoji: string,
    action: 'add' | 'remove',
    userId: string,
    updateEvent: unknown
  ): Promise<void> {
    if (emoji === HEART_EMOJI) {
      const post = await this.prisma.post.findUnique({
        where: { id: postId },
        select: { authorId: true, type: true, likeCount: true, reactionSummary: true, visibility: true, visibilityUserIds: true },
      });
      if (post && post.authorId && (post.type === 'POST' || post.type === 'REEL')) {
        const payload = {
          postId,
          userId,
          emoji,
          likeCount: post.likeCount,
          reactionSummary: (post.reactionSummary as Record<string, number>) ?? {},
        };
        if (action === 'add') {
          await this.socialEvents.broadcastPostLiked(payload, post.authorId, post.visibility, post.visibilityUserIds ?? []);
        } else {
          await this.socialEvents.broadcastPostUnliked(payload, post.authorId, post.visibility, post.visibilityUserIds ?? []);
        }
        return;
      }
    }
    const event = action === 'add' ? SERVER_EVENTS.POST_REACTION_ADDED : SERVER_EVENTS.POST_REACTION_REMOVED;
    this.io.to(ROOMS.post(postId)).emit(event, updateEvent);
  }

  /**
   * Ajoute une réaction à un post
   */
  async handleAddReaction(
    socket: Socket,
    data: { postId: string; emoji: string },
    callback?: (response: SocketIOResponse<unknown>) => void
  ): Promise<void> {
    try {
      const schemaValidation = validateSocketEvent(SocketPostReactionAddSchema, data);
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

      const rateLimitAllowed = await reactionRateLimiter.checkLimit(userId, POST_REACTION_RATE_LIMIT);
      if (!rateLimitAllowed) {
        this.logger.warn('[PostReactionHandler] post:reaction-add rate limit exceeded', { userId, postId: validated.postId });
        if (callback) callback({ success: false, error: 'Rate limit exceeded' });
        return;
      }

      const reaction = await this.postReactionService.addReaction({
        postId: validated.postId,
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

      const updateEvent = await this.postReactionService.createUpdateEvent(
        validated.postId,
        validated.emoji,
        'add',
        userId
      );

      // Contrat ACK == broadcast : on renvoie l'`updateEvent` (postId, userId,
      // emoji, action, aggregation, timestamp) — le MÊME objet que le broadcast
      // `post:reaction-added`. Le web ignore `data` (lit seulement success/error),
      // l'iOS le décode en `SocketPostReactionUpdateEvent`. Renvoyer la `reaction`
      // brute (sans action/aggregation) cassait le décodage iOS (malformedResponse).
      const successResponse: SocketIOResponse<unknown> = {
        success: true,
        data: updateEvent,
      };
      if (callback) callback(successResponse);

      await this.broadcastReactionChange(validated.postId, validated.emoji, 'add', userId, updateEvent);

      await this._createPostReactionNotification(
        validated.postId,
        validated.emoji,
        userId
      );
    } catch (error: unknown) {
      this.logger.error('Failed to add post reaction', error, { userId: this.socketToUser.get(socket.id) });
      const errorResponse: SocketIOResponse<unknown> = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to add reaction',
      };
      if (callback) callback(errorResponse);
    }
  }

  /**
   * Supprime une réaction d'un post
   */
  async handleRemoveReaction(
    socket: Socket,
    data: { postId: string; emoji: string },
    callback?: (response: SocketIOResponse<unknown>) => void
  ): Promise<void> {
    try {
      const schemaValidation = validateSocketEvent(SocketPostReactionRemoveSchema, data);
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

      const rateLimitAllowed = await reactionRateLimiter.checkLimit(userId, POST_REACTION_RATE_LIMIT);
      if (!rateLimitAllowed) {
        this.logger.warn('[PostReactionHandler] post:reaction-remove rate limit exceeded', { userId, postId: validated.postId });
        if (callback) callback({ success: false, error: 'Rate limit exceeded' });
        return;
      }

      const removed = await this.postReactionService.removeReaction({
        postId: validated.postId,
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

      const updateEvent = await this.postReactionService.createUpdateEvent(
        validated.postId,
        validated.emoji,
        'remove',
        userId
      );

      // Contrat ACK == broadcast (voir handleAddReaction) : on renvoie l'`updateEvent`,
      // identique au broadcast `post:reaction-removed`, au lieu d'un simple {message}.
      const successResponse: SocketIOResponse<unknown> = {
        success: true,
        data: updateEvent,
      };
      if (callback) callback(successResponse);

      await this.broadcastReactionChange(validated.postId, validated.emoji, 'remove', userId, updateEvent);
    } catch (error: unknown) {
      this.logger.error('Failed to remove post reaction', error, { userId: this.socketToUser.get(socket.id) });
      const errorResponse: SocketIOResponse<unknown> = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove reaction',
      };
      if (callback) callback(errorResponse);
    }
  }

  /**
   * Synchronise les réactions d'un post
   */
  async handleRequestSync(
    socket: Socket,
    data: { postId: string },
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

      const reactionSync = await this.postReactionService.getPostReactions({
        postId: data.postId,
        currentUserId: userId,
      });

      const successResponse: SocketIOResponse<unknown> = {
        success: true,
        data: reactionSync,
      };
      if (callback) callback(successResponse);
    } catch (error: unknown) {
      this.logger.error('Failed to sync post reactions', error, { userId: this.socketToUser.get(socket.id) });
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

      const canView = await canUserViewPost(this.prisma, post, userId);
      if (!canView) {
        this.logger.warn('[PostReactionHandler] post:join denied (visibility)', { userId, postId: validated.postId });
        return callback?.({ success: false, error: 'Forbidden' });
      }

      await socket.join(ROOMS.post(validated.postId));
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

      await socket.leave(ROOMS.post(validated.postId));
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
   * Crée une notification de réaction sur post (reuses post_like type)
   */
  private async _createPostReactionNotification(
    postId: string,
    emoji: string,
    reactorUserId: string
  ): Promise<void> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { authorId: true },
    });

    if (!post?.authorId) return;

    this.notificationService
      .createPostLikeNotification({
        actorId: reactorUserId,
        postId,
        postAuthorId: post.authorId,
        emoji,
        postType: 'POST',
      })
      .catch((error) => {
        this.logger.error('[PostReactionHandler] Failed to create post reaction notification', error, { reactorUserId, postId, emoji });
      });
  }
}
