/**
 * Conversation Handler
 * Gère les événements de conversation (join, leave, stats)
 */

import type { Socket } from 'socket.io';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { normalizeConversationId, type SocketUser } from '../utils/socket-helpers';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { conversationStatsService } from '../../services/ConversationStatsService';
import { validateSocketEvent } from '../../middleware/validation.js';
import { SocketConversationJoinSchema, SocketConversationLeaveSchema } from '../../validation/socket-event-schemas.js';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import type { MessageReadStatusService } from '../../services/MessageReadStatusService.js';
import { getSocketRateLimiter, SOCKET_RATE_LIMITS } from '../../utils/socket-rate-limiter.js';

const logger = enhancedLogger.child({ module: 'ConversationHandler' });

export interface ConversationHandlerDependencies {
  prisma: PrismaClient;
  connectedUsers: Map<string, SocketUser>;
  socketToUser: Map<string, string>;
  readStatusService: Pick<MessageReadStatusService, 'getUnreadCount'>;
}

export class ConversationHandler {
  private prisma: PrismaClient;
  private connectedUsers: Map<string, SocketUser>;
  private socketToUser: Map<string, string>;
  private readStatusService: Pick<MessageReadStatusService, 'getUnreadCount'>;
  private rateLimiter = getSocketRateLimiter();

  constructor(deps: ConversationHandlerDependencies) {
    this.prisma = deps.prisma;
    this.connectedUsers = deps.connectedUsers;
    this.socketToUser = deps.socketToUser;
    this.readStatusService = deps.readStatusService;
  }

  /**
   * Gère l'événement conversation:join
   */
  async handleConversationJoin(socket: Socket, data: { conversationId: string }): Promise<void> {
    // Resolve early so we can attach the conversationId to every error
    // emission. The client uses it to route the error to the right
    // ViewModel and purge stale cache entries.
    const requestedId = (data && typeof data === 'object' && 'conversationId' in data)
      ? String((data as { conversationId: unknown }).conversationId ?? '')
      : '';
    try {
      const schemaValidation = validateSocketEvent(SocketConversationJoinSchema, data);
      if (schemaValidation.success === false) {
        socket.emit(SERVER_EVENTS.CONVERSATION_JOIN_ERROR, {
          conversationId: requestedId,
          reason: 'invalid_payload',
          message: schemaValidation.error,
        });
        return;
      }
      const validated = schemaValidation.data;

      const normalizedId = await normalizeConversationId(
        validated.conversationId,
        (where) => this.prisma.conversation.findUnique({ where, select: { id: true, identifier: true } })
      );

      const userIdOrToken = this.socketToUser.get(socket.id);
      const connectedUser = userIdOrToken ? this.connectedUsers.get(userIdOrToken) : null;

      if (!connectedUser) {
        socket.emit(SERVER_EVENTS.CONVERSATION_JOIN_ERROR, {
          conversationId: validated.conversationId,
          reason: 'not_authenticated',
          message: 'Non authentifié',
        });
        return;
      }

      const joinAllowed = await this.rateLimiter.checkLimit(userIdOrToken!, SOCKET_RATE_LIMITS.CONVERSATION_JOIN);
      if (!joinAllowed) {
        socket.emit(SERVER_EVENTS.CONVERSATION_JOIN_ERROR, {
          conversationId: validated.conversationId,
          reason: 'rate_limited',
          message: 'Trop de requêtes. Veuillez réessayer.',
        });
        return;
      }

      if (connectedUser.isAnonymous) {
        // Anonymous: verify participant owns this exact conversation
        const participantId = connectedUser.participantId;
        const participant = await this.prisma.participant.findFirst({
          where: { id: participantId, conversationId: normalizedId, isActive: true },
          select: { id: true },
        });
        if (!participant) {
          socket.emit(SERVER_EVENTS.CONVERSATION_JOIN_ERROR, {
            conversationId: validated.conversationId,
            reason: 'not_a_member',
            message: 'Vous n\'êtes pas membre de cette conversation',
          });
          return;
        }
      } else {
        // Registered: check participant record by userId
        const userId = connectedUser.userId!;
        const participant = await this.prisma.participant.findFirst({
          where: { conversationId: normalizedId, userId },
          select: { id: true, bannedAt: true, leftAt: true, isActive: true },
        });

        if (!participant) {
          socket.emit(SERVER_EVENTS.CONVERSATION_JOIN_ERROR, {
            conversationId: validated.conversationId,
            reason: 'not_a_member',
            message: 'Vous n\'êtes pas membre de cette conversation',
          });
          return;
        }

        if (participant.bannedAt) {
          socket.emit(SERVER_EVENTS.CONVERSATION_JOIN_ERROR, {
            conversationId: validated.conversationId,
            reason: 'banned',
            message: 'Vous êtes banni de cette conversation',
          });
          return;
        }

        if (participant.leftAt || participant.isActive === false) {
          socket.emit(SERVER_EVENTS.CONVERSATION_JOIN_ERROR, {
            conversationId: validated.conversationId,
            reason: 'no_longer_member',
            message: 'Vous n\'êtes plus membre de cette conversation',
          });
          return;
        }
      }

      const room = ROOMS.conversation(normalizedId);
      await socket.join(room);
      const registeredUserId = connectedUser.userId;
      if (registeredUserId) {
        socket.emit(SERVER_EVENTS.CONVERSATION_JOINED, {
          conversationId: normalizedId,
          userId: registeredUserId
        });

        try {
          const unreadCount = await this.readStatusService.getUnreadCount(registeredUserId, normalizedId);
          socket.emit(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, { conversationId: normalizedId, unreadCount });
        } catch (err) {
          logger.warn('unread count fetch failed on join (non-blocking)', { conversationId: normalizedId, error: err });
        }

        // Envoyer les stats de conversation
        await this.sendConversationStatsToSocket(socket, validated.conversationId).catch(err => {
          logger.warn('conversation stats broadcast failed (non-blocking)', { conversationId: validated.conversationId, error: err });
        });
      }
    } catch (error) {
      logger.error('conversation:join failed', { error });
      socket.emit(SERVER_EVENTS.CONVERSATION_JOIN_ERROR, {
        conversationId: requestedId,
        reason: 'server_error',
        message: 'Erreur serveur lors du join',
      });
    }
  }

  /**
   * Gère l'événement conversation:leave
   */
  async handleConversationLeave(socket: Socket, data: { conversationId: string }): Promise<void> {
    try {
      const schemaValidation = validateSocketEvent(SocketConversationLeaveSchema, data);
      if (schemaValidation.success === false) {
        socket.emit(SERVER_EVENTS.ERROR, { message: schemaValidation.error });
        return;
      }
      const validated = schemaValidation.data;

      const normalizedId = await normalizeConversationId(
        validated.conversationId,
        (where) => this.prisma.conversation.findUnique({ where, select: { id: true, identifier: true } })
      );

      const room = ROOMS.conversation(normalizedId);
      await socket.leave(room);

      const userId = this.socketToUser.get(socket.id);
      if (userId) {
        socket.emit(SERVER_EVENTS.CONVERSATION_LEFT, {
          conversationId: normalizedId,
          userId
        });
      }
    } catch (error) {
      logger.error('conversation:leave failed', { error });
      socket.emit(SERVER_EVENTS.ERROR, { message: 'Failed to leave conversation' });
    }
  }

  /**
   * Envoie les statistiques de conversation à un socket
   */
  async sendConversationStatsToSocket(socket: Socket, conversationId: string): Promise<void> {
    try {
      // Read-only refresh on join: getOrCompute returns cached-or-freshly-computed
      // stats WITHOUT mutating them. Using updateOnNewMessage here (the per-new-message
      // increment path) bumped messagesPerLanguage['fr'] by one on every warm-cache
      // join, inflating a conversation's message counts and persisting the corruption
      // in the shared singleton cache until its 1h TTL expired.
      const stats = await conversationStatsService.getOrCompute(
        this.prisma,
        conversationId,
        () => Array.from(this.connectedUsers.values()).map((u) => u.id)
      );

      if (stats) {
        socket.emit(SERVER_EVENTS.CONVERSATION_STATS, {
          conversationId,
          stats
        });
      }
    } catch (error) {
      logger.error('conversation stats emit failed', { error });
    }
  }
}
