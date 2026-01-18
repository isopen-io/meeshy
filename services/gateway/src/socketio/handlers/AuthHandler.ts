/**
 * Authentication Handler
 * Gère l'authentification des sockets (JWT et session tokens)
 */

import type { Socket } from 'socket.io';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { StatusService } from '../../services/StatusService';
import { extractJWTToken, extractSessionToken, type SocketUser } from '../utils/socket-helpers';
import jwt from 'jsonwebtoken';

export interface AuthHandlerDependencies {
  prisma: PrismaClient;
  statusService: StatusService;
  connectedUsers: Map<string, SocketUser>;
  socketToUser: Map<string, string>;
  userSockets: Map<string, Set<string>>;
}

export class AuthHandler {
  private prisma: PrismaClient;
  private statusService: StatusService;
  private connectedUsers: Map<string, SocketUser>;
  private socketToUser: Map<string, string>;
  private userSockets: Map<string, Set<string>>;

  constructor(deps: AuthHandlerDependencies) {
    this.prisma = deps.prisma;
    this.statusService = deps.statusService;
    this.connectedUsers = deps.connectedUsers;
    this.socketToUser = deps.socketToUser;
    this.userSockets = deps.userSockets;
  }

  /**
   * Authentification automatique via token JWT
   */
  async handleTokenAuthentication(socket: Socket): Promise<void> {
    try {
      const token = extractJWTToken(socket);
      const sessionToken = extractSessionToken(socket);

      if (!token && !sessionToken) {
        console.warn(`[AUTH] ⚠️  Socket ${socket.id} sans token (ni JWT ni session)`);
        return;
      }

      // Utilisateur anonyme avec sessionToken
      if (sessionToken && !token) {
        await this._authenticateAnonymousUser(socket, sessionToken);
        return;
      }

      // Utilisateur authentifié avec JWT
      if (token) {
        await this._authenticateJWTUser(socket, token);
        return;
      }
    } catch (error) {
      console.error('[AUTH] ❌ Erreur authentification automatique:', error);
      socket.emit('error', { message: 'Authentication failed' });
    }
  }

  /**
   * Authentification manuelle (fallback)
   */
  async handleManualAuthentication(
    socket: Socket,
    data: { userId?: string; sessionToken?: string; language?: string }
  ): Promise<void> {
    try {
      const { userId, sessionToken, language } = data;

      if (!userId && !sessionToken) {
        socket.emit('error', { message: 'userId or sessionToken required' });
        return;
      }

      // Cas utilisateur anonyme
      if (sessionToken && !userId) {
        await this._authenticateAnonymousUser(socket, sessionToken, language);
        return;
      }

      // Cas utilisateur authentifié
      if (userId) {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, systemLanguage: true }
        });

        if (!user) {
          socket.emit('error', { message: 'User not found' });
          return;
        }

        const socketUser: SocketUser = {
          id: user.id,
          socketId: socket.id,
          isAnonymous: false,
          language: language || user.systemLanguage || 'en'
        };

        this._registerUser(user.id, socketUser, socket);
        socket.emit('authenticated', { userId: user.id, isAnonymous: false });

        // Mettre à jour le statut
        await this.statusService.updateLastSeen(user.id, false);
      }
    } catch (error) {
      console.error('[AUTH] ❌ Erreur authentification manuelle:', error);
      socket.emit('error', { message: 'Authentication failed' });
    }
  }

  /**
   * Authentification utilisateur JWT
   */
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
      socket.emit('error', { message: 'User not found' });
      return;
    }

    const socketUser: SocketUser = {
      id: user.id,
      socketId: socket.id,
      isAnonymous: false,
      language: user.systemLanguage || 'en'
    };

    this._registerUser(user.id, socketUser, socket);
    socket.emit('authenticated', { userId: user.id, isAnonymous: false });

    await this.statusService.updateLastSeen(user.id, false);
  }

  /**
   * Authentification utilisateur anonyme
   */
  private async _authenticateAnonymousUser(
    socket: Socket,
    sessionToken: string,
    language?: string
  ): Promise<void> {
    const anonymousUser = await this.prisma.anonymousParticipant.findUnique({
      where: { sessionToken },
      select: { id: true, sessionToken: true }
    });

    if (!anonymousUser) {
      socket.emit('error', { message: 'Anonymous session not found' });
      return;
    }

    const socketUser: SocketUser = {
      id: anonymousUser.id,
      socketId: socket.id,
      isAnonymous: true,
      language: language || 'en',
      sessionToken: anonymousUser.sessionToken
    };

    this._registerUser(sessionToken, socketUser, socket);
    socket.emit('authenticated', {
      userId: anonymousUser.id,
      isAnonymous: true,
      sessionToken: anonymousUser.sessionToken
    });

    await this.statusService.updateLastSeen(anonymousUser.id, true);
  }

  /**
   * Enregistre un utilisateur dans les maps de connexion
   */
  private _registerUser(key: string, user: SocketUser, socket: Socket): void {
    this.connectedUsers.set(key, user);
    this.socketToUser.set(socket.id, key);

    const userSocketsSet = this.userSockets.get(user.id) || new Set();
    userSocketsSet.add(socket.id);
    this.userSockets.set(user.id, userSocketsSet);

    console.log(`[AUTH] ✅ User ${user.id} authenticated (anonymous: ${user.isAnonymous})`);
  }

  /**
   * Déconnexion et nettoyage
   */
  handleDisconnection(socket: Socket): void {
    const userIdOrToken = this.socketToUser.get(socket.id);
    if (!userIdOrToken) return;

    const user = this.connectedUsers.get(userIdOrToken);
    if (user) {
      const socketSet = this.userSockets.get(user.id);
      if (socketSet) {
        socketSet.delete(socket.id);
        if (socketSet.size === 0) {
          this.userSockets.delete(user.id);
          // L'utilisateur n'a plus aucune connexion active
          this.statusService.updateLastSeen(user.id, user.isAnonymous);
        }
      }
    }

    this.connectedUsers.delete(userIdOrToken);
    this.socketToUser.delete(socket.id);

    console.log(`[AUTH] 👋 Socket ${socket.id} disconnected`);
  }
}
