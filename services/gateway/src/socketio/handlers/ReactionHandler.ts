/**
 * Reaction Handler
 * Gère les réactions aux messages (ajout, suppression, synchronisation)
 */

import type { Socket } from 'socket.io';
import type { Server as SocketIOServer } from 'socket.io';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { NotificationService } from '../../services/notifications/NotificationService';
import { notifyReactionAdded } from '../../services/notifications/reactionNotify';
import { ReactionService } from '../../services/ReactionService.js';
import { getConnectedUser, normalizeConversationId, type SocketUser } from '../utils/socket-helpers';
import type { SocketIOResponse } from '@meeshy/shared/types/socketio-events';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { validateSocketEvent } from '../../middleware/validation.js';
import { SocketReactionAddSchema, SocketReactionRemoveSchema } from '../../validation/socket-event-schemas.js';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { getSocketRateLimiter, SOCKET_RATE_LIMITS } from '../../utils/socket-rate-limiter.js';
import type { RedisDeliveryQueue } from '../../services/RedisDeliveryQueue';

const logger = enhancedLogger.child({ module: 'ReactionHandler' });

export interface ReactionHandlerDependencies {
  io: SocketIOServer;
  prisma: PrismaClient;
  notificationService: NotificationService;
  reactionService: ReactionService;
  connectedUsers: Map<string, SocketUser>;
  socketToUser: Map<string, string>;
  deliveryQueue?: RedisDeliveryQueue | null;
}

export class ReactionHandler {
  private io: SocketIOServer;
  private prisma: PrismaClient;
  private notificationService: NotificationService;
  private reactionService: ReactionService;
  private connectedUsers: Map<string, SocketUser>;
  private socketToUser: Map<string, string>;
  private deliveryQueue: RedisDeliveryQueue | null;
  private rateLimiter = getSocketRateLimiter();

  constructor(deps: ReactionHandlerDependencies) {
    this.io = deps.io;
    this.prisma = deps.prisma;
    this.notificationService = deps.notificationService;
    this.reactionService = deps.reactionService;
    this.connectedUsers = deps.connectedUsers;
    this.socketToUser = deps.socketToUser;
    this.deliveryQueue = deps.deliveryQueue ?? null;
  }

  /**
   * Injected after construction by `MeeshySocketIOManager.setDeliveryQueue`
   * (same instance shared with MessageHandler and the REST broadcast path),
   * since the queue is built once `server.ts` has the Redis-backed CacheStore.
   */
  setDeliveryQueue(queue: RedisDeliveryQueue): void {
    this.deliveryQueue = queue;
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
      const schemaValidation = validateSocketEvent(SocketReactionAddSchema, data);
      if (schemaValidation.success === false) {
        if (callback) callback({ success: false, error: schemaValidation.error });
        return;
      }
      const validated = schemaValidation.data;

      const userIdOrToken = this.socketToUser.get(socket.id);
      if (!userIdOrToken) {
        logger.error('reaction:add — unauthenticated socket', { socketId: socket.id });
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

      const rateLimitAllowed = await this.rateLimiter.checkLimit(userId, SOCKET_RATE_LIMITS.REACTION_ADD);
      if (!rateLimitAllowed) {
        const info = this.rateLimiter.getRateLimitInfo(userId, SOCKET_RATE_LIMITS.REACTION_ADD);
        if (callback) callback({ success: false, error: 'Rate limit exceeded' });
        socket.emit(SERVER_EVENTS.ERROR, {
          message: `Too many reactions. Please wait ${Math.ceil(info.resetIn / 1000)} seconds.`
        });
        return;
      }

      const participantId = await this._resolveParticipantId(user, userId, isAnonymous, validated.messageId);
      if (!participantId) {
        const errorResponse: SocketIOResponse<unknown> = { success: false, error: 'Could not resolve participant' };
        if (callback) callback(errorResponse);
        return;
      }

      const reactionService = this.reactionService;

      const addResult = await reactionService.addReaction({
        messageId: validated.messageId,
        emoji: validated.emoji,
        participantId
      });

      if (!addResult) {
        const errorResponse: SocketIOResponse<unknown> = {
          success: false,
          error: 'Failed to add reaction'
        };
        if (callback) callback(errorResponse);
        return;
      }

      const { reaction, replacedEmojis } = addResult;

      if (addResult.unchanged) {
        // Idempotent no-op: the participant already had exactly this emoji on
        // this message (optimistic-UI double-fire, a socket retry after a lost
        // ACK, or a second device echoing the same tap). Nothing changed in the
        // DB, so reply success but skip the REACTION_ADDED broadcast and the
        // author notification — re-emitting them spams every participant in the
        // room and re-notifies the author for a reaction that never changed
        // state. Mirrors handleReactionRemove's already-absent guard below.
        if (callback) callback({ success: true, data: reaction });
        return;
      }

      const message = await this.prisma.message.findUnique({
        where: { id: validated.messageId },
        select: { conversationId: true }
      });

      const updateEvent = await reactionService.createUpdateEvent(
        validated.messageId,
        validated.emoji,
        'add',
        participantId,
        message?.conversationId ?? ''
      );

      const successResponse: SocketIOResponse<unknown> = {
        success: true,
        data: reaction
      };
      if (callback) callback(successResponse);

      // Fire-and-forget post-success side-effects so errors in broadcast or
      // notification do not confuse the already-confirmed client response.
      if (message) {
        // Single-reaction-per-user swap: tell other clients the previous emoji
        // is gone before announcing the new one (order is cosmetic — the two
        // events target different emojis and merge independently client-side).
        for (const removedEmoji of replacedEmojis) {
          reactionService.createUpdateEvent(
            validated.messageId,
            removedEmoji,
            'remove',
            participantId,
            message.conversationId
          )
            .then(removeEvent => {
              this._broadcastReactionEventWithConversationId(message.conversationId, removeEvent, SERVER_EVENTS.REACTION_REMOVED);
              void this._enqueueOfflineReactionEvent(message.conversationId, participantId, 'reaction-removed', validated.messageId, removedEmoji, removeEvent as unknown as Record<string, unknown>);
            })
            .catch(err => logger.error('reaction:add replaced-emoji broadcast failed', { error: err, conversationId: message.conversationId }));
        }
        this._broadcastReactionEventWithConversationId(message.conversationId, updateEvent, SERVER_EVENTS.REACTION_ADDED)
          .catch(err => logger.error('reaction:add broadcast failed', { error: err, conversationId: message.conversationId }));
        void this._enqueueOfflineReactionEvent(message.conversationId, participantId, 'reaction-added', validated.messageId, validated.emoji, updateEvent as unknown as Record<string, unknown>);
      }
      // _createReactionNotification handles errors internally; void to be explicit.
      void this._createReactionNotification(validated.messageId, validated.emoji, participantId, isAnonymous, reaction.id);
    } catch (error: unknown) {
      logger.error('reaction:add failed', { error });
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
      const schemaValidation = validateSocketEvent(SocketReactionRemoveSchema, data);
      if (schemaValidation.success === false) {
        if (callback) callback({ success: false, error: schemaValidation.error });
        return;
      }
      const validated = schemaValidation.data;

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

      const rateLimitAllowed = await this.rateLimiter.checkLimit(userId, SOCKET_RATE_LIMITS.REACTION_REMOVE);
      if (!rateLimitAllowed) {
        const info = this.rateLimiter.getRateLimitInfo(userId, SOCKET_RATE_LIMITS.REACTION_REMOVE);
        if (callback) callback({ success: false, error: 'Rate limit exceeded' });
        socket.emit(SERVER_EVENTS.ERROR, {
          message: `Too many reaction changes. Please wait ${Math.ceil(info.resetIn / 1000)} seconds.`
        });
        return;
      }

      const participantId = await this._resolveParticipantId(user, userId, isAnonymous, validated.messageId);
      if (!participantId) {
        const errorResponse: SocketIOResponse<unknown> = { success: false, error: 'Could not resolve participant' };
        if (callback) callback(errorResponse);
        return;
      }

      const reactionService = this.reactionService;

      const removed = await reactionService.removeReaction({
        messageId: validated.messageId,
        emoji: validated.emoji,
        participantId
      });

      if (!removed) {
        // Idempotent: the reaction is already absent — the caller's desired
        // end-state is achieved. Reply success (no broadcast, nothing changed)
        // instead of an error, which the client would treat as a failed un-react
        // and roll the optimistic removal back, re-showing a reaction that is
        // gone. Mirrors the idempotent REST DELETE (R-GW2) and the add path's
        // P2002 handling.
        if (callback) callback({ success: true, data: { message: 'Reaction already absent' } });
        return;
      }

      const message = await this.prisma.message.findUnique({
        where: { id: validated.messageId },
        select: { conversationId: true }
      });

      const updateEvent = await reactionService.createUpdateEvent(
        validated.messageId,
        validated.emoji,
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
        this._broadcastReactionEventWithConversationId(message.conversationId, updateEvent, SERVER_EVENTS.REACTION_REMOVED)
          .catch(err => logger.error('reaction:remove broadcast failed', { error: err, conversationId: message.conversationId }));
        void this._enqueueOfflineReactionEvent(message.conversationId, participantId, 'reaction-removed', validated.messageId, validated.emoji, updateEvent as unknown as Record<string, unknown>);
      }
    } catch (error: unknown) {
      logger.error('reaction:remove failed', { error });
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
        logger.error('reaction:sync — unauthenticated socket', { socketId: socket.id });
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

      const syncAllowed = await this.rateLimiter.checkLimit(userId, SOCKET_RATE_LIMITS.REACTION_SYNC);
      if (!syncAllowed) {
        if (callback) callback({ success: false, error: 'Rate limit exceeded' });
        return;
      }

      const participantId = await this._resolveParticipantId(user, userId, isAnonymous, messageId);
      if (!participantId) {
        const errorResponse: SocketIOResponse<unknown> = { success: false, error: 'Could not resolve participant' };
        if (callback) callback(errorResponse);
        return;
      }

      const reactionService = this.reactionService;

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
      logger.error('reaction:sync failed', { error });
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

    // Guard: a `messageId` still carrying a client-generated optimistic id
    // (`cid_<uuid>`) — or anything not a 24-hex Mongo ObjectId — must NEVER reach
    // prisma.message.findUnique, which throws P2023 ("Malformed ObjectID") and
    // aborts the whole reaction flow. The optimistic row is not yet reconciled to
    // its server id, so we skip gracefully; the caller replies "Could not resolve
    // participant" and the client retries after the send ACK reconciles the cid.
    if (!/^[0-9a-fA-F]{24}$/.test(messageId)) {
      logger.warn('reaction — unreconciled optimistic messageId, skipping', { messageId });
      return undefined;
    }

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
   * Offline delivery queue for reaction add/remove — mirrors
   * `MessageHandler._enqueueOfflineEventForParticipants` for edits/deletes.
   * Without this a reaction toggled while a participant is offline is only
   * broadcast to the live conversation room, so the offline peer's cached
   * reaction counts stay stale until an unrelated full refetch. On reconnect
   * `MeeshySocketIOManager._drainedEventName` replays the queued entry as
   * REACTION_ADDED / REACTION_REMOVED with the same payload as the live emit.
   *
   * The actor is excluded by participant id (Leçon 78: exclude on the CALLER's
   * identity, never on message content) and every online peer is skipped since
   * they already received the live broadcast.
   *
   * `dedupKey` scopes the delivery-queue dedup to (messageId, reactor, emoji)
   * instead of the default messageId — RedisDeliveryQueue's default dedup is
   * (messageId, eventType), which would otherwise collapse two different
   * reactors' 'reaction-added' events on the same message into one, silently
   * dropping every reactor after the first for an offline peer.
   */
  private async _enqueueOfflineReactionEvent(
    conversationId: string,
    actorParticipantId: string | null | undefined,
    eventType: 'reaction-added' | 'reaction-removed',
    messageId: string,
    emoji: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    if (!this.deliveryQueue) return;
    try {
      const participants = await this.prisma.participant.findMany({
        where: { conversationId, isActive: true },
        select: { id: true, userId: true }
      });
      const dedupKey = `${messageId}:${actorParticipantId ?? 'unknown'}:${emoji}`;
      for (const p of participants) {
        const queueKey = p.userId ?? p.id;
        if (p.id === actorParticipantId || this.connectedUsers.has(queueKey)) continue;
        this.deliveryQueue.enqueue(queueKey, {
          messageId,
          conversationId,
          payload,
          enqueuedAt: new Date().toISOString(),
          eventType,
          dedupKey,
        }).catch((err) => logger.warn('Failed to enqueue offline reaction event', { userId: queueKey, eventType, error: err }));
      }
    } catch (err) {
      logger.warn('Failed to fetch participants for offline reaction enqueue', { conversationId, eventType, error: err });
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
    _reactionId: string
  ): Promise<void> {
    // Source unique partagée avec la route REST `POST /reactions`
    // (cf. notifyReactionAdded) — évite la dérive entre transports qui avait
    // fait disparaître les notifs de réaction sur le chemin outbox/REST.
    await notifyReactionAdded(
      { prisma: this.prisma, notificationService: this.notificationService },
      { messageId, reactorParticipantId: reactorId, emoji, isAnonymous }
    ).catch((error) => {
      logger.error('reaction notification creation failed', { error });
    });
  }
}
