/**
 * Conversation Handler
 * Gère les événements de conversation (join, leave, stats)
 */

import type { Socket } from 'socket.io';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { normalizeConversationId, type SocketUser } from '../utils/socket-helpers';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { conversationStatsService } from '../../services/ConversationStatsService';

export interface ConversationHandlerDependencies {
  prisma: PrismaClient;
  connectedUsers: Map<string, SocketUser>;
  socketToUser: Map<string, string>;
}

export class ConversationHandler {
  private prisma: PrismaClient;
  private connectedUsers: Map<string, SocketUser>;
  private socketToUser: Map<string, string>;

  constructor(deps: ConversationHandlerDependencies) {
    this.prisma = deps.prisma;
    this.connectedUsers = deps.connectedUsers;
    this.socketToUser = deps.socketToUser;
  }

  /**
   * Gère l'événement conversation:join
   */
  async handleConversationJoin(socket: Socket, data: { conversationId: string }): Promise<void> {
    try {
      const normalizedId = await normalizeConversationId(
        data.conversationId,
        (where) => this.prisma.conversation.findUnique({ where, select: { id: true, identifier: true } })
      );

      const room = `conversation_${normalizedId}`;
      socket.join(room);

      const userId = this.socketToUser.get(socket.id);
      if (userId) {
        socket.emit(SERVER_EVENTS.CONVERSATION_JOINED, {
          conversationId: normalizedId,
          userId
        });

        // Envoyer les stats de conversation
        await this.sendConversationStatsToSocket(socket, data.conversationId).catch(() => {});
      }
    } catch (error) {
      console.error('[CONVERSATION_JOIN] Erreur:', error);
    }
  }

  /**
   * Gère l'événement conversation:leave
   */
  async handleConversationLeave(socket: Socket, data: { conversationId: string }): Promise<void> {
    try {
      const normalizedId = await normalizeConversationId(
        data.conversationId,
        (where) => this.prisma.conversation.findUnique({ where, select: { id: true, identifier: true } })
      );

      const room = `conversation_${normalizedId}`;
      socket.leave(room);

      const userId = this.socketToUser.get(socket.id);
      if (userId) {
        socket.emit(SERVER_EVENTS.CONVERSATION_LEFT, {
          conversationId: normalizedId,
          userId
        });
      }
    } catch (error) {
      console.error('[CONVERSATION_LEAVE] Erreur:', error);
    }
  }

  /**
   * Envoie les statistiques de conversation à un socket
   */
  async sendConversationStatsToSocket(socket: Socket, conversationId: string): Promise<void> {
    try {
      const stats = await conversationStatsService.updateOnNewMessage(
        this.prisma,
        conversationId,
        'fr', // Default language pour stats refresh
        () => Array.from(this.connectedUsers.values()).map((u) => u.id)
      );

      if (stats) {
        socket.emit(SERVER_EVENTS.CONVERSATION_STATS_UPDATED, {
          conversationId,
          stats
        });
      }
    } catch (error) {
      console.error('[CONVERSATION_STATS] Erreur:', error);
    }
  }
}
