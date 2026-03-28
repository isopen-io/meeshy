import type { Socket } from 'socket.io';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { StatusService } from '../../services/StatusService';
import { MaintenanceService } from '../../services/MaintenanceService';
import { CallService } from '../../services/CallService';
import { hashSessionToken } from '../../utils/session-token';
import { extractJWTToken, extractSessionToken, type SocketUser } from '../utils/socket-helpers';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import jwt from 'jsonwebtoken';

export interface AuthHandlerDependencies {
  prisma: PrismaClient;
  statusService: StatusService;
  maintenanceService: MaintenanceService;
  callService: CallService;
  connectedUsers: Map<string, SocketUser>;
  socketToUser: Map<string, string>;
  userSockets: Map<string, Set<string>>;
}

export class AuthHandler {
  private prisma: PrismaClient;
  private statusService: StatusService;
  private maintenanceService: MaintenanceService;
  private callService: CallService;
  private connectedUsers: Map<string, SocketUser>;
  private socketToUser: Map<string, string>;
  private userSockets: Map<string, Set<string>>;

  constructor(deps: AuthHandlerDependencies) {
    this.prisma = deps.prisma;
    this.statusService = deps.statusService;
    this.maintenanceService = deps.maintenanceService;
    this.callService = deps.callService;
    this.connectedUsers = deps.connectedUsers;
    this.socketToUser = deps.socketToUser;
    this.userSockets = deps.userSockets;
  }

  async handleTokenAuthentication(socket: Socket): Promise<void> {
    try {
      const token = extractJWTToken(socket);
      const sessionToken = extractSessionToken(socket);

      if (!token && !sessionToken) {
        console.warn(`[AUTH] ⚠️  Socket ${socket.id} sans token (ni JWT ni session)`);
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
      console.error('[AUTH] ❌ Erreur authentification automatique:', error);
      socket.emit(SERVER_EVENTS.ERROR, { message: 'Authentication failed' });
    }
  }

  async handleManualAuthentication(
    socket: Socket,
    data: { userId?: string; sessionToken?: string; language?: string }
  ): Promise<void> {
    try {
      const { userId, sessionToken, language } = data;

      if (!userId && !sessionToken) {
        socket.emit(SERVER_EVENTS.ERROR, { message: 'userId or sessionToken required' });
        return;
      }

      if (sessionToken && !userId) {
        await this._authenticateAnonymousUser(socket, sessionToken, language);
        return;
      }

      if (userId) {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, systemLanguage: true }
        });

        if (!user) {
          socket.emit(SERVER_EVENTS.ERROR, { message: 'User not found' });
          return;
        }

        const socketUser: SocketUser = {
          id: user.id,
          socketId: socket.id,
          isAnonymous: false,
          language: language || user.systemLanguage || 'en',
          userId: user.id
        };

        this._registerUser(user.id, socketUser, socket);

        try {
          if (user.id && typeof user.id === 'string') {
            socket.join(user.id);
            socket.join(ROOMS.user(user.id));
            socket.join(ROOMS.feed(user.id));
          }
        } catch (error) {
          console.error(`[AUTH] Failed to join personal rooms for user ${user.id}:`, error);
        }

        this.statusService.markConnected(user.id, false);
        await this.maintenanceService.updateUserOnlineStatus(user.id, true, true);
        await this._joinUserConversations(socket, user.id, false);

        try {
          socket.join('conversation:any');
        } catch {}

        socket.emit(SERVER_EVENTS.AUTHENTICATED, {
          success: true,
          user: { id: user.id, language: socketUser.language, isAnonymous: false },
          version: process.env.APP_VERSION || '1.1.0'
        });
      }
    } catch (error) {
      console.error('[AUTH] ❌ Erreur authentification manuelle:', error);
      socket.emit(SERVER_EVENTS.ERROR, { message: 'Authentication failed' });
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
      select: { id: true, systemLanguage: true }
    });

    if (!user) {
      socket.emit(SERVER_EVENTS.ERROR, { message: 'User not found' });
      return;
    }

    const socketUser: SocketUser = {
      id: user.id,
      socketId: socket.id,
      isAnonymous: false,
      language: user.systemLanguage || 'en',
      userId: user.id
    };

    this._registerUser(user.id, socketUser, socket);

    try {
      if (user.id && typeof user.id === 'string') {
        socket.join(user.id);
        socket.join(ROOMS.user(user.id));
        socket.join(ROOMS.feed(user.id));
      }
    } catch (error) {
      console.error(`[AUTH] Failed to join personal rooms for user ${user.id}:`, error);
    }

    this.statusService.markConnected(user.id, false);
    await this.maintenanceService.updateUserOnlineStatus(user.id, true, true);
    await this._joinUserConversations(socket, user.id, false);

    try {
      socket.join('conversation:any');
    } catch {}

    socket.emit(SERVER_EVENTS.AUTHENTICATED, {
      success: true,
      user: { id: user.id, language: socketUser.language, isAnonymous: false },
      version: process.env.APP_VERSION || '1.1.0'
    });
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
      return;
    }

    const socketUser: SocketUser = {
      id: participant.id,
      socketId: socket.id,
      isAnonymous: true,
      language: language || participant.language || 'en',
      participantId: participant.id,
      displayName: participant.displayName,
      sessionToken
    };

    this._registerUser(participant.id, socketUser, socket);

    try {
      if (socketUser.id && typeof socketUser.id === 'string') {
        socket.join(socketUser.id);
      }
    } catch (error) {
      console.error(`[AUTH] Failed to join personal room for anonymous user ${socketUser.id}:`, error);
    }

    await this.maintenanceService.updateAnonymousOnlineStatus(socketUser.id, true, true);

    try {
      socket.join(ROOMS.conversation(participant.conversationId));
    } catch {}

    socket.emit(SERVER_EVENTS.AUTHENTICATED, {
      success: true,
      user: { id: socketUser.id, language: socketUser.language, isAnonymous: true },
      version: process.env.APP_VERSION || '1.1.0'
    });
  }

  private _registerUser(key: string, user: SocketUser, socket: Socket): void {
    this.connectedUsers.set(key, user);
    this.socketToUser.set(socket.id, key);

    const userSocketsSet = this.userSockets.get(user.id) || new Set();
    userSocketsSet.add(socket.id);
    this.userSockets.set(user.id, userSocketsSet);

    console.log(`[AUTH] ✅ User ${user.id} authenticated (anonymous: ${user.isAnonymous})`);
  }

  async handleDisconnection(socket: Socket): Promise<void> {
    const userIdOrToken = this.socketToUser.get(socket.id);
    if (!userIdOrToken) return;

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

    try {
      const activeParticipations = await this.prisma.callParticipant.findMany({
        where: {
          leftAt: null,
          participant: isAnonymous
            ? { id: userIdOrToken }
            : { userId: userIdOrToken }
        },
        include: {
          callSession: true
        }
      });

      for (const participation of activeParticipations) {
        try {
          await this.callService.leaveCall({
            callId: participation.callSessionId,
            userId: userIdOrToken,
            participantId: participation.participantId
          });
        } catch (error) {
          console.error(`[AUTH] Error auto-leaving call ${participation.callSessionId}:`, error);
        }
      }
    } catch (error) {
      console.error(`[AUTH] Error checking/leaving active calls for user ${userIdOrToken}:`, error);
    }

    this.connectedUsers.delete(userIdOrToken);

    try {
      if (isAnonymous) {
        await this.maintenanceService.updateAnonymousOnlineStatus(userIdOrToken, false, true);
      } else {
        await this.maintenanceService.updateUserOnlineStatus(userIdOrToken, false, true);
      }
    } catch (error) {
      console.error(`[AUTH] Error updating offline status for ${userIdOrToken}:`, error);
    }
  }

  async handleHeartbeat(socket: Socket): Promise<void> {
    const userIdOrToken = this.socketToUser.get(socket.id);
    if (!userIdOrToken) return;

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
    } catch {}
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

      for (const conv of conversations) {
        socket.join(ROOMS.conversation(conv.conversationId));
      }
    } catch (error) {
      console.error(`[AUTH] Error joining conversations for ${userId}:`, error);
    }
  }
}
