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
import { getSocketRateLimiter, SOCKET_RATE_LIMITS } from '../../utils/socket-rate-limiter.js';
import { BoundedTtlCache } from '../../utils/bounded-cache.js';

const logger = enhancedLogger.child({ module: 'StatusHandler' });

export interface StatusHandlerDependencies {
  prisma: PrismaClient;
  statusService: StatusService;
  privacyPreferencesService: PrivacyPreferencesService;
  connectedUsers: Map<string, SocketUser>;
  socketToUser: Map<string, string>;
}

const IDENTITY_CACHE_TTL_MS = 60_000;
const IDENTITY_CACHE_MAX_SIZE = 5_000;

type CachedIdentity = { username: string; displayName: string };

type ActiveTyper = { conversationId: string; userId: string; username: string; displayName: string };

export class StatusHandler {
  private prisma: PrismaClient;
  private statusService: StatusService;
  private privacyPreferencesService: PrivacyPreferencesService;
  private connectedUsers: Map<string, SocketUser>;
  private socketToUser: Map<string, string>;
  private identityCache = new BoundedTtlCache<string, CachedIdentity>({
    maxSize: IDENTITY_CACHE_MAX_SIZE,
    ttlMs: IDENTITY_CACHE_TTL_MS
  });
  private typingThrottleMap = new Map<string, number>();
  private activeTypers = new Map<string, Array<ActiveTyper>>();
  private static readonly TYPING_THROTTLE_MS = 2_000;
  private static readonly TYPING_THROTTLE_TTL_MS = 30_000;
  private static readonly TYPING_THROTTLE_CLEANUP_SIZE = 1_000;
  private typingThrottleCleanupTimer: ReturnType<typeof setInterval> | null = null;
  private rateLimiter = getSocketRateLimiter();

  constructor(deps: StatusHandlerDependencies) {
    this.prisma = deps.prisma;
    this.statusService = deps.statusService;
    this.privacyPreferencesService = deps.privacyPreferencesService;
    this.connectedUsers = deps.connectedUsers;
    this.socketToUser = deps.socketToUser;
    this.typingThrottleCleanupTimer = setInterval(() => this._evictStale(), 30_000);
    if (this.typingThrottleCleanupTimer.unref) this.typingThrottleCleanupTimer.unref();
  }

  destroy(): void {
    if (this.typingThrottleCleanupTimer !== null) {
      clearInterval(this.typingThrottleCleanupTimer);
      this.typingThrottleCleanupTimer = null;
    }
  }

  private _evictStale(): void {
    this._evictStaleThrottleEntries();
    this.identityCache.evictExpired();
  }

  private _evictStaleThrottleEntries(): void {
    const stale = Date.now() - StatusHandler.TYPING_THROTTLE_TTL_MS;
    for (const [k, ts] of this.typingThrottleMap) {
      if (ts < stale) this.typingThrottleMap.delete(k);
    }
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
   * Broadcast `typing:stop` for every conversation this socket was actively
   * typing in, then clean up tracking state.
   *
   * `otherSocketIds` — when the disconnecting user still has other connected
   * sockets, pass their IDs here. For each conversation this socket was typing
   * in, if at least one other socket for the same user is ALSO tracked as
   * typing in that conversation the stop broadcast is suppressed: the user is
   * still present and typing on another device, so clients must not clear the
   * indicator prematurely.
   */
  handleSocketDisconnecting(
    socketId: string,
    broadcastFn: (room: string, event: string, data: unknown) => void,
    otherSocketIds?: ReadonlySet<string>
  ): void {
    const typers = this.activeTypers.get(socketId);
    if (typers && typers.length > 0) {
      for (const { conversationId, userId, username, displayName } of typers) {
        if (otherSocketIds && otherSocketIds.size > 0) {
          const anotherIsTyping = [...otherSocketIds].some(sid =>
            (this.activeTypers.get(sid) ?? []).some(t => t.conversationId === conversationId)
          );
          if (anotherIsTyping) continue;
        }
        const room = ROOMS.conversation(conversationId);
        const typingEvent: TypingEvent = { userId, username, displayName, conversationId, isTyping: false };
        broadcastFn(room, SERVER_EVENTS.TYPING_STOP, typingEvent);
      }
      this.activeTypers.delete(socketId);
    }
    const userIdOrToken = this.socketToUser.get(socketId);
    if (userIdOrToken) {
      this.clearTypingThrottle(userIdOrToken);
    }
  }

  private _trackTyping(socketId: string, conversationId: string, userId: string, username: string, displayName: string): void {
    const existing = this.activeTypers.get(socketId) ?? [];
    const filtered = existing.filter(t => t.conversationId !== conversationId);
    this.activeTypers.set(socketId, [...filtered, { conversationId, userId, username, displayName }]);
  }

  private _untrackTyping(socketId: string, conversationId: string): void {
    const existing = this.activeTypers.get(socketId);
    if (!existing) return;
    const filtered = existing.filter(t => t.conversationId !== conversationId);
    if (filtered.length === 0) this.activeTypers.delete(socketId);
    else this.activeTypers.set(socketId, filtered);
  }

  /**
   * Returns the conversations where `userId` was recently typing (throttle
   * map entry exists within TTL) and simultaneously clears those entries so
   * the caller can broadcast `typing:stop` on behalf of a disconnected socket
   * without waiting for the 15-second safety timer on every client.
   *
   * Also returns the cached identity so the caller can compose the stop event
   * without an extra DB round-trip. Returns `null` identity when the user has
   * no cache entry (never typed this session or cache already evicted).
   */
  drainActiveTypingState(userId: string): {
    conversationIds: string[];
    identity: { username: string; displayName: string } | null;
  } {
    const stale = Date.now() - StatusHandler.TYPING_THROTTLE_TTL_MS;
    const conversationIds: string[] = [];
    const prefix = `${userId}:`;
    for (const [key, ts] of this.typingThrottleMap) {
      if (!key.startsWith(prefix)) continue;
      if (ts >= stale) {
        conversationIds.push(key.slice(prefix.length));
      }
      this.typingThrottleMap.delete(key);
    }
    const cacheKey = `user:${userId}`;
    const cached = this.identityCache.get(cacheKey);
    const identity = cached
      ? { username: cached.username, displayName: cached.displayName }
      : null;
    return { conversationIds, identity };
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

    const typingAllowed = await this.rateLimiter.checkLimit(userIdOrToken, SOCKET_RATE_LIMITS.TYPING_INDICATOR);
    if (!typingAllowed) return;

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
      if (this.typingThrottleMap.size > StatusHandler.TYPING_THROTTLE_CLEANUP_SIZE) {
        this._evictStaleThrottleEntries();
      }

      const room = ROOMS.conversation(normalizedId);
      socket.to(room).emit(SERVER_EVENTS.TYPING_START, typingEvent);
      this._trackTyping(socket.id, normalizedId, userId, identity.username, identity.displayName);
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
      this._untrackTyping(socket.id, normalizedId);
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
    if (cached) {
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
      this.identityCache.set(cacheKey, identity);
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
      this.identityCache.set(cacheKey, identity);
      return identity;
    }
  }
}
