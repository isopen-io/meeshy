/**
 * Status Handler
 * Gère les événements de statut utilisateur (typing indicators)
 */

import type { Socket } from 'socket.io';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { StatusService } from '../../services/StatusService';
import { PrivacyPreferencesService } from '../../services/PrivacyPreferencesService';
import { getConnectedUser, normalizeConversationId, type SocketUser } from '../utils/socket-helpers';
import type { TypingEvent } from '@meeshy/shared/types/socketio-events';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';

export interface StatusHandlerDependencies {
  prisma: PrismaClient;
  statusService: StatusService;
  privacyPreferencesService: PrivacyPreferencesService;
  connectedUsers: Map<string, SocketUser>;
  socketToUser: Map<string, string>;
}

export class StatusHandler {
  private prisma: PrismaClient;
  private statusService: StatusService;
  private privacyPreferencesService: PrivacyPreferencesService;
  private connectedUsers: Map<string, SocketUser>;
  private socketToUser: Map<string, string>;

  constructor(deps: StatusHandlerDependencies) {
    this.prisma = deps.prisma;
    this.statusService = deps.statusService;
    this.privacyPreferencesService = deps.privacyPreferencesService;
    this.connectedUsers = deps.connectedUsers;
    this.socketToUser = deps.socketToUser;
  }

  /**
   * Gère l'événement typing:start
   */
  async handleTypingStart(socket: Socket, data: { conversationId: string }): Promise<void> {
    const userIdOrToken = this.socketToUser.get(socket.id);
    if (!userIdOrToken) {
      console.warn('⚠️ [TYPING] Typing start sans userId pour socket', socket.id);
      return;
    }

    try {
      const normalizedId = await normalizeConversationId(
        data.conversationId,
        (where) => this.prisma.conversation.findUnique({ where, select: { id: true, identifier: true } })
      );

      const result = getConnectedUser(userIdOrToken, this.connectedUsers);
      if (!result) {
        console.warn('⚠️ [TYPING] Utilisateur non connecté:', userIdOrToken);
        return;
      }
      const { user: connectedUser, realUserId: userId } = result;

      // Mettre à jour l'activité
      this.statusService.updateLastSeen(userId, connectedUser.isAnonymous);

      // Vérifier les préférences de confidentialité
      const shouldShowTyping = await this.privacyPreferencesService.shouldShowTypingIndicator(
        userId,
        connectedUser.isAnonymous
      );
      if (!shouldShowTyping) {
        return;
      }

      const displayName = await this._getDisplayName(userId, connectedUser.isAnonymous);
      if (!displayName) return;

      const typingEvent: TypingEvent = {
        userId: userId,
        username: displayName,
        conversationId: normalizedId,
        isTyping: true
      };

      const room = ROOMS.conversation(normalizedId);
      socket.to(room).emit(SERVER_EVENTS.TYPING_START, typingEvent);
    } catch (error) {
      console.error('❌ [TYPING] Erreur handleTypingStart:', error);
    }
  }

  /**
   * Gère l'événement typing:stop
   */
  async handleTypingStop(socket: Socket, data: { conversationId: string }): Promise<void> {
    const userIdOrToken = this.socketToUser.get(socket.id);
    if (!userIdOrToken) {
      console.warn('⚠️ [TYPING] Typing stop sans userId pour socket', socket.id);
      return;
    }

    try {
      const normalizedId = await normalizeConversationId(
        data.conversationId,
        (where) => this.prisma.conversation.findUnique({ where, select: { id: true, identifier: true } })
      );

      const result = getConnectedUser(userIdOrToken, this.connectedUsers);
      if (!result) {
        console.warn('⚠️ [TYPING] Utilisateur non connecté:', userIdOrToken);
        return;
      }
      const { user: connectedUser, realUserId: userId } = result;

      const shouldShowTyping = await this.privacyPreferencesService.shouldShowTypingIndicator(
        userId,
        connectedUser.isAnonymous
      );
      if (!shouldShowTyping) {
        return;
      }

      const displayName = await this._getDisplayName(userId, connectedUser.isAnonymous);
      if (!displayName) return;

      const typingEvent: TypingEvent = {
        userId: userId,
        username: displayName,
        conversationId: normalizedId,
        isTyping: false
      };

      const room = ROOMS.conversation(normalizedId);
      socket.to(room).emit(SERVER_EVENTS.TYPING_STOP, typingEvent);
    } catch (error) {
      console.error('❌ [TYPING] Erreur handleTypingStop:', error);
    }
  }

  /**
   * Récupère le nom d'affichage d'un utilisateur
   */
  private async _getDisplayName(userId: string, isAnonymous: boolean): Promise<string | null> {
    if (isAnonymous) {
      const dbAnonymousUser = await this.prisma.anonymousParticipant.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true
        }
      });

      if (!dbAnonymousUser) {
        console.warn('⚠️ [TYPING] Utilisateur anonyme non trouvé:', userId);
        return null;
      }

      return (
        `${dbAnonymousUser.firstName || ''} ${dbAnonymousUser.lastName || ''}`.trim() ||
        dbAnonymousUser.username
      );
    } else {
      const dbUser = await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          displayName: true
        }
      });

      if (!dbUser) {
        console.warn('⚠️ [TYPING] Utilisateur non trouvé:', userId);
        return null;
      }

      return (
        dbUser.displayName ||
        `${dbUser.firstName || ''} ${dbUser.lastName || ''}`.trim() ||
        dbUser.username
      );
    }
  }
}
