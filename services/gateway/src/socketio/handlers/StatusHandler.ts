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
import { resolveParticipant } from '../utils/participant-resolver';
import type { TypingEvent } from '@meeshy/shared/types/socketio-events';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { validateSocketEvent } from '../../middleware/validation.js';
import { SocketTypingSchema } from '../../validation/socket-event-schemas.js';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { getSocketRateLimiter, SOCKET_RATE_LIMITS } from '../../utils/socket-rate-limiter.js';
import { BoundedTtlCache } from '../../utils/bounded-cache.js';
import { getBlockedUserIdsAmong } from '../../utils/blocking';

const logger = enhancedLogger.child({ module: 'StatusHandler' });

export interface StatusHandlerDependencies {
  prisma: PrismaClient;
  statusService: StatusService;
  privacyPreferencesService: PrivacyPreferencesService;
  connectedUsers: Map<string, SocketUser>;
  socketToUser: Map<string, string>;
  /** userId → connected socket ids (multi-device). Optional for back-compat; defaults to empty. */
  userSockets?: Map<string, Set<string>>;
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
  private userSockets: Map<string, Set<string>>;
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
    this.userSockets = deps.userSockets ?? new Map();
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
  async handleSocketDisconnecting(
    socketId: string,
    broadcastFn: (room: string, event: string, data: unknown, exceptSocketIds?: string[]) => void,
    otherSocketIds?: ReadonlySet<string>
  ): Promise<void> {
    const typers = this.activeTypers.get(socketId);
    try {
      if (typers && typers.length > 0) {
        for (const { conversationId, userId, username, displayName } of typers) {
          // Per-conversation isolation: a transient DB failure in the
          // blocked-viewer lookup (or a throwing broadcast) for ONE conversation
          // must not abort the loop — the socket's other typing conversations
          // must still receive their typing:stop, and cleanup below must always
          // run. Mirrors the try/catch in handleTypingStart / handleTypingStop.
          try {
            if (otherSocketIds && otherSocketIds.size > 0) {
              const anotherIsTyping = [...otherSocketIds].some(sid =>
                (this.activeTypers.get(sid) ?? []).some(t => t.conversationId === conversationId)
              );
              if (anotherIsTyping) continue;
            }
            const room = ROOMS.conversation(conversationId);
            const typingEvent: TypingEvent = { userId, username, displayName, conversationId, isTyping: false };
            const blockedSocketIds = await this._getBlockedSocketIdsInRoom(userId, conversationId);
            broadcastFn(room, SERVER_EVENTS.TYPING_STOP, typingEvent, blockedSocketIds.length > 0 ? blockedSocketIds : undefined);
          } catch (error) {
            logger.error('typing:stop broadcast on disconnect failed', { error, socketId, conversationId });
          }
        }
      }
    } finally {
      // Cleanup MUST run even if the loop threw: this handler is fired
      // fire-and-forget (`void ...`) with no .catch at the call site, so an
      // escaping rejection surfaces as a false "unhandled rejection" crash, and
      // a skipped delete leaks the socket's activeTypers entry (memory) while
      // peers keep a phantom "typing…" indicator for a user who has left.
      if (typers && typers.length > 0) {
        this.activeTypers.delete(socketId);
      }
      const userIdOrToken = this.socketToUser.get(socketId);
      if (userIdOrToken) {
        this.clearTypingThrottle(userIdOrToken);
      }
    }
  }

  private _trackTyping(socketId: string, conversationId: string, userId: string, username: string, displayName: string): void {
    const existing = this.activeTypers.get(socketId) ?? [];
    const filtered = existing.filter(t => t.conversationId !== conversationId);
    this.activeTypers.set(socketId, [...filtered, { conversationId, userId, username, displayName }]);
  }

  /**
   * PRIVACY: socket ids to exclude from a typing broadcast — same bidirectional
   * blocking rule already enforced on the presence channel (`_broadcastUserStatus`
   * in MeeshySocketIOManager). Typing is a more sensitive, moment-to-moment signal
   * than presence, so it must not leak to a blocked co-participant either.
   * Anonymous participants (no `userId`) can't block/be blocked — only registered
   * users are considered.
   */
  private async _getBlockedSocketIdsInRoom(userId: string, conversationId: string): Promise<string[]> {
    const participants = await this.prisma.participant.findMany({
      where: { conversationId, isActive: true, userId: { not: null } },
      select: { userId: true }
    });
    const onlineParticipantUserIds = participants
      .map(p => p.userId)
      .filter((id): id is string => !!id && id !== userId && this.connectedUsers.has(id));
    if (onlineParticipantUserIds.length === 0) return [];

    const blockedUserIds = await getBlockedUserIdsAmong(this.prisma, userId, onlineParticipantUserIds);
    if (blockedUserIds.size === 0) return [];

    return [...blockedUserIds].flatMap(id => [...(this.userSockets.get(id) ?? [])]);
  }

  private _untrackTyping(socketId: string, conversationId: string): void {
    const existing = this.activeTypers.get(socketId);
    if (!existing) return;
    const filtered = existing.filter(t => t.conversationId !== conversationId);
    if (filtered.length === 0) this.activeTypers.delete(socketId);
    else this.activeTypers.set(socketId, filtered);
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

      // Every sibling handler (message send, reaction add, location share) verifies
      // the caller is an active participant of the target conversation before
      // broadcasting into its room. typing:start skipped this check, letting any
      // authenticated user — including one removed/banned from the conversation —
      // broadcast their identity into a room they don't belong to.
      const participant = await resolveParticipant({
        prisma: this.prisma,
        userIdOrToken,
        conversationId: normalizedId,
        connectedUsers: this.connectedUsers,
      });
      if (!participant) {
        logger.warn('typing:start — not a participant in conversation', { userId, conversationId: normalizedId });
        return;
      }

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

      // Track THIS socket as typing before the emit-throttle gate below. The
      // throttle is keyed per (user, conversation) — shared across all of the
      // user's devices — so a second device that starts typing within the
      // window is throttled out of BROADCASTING. But it is still genuinely
      // typing, and `handleSocketDisconnecting`'s multi-device suppression
      // relies on every typing socket being present in `activeTypers` to avoid
      // emitting a premature typing:stop when one device drops. Tracking after
      // the throttle return left that second device untracked, so an unrelated
      // device dropping cleared the indicator while the user was still typing.
      // `_trackTyping` is idempotent per (socket, conversation), so running it
      // on every start — throttled or not — is safe.
      this._trackTyping(socket.id, normalizedId, userId, identity.username, identity.displayName);

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
      const blockedSocketIds = await this._getBlockedSocketIdsInRoom(userId, normalizedId);
      const emitter = blockedSocketIds.length > 0 ? socket.to(room).except(blockedSocketIds) : socket.to(room);
      emitter.emit(SERVER_EVENTS.TYPING_START, typingEvent);
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

      const participant = await resolveParticipant({
        prisma: this.prisma,
        userIdOrToken,
        conversationId: normalizedId,
        connectedUsers: this.connectedUsers,
      });
      if (!participant) {
        logger.warn('typing:stop — not a participant in conversation', { userId, conversationId: normalizedId });
        return;
      }

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

      // Multi-device suppression: the typing indicator is a per-USER signal
      // (peers render one "Alice is typing…" per user, not per device). If the
      // same user is still tracked as typing on ANOTHER socket in this
      // conversation, an explicit stop from this device must NOT retract the
      // indicator peers still owe to the other device. Mirrors the disconnect
      // guard in `handleSocketDisconnecting`; without it, a second device that
      // started typing within the shared 2s throttle window (tracked but not
      // re-broadcast) has its "still typing" state wrongly cleared.
      const anotherIsTyping = [...(this.userSockets.get(userId) ?? [])].some(
        sid => sid !== socket.id &&
          (this.activeTypers.get(sid) ?? []).some(t => t.conversationId === normalizedId)
      );
      if (!anotherIsTyping) {
        const room = ROOMS.conversation(normalizedId);
        const blockedSocketIds = await this._getBlockedSocketIdsInRoom(userId, normalizedId);
        const emitter = blockedSocketIds.length > 0 ? socket.to(room).except(blockedSocketIds) : socket.to(room);
        emitter.emit(SERVER_EVENTS.TYPING_STOP, typingEvent);
      }
      this._untrackTyping(socket.id, normalizedId);
      // An explicit stop ends the typing burst, so drop the throttle window for
      // this (user, conversation): the next typing:start is a NEW burst and must
      // not be swallowed by the 2s coalescing guard (start→stop→start is the
      // common "send a message then immediately type the next" flow).
      this.typingThrottleMap.delete(`${userId}:${normalizedId}`);
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
