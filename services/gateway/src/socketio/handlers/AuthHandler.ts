import type { Socket } from 'socket.io';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { StatusService } from '../../services/StatusService';
import { MaintenanceService } from '../../services/MaintenanceService';
import { CallService } from '../../services/CallService';
import { hashSessionToken } from '../../utils/session-token';
import { extractJWTToken, extractSessionToken, type SocketUser } from '../utils/socket-helpers';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import jwt from 'jsonwebtoken';
import { validateSocketEvent } from '../../middleware/validation.js';
import { SocketAuthenticateSchema } from '../../validation/socket-event-schemas.js';
import { getSocketRateLimiter, SOCKET_RATE_LIMITS } from '../../utils/socket-rate-limiter.js';
import { resolveUserLanguagesOrdered } from '@meeshy/shared/utils/conversation-helpers';
import { enhancedLogger } from '../../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'AuthHandler' });

export interface AuthHandlerDependencies {
  prisma: PrismaClient;
  statusService: StatusService;
  maintenanceService: MaintenanceService;
  callService: CallService;
  connectedUsers: Map<string, SocketUser>;
  socketToUser: Map<string, string>;
  userSockets: Map<string, Set<string>>;
  /**
   * Callback fourni par MeeshySocketIOManager pour émettre le snapshot de présence
   * juste après que l'utilisateur a joint ses conversations. Reçoit le socket + le userId
   * du nouvel arrivant. Si null/undefined, le snapshot est silencieusement skippé
   * (rétrocompat).
   */
  emitPresenceSnapshot?: (socket: Socket, userId: string, isAnonymous: boolean) => Promise<void>;
}

export class AuthHandler {
  private prisma: PrismaClient;
  private statusService: StatusService;
  private maintenanceService: MaintenanceService;
  private callService: CallService;
  private connectedUsers: Map<string, SocketUser>;
  private socketToUser: Map<string, string>;
  private userSockets: Map<string, Set<string>>;
  private emitPresenceSnapshot?: (socket: Socket, userId: string, isAnonymous: boolean) => Promise<void>;

  constructor(deps: AuthHandlerDependencies) {
    this.prisma = deps.prisma;
    this.statusService = deps.statusService;
    this.maintenanceService = deps.maintenanceService;
    this.callService = deps.callService;
    this.connectedUsers = deps.connectedUsers;
    this.socketToUser = deps.socketToUser;
    this.userSockets = deps.userSockets;
    this.emitPresenceSnapshot = deps.emitPresenceSnapshot;
  }

  async handleTokenAuthentication(socket: Socket): Promise<void> {
    try {
      const token = extractJWTToken(socket);
      const sessionToken = extractSessionToken(socket);

      if (!token && !sessionToken) {
        logger.warn('socket sans token — déconnexion dans 10s si non authentifié', { socketId: socket.id });
        const authTimeout = setTimeout(() => {
          if (!this.socketToUser.has(socket.id)) {
            logger.warn('socket toujours non authentifié après 10s — déconnexion', { socketId: socket.id });
            socket.disconnect(true);
          }
        }, 10_000);
        socket.on('disconnect', () => clearTimeout(authTimeout));
        return;
      }

      if (sessionToken && !token) {
        await this._authenticateAnonymousUser(socket, sessionToken);
        return;
      }

      if (token) {
        await this._authenticateJWTUser(socket, token);
        return;
      }
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        logger.info('token expired on socket connect', { socketId: socket.id });
        socket.emit(SERVER_EVENTS.AUTH_TOKEN_EXPIRED, { code: 'token_expired', message: 'JWT token has expired' });
        socket.disconnect(true);
        return;
      }
      logger.error('erreur authentification automatique', { error });
      socket.emit(SERVER_EVENTS.ERROR, { message: 'Authentication failed' });
      socket.disconnect(true);
    }
  }

  async handleManualAuthentication(
    socket: Socket,
    data: { userId?: string; sessionToken?: string; language?: string; token?: string }
  ): Promise<void> {
    try {
      const schemaValidation = validateSocketEvent(SocketAuthenticateSchema, data);
      if (schemaValidation.success === false) {
        socket.emit(SERVER_EVENTS.ERROR, { message: schemaValidation.error });
        return;
      }
      const validated = schemaValidation.data;

      // Rate-limit auth attempts by IP to prevent credential stuffing.
      // Key: socket IP so the limit spans multiple socket connections from the same host.
      const clientIp = socket.handshake.address ?? socket.id;
      const rateLimiter = getSocketRateLimiter();
      const allowed = await rateLimiter.checkLimit(clientIp, SOCKET_RATE_LIMITS.SOCKET_AUTH);
      if (!allowed) {
        logger.warn('socket auth rate limit exceeded', { ip: clientIp, socketId: socket.id });
        socket.emit(SERVER_EVENTS.ERROR, { message: 'Too many authentication attempts. Please wait before retrying.', code: 'RATE_LIMIT_EXCEEDED' });
        socket.disconnect(true);
        return;
      }

      const { sessionToken, language, token } = validated;

      if (!token && !sessionToken) {
        socket.emit(SERVER_EVENTS.ERROR, { message: 'token or sessionToken required' });
        return;
      }

      if (sessionToken && !token) {
        await this._authenticateAnonymousUser(socket, sessionToken, language);
        return;
      }

      if (token) {
        await this._authenticateJWTUser(socket, token);
        return;
      }
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        logger.info('token expired on manual auth', { socketId: socket.id });
        socket.emit(SERVER_EVENTS.AUTH_TOKEN_EXPIRED, { code: 'token_expired', message: 'JWT token has expired' });
        socket.disconnect(true);
        return;
      }
      logger.error('erreur authentification manuelle', { error });
      socket.emit(SERVER_EVENTS.ERROR, { message: 'Authentication failed' });
      socket.disconnect(true);
    }
  }

  private async _authenticateJWTUser(socket: Socket, token: string): Promise<void> {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error('JWT_SECRET non configuré');
    }

    const decoded = jwt.verify(token, jwtSecret) as { userId: string };
    const userId = decoded.userId;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        systemLanguage: true,
        regionalLanguage: true,
        customDestinationLanguage: true,
        deviceLocale: true,
      }
    });

    if (!user) {
      socket.emit(SERVER_EVENTS.ERROR, { message: 'User not found' });
      socket.disconnect(true);
      return;
    }

    const resolvedLanguages = resolveUserLanguagesOrdered(user, {
      deviceLocale: user.deviceLocale ?? undefined,
    });

    const socketUser: SocketUser = {
      id: user.id,
      socketId: socket.id,
      isAnonymous: false,
      language: user.systemLanguage || 'en',
      resolvedLanguages,
      userId: user.id
    };

    this._registerUser(user.id, socketUser, socket);

    try {
      if (user.id && typeof user.id === 'string') {
        await Promise.allSettled([
          socket.join(ROOMS.user(user.id)),
          socket.join(ROOMS.feed(user.id)),
        ]);
      }
    } catch (error) {
      logger.error('failed to join personal rooms (JWT auth)', { userId: user.id, error });
    }

    this.statusService.markConnected(user.id, false);
    await this.maintenanceService.updateUserOnlineStatus(user.id, true, true);
    await this._joinUserConversations(socket, user.id, false);

    try {
      await socket.join('conversation:any');
    } catch (error) {
      logger.debug('failed to join conversation:any room (JWT auth)', { userId: user.id, error });
    }

    socket.emit(SERVER_EVENTS.AUTHENTICATED, {
      success: true,
      user: { id: user.id, language: socketUser.language, isAnonymous: false },
      version: process.env.APP_VERSION || '1.1.0'
    });

    // Snapshot de présence: même traitement que l'auth manuelle (l.170) et
    // anonyme (l.307). Sans ça, un utilisateur enregistré authentifié via le
    // handshake automatique ne reçoit jamais le seed initial et voit ses
    // contacts hors ligne jusqu'au premier changement d'état. Best-effort.
    if (this.emitPresenceSnapshot) {
      this.emitPresenceSnapshot(socket, user.id, false).catch(error => {
        logger.error('failed to emit presence snapshot (JWT auth)', { userId: user.id, error });
      });
    }
  }

  private async _authenticateAnonymousUser(
    socket: Socket,
    sessionToken: string,
    language?: string
  ): Promise<void> {
    const tokenHash = hashSessionToken(sessionToken);

    const participant = await this.prisma.participant.findFirst({
      where: {
        sessionTokenHash: tokenHash,
        type: 'anonymous',
        isActive: true
      },
      select: {
        id: true,
        displayName: true,
        language: true,
        conversationId: true
      }
    });

    if (!participant) {
      socket.emit(SERVER_EVENTS.ERROR, { message: 'Anonymous session not found' });
      socket.disconnect(true);
      return;
    }

    const socketUser: SocketUser = {
      id: participant.id,
      socketId: socket.id,
      isAnonymous: true,
      language: language || participant.language || 'en',
      resolvedLanguages: [],
      participantId: participant.id,
      displayName: participant.displayName,
      sessionToken
    };

    this._registerUser(participant.id, socketUser, socket);

    try {
      if (socketUser.id && typeof socketUser.id === 'string') {
        await socket.join(socketUser.id);
      }
    } catch (error) {
      logger.error('failed to join personal room for anonymous user', { anonymousId: socketUser.id, error });
    }

    await this.maintenanceService.updateAnonymousOnlineStatus(socketUser.id, true, true);

    try {
      await socket.join(ROOMS.conversation(participant.conversationId));
    } catch (error) {
      logger.warn('failed to join conversation room for anonymous user — messages may not be received', {
        anonymousId: socketUser.id,
        conversationId: participant.conversationId,
        error,
      });
    }

    socket.emit(SERVER_EVENTS.AUTHENTICATED, {
      success: true,
      user: { id: socketUser.id, language: socketUser.language, isAnonymous: true },
      version: process.env.APP_VERSION || '1.1.0'
    });

    // Snapshot de présence pour les anonymes aussi (autres participants de la conversation)
    if (this.emitPresenceSnapshot) {
      this.emitPresenceSnapshot(socket, socketUser.id, true).catch(error => {
        logger.error('failed to emit presence snapshot for anonymous', { anonymousId: socketUser.id, error });
      });
    }
  }

  private _registerUser(key: string, user: SocketUser, socket: Socket): void {
    this.connectedUsers.set(key, user);
    this.socketToUser.set(socket.id, key);

    const userSocketsSet = this.userSockets.get(user.id) || new Set();
    userSocketsSet.add(socket.id);
    this.userSockets.set(user.id, userSocketsSet);

    logger.info('user authenticated', { userId: user.id, isAnonymous: user.isAnonymous });
  }

  async handleDisconnection(socket: Socket): Promise<void> {
    const userIdOrToken = this.socketToUser.get(socket.id);
    if (!userIdOrToken) return;
    logger.debug('socket disconnected', { socketId: socket.id, userId: userIdOrToken });

    const user = this.connectedUsers.get(userIdOrToken);
    const isAnonymous = user?.isAnonymous || false;

    const socketSet = this.userSockets.get(userIdOrToken);
    if (socketSet) {
      socketSet.delete(socket.id);
    }
    this.socketToUser.delete(socket.id);

    const remainingSockets = this.userSockets.get(userIdOrToken);
    const hasRemainingSockets = remainingSockets && remainingSockets.size > 0;

    if (hasRemainingSockets) {
      const nextSocketId = remainingSockets.values().next().value;
      const currentUser = this.connectedUsers.get(userIdOrToken);
      if (currentUser && nextSocketId) {
        this.connectedUsers.set(userIdOrToken, { ...currentUser, socketId: nextSocketId });
      }
      return;
    }

    this.userSockets.delete(userIdOrToken);
    this.statusService.markDisconnected(userIdOrToken, isAnonymous);

    // CALL-RESILIENCE — call lifecycle on disconnect is owned by
    // CallEventsHandler's per-socket disconnect handler (reconnect grace for
    // answered calls, immediate leave pre-answer, shutdown guard). Leaving
    // calls here too marked answered CallSessions ended in DB while their P2P
    // media was still alive (socket blip / gateway restart on a single-device
    // user), defeating that grace window. Anonymous participants are the one
    // case that handler cannot resolve (its lookup is keyed on
    // participant.userId) and they get no reconnect grace (ADR-6) — the
    // immediate auto-leave stays for them only.
    if (isAnonymous) {
      try {
        const activeParticipations = await this.prisma.callParticipant.findMany({
          where: {
            // Audit C5 (2026-07-02) — `{leftAt: null}` alone misses Mongo docs
            // whose leftAt field was never written (pre-C5 participants).
            OR: [{ leftAt: null }, { leftAt: { isSet: false } }],
            participant: { id: userIdOrToken }
          },
          include: {
            callSession: true
          }
        });

        if (activeParticipations.length > 0) {
          logger.debug('disconnect-cleanup: active call participations found', {
            socketId: socket.id,
            userId: userIdOrToken,
            count: activeParticipations.length,
            callIds: activeParticipations.map((p: { callSessionId: string }) => p.callSessionId)
          });
        }

        for (const participation of activeParticipations) {
          try {
            await this.callService.leaveCall({
              callId: participation.callSessionId,
              userId: userIdOrToken,
              participantId: participation.participantId
            });
          } catch (error) {
            logger.error('error auto-leaving call on disconnect', { callId: participation.callSessionId, error });
          }
        }
      } catch (error) {
        logger.error('error checking/leaving active calls on disconnect', { userId: userIdOrToken, error });
      }
    }

    // Guard: a new socket may have reconnected while async cleanup was in progress.
    // Only delete the connectedUsers entry if no new sockets exist for this user.
    const stillHasSockets = (this.userSockets.get(userIdOrToken)?.size ?? 0) > 0;
    if (!stillHasSockets) {
      this.connectedUsers.delete(userIdOrToken);
    }

    try {
      if (isAnonymous) {
        await this.maintenanceService.updateAnonymousOnlineStatus(userIdOrToken, false, true);
      } else {
        await this.maintenanceService.updateUserOnlineStatus(userIdOrToken, false, true);
      }
    } catch (error) {
      logger.error('error updating offline status on disconnect', { userId: userIdOrToken, error });
    }
  }

  async handleHeartbeat(socket: Socket, data?: { clientTime?: number }): Promise<void> {
    const userIdOrToken = this.socketToUser.get(socket.id);
    if (!userIdOrToken) return;

    const serverTime = new Date().toISOString();
    const latencyHintMs = data?.clientTime !== undefined
      ? Date.now() - data.clientTime
      : undefined;

    // Emit ACK before the async DB write so clients get RTT data immediately
    socket.emit(SERVER_EVENTS.HEARTBEAT_ACK, { serverTime, latencyHintMs });

    try {
      const user = this.connectedUsers.get(userIdOrToken);
      if (!user) return;

      this.statusService.updateLastSeen(userIdOrToken, user.isAnonymous);

      if (!user.isAnonymous) {
        await this.prisma.user.update({
          where: { id: userIdOrToken },
          data: { lastActiveAt: new Date() }
        });
      }
    } catch (error) {
      logger.debug('heartbeat DB update failed (best-effort)', { userId: userIdOrToken, error });
    }
  }

  private async _joinUserConversations(socket: Socket, userId: string, isAnonymous: boolean): Promise<void> {
    try {
      let conversations: { conversationId: string }[] = [];

      if (isAnonymous) {
        conversations = await this.prisma.participant.findMany({
          where: { id: userId, isActive: true },
          select: { conversationId: true }
        });
      } else {
        conversations = await this.prisma.participant.findMany({
          where: { userId: userId, isActive: true },
          select: { conversationId: true }
        });
      }

      const joinResults = await Promise.allSettled(conversations.map(conv => socket.join(ROOMS.conversation(conv.conversationId))));
      const failedJoins = joinResults.filter(r => r.status === 'rejected');
      if (failedJoins.length > 0) {
        logger.warn('some conversation room joins failed', { userId, failed: failedJoins.length, total: conversations.length });
      }
      logger.debug('user joined conversation rooms', { userId, count: conversations.length - failedJoins.length });
    } catch (error) {
      logger.error('error joining conversations for user', { userId, error });
    }
  }
}
