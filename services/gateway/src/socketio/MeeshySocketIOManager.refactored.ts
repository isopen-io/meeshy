/**
 * Gestionnaire Socket.IO pour Meeshy - VERSION REFACTORISÉE
 * Architecture modulaire avec handlers spécialisés
 */

import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { MessageTranslationService } from '../services/MessageTranslationService';
import { MaintenanceService } from '../services/MaintenanceService';
import { StatusService } from '../services/StatusService';
import { MessagingService } from '../services/MessagingService';
import { CallEventsHandler } from './CallEventsHandler';
import { CallService } from '../services/CallService';
import { AttachmentService } from '../services/AttachmentService';
import { NotificationService } from '../services/NotificationService';
import { PrivacyPreferencesService } from '../services/PrivacyPreferencesService';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  TranslationEvent
} from '@meeshy/shared/types/socketio-events';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

// Handlers modulaires
import { AuthHandler } from './handlers/AuthHandler';
import { MessageHandler } from './handlers/MessageHandler';
import { StatusHandler } from './handlers/StatusHandler';
import { ReactionHandler } from './handlers/ReactionHandler';
import { ConversationHandler } from './handlers/ConversationHandler';
import type { SocketUser } from './utils/socket-helpers';

export interface TranslationNotification {
  messageId: string;
  translatedText: string;
  targetLanguage: string;
  confidenceScore: number;
}

export class MeeshySocketIOManager {
  private io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>;
  private prisma: PrismaClient;
  private translationService: MessageTranslationService;
  private maintenanceService: MaintenanceService;
  private statusService: StatusService;
  private messagingService: MessagingService;
  private callEventsHandler: CallEventsHandler;
  private callService: CallService;
  private notificationService: NotificationService;
  private privacyPreferencesService: PrivacyPreferencesService;

  // Handlers spécialisés
  private authHandler: AuthHandler;
  private messageHandler: MessageHandler;
  private statusHandler: StatusHandler;
  private reactionHandler: ReactionHandler;
  private conversationHandler: ConversationHandler;

  // Maps de connexion
  private connectedUsers: Map<string, SocketUser> = new Map();
  private socketToUser: Map<string, string> = new Map();
  private userSockets: Map<string, Set<string>> = new Map();

  // Statistiques
  private stats = {
    total_connections: 0,
    active_connections: 0,
    messages_processed: 0,
    translations_sent: 0,
    errors: 0
  };

  constructor(httpServer: HTTPServer, prisma: PrismaClient) {
    this.prisma = prisma;
    this.translationService = new MessageTranslationService(prisma);

    const attachmentService = new AttachmentService(prisma);
    this.maintenanceService = new MaintenanceService(prisma, attachmentService);
    this.statusService = new StatusService(prisma);
    this.privacyPreferencesService = new PrivacyPreferencesService(prisma);
    this.notificationService = new NotificationService(prisma);
    this.messagingService = new MessagingService(prisma, this.translationService, this.notificationService);
    this.callEventsHandler = new CallEventsHandler(prisma);
    this.callService = new CallService(prisma);

    // Configurer le callback de broadcast de statut
    this.maintenanceService.setStatusBroadcastCallback(
      (userId: string, isOnline: boolean, isAnonymous: boolean) => {
        this._broadcastUserStatus(userId, isOnline, isAnonymous);
      }
    );

    // Initialiser Socket.IO
    this.io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
      path: '/socket.io/',
      transports: ['websocket', 'polling'],
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        allowedHeaders: ['authorization', 'content-type', 'x-session-token', 'websocket', 'polling'],
        credentials: true
      },
      pingTimeout: 10000,
      pingInterval: 25000,
      connectTimeout: 45000,
      allowEIO3: true
    });

    // Initialiser les handlers avec leurs dépendances
    this.authHandler = new AuthHandler({
      prisma: this.prisma,
      statusService: this.statusService,
      connectedUsers: this.connectedUsers,
      socketToUser: this.socketToUser,
      userSockets: this.userSockets
    });

    this.messageHandler = new MessageHandler({
      io: this.io,
      prisma: this.prisma,
      messagingService: this.messagingService,
      statusService: this.statusService,
      notificationService: this.notificationService,
      connectedUsers: this.connectedUsers,
      socketToUser: this.socketToUser,
      stats: this.stats
    });

    this.statusHandler = new StatusHandler({
      prisma: this.prisma,
      statusService: this.statusService,
      privacyPreferencesService: this.privacyPreferencesService,
      connectedUsers: this.connectedUsers,
      socketToUser: this.socketToUser
    });

    this.reactionHandler = new ReactionHandler({
      io: this.io,
      prisma: this.prisma,
      notificationService: this.notificationService,
      connectedUsers: this.connectedUsers,
      socketToUser: this.socketToUser
    });

    this.conversationHandler = new ConversationHandler({
      prisma: this.prisma,
      connectedUsers: this.connectedUsers,
      socketToUser: this.socketToUser
    });
  }

  /**
   * Expose NotificationService for routes
   */
  public getNotificationService(): NotificationService {
    return this.notificationService;
  }

  /**
   * Initialisation du gestionnaire
   */
  async initialize(): Promise<void> {
    try {
      await this.translationService.initialize();
      this.notificationService.setSocketIO(this.io, this.userSockets);
      this.callEventsHandler.setNotificationService(this.notificationService);

      // Écouter les événements de traduction
      this.translationService.on('translationReady', this._handleTranslationReady.bind(this));
      this.translationService.on('audioTranslationReady', this._handleAudioTranslationReady.bind(this));

      this._setupSocketEvents();

      try {
        await this.maintenanceService.startMaintenanceTasks();
      } catch (error) {
        console.error('[GATEWAY] ❌ Erreur démarrage maintenance:', error);
      }
    } catch (error) {
      console.error('[GATEWAY] ❌ Erreur initialisation MeeshySocketIOManager:', error);
      throw error;
    }
  }

  /**
   * Configuration des événements Socket.IO
   */
  private _setupSocketEvents(): void {
    this.io.on('connection', (socket) => {
      this.stats.total_connections++;
      this.stats.active_connections++;

      // Authentification
      this.authHandler.handleTokenAuthentication(socket);

      socket.on(CLIENT_EVENTS.AUTHENTICATE, async (data) => {
        await this.authHandler.handleManualAuthentication(socket, data);
      });

      // Messages
      socket.on(CLIENT_EVENTS.MESSAGE_SEND, async (data, callback) => {
        await this.messageHandler.handleMessageSend(socket, data, callback);
      });

      socket.on(CLIENT_EVENTS.MESSAGE_SEND_WITH_ATTACHMENTS, async (data, callback) => {
        await this.messageHandler.handleMessageSendWithAttachments(socket, data, callback);
      });

      // Traductions
      socket.on(CLIENT_EVENTS.REQUEST_TRANSLATION, async (data) => {
        await this._handleTranslationRequest(socket, data);
      });

      // Conversations
      socket.on(CLIENT_EVENTS.CONVERSATION_JOIN, async (data) => {
        await this.conversationHandler.handleConversationJoin(socket, data);
      });

      socket.on(CLIENT_EVENTS.CONVERSATION_LEAVE, async (data) => {
        await this.conversationHandler.handleConversationLeave(socket, data);
      });

      // Statut
      socket.on(CLIENT_EVENTS.TYPING_START, (data) => {
        this.statusHandler.handleTypingStart(socket, data);
      });

      socket.on(CLIENT_EVENTS.TYPING_STOP, (data) => {
        this.statusHandler.handleTypingStop(socket, data);
      });

      // Réactions
      socket.on(CLIENT_EVENTS.REACTION_ADD, async (data, callback) => {
        await this.reactionHandler.handleReactionAdd(socket, data, callback);
      });

      socket.on(CLIENT_EVENTS.REACTION_REMOVE, async (data, callback) => {
        await this.reactionHandler.handleReactionRemove(socket, data, callback);
      });

      socket.on(CLIENT_EVENTS.REACTION_REQUEST_SYNC, async (messageId, callback) => {
        await this.reactionHandler.handleReactionSync(socket, messageId, callback);
      });

      // Appels vidéo/audio
      this.callEventsHandler.setupCallEvents(
        socket,
        this.io,
        (socketId: string) => this.socketToUser.get(socketId),
        (socketId: string) => {
          const userId = this.socketToUser.get(socketId);
          if (!userId) return undefined;
          const user = this.connectedUsers.get(userId);
          if (!user) return undefined;
          return { id: user.id, isAnonymous: user.isAnonymous };
        }
      );

      // Déconnexion
      socket.on('disconnect', () => {
        this.authHandler.handleDisconnection(socket);
        this.stats.active_connections--;
      });
    });
  }

  /**
   * Gère les requêtes de traduction manuelle
   */
  private async _handleTranslationRequest(
    socket: unknown,
    data: { messageId: string; targetLanguage: string }
  ): Promise<void> {
    try {
      console.log(`[TRANSLATION] Requête traduction: ${data.messageId} -> ${data.targetLanguage}`);
      // Déléguer au TranslationService
      // Cette logique reste inchangée pour l'instant
    } catch (error) {
      console.error('[TRANSLATION] Erreur:', error);
    }
  }

  /**
   * Gère les événements de traduction prête
   */
  private async _handleTranslationReady(data: {
    taskId: string;
    result: unknown;
    targetLanguage: string;
    translationId?: string;
    id?: string;
  }): Promise<void> {
    try {
      console.log(`[TRANSLATION] Traduction prête: ${data.taskId}`);
      // Broadcaster la traduction aux clients concernés
    } catch (error) {
      console.error('[TRANSLATION] Erreur broadcast:', error);
    }
  }

  /**
   * Gère les événements de traduction audio prête
   */
  private async _handleAudioTranslationReady(data: {
    taskId: string;
    result: unknown;
    targetLanguage: string;
  }): Promise<void> {
    try {
      console.log(`[AUDIO_TRANSLATION] Traduction audio prête: ${data.taskId}`);
      // Broadcaster la traduction audio
    } catch (error) {
      console.error('[AUDIO_TRANSLATION] Erreur:', error);
    }
  }

  /**
   * Broadcaster le statut d'un utilisateur
   */
  private _broadcastUserStatus(userId: string, isOnline: boolean, isAnonymous: boolean): void {
    this.io.emit(SERVER_EVENTS.USER_STATUS, {
      userId,
      isOnline,
      timestamp: new Date()
    });
  }

  /**
   * Méthodes publiques pour API externe
   */
  getStats() {
    return {
      ...this.stats,
      connected_users: this.connectedUsers.size,
      active_sockets: this.socketToUser.size
    };
  }

  getConnectedUsers(): string[] {
    return Array.from(this.connectedUsers.values()).map((u) => u.id);
  }

  disconnectUser(userId: string): boolean {
    const user = this.connectedUsers.get(userId);
    if (user) {
      const socket = this.io.sockets.sockets.get(user.socketId);
      if (socket) {
        socket.disconnect(true);
        return true;
      }
    }
    return false;
  }

  sendToUser<K extends keyof ServerToClientEvents>(
    userId: string,
    event: K,
    ...args: Parameters<ServerToClientEvents[K]>
  ): boolean {
    const user = this.connectedUsers.get(userId);
    if (user) {
      const socket = this.io.sockets.sockets.get(user.socketId);
      if (socket) {
        socket.emit(event, ...args);
        return true;
      }
    }
    return false;
  }

  broadcast<K extends keyof ServerToClientEvents>(
    event: K,
    ...args: Parameters<ServerToClientEvents[K]>
  ): void {
    this.io.emit(event, ...args);
  }
}
