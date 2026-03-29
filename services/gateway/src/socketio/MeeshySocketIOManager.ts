/**
 * Gestionnaire Socket.IO pour Meeshy
 * Gestion des connexions, conversations et traductions en temps réel
 */

import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { MessageTranslationService, MessageData } from '../services/message-translation/MessageTranslationService';
import { transformTranslationsToArray } from '../utils/translation-transformer';
import { MaintenanceService } from '../services/MaintenanceService';
import { StatusService } from '../services/StatusService';
import { MessagingService } from '../services/MessagingService';
import { CallEventsHandler } from './CallEventsHandler';
import { SocialEventsHandler } from './handlers/SocialEventsHandler';
import { LocationHandler } from './handlers/LocationHandler';
import { AuthHandler } from './handlers/AuthHandler';
import { MessageHandler } from './handlers/MessageHandler';
import { StatusHandler } from './handlers/StatusHandler';
import { ReactionHandler } from './handlers/ReactionHandler';
import { ConversationHandler } from './handlers/ConversationHandler';
import { CallService } from '../services/CallService';
import { AttachmentService } from '../services/attachments';
import { ReactionService } from '../services/ReactionService.js';
import { MessageReadStatusService } from '../services/MessageReadStatusService.js';
import { EmailService } from '../services/EmailService';
import { PushNotificationService } from '../services/PushNotificationService';
import { NotificationService } from '../services/notifications/NotificationService';
import { PrivacyPreferencesService } from '../services/PrivacyPreferencesService';
import { PostAudioService } from '../services/posts/PostAudioService';
import { PostTranslationService } from '../services/posts/PostTranslationService';
import { StoryTextObjectTranslationService } from '../services/posts/StoryTextObjectTranslationService';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  SocketIOResponse,
  TranslationEvent,
  MessageType,
} from '@meeshy/shared/types/socketio-events';
import { CLIENT_EVENTS, SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { conversationStatsService } from '../services/ConversationStatsService';
import type { Message } from '@meeshy/shared/types/index';
import { enhancedLogger } from '../utils/logger-enhanced';
import type { ZmqAgentClient } from '../services/zmq-agent/ZmqAgentClient';
import { MentionService } from '../services/MentionService';
import { RedisDeliveryQueue } from '../services/RedisDeliveryQueue';

// Logger dédié pour SocketIOManager
const logger = enhancedLogger.child({ module: 'SocketIOManager' });

export interface SocketUser {
  id: string;
  socketId: string;
  isAnonymous: boolean;
  language: string;
  /** For anonymous participants: the participant.id */
  participantId?: string;
  /** For registered users: the user.id */
  userId?: string;
  /** Display name resolved at connection time */
  displayName?: string;
  /** @deprecated kept for backward compat — raw session token */
  sessionToken?: string;
}

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
  private socialEventsHandler: SocialEventsHandler;
  private locationHandler: LocationHandler;
  private privacyPreferencesService: PrivacyPreferencesService;
  private agentClient: ZmqAgentClient | null = null;
  private mentionService: MentionService;
  private deliveryQueue: RedisDeliveryQueue | null = null;

  private authHandler!: AuthHandler;
  private messageHandler!: MessageHandler;
  private statusHandler!: StatusHandler;
  private reactionHandler!: ReactionHandler;
  private conversationHandler!: ConversationHandler;

  // Mapping des utilisateurs connectés
  private connectedUsers: Map<string, SocketUser> = new Map();
  private socketToUser: Map<string, string> = new Map();
  private userSockets: Map<string, Set<string>> = new Map();

  // Cache immutable identifier → ObjectId (populated on first lookup)
  private conversationIdCache = new Map<string, string>();

  // Statistiques
  private stats = {
    total_connections: 0,
    active_connections: 0,
    messages_processed: 0,
    translations_sent: 0,
    errors: 0
  };

  constructor(
    httpServer: HTTPServer,
    prisma: PrismaClient,
    translationService: MessageTranslationService
  ) {
    this.prisma = prisma;
    this.translationService = translationService;

    // Créer l'AttachmentService pour le cleanup automatique
    const attachmentService = new AttachmentService(prisma);
    const emailService = new EmailService();
    this.maintenanceService = new MaintenanceService(prisma, attachmentService, emailService);

    // Initialiser StatusService pour throttling des updates lastActiveAt
    this.statusService = new StatusService(prisma);

    // Initialiser PrivacyPreferencesService pour vérifier les préférences de confidentialité
    this.privacyPreferencesService = new PrivacyPreferencesService(prisma);

    // CORRECTION: Créer NotificationService AVANT MessagingService pour que les mentions génèrent des notifications
    this.notificationService = new NotificationService(prisma);
    this.mentionService = new MentionService(prisma);
    this.messagingService = new MessagingService(prisma, this.translationService, this.notificationService);
    this.callEventsHandler = new CallEventsHandler(prisma);
    this.callService = new CallService(prisma);

    // CORRECTION: Configurer le callback de broadcast pour le MaintenanceService
    this.maintenanceService.setStatusBroadcastCallback(
      (userId: string, isOnline: boolean, isAnonymous: boolean) => {
        this._broadcastUserStatus(userId, isOnline, isAnonymous);
      }
    );

    // Initialiser Socket.IO avec les types shared
    this.io = new SocketIOServer<ClientToServerEvents, ServerToClientEvents>(httpServer, {
      path: "/socket.io/",
      transports: ["websocket", "polling"],
      cors: {
        origin: '*',
        methods: ["GET", "POST"],
        allowedHeaders: ['authorization', 'content-type', 'x-session-token', 'websocket', 'polling'],
        credentials: true
      },
      // CORRECTION CRITIQUE: Configuration timeouts pour détecter déconnexions abruptes
      pingTimeout: 10000,  // 10s - Temps d'attente pour le pong avant de considérer la connexion morte
      pingInterval: 25000, // 25s - Intervalle entre les pings (par défaut)
      connectTimeout: 45000, // 45s - Timeout pour la connexion initiale
      // Autoriser reconnexion rapide
      allowEIO3: true
    });

    // Initialiser le SocialEventsHandler pour les broadcasts feed
    this.socialEventsHandler = new SocialEventsHandler({
      io: this.io as any,
      prisma: this.prisma,
    });

    // Initialiser le LocationHandler pour les événements de partage de localisation
    this.locationHandler = new LocationHandler({
      io: this.io as any,
      prisma: this.prisma,
      connectedUsers: this.connectedUsers,
      socketToUser: this.socketToUser,
      normalizeConversationId: (id: string) => this.normalizeConversationId(id),
    });

    // Initialiser le PostAudioService singleton (dépend de socialEventsHandler)
    PostAudioService.init(this.prisma, this.socialEventsHandler);

    // Initialiser le StoryTextObjectTranslationService singleton
    StoryTextObjectTranslationService.init(this.prisma, this.io as any);

    this.authHandler = new AuthHandler({
      prisma: this.prisma,
      statusService: this.statusService,
      maintenanceService: this.maintenanceService,
      callService: this.callService,
      connectedUsers: this.connectedUsers,
      socketToUser: this.socketToUser,
      userSockets: this.userSockets,
    });

    const reactionService = new ReactionService(prisma);
    const readStatusService = new MessageReadStatusService(prisma);

    this.messageHandler = new MessageHandler({
      io: this.io,
      prisma: this.prisma,
      messagingService: this.messagingService,
      translationService: this.translationService,
      statusService: this.statusService,
      notificationService: this.notificationService,
      connectedUsers: this.connectedUsers,
      socketToUser: this.socketToUser,
      stats: this.stats,
      agentClient: this.agentClient,
      attachmentService: new AttachmentService(prisma),
      readStatusService,
    });

    this.statusHandler = new StatusHandler({
      prisma: this.prisma,
      statusService: this.statusService,
      privacyPreferencesService: this.privacyPreferencesService,
      connectedUsers: this.connectedUsers,
      socketToUser: this.socketToUser,
    });

    this.reactionHandler = new ReactionHandler({
      io: this.io,
      prisma: this.prisma,
      notificationService: this.notificationService,
      reactionService,
      connectedUsers: this.connectedUsers,
      socketToUser: this.socketToUser,
    });

    this.conversationHandler = new ConversationHandler({
      prisma: this.prisma,
      connectedUsers: this.connectedUsers,
      socketToUser: this.socketToUser,
    });
  }

  setDeliveryQueue(queue: RedisDeliveryQueue): void {
    this.deliveryQueue = queue;
  }

  private async _drainPendingMessages(socket: any, userId: string): Promise<void> {
    if (!this.deliveryQueue) return;
    try {
      const pending = await this.deliveryQueue.drain(userId);
      if (pending.length === 0) return;

      logger.info(`Delivering ${pending.length} queued messages to ${userId}`);
      for (const entry of pending) {
        socket.emit(SERVER_EVENTS.MESSAGE_NEW, entry.payload);
      }
      socket.emit(SERVER_EVENTS.PENDING_MESSAGES_DELIVERED, { count: pending.length });
    } catch (error) {
      logger.warn('Failed to drain pending messages', { userId, error });
    }
  }

  /**
   * Normalise l'identifiant de conversation pour créer une room cohérente
   * Résout identifier/ObjectId vers l'identifier canonique
   */
  private async normalizeConversationId(conversationId: string): Promise<string> {
    try {
      if (/^[0-9a-fA-F]{24}$/.test(conversationId)) return conversationId;
      const cached = this.conversationIdCache.get(conversationId);
      if (cached) return cached;
      const conversation = await this.prisma.conversation.findUnique({
        where: { identifier: conversationId },
        select: { id: true, identifier: true }
      });
      if (conversation) {
        this.conversationIdCache.set(conversationId, conversation.id);
        return conversation.id;
      }
      return conversationId;
    } catch (error) {
      logger.error('❌ [NORMALIZE] Erreur normalisation', error);
      return conversationId;
    }
  }

  /**
   * Expose NotificationService for use in routes
   */
  public getNotificationService(): NotificationService {
    return this.notificationService;
  }

  /**
   * Expose SocialEventsHandler for use in routes (broadcast social events)
   */
  public getSocialEventsHandler(): SocialEventsHandler {
    return this.socialEventsHandler;
  }

  /**
   * Expose broadcast function for REST-triggered presence updates
   * Permet au StatusService du serveur de broadcaster les changements de présence
   */
  public getPresenceBroadcastCallback(): (userId: string, isOnline: boolean, isAnonymous: boolean) => void {
    return (userId: string, isOnline: boolean, isAnonymous: boolean) => {
      this._broadcastUserStatus(userId, isOnline, isAnonymous);
    };
  }

  async initialize(): Promise<void> {
    try {
      // Initialiser le service de traduction
      await this.translationService.initialize();

      // Initialiser le PostTranslationService singleton (dépend de ZMQ client + socialEventsHandler)
      const zmqClient = this.translationService.getZmqClient();
      if (zmqClient) {
        PostTranslationService.init(this.prisma, zmqClient, this.socialEventsHandler);
      }

      // Initialiser le service de notifications avec Socket.IO
      this.notificationService.setSocketIO(this.io, this.userSockets);

      // Wire push notifications
      const pushService = new PushNotificationService(this.prisma);
      this.notificationService.setPushNotificationService(pushService);

      // Wire email for immediate high-priority notifications
      const emailService = new EmailService();
      this.notificationService.setEmailService(emailService);

      // Initialiser le service de notifications pour CallEventsHandler
      this.callEventsHandler.setNotificationService(this.notificationService);

      // Écouter les événements de transcription seule prêtes
      this.translationService.on('transcriptionReady', this._handleTranscriptionReady.bind(this));

      // Écouter les événements de traduction audio avec contexte sémantique
      this.translationService.on('audioTranslationReady', this._handleAudioTranslationReady.bind(this));  // Langue unique
      this.translationService.on('audioTranslationsProgressive', this._handleAudioTranslationsProgressive.bind(this));  // Progressive (multi)
      this.translationService.on('audioTranslationsCompleted', this._handleAudioTranslationsCompleted.bind(this));  // Dernière (multi)

      // Écouter les événements de traduction TEXTE
      this.translationService.on('translationReady', this._handleTextTranslationReady.bind(this));

      // Écouter les traductions de textObjects de story
      this.translationService.on('storyTextObjectTranslationCompleted', this._handleStoryTextObjectTranslationCompleted.bind(this));

      // Configurer les événements Socket.IO
      this._setupSocketEvents();
      // ✅ FIX BUG #3: SUPPRIMER le polling périodique
      // Le système utilise maintenant uniquement les événements Socket.IO (connect/disconnect)
      // et le broadcast de statut lors de ces événements
      // this._ensureOnlineStatsTicker(); // ← SUPPRIMÉ

      // Démarrer les tâches de maintenance
      try {
        await this.maintenanceService.startMaintenanceTasks();
      } catch (error) {
        logger.error('❌ Erreur lors du démarrage des tâches de maintenance', error);
        logger.error('❌ Stack trace', error instanceof Error ? error.stack : 'No stack trace');
      }
      
      // Note: Les événements de traduction sont gérés via le singleton ZMQ
      
      
    } catch (error) {
      logger.error('❌ Erreur initialisation MeeshySocketIOManager', error);
      throw error;
    }
  }

  private _setupSocketEvents(): void {
    this.io.on('connection', (socket) => {
      this.stats.total_connections++;
      this.stats.active_connections++;

      this.authHandler.handleTokenAuthentication(socket);

      socket.on(CLIENT_EVENTS.AUTHENTICATE, async (data) => {
        try { await this.authHandler.handleManualAuthentication(socket, data); } catch (error) { logger.error('[AUTHENTICATE] Error:', error); }
      });

      socket.on(CLIENT_EVENTS.MESSAGE_SEND, async (data, callback) => {
        try { await this.messageHandler.handleMessageSend(socket, data, callback); } catch (error) { logger.error('[MESSAGE_SEND] Error:', error); }
      });

      socket.on(CLIENT_EVENTS.MESSAGE_SEND_WITH_ATTACHMENTS, async (data, callback) => {
        try { await this.messageHandler.handleMessageSendWithAttachments(socket, data, callback); } catch (error) { logger.error('[MESSAGE_SEND_WITH_ATTACHMENTS] Error:', error); }
      });

      socket.on(CLIENT_EVENTS.REQUEST_TRANSLATION, async (data: { messageId: string; targetLanguage: string }) => {
        try { await this._handleTranslationRequest(socket, data); } catch (error) { logger.error('[REQUEST_TRANSLATION] Error:', error); }
      });

      socket.on(CLIENT_EVENTS.CONVERSATION_JOIN, async (data) => {
        try { await this.conversationHandler.handleConversationJoin(socket, data); } catch (error) { logger.error('[CONVERSATION_JOIN] Error:', error); }
      });

      socket.on(CLIENT_EVENTS.CONVERSATION_LEAVE, async (data) => {
        try { await this.conversationHandler.handleConversationLeave(socket, data); } catch (error) { logger.error('[CONVERSATION_LEAVE] Error:', error); }
      });

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

      socket.on(CLIENT_EVENTS.FEED_SUBSCRIBE, (callback?: (response: SocketIOResponse) => void) => {
        const userId = this.socketToUser.get(socket.id);
        if (userId) {
          this.socialEventsHandler.handleFeedSubscribe(socket, userId);
          if (callback) callback({ success: true });
        } else {
          if (callback) callback({ success: false, error: 'Not authenticated' });
        }
      });

      socket.on(CLIENT_EVENTS.FEED_UNSUBSCRIBE, (callback?: (response: SocketIOResponse) => void) => {
        const userId = this.socketToUser.get(socket.id);
        if (userId) {
          this.socialEventsHandler.handleFeedUnsubscribe(socket, userId);
          if (callback) callback({ success: true });
        } else {
          if (callback) callback({ success: false, error: 'Not authenticated' });
        }
      });

      socket.on(CLIENT_EVENTS.TYPING_START, (data) => {
        this.statusHandler.handleTypingStart(socket, data).catch((error) => logger.error('[TYPING_START] Error:', error));
      });

      socket.on(CLIENT_EVENTS.TYPING_STOP, (data) => {
        this.statusHandler.handleTypingStop(socket, data).catch((error) => logger.error('[TYPING_STOP] Error:', error));
      });

      socket.on(CLIENT_EVENTS.HEARTBEAT, () => {
        this.authHandler.handleHeartbeat(socket).catch((error) => logger.error('[HEARTBEAT] Error:', error));
      });

      socket.on(CLIENT_EVENTS.REACTION_ADD, async (data, callback) => {
        try { await this.reactionHandler.handleReactionAdd(socket, data, callback); } catch (error) { logger.error('[REACTION_ADD] Error:', error); }
      });

      socket.on(CLIENT_EVENTS.REACTION_REMOVE, async (data, callback) => {
        try { await this.reactionHandler.handleReactionRemove(socket, data, callback); } catch (error) { logger.error('[REACTION_REMOVE] Error:', error); }
      });

      socket.on(CLIENT_EVENTS.REACTION_REQUEST_SYNC, async (messageId, callback) => {
        try { await this.reactionHandler.handleReactionSync(socket, messageId, callback); } catch (error) { logger.error('[REACTION_SYNC] Error:', error); }
      });

      socket.on(CLIENT_EVENTS.LOCATION_SHARE, async (data, callback) => {
        try { await this.locationHandler.handleLocationShare(socket, data, callback); } catch (error) { logger.error('[LOCATION_SHARE] Error:', error); }
      });

      socket.on(CLIENT_EVENTS.LOCATION_LIVE_START, async (data, callback) => {
        try { await this.locationHandler.handleLiveLocationStart(socket, data, callback); } catch (error) { logger.error('[LOCATION_LIVE_START] Error:', error); }
      });

      socket.on(CLIENT_EVENTS.LOCATION_LIVE_UPDATE, async (data) => {
        try { await this.locationHandler.handleLiveLocationUpdate(socket, data); } catch (error) { logger.error('[LOCATION_LIVE_UPDATE] Error:', error); }
      });

      socket.on(CLIENT_EVENTS.LOCATION_LIVE_STOP, async (data) => {
        try { await this.locationHandler.handleLiveLocationStop(socket, data); } catch (error) { logger.error('[LOCATION_LIVE_STOP] Error:', error); }
      });

      socket.on('disconnect', () => {
        this.authHandler.handleDisconnection(socket).catch((error) => logger.error('[DISCONNECT] Error:', error));
        this.stats.active_connections--;
      });
    });
  }


  private async _handleTranslationRequest(socket: any, data: { messageId: string; targetLanguage: string }) {
    try {
      const userId = this.socketToUser.get(socket.id);
      if (!userId) {
        socket.emit(SERVER_EVENTS.ERROR, { message: 'User not authenticated' });
        return;
      }
      
      
      // Récupérer la traduction (depuis le cache ou la base de données)
      const translation = await this.translationService.getTranslation(data.messageId, data.targetLanguage);
      
      if (translation) {
        socket.emit(SERVER_EVENTS.MESSAGE_TRANSLATION, {
          messageId: data.messageId,
          translatedText: translation.translatedText,
          targetLanguage: data.targetLanguage,
          confidenceScore: translation.confidenceScore
        });

        this.stats.translations_sent++;

      } else {
        // No cached translation — trigger on-demand translation via ZMQ
        try {
          const message = await this.prisma.message.findUnique({
            where: { id: data.messageId },
            select: { id: true, conversationId: true, content: true, originalLanguage: true, senderId: true, encryptionMode: true }
          });

          if (!message || !message.content) {
            socket.emit(SERVER_EVENTS.ERROR, {
              message: 'Message not found or empty'
            });
            return;
          }

          await this.translationService.handleNewMessage({
            id: message.id,
            conversationId: message.conversationId,
            senderId: message.senderId ?? undefined,
            content: message.content,
            originalLanguage: message.originalLanguage ?? 'auto',
            targetLanguage: data.targetLanguage,
            encryptionMode: message.encryptionMode as MessageData['encryptionMode'],
          });

          logger.info(`🔄 On-demand translation requested for message ${data.messageId} -> ${data.targetLanguage}`);
        } catch (translationError) {
          logger.error(`❌ On-demand translation failed: ${translationError}`);
          socket.emit(SERVER_EVENTS.ERROR, {
            message: 'Translation request failed'
          });
        }
      }
      
    } catch (error) {
      logger.error(`❌ Erreur demande traduction: ${error}`);
      this.stats.errors++;
      socket.emit(SERVER_EVENTS.ERROR, { message: 'Failed to get translation' });
    }
  }

  /**
   * @deprecated Cette fonction gère les anciennes traductions de texte (non audio).
   * Les nouvelles traductions audio utilisent _handleAudioTranslationReady et variants.
   */
  private async _handleTextTranslationReady(data: { taskId: string; result: any; targetLanguage: string; translationId?: string; id?: string }) {
    try {
      const { result, targetLanguage} = data;
      
      
      // Récupérer la conversation du message pour broadcast
      let conversationIdForBroadcast: string | null = null;
      try {
        const msg = await this.prisma.message.findUnique({
          where: { id: result.messageId },
          select: { conversationId: true }
        });
        conversationIdForBroadcast = msg?.conversationId || null;
      } catch (error) {
        logger.error(`❌ [SocketIOManager] Erreur récupération conversation:`, error);
      }
      
      // Préparer les données de traduction au format correct pour le frontend
      // FORMAT: TranslationEvent avec un tableau de traductions
      const translationData: TranslationEvent = {
        messageId: result.messageId,
        translations: [{
          id: data.translationId || data.id || `${result.messageId}_${targetLanguage}_${Date.now()}`,
          messageId: result.messageId,
          sourceLanguage: result.sourceLanguage || 'auto',
          targetLanguage: targetLanguage,
          translatedContent: result.translatedText,
          translationModel: result.translationModel || result.modelType || 'medium',
          cacheKey: `${result.messageId}_${result.sourceLanguage || 'auto'}_${targetLanguage}`,
          cached: false,
          confidenceScore: result.confidenceScore || 0.85,
          createdAt: new Date()
        }]
      };
      
      
      // Diffuser dans la room de conversation (méthode principale et UNIQUE)
      if (conversationIdForBroadcast) {
        // Normaliser l'ID de conversation
        const normalizedId = await this.normalizeConversationId(conversationIdForBroadcast);
        const roomName = ROOMS.conversation(normalizedId);
        const roomClients = this.io.sockets.adapter.rooms.get(roomName);
        const clientCount = roomClients ? roomClients.size : 0;
        
        
        // Log des clients dans la room pour debug
        if (clientCount > 0 && roomClients) {
          const clientSocketIds = Array.from(roomClients);
        }
        
        this.io.to(roomName).emit(SERVER_EVENTS.MESSAGE_TRANSLATION, translationData);
        this.stats.translations_sent += clientCount;
        
      } else {
        logger.warn(`⚠️ [SocketIOManager] Aucune conversation trouvée pour le message ${result.messageId}`);
        
        // Fallback UNIQUEMENT si pas de room: Envoi direct aux utilisateurs connectés pour cette langue
        const targetUsers = this._findUsersForLanguage(targetLanguage);
        let directSendCount = 0;
        
        for (const user of targetUsers) {
          const userSocket = this.io.sockets.sockets.get(user.socketId);
          if (userSocket) {
            userSocket.emit(SERVER_EVENTS.MESSAGE_TRANSLATION, translationData);
            directSendCount++;
          }
        }
        
        if (directSendCount > 0) {
        }
      }
      
      // Envoyer les notifications de traduction pour les utilisateurs non connectés
      if (conversationIdForBroadcast) {
        setImmediate(async () => {
          try {
            // Construire les traductions pour les trois langues de base
            const translations: { fr?: string; en?: string; es?: string } = {};
            if (targetLanguage === 'fr') {
              translations.fr = result.translatedText;
            } else if (targetLanguage === 'en') {
              translations.en = result.translatedText;
            } else if (targetLanguage === 'es') {
              translations.es = result.translatedText;
            }
            
            // Note: Les notifications de traduction sont gérées directement dans routes/notifications.ts
          } catch (error) {
            logger.error(`❌ Erreur envoi notification traduction ${result.messageId}:`, error);
          }
        });
      }
      
    } catch (error) {
      logger.error(`❌ Erreur envoi traduction: ${error}`);
      this.stats.errors++;
    }
  }

  /**
   * Gère la réception d'une traduction de textObject de story complétée.
   * Délègue au StoryTextObjectTranslationService qui persiste et émet via Socket.IO.
   */
  private async _handleStoryTextObjectTranslationCompleted(data: {
    postId: string;
    textObjectIndex: number;
    translations: Record<string, string>;
  }): Promise<void> {
    try {
      await StoryTextObjectTranslationService.shared.handleTranslationCompleted(data);
    } catch (error) {
      logger.error(`❌ [SocketIOManager] StoryTextObject translation handler error:`, error);
    }
  }

  /**
   * Gère la réception d'une transcription seule prête depuis le Translator
   * Diffuse l'événement TRANSCRIPTION_READY aux clients de la conversation
   * Utilisé lorsque seule la transcription est demandée, sans génération d'audios traduits
   */
  private async _handleTranscriptionReady(data: {
    taskId: string;
    messageId: string;
    attachmentId: string;
    transcription: {
      id: string;
      text: string;
      language: string;
      confidence?: number;
      source?: string;
      segments?: Array<{ text: string; startMs: number; endMs: number; confidence?: number }>;
      durationMs?: number;
      speakerCount?: number;
      primarySpeakerId?: string;
      senderVoiceIdentified?: boolean;
      senderSpeakerId?: string | null;
    };
    processingTimeMs?: number;
    postId?: string;
    postMediaId?: string;
  }) {
    try {
      // Route post audio transcriptions to PostAudioService — skip message broadcast logic
      if (data.postId && data.postMediaId) {
        await PostAudioService.shared.handleTranscriptionReady({
          postId: data.postId,
          postMediaId: data.postMediaId,
          transcription: data.transcription,
        });
        return;
      }

      logger.info(`📝 [SocketIOManager] ======== DIFFUSION TRANSCRIPTION VERS CLIENTS ========`);
      logger.info(`📝 [SocketIOManager] Transcription ready pour message ${data.messageId}, attachment ${data.attachmentId}`);
      logger.info(`   📝 Transcription ID: ${data.transcription.id}`);
      logger.info(`   📝 Texte: "${data.transcription.text?.substring(0, 100)}..."`);
      logger.info(`   📝 Langue: ${data.transcription.language}`);
      logger.info(`   📝 Confiance: ${data.transcription.confidence}`);
      logger.info(`   📝 Segments: ${data.transcription.segments?.length || 0} segments`);

      // Récupérer la conversation du message pour broadcast
      let conversationId: string | null = null;
      try {
        const msg = await this.prisma.message.findUnique({
          where: { id: data.messageId },
          select: { conversationId: true }
        });
        conversationId = msg?.conversationId || null;
      } catch (error) {
        logger.error(`❌ [SocketIOManager] Erreur récupération conversation pour transcription:`, error);
      }

      if (!conversationId) {
        logger.warn(`⚠️ [SocketIOManager] Aucune conversation trouvée pour le message ${data.messageId}`);
        return;
      }

      // Normaliser l'ID de conversation
      const normalizedId = await this.normalizeConversationId(conversationId);
      const roomName = ROOMS.conversation(normalizedId);
      const roomClients = this.io.sockets.adapter.rooms.get(roomName);
      const clientCount = roomClients ? roomClients.size : 0;

      logger.info(`📢 [SocketIOManager] Diffusion transcription vers room ${roomName} (${clientCount} clients)`);

      // Préparer les données au format TranscriptionReadyEventData
      const transcriptionData = {
        messageId: data.messageId,
        attachmentId: data.attachmentId,
        conversationId: normalizedId,
        transcription: data.transcription,
        processingTimeMs: data.processingTimeMs
      };

      // Diffuser dans la room de conversation
      logger.info(`📡 [SocketIOManager] Émission événement '${SERVER_EVENTS.TRANSCRIPTION_READY}' vers room '${roomName}' (${clientCount} clients)`);
      this.io.to(roomName).emit(SERVER_EVENTS.TRANSCRIPTION_READY, transcriptionData);

      logger.info(`✅ [SocketIOManager] ======== ÉVÉNEMENT TRANSCRIPTION DIFFUSÉ ========`);
      logger.info(`✅ [SocketIOManager] Transcription diffusée vers ${clientCount} client(s)`);

    } catch (error) {
      logger.error(`❌ [SocketIOManager] Erreur envoi transcription:`, error);
      this.stats.errors++;
    }
  }

  /**
   * Gère la réception d'une traduction individuelle prête depuis le Translator (PROGRESSIVE)
   * @deprecated Utilisez _handleAudioTranslationReady, _handleAudioTranslationsProgressive ou _handleAudioTranslationsCompleted
   * Délègue au helper générique avec un événement générique
   */

  /**
   * Helper générique pour broadcaster les événements de traduction audio.
   */
  private async _broadcastTranslationEvent(
    data: {
      taskId: string;
      messageId: string;
      attachmentId: string;
      language: string;
      translatedAudio: any;
      phase?: string;
      transcription?: any;
    },
    eventName: string,
    eventConstant:
      | typeof SERVER_EVENTS.AUDIO_TRANSLATION_READY
      | typeof SERVER_EVENTS.AUDIO_TRANSLATIONS_PROGRESSIVE
      | typeof SERVER_EVENTS.AUDIO_TRANSLATIONS_COMPLETED,
    logPrefix: string
  ) {
    try {
      logger.info(`${logPrefix} [SocketIOManager] ======== DIFFUSION TRADUCTION VERS CLIENTS ========`);
      logger.info(`${logPrefix} [SocketIOManager] Translation ready pour message ${data.messageId}, attachment ${data.attachmentId}`);
      logger.info(`   🔊 Langue: ${data.language || 'UNDEFINED'}`);
      logger.info(`   📝 Segments: ${data.translatedAudio?.segments?.length || 0}`);

      // Récupérer la conversation du message pour broadcast
      let conversationId: string | null = null;
      try {
        const msg = await this.prisma.message.findUnique({
          where: { id: data.messageId },
          select: { conversationId: true }
        });
        conversationId = msg?.conversationId || null;
      } catch (error) {
        logger.error(`❌ [SocketIOManager] Erreur récupération conversation pour traduction:`, error);
      }

      if (!conversationId) {
        logger.warn(`⚠️ [SocketIOManager] Aucune conversation trouvée pour le message ${data.messageId}`);
        return;
      }

      // Normaliser l'ID de conversation
      const normalizedId = await this.normalizeConversationId(conversationId);
      const roomName = ROOMS.conversation(normalizedId);
      const roomClients = this.io.sockets.adapter.rooms.get(roomName);
      const clientCount = roomClients ? roomClients.size : 0;

      logger.info(`📢 [SocketIOManager] Diffusion traduction ${data.language} vers room ${roomName} (${clientCount} clients)`);

      // Vérifier que translatedAudio existe
      if (!data.translatedAudio) {
        logger.error(`❌ [SocketIOManager] data.translatedAudio est undefined pour ${data.messageId}`);
        return;
      }

      // Préparer les données au format structure officielle de shared
      // Note: AudioTranslationReadyEventData, AudioTranslationsProgressiveEventData, AudioTranslationsCompletedEventData
      // sont des type aliases de AudioTranslationEventData, donc on peut utiliser n'importe lequel
      const translationData: import('@meeshy/shared/types/socketio-events').AudioTranslationEventData = {
        messageId: data.messageId,
        attachmentId: data.attachmentId,
        conversationId: normalizedId,
        language: data.language || data.translatedAudio.targetLanguage,
        translatedAudio: {
          id: data.translatedAudio.id || `${data.attachmentId}_${data.language}`,
          targetLanguage: data.translatedAudio.targetLanguage || data.language,
          url: data.translatedAudio.url,
          path: data.translatedAudio.path,
          transcription: data.translatedAudio.translatedText || data.translatedAudio.transcription || '',
          durationMs: data.translatedAudio.durationMs || data.translatedAudio.duration || 0,
          format: data.translatedAudio.format || 'mp3',
          cloned: data.translatedAudio.cloned || false,
          quality: data.translatedAudio.quality || 0,
          voiceModelId: data.translatedAudio.voiceModelId,
          ttsModel: data.translatedAudio.ttsModel || 'xtts',
          segments: data.translatedAudio.segments
        },
        processingTimeMs: data.phase ? undefined : 0
      };

      // Vérification et log des segments
      if (translationData.translatedAudio.segments && translationData.translatedAudio.segments.length > 0) {
        logger.info(`   ✅ Segments inclus: ${translationData.translatedAudio.segments.length}`);
        const firstSeg = translationData.translatedAudio.segments[0];
        logger.info(`   📝 Premier segment: "${firstSeg.text}" (${firstSeg.startMs}ms-${firstSeg.endMs}ms, speaker=${firstSeg.speakerId}, score=${firstSeg.voiceSimilarityScore})`);
      } else {
        logger.warn(`   ⚠️ Aucun segment dans translatedAudio!`);
      }

      // Diffuser dans la room de conversation
      logger.info(`📡 [SocketIOManager] Émission événement '${eventConstant}' vers room '${roomName}' (${clientCount} clients)`);
      this.io.to(roomName).emit(eventConstant, translationData);

      logger.info(`✅ [SocketIOManager] ======== ÉVÉNEMENT TRADUCTION DIFFUSÉ ========`);
      logger.info(`✅ [SocketIOManager] Traduction ${data.language} diffusée vers ${clientCount} client(s)`);

    } catch (error) {
      logger.error(`❌ [SocketIOManager] Erreur envoi traduction:`, error);
      this.stats.errors++;
    }
  }

  /**
   * Gère un événement de traduction audio unique (1 seule langue demandée).
   * Format unifié: translatedAudio (singulier) — cohérent avec progressive/completed.
   */
  private async _handleAudioTranslationReady(data: any) {
    if (!data.translatedAudio) {
      logger.error(`❌ [SocketIOManager] _handleAudioTranslationReady: translatedAudio manquant`, {
        keys: Object.keys(data),
        messageId: data.messageId
      });
      return;
    }

    await this._broadcastTranslationEvent(
      {
        taskId: data.taskId,
        messageId: data.messageId,
        attachmentId: data.attachmentId,
        language: data.language || data.translatedAudio.targetLanguage,
        translatedAudio: data.translatedAudio,
        transcription: data.transcription,
        phase: data.phase
      },
      'audioTranslationReady',
      SERVER_EVENTS.AUDIO_TRANSLATION_READY,
      '🎯'
    );
  }

  /**
   * Gère un événement de traduction progressive (multi-langues, pas la dernière).
   * Format unifié: translatedAudio (singulier).
   */
  private async _handleAudioTranslationsProgressive(data: any) {
    await this._broadcastTranslationEvent(
      data,
      'audioTranslationsProgressive',
      SERVER_EVENTS.AUDIO_TRANSLATIONS_PROGRESSIVE,
      '🔄'
    );
  }

  /**
   * Gère un événement de dernière traduction terminée (multi-langues).
   * Format unifié: translatedAudio (singulier).
   */
  private async _handleAudioTranslationsCompleted(data: any) {
    await this._broadcastTranslationEvent(
      data,
      'audioTranslationsCompleted',
      SERVER_EVENTS.AUDIO_TRANSLATIONS_COMPLETED,
      '✅'
    );
  }

  private _findUsersForLanguage(targetLanguage: string): SocketUser[] {
    const targetUsers: SocketUser[] = [];

    for (const [userId, user] of this.connectedUsers) {
      if (user.language === targetLanguage) {
        targetUsers.push(user);
      }
    }

    return targetUsers;
  }

  /**
   * CORRECTION: Broadcaster le changement de statut d'un utilisateur à tous les clients
   * PRIVACY: Respecte les préférences showOnlineStatus et showLastSeen
   */
  private async _broadcastUserStatus(userId: string, isOnline: boolean, isAnonymous: boolean): Promise<void> {
    try {
      // PRIVACY: Vérifier les préférences de confidentialité de l'utilisateur
      const privacyPrefs = await this.privacyPreferencesService.getPreferences(userId, isAnonymous);

      // Si l'utilisateur a désactivé showOnlineStatus, ne pas broadcaster son statut
      if (!privacyPrefs.showOnlineStatus) {
        return;
      }

      // Récupérer les informations de l'utilisateur pour le broadcast
      if (isAnonymous) {
        // userId is participantId for anonymous
        const participant = await this.prisma.participant.findUnique({
          where: { id: userId },
          select: {
            id: true,
            displayName: true,
            nickname: true,
            lastActiveAt: true,
            conversationId: true
          }
        });

        if (participant) {
          const displayName = participant.nickname || participant.displayName;

          // PRIVACY: Ne pas envoyer lastActiveAt si showLastSeen est désactivé
          const lastActiveAt = privacyPrefs.showLastSeen ? participant.lastActiveAt : null;

          // Broadcaster uniquement dans la conversation du participant anonyme
          this.io.to(ROOMS.conversation(participant.conversationId)).emit(SERVER_EVENTS.USER_STATUS, {
            userId: participant.id,
            username: displayName,
            isOnline,
            lastActiveAt
          });

        }
      } else {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            username: true,
            displayName: true,
            firstName: true,
            lastName: true,
            lastActiveAt: true
          }
        });

        if (user) {
          const displayName = user.displayName || `${user.firstName} ${user.lastName}`.trim() || user.username;

          // PRIVACY: Ne pas envoyer lastActiveAt si showLastSeen est désactivé
          const lastActiveAt = privacyPrefs.showLastSeen ? user.lastActiveAt : null;

          // Find all conversations this user participates in
          const participantRows = await this.prisma.participant.findMany({
            where: { userId: user.id, isActive: true },
            select: { conversationId: true }
          });

          // Broadcaster dans toutes les conversations de l'utilisateur (batch: 1 emit au lieu de N)
          const rooms = participantRows.map(p => ROOMS.conversation(p.conversationId));
          if (rooms.length > 0) {
            this.io.to(rooms).emit(SERVER_EVENTS.USER_STATUS, {
              userId: user.id,
              username: displayName,
              isOnline,
              lastActiveAt
            });
          }

        }
      }
    } catch (error) {
      logger.error('❌ [STATUS] Erreur lors du broadcast du statut', error);
    }
  }


  /**
   * PHASE 3.1: Broadcast d'un nouveau message via MessagingService
   * Remplace l'ancienne logique de broadcast dans _handleNewMessage
   * Utilise le comportement simple et fiable de l'ancienne méthode
   * 
   * OPTIMISATION: Le calcul des stats est fait de manière asynchrone (non-bloquant)
   */
  private async _broadcastNewMessage(message: Message, conversationId: string, senderSocket?: any): Promise<void> {
    try {
      // Normaliser l'ID de conversation pour le broadcast ET le payload
      const normalizedId = await this.normalizeConversationId(conversationId);


      // CORRECTION CRITIQUE: Remplacer message.conversationId par l'ObjectId normalisé
      // car le message en base peut contenir l'identifier au lieu de l'ObjectId
      (message as any).conversationId = normalizedId;
      
      // OPTIMISATION: Récupérer les traductions et les stats en parallèle (non-bloquant)
      // Les stats seront envoyées séparément si elles prennent du temps
      let messageTranslations: any[] = [];
      let updatedStats: any = null;
      
      // Lancer les 2 requêtes en parallèle
      const [translationsResult, statsResult] = await Promise.allSettled([
        // Récupérer les traductions existantes du message (format JSON)
        (async () => {
          if (!message.id) return [];
          try {
            const messageWithTranslations = await this.prisma.message.findUnique({
              where: { id: message.id },
              select: {
                translations: true
              }
            });
            // Transformer JSON vers array pour frontend
            return transformTranslationsToArray(
              message.id,
              messageWithTranslations?.translations as Record<string, any>
            );
          } catch (error) {
            logger.warn(`⚠️ [DEBUG] Erreur récupération traductions pour ${message.id}:`, error);
            return [];
          }
        })(),
        // OPTIMISATION: Calculer les stats de manière asynchrone
        // Si c'est long, le broadcast du message ne sera pas bloqué
        conversationStatsService.updateOnNewMessage(
          this.prisma,
          conversationId,  // Utiliser l'ID original (ObjectId) pour Prisma
          message.originalLanguage || 'fr',
          () => this.getConnectedUsers()
        ).catch(error => {
          logger.warn(`⚠️ [PERF] Erreur calcul stats (non-bloquant): ${error}`);
          return null; // Continuer même si les stats échouent
        })
      ]);

      // Extraire les résultats
      if (translationsResult.status === 'fulfilled') {
        messageTranslations = translationsResult.value;
      }

      if (statsResult.status === 'fulfilled') {
        updatedStats = statsResult.value;
      } else {
        logger.warn(`⚠️ [PERF] Stats non disponibles, broadcast sans stats`);
      }

      // Construire le payload de message pour broadcast - compatible avec les types existants
      // CORRECTION CRITIQUE: Utiliser l'ObjectId normalisé pour cohérence client-serveur
      const messagePayload = {
        id: message.id,
        conversationId: normalizedId,  // ← FIX: Toujours utiliser l'ObjectId normalisé
        senderId: message.senderId || undefined,
        content: message.content,
        originalLanguage: message.originalLanguage || 'fr',
        originalContent: (message as any).originalContent || message.content,
        messageType: (message.messageType || 'text') as MessageType,
        isEdited: Boolean(message.isEdited),
        deletedAt: message.deletedAt || undefined,
        isBlurred: Boolean((message as any).isBlurred),
        isViewOnce: Boolean((message as any).isViewOnce),
        effectFlags: (message as any).effectFlags ?? 0,
        expiresAt: (message as any).expiresAt || undefined,
        createdAt: message.createdAt || new Date(),
        updatedAt: message.updatedAt || new Date(),
        // CORRECTION CRITIQUE: Inclure validatedMentions pour rendre les mentions cliquables en temps réel
        validatedMentions: (message as any).validatedMentions || [],
        // CORRECTION CRITIQUE: Inclure les traductions dans le payload
        translations: messageTranslations,
        // Unified Participant sender
        sender: message.sender ? (() => {
          const s = message.sender as any;
          const u = s.user;
          return {
            id: s.id,
            displayName: s.nickname || s.displayName,
            avatar: s.avatar || u?.avatar,
            type: s.type,
            userId: s.userId,
            username: u?.username,
            firstName: u?.firstName || '',
            lastName: u?.lastName || '',
          };
        })() : undefined,
        // CORRECTION: Inclure les attachments dans le payload avec metadata brut
        attachments: (message as any).attachments || [],
        // CORRECTION: Inclure l'objet replyTo complet ET replyToId
        replyToId: message.replyToId || undefined,
        replyTo: (message as any).replyTo ? {
          id: (message as any).replyTo.id,
          conversationId: normalizedId,
          senderId: (message as any).replyTo.senderId || undefined,
          content: (message as any).replyTo.content,
          originalLanguage: (message as any).replyTo.originalLanguage || 'fr',
          messageType: ((message as any).replyTo.messageType || 'text') as MessageType,
          createdAt: (message as any).replyTo.createdAt || new Date(),
          sender: (message as any).replyTo.sender ? {
            id: (message as any).replyTo.sender.id,
            displayName: (message as any).replyTo.sender.nickname || (message as any).replyTo.sender.displayName,
            avatar: (message as any).replyTo.sender.avatar,
            type: (message as any).replyTo.sender.type,
            userId: (message as any).replyTo.sender.userId,
            username: (message as any).replyTo.sender.user?.username,
            firstName: (message as any).replyTo.sender.user?.firstName || '',
            lastName: (message as any).replyTo.sender.user?.lastName || '',
          } : undefined
        } : undefined,
        meta: {
          conversationStats: updatedStats
        }
      };

      // DEBUG: Log pour vérifier les attachments et metadata
      if ((message as any).attachments && (message as any).attachments.length > 0) {
        logger.info('🔍 [WEBSOCKET] Broadcasting message avec attachments:', {
          messageId: message.id,
          attachmentCount: (message as any).attachments.length,
          firstAttachment: {
            id: (message as any).attachments[0].id,
            hasMetadata: !!(message as any).attachments[0].metadata,
            metadata: (message as any).attachments[0].metadata,
            metadataType: typeof (message as any).attachments[0].metadata,
            metadataKeys: (message as any).attachments[0].metadata ? Object.keys((message as any).attachments[0].metadata) : []
          },
          payloadAttachments: messagePayload.attachments,
          payloadFirstAttachment: messagePayload.attachments && messagePayload.attachments[0] ? {
            id: messagePayload.attachments[0].id,
            hasMetadata: !!(messagePayload.attachments[0] as any).metadata,
            metadataKeys: (messagePayload.attachments[0] as any).metadata ? Object.keys((messagePayload.attachments[0] as any).metadata) : []
          } : null
        });
      }

      // COMPORTEMENT SIMPLE ET FIABLE DE L'ANCIENNE MÉTHODE
      const room = ROOMS.conversation(normalizedId);
      // 1. Broadcast vers tous les clients de la conversation
      this.io.to(room).emit(SERVER_EVENTS.MESSAGE_NEW, messagePayload);

      // 2. S'assurer que l'auteur reçoit aussi (au cas où il ne serait pas dans la room encore)
      if (senderSocket) {
        senderSocket.emit(SERVER_EVENTS.MESSAGE_NEW, messagePayload);
      } else {
      }

      // 2b. Emit mention:created to each mentioned user's personal room
      const mentions = (message as any).validatedMentions as Array<{ participantId?: string; userId?: string; username?: string }> | undefined;
      if (mentions && mentions.length > 0) {
        for (const mention of mentions) {
          const targetUserId = mention.userId;
          if (targetUserId && targetUserId !== message.senderId) {
            this.io.to(ROOMS.user(targetUserId)).emit(SERVER_EVENTS.MENTION_CREATED, {
              messageId: message.id,
              conversationId: normalizedId,
              senderId: message.senderId,
              mentionedUserId: targetUserId,
              mentionedParticipantId: mention.participantId,
              content: (message as any).content,
              timestamp: new Date().toISOString(),
            });
          }
        }
      }

      const roomClients = this.io.sockets.adapter.rooms.get(room);

      // 3. Mettre à jour le unreadCount pour tous les participants (sauf l'expéditeur)
      // Cela permet d'incrémenter le badge en temps réel pour les conversations non ouvertes
      try {
        const senderId = message.senderId;
        if (senderId) {
          // Récupérer tous les participants de la conversation (Participant model)
          const participants = await this.prisma.participant.findMany({
            where: {
              conversationId: normalizedId,
              isActive: true,
              id: { not: senderId }
            },
            select: { id: true, userId: true }
          });

          // Calculer le unreadCount pour chaque participant et émettre l'événement
          const { MessageReadStatusService } = await import('../services/MessageReadStatusService.js');
          const readStatusService = new MessageReadStatusService(this.prisma);

          const connectedUserIds = new Set(this.getConnectedUsers());

          for (const participant of participants) {
            const roomTarget = participant.userId || participant.id;
            const unreadCount = await readStatusService.getUnreadCount(roomTarget, normalizedId);

            // Émettre vers le socket personnel de l'utilisateur
            this.io.to(ROOMS.user(roomTarget)).emit(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, {
              conversationId: normalizedId,
              unreadCount
            });

            // Queue message for offline participants
            if (this.deliveryQueue && !connectedUserIds.has(roomTarget)) {
              this.deliveryQueue.enqueue(roomTarget, {
                messageId: message.id,
                conversationId: normalizedId,
                payload: messagePayload as Record<string, unknown>,
                enqueuedAt: new Date().toISOString(),
              }).catch(err => logger.warn('Failed to enqueue message for offline user', { userId: roomTarget, error: err }));
            }
          }
        }
      } catch (unreadError) {
        logger.warn('⚠️ [UNREAD_COUNT] Erreur calcul unreadCount (non-bloquant):', unreadError);
      }

      // Envoyer les notifications de message pour les utilisateurs non connectés à la conversation
      if (message.senderId) {
        // Note: Les notifications sont gérées directement dans routes/notifications.ts
      }
      
    } catch (error) {
      logger.error('[PHASE 3.1] Erreur broadcast message', error);
    }
  }

  /**
   * Public wrapper pour broadcaster un nouveau message depuis une route REST.
   * Permet aux routes HTTP de déclencher le broadcast socket sans accéder aux méthodes privées.
   */
  public async broadcastMessage(message: Message, conversationId: string): Promise<void> {
    const messageWithTimestamp = {
      ...message,
      timestamp: (message as any).createdAt || (message as any).timestamp || new Date()
    } as any;
    await this._broadcastNewMessage(messageWithTimestamp, conversationId);
  }


  // Méthodes publiques pour les statistiques et la gestion
  getStats() {
    return {
      ...this.stats,
      connected_users: this.connectedUsers.size,
      translation_service_stats: this.translationService.getStats()
    };
  }

  /**
   * Vérifie si un utilisateur est connecté
   */
  isUserConnected(userId: string): boolean {
    return this.connectedUsers.has(userId);
  }


  /**
   * Vérifie si un utilisateur est dans une salle de conversation
   */
  isUserInConversationRoom(userId: string, conversationId: string): boolean {
    const user = this.connectedUsers.get(userId);
    if (user) {
      const socket = this.io.sockets.sockets.get(user.socketId);
      if (socket) {
        return socket.rooms.has(`conversation:${conversationId}`);
      }
    }
    return false;
  }


  /**
   * Déconnecte un utilisateur spécifique
   */
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

  /**
   * Envoie une notification à un utilisateur spécifique
   */
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

  /**
   * Broadcast un message à tous les utilisateurs connectés
   */
  broadcast<K extends keyof ServerToClientEvents>(
    event: K, 
    ...args: Parameters<ServerToClientEvents[K]>
  ): void {
    this.io.emit(event, ...args);
  }

  /**
   * Obtient la liste des utilisateurs connectés
   */
  getConnectedUsers(): string[] {
    return Array.from(this.connectedUsers.keys());
  }



  async healthCheck(): Promise<boolean> {
    try {
      const translationHealth = await this.translationService.healthCheck();
      return translationHealth;
    } catch (error) {
      logger.error(`❌ Health check échoué: ${error}`);
      return false;
    }
  }

  async close(): Promise<void> {
    try {
      // ✅ FIX BUG #3: Ticker supprimé, plus besoin de le nettoyer
      // Le système n'utilise plus de polling périodique

      await this.translationService.close();
      this.io.close();
    } catch (error) {
      logger.error(`❌ Erreur fermeture MeeshySocketIOManager: ${error}`);
    }
  }

  // --------------------------------------------------------------------------
  // AGENT INTEGRATION
  // --------------------------------------------------------------------------

  setAgentClient(client: ZmqAgentClient): void {
    this.agentClient = client;
    logger.info('[Agent] ZmqAgentClient wired to SocketIOManager');
  }

  async handleAgentResponse(response: {
    type: 'agent:response';
    conversationId: string;
    asUserId: string;
    content: string;
    originalLanguage: string;
    replyToId?: string;
    mentionedUsernames?: string[];
    messageSource: 'agent';
    metadata: { agentType: 'impersonator' | 'animator' | 'orchestrator'; roleConfidence: number; archetypeId?: string };
  }): Promise<void> {
    try {
      // Resolve mentionedUsernames to mentionedUserIds for the full mention pipeline
      let mentionedUserIds: string[] | undefined;
      if (response.mentionedUsernames && response.mentionedUsernames.length > 0) {
        const users = await this.prisma.user.findMany({
          where: { username: { in: response.mentionedUsernames.map((u) => u.toLowerCase()) } },
          select: { id: true },
        });
        if (users.length > 0) {
          mentionedUserIds = users.map((u) => u.id);
        }
      } else if (response.content?.includes('@')) {
        // Résolution @DisplayName depuis les participants de la conversation
        const participants = await this.getConversationParticipantsForMention(response.conversationId);
        if (participants.length > 0) {
          const usernames = this.mentionService.extractMentionsWithParticipants(response.content, participants);
          if (usernames.length > 0) {
            const userMap = await this.mentionService.resolveUsernames(usernames);
            const resolved = [...userMap.values()].map((u) => u.id);
            if (resolved.length > 0) {
              mentionedUserIds = resolved;
            }
          }
        }
      }

      // Use MessagingService full pipeline: DB save + mention extraction + translation + broadcast
      const messageRequest = {
        conversationId: response.conversationId,
        content: response.content,
        originalLanguage: response.originalLanguage,
        messageType: 'text' as const,
        messageSource: 'agent' as const,
        replyToId: response.replyToId,
        mentionedUserIds,
        isAnonymous: false,
        metadata: { source: 'api' as const },
      };

      const result = await this.messagingService.handleMessage(
        messageRequest,
        response.asUserId
      );

      if (!result.success || !result.data) {
        logger.error(`[Agent] handleMessage failed — conv=${response.conversationId}`, result.error);
        return;
      }

      // Broadcast to all members (translation arrives asynchronously via translationReady event)
      // Note: Notifications are already triggered inside messagingService.handleMessage -> processor.triggerAllNotifications
      const messageWithTimestamp = { ...result.data, timestamp: result.data.createdAt } as any;
      await this._broadcastNewMessage(messageWithTimestamp, response.conversationId);

      logger.info(`[Agent] Response sent — conv=${response.conversationId} user=${response.asUserId} type=${response.metadata.agentType} msgId=${result.data.id}`);
    } catch (error) {
      logger.error('[Agent] handleAgentResponse error:', error);
    }
  }

  private async getConversationParticipantsForMention(
    conversationId: string
  ): Promise<import('@meeshy/shared/utils/mention-parser').MentionParticipant[]> {
    try {
      const participants = await this.prisma.participant.findMany({
        where: { conversationId, isActive: true, userId: { not: null } },
        select: {
          userId: true,
          displayName: true,
          user: {
            select: { id: true, username: true, displayName: true }
          }
        }
      });

      return participants
        .filter((p): p is typeof p & { user: NonNullable<typeof p.user> } => p.user !== null)
        .map((p) => ({
          userId: p.user.id,
          username: p.user.username,
          displayName: p.user.displayName ?? p.user.username,
        }));
    } catch {
      return [];
    }
  }

  async handleAgentReaction(reaction: {
    type: 'agent:reaction';
    conversationId: string;
    asUserId: string;
    targetMessageId: string;
    emoji: string;
  }): Promise<void> {
    try {
      const { ReactionService } = await import('../services/ReactionService.js');
      const reactionService = new ReactionService(this.prisma);

      const result = await reactionService.addReaction({
        messageId: reaction.targetMessageId,
        emoji: reaction.emoji,
        participantId: reaction.asUserId,
      });

      if (!result) {
        logger.warn(`[Agent] Reaction failed — conv=${reaction.conversationId} msg=${reaction.targetMessageId}`);
        return;
      }

      const updateEvent = await reactionService.createUpdateEvent(
        reaction.targetMessageId,
        reaction.emoji,
        'add',
        reaction.asUserId,
        reaction.conversationId
      );

      const message = await this.prisma.message.findUnique({
        where: { id: reaction.targetMessageId },
        select: { conversationId: true },
      });

      if (message) {
        const normalizedConversationId = message.conversationId;
        this.io.to(ROOMS.conversation(normalizedConversationId)).emit(SERVER_EVENTS.REACTION_ADDED, updateEvent);
      }

      logger.info(`[Agent] Reaction sent — conv=${reaction.conversationId} user=${reaction.asUserId} emoji=${reaction.emoji} msg=${reaction.targetMessageId}`);
    } catch (error) {
      logger.error('[Agent] handleAgentReaction error:', error);
    }
  }

  private async _resolveMentionUserIds(usernames: string[]): Promise<string[]> {
    if (usernames.length === 0) return [];
    try {
      const users = await this.prisma.user.findMany({
        where: { username: { in: usernames.map((u) => u.toLowerCase()) } },
        select: { id: true },
      });
      return users.map((u) => u.id);
    } catch {
      return [];
    }
  }

  private _notifyAgent(message: {
    id: string;
    conversationId: string;
    senderId: string | null;
    senderDisplayName?: string;
    senderUsername?: string;
    content: string | null;
    originalLanguage: string | null;
    replyToId?: string | null;
    mentionedUserIds?: string[];
    createdAt: Date;
  }): void {
    if (!this.agentClient || !message.senderId || !message.content) return;
    this.agentClient.sendEvent({
      type: 'agent:new-message',
      conversationId: message.conversationId,
      messageId: message.id,
      senderId: message.senderId,
      senderDisplayName: message.senderDisplayName,
      senderUsername: message.senderUsername,
      content: message.content,
      originalLanguage: message.originalLanguage ?? 'fr',
      replyToId: message.replyToId ?? undefined,
      mentionedUserIds: message.mentionedUserIds ?? [],
      timestamp: message.createdAt.getTime(),
    }).catch((err: unknown) => {
      logger.warn('[Agent] sendEvent error (non-blocking):', err);
    });
  }
}
