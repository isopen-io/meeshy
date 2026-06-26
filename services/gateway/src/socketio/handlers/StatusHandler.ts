/**
 * Status Handler
 * Gère les événements de statut utilisateur (typing indicators)
 *
 * Unified Participant model: display names are resolved from Participant
 * for anonymous users, from User for registered users.
 */

import type { Socket } from 'socket.io';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { StatusService } from '../../services/StatusService';
import { PrivacyPreferencesService } from '../../services/PrivacyPreferencesService';
import { getConnectedUser, normalizeConversationId, type SocketUser } from '../utils/socket-helpers';
import type { TypingEvent } from '@meeshy/shared/types/socketio-events';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { validateSocketEvent } from '../../middleware/validation.js';
import { SocketTypingSchema } from '../../validation/socket-event-schemas.js';
import { enhancedLogger } from '../../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'StatusHandler' });

export interface StatusHandlerDependencies {
  prisma: PrismaClient;
  statusService: StatusService;
  privacyPreferencesService: PrivacyPreferencesService;
  connectedUsers: Map<string, SocketUser>;
  socketToUser: Map<string, string>;
}

const IDENTITY_CACHE_TTL_MS = 60_000;

type CachedIdentity = { username: string; displayName: string; expiresAt: number };

export class StatusHandler {
  private prisma: PrismaClient;
  private statusService: StatusService;
  private privacyPreferencesService: PrivacyPreferencesService;
  private connectedUsers: Map<string, SocketUser>;
  private socketToUser: Map<string, string>;
  private identityCache = new Map<string, CachedIdentity>();
  private typingThrottleMap = new Map<string, number>();
  private static readonly TYPING_THROTTLE_MS = 2_000;

  constructor(deps: StatusHandlerDependencies) {
    this.prisma = deps.prisma;
    this.statusService = deps.statusService;
    this.privacyPreferencesService = deps.privacyPreferencesService;
    this.connectedUsers = deps.connectedUsers;
    this.socketToUser = deps.socketToUser;
  }

  invalidateIdentityCache(userId: string): void {
    this.identityCache.delete(`user:${userId}`);
    this.identityCache.delete(`anon:${userId}`);
  }

  clearTypingThrottle(userId: string): void {
    for (const key of this.typingThrottleMap.keys()) {
      if (key.startsWith(`${userId}:`)) this.typingThrottleMap.delete(key);
    }
  }

  /**
   * Gère l'événement typing:start
   */
  async handleTypingStart(socket: Socket, data: { conversationId: string }): Promise<void> {
    const schemaValidation = validateSocketEvent(SocketTypingSchema, data);
    if (!schemaValidation.success) return;
    const validated = schemaValidation.data;

    const userIdOrToken = this.socketToUser.get(socket.id);
    if (!userIdOrToken) {
      logger.warn('typing:start — unauthenticated socket', { socketId: socket.id });
      return;
    }

    try {
      const normalizedId = await normalizeConversationId(
        validated.conversationId,
        (where) => this.prisma.conversation.findUnique({ where, select: { id: true, identifier: true } })
      );

      const result = getConnectedUser(userIdOrToken, this.connectedUsers);
      if (!result) {
        logger.warn('typing:start — user not connected', { userId: userIdOrToken });
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

      const identity = await this._resolveTypingIdentity(userId, connectedUser.isAnonymous);
      if (!identity) return;

      const typingEvent: TypingEvent = {
        userId: userId,
        username: identity.username,
        displayName: identity.displayName,
        conversationId: normalizedId,
        isTyping: true
      };

      const throttleKey = `${userId}:${normalizedId}`;
      const now = Date.now();
      const lastEmitAt = this.typingThrottleMap.get(throttleKey) ?? 0;
      if (now - lastEmitAt < StatusHandler.TYPING_THROTTLE_MS) return;
      this.typingThrottleMap.set(throttleKey, now);
      if (this.typingThrottleMap.size > 10_000) {
        const stale = now - StatusHandler.TYPING_THROTTLE_MS * 10;
        for (const [k, ts] of this.typingThrottleMap) {
          if (ts < stale) this.typingThrottleMap.delete(k);
        }
      }

      const room = ROOMS.conversation(normalizedId);
      socket.to(room).emit(SERVER_EVENTS.TYPING_START, typingEvent);
    } catch (error) {
      logger.error('typing:start failed', { error });
    }
  }

  /**
   * Gère l'événement typing:stop
   */
  async handleTypingStop(socket: Socket, data: { conversationId: string }): Promise<void> {
    const schemaValidation = validateSocketEvent(SocketTypingSchema, data);
    if (!schemaValidation.success) return;
    const validated = schemaValidation.data;

    const userIdOrToken = this.socketToUser.get(socket.id);
    if (!userIdOrToken) {
      logger.warn('typing:stop — unauthenticated socket', { socketId: socket.id });
      return;
    }

    try {
      const normalizedId = await normalizeConversationId(
        validated.conversationId,
        (where) => this.prisma.conversation.findUnique({ where, select: { id: true, identifier: true } })
      );

      const result = getConnectedUser(userIdOrToken, this.connectedUsers);
      if (!result) {
        logger.warn('typing:stop — user not connected', { userId: userIdOrToken });
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

      const identity = await this._resolveTypingIdentity(userId, connectedUser.isAnonymous);
      if (!identity) return;

      const typingEvent: TypingEvent = {
        userId: userId,
        username: identity.username,
        displayName: identity.displayName,
        conversationId: normalizedId,
        isTyping: false
      };

      const room = ROOMS.conversation(normalizedId);
      socket.to(room).emit(SERVER_EVENTS.TYPING_STOP, typingEvent);
    } catch (error) {
      logger.error('typing:stop failed', { error });
    }
  }

  /**
   * Résout l'identité de frappe d'un utilisateur : son `username` (handle) et son
   * `displayName` (nom à afficher).
   *
   * `displayName` suit l'ordre : displayName explicite > « Prénom Nom » > username.
   *
   * For anonymous users, resolve from Participant table — un participant anonyme n'a
   * pas de handle, donc `username` retombe sur le nom d'affichage.
   * For registered users, resolve from User table.
   */
  private async _resolveTypingIdentity(
    userId: string,
    isAnonymous: boolean
  ): Promise<{ username: string; displayName: string } | null> {
    const cacheKey = `${isAnonymous ? 'anon' : 'user'}:${userId}`;
    const cached = this.identityCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return { username: cached.username, displayName: cached.displayName };
    }

    if (isAnonymous) {
      // userId is actually a participantId for anonymous users
      const participant = await this.prisma.participant.findUnique({
        where: { id: userId },
        select: {
          id: true,
          displayName: true,
          nickname: true
        }
      });

      if (!participant) {
        logger.warn('typing — anonymous participant not found', { participantId: userId });
        return null;
      }

      const displayName = participant.nickname || participant.displayName;
      const identity = { username: displayName, displayName };
      this.identityCache.set(cacheKey, { ...identity, expiresAt: Date.now() + IDENTITY_CACHE_TTL_MS });
      return identity;
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
        logger.warn('typing — registered user not found', { userId });
        return null;
      }

      const displayName =
        dbUser.displayName ||
        `${dbUser.firstName || ''} ${dbUser.lastName || ''}`.trim() ||
        dbUser.username;
      const identity = { username: dbUser.username, displayName };
      this.identityCache.set(cacheKey, { ...identity, expiresAt: Date.now() + IDENTITY_CACHE_TTL_MS });
      return identity;
    }
  }
}
