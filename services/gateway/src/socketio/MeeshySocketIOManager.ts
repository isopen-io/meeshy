/**
 * Gestionnaire Socket.IO pour Meeshy
 * Gestion des connexions, conversations et traductions en temps réel
 */

import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import * as path from 'path';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { MessageTranslationService, MessageData } from '../services/message-translation/MessageTranslationService';
import { transformTranslationsToArray } from '../utils/translation-transformer';
import { MaintenanceService } from '../services/MaintenanceService';
import { StatusService } from '../services/StatusService';
import { MessagingService } from '../services/MessagingService';
import { CallEventsHandler } from './CallEventsHandler';
import { SocialEventsHandler } from './handlers/SocialEventsHandler';
import { CallService } from '../services/CallService';
import { AttachmentService } from '../services/attachments';
import { EmailService } from '../services/EmailService';
import { NotificationService } from '../services/notifications/NotificationService';
import { PrivacyPreferencesService } from '../services/PrivacyPreferencesService';
import { PostAudioService } from '../services/posts/PostAudioService';
import { PostTranslationService } from '../services/posts/PostTranslationService';
import { StoryTextObjectTranslationService } from '../services/posts/StoryTextObjectTranslationService';
import { validateMessageLength } from '../config/message-limits';
import jwt from 'jsonwebtoken';
import type {
  ServerToClientEvents,
  ClientToServerEvents,
  SocketIOMessage,
  SocketIOUser,
  SocketIOResponse,
  TypingEvent,
  TranslationEvent,
  UserStatusEvent,
  TranslatedAudioData,
  TranscriptionReadyEventData
} from '@meeshy/shared/types/socketio-events';
import { CLIENT_EVENTS, SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { conversationStatsService } from '../services/ConversationStatsService';
import type { MessageRequest, MessageResponse } from '@meeshy/shared/types/messaging';
import type { Message } from '@meeshy/shared/types/index';
import { enhancedLogger } from '../utils/logger-enhanced';
import type { ZmqAgentClient } from '../services/zmq-agent/ZmqAgentClient';
import { MentionService } from '../services/MentionService';
import { hashSessionToken } from '../utils/session-token';
import { getSocketRateLimiter, SOCKET_RATE_LIMITS } from '../utils/socket-rate-limiter';

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
  private privacyPreferencesService: PrivacyPreferencesService;
  private agentClient: ZmqAgentClient | null = null;
  private mentionService: MentionService;
  private rateLimiter = getSocketRateLimiter();

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
    translationService: MessageTranslationService,
    redis?: any
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

    // Initialiser le PostAudioService singleton (dépend de socialEventsHandler)
    PostAudioService.init(this.prisma, this.socialEventsHandler);

    // Initialiser le StoryTextObjectTranslationService singleton
    StoryTextObjectTranslationService.init(this.prisma, this.io as any);

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
      
      // Authentification automatique via le token envoyé dans socket.auth
      this._handleTokenAuthentication(socket);
      
      // Authentification manuelle (fallback)
      socket.on(CLIENT_EVENTS.AUTHENTICATE, async (data: { userId?: string; sessionToken?: string; language?: string }) => {
        await this._handleAuthentication(socket, data);
      });
      
      // Réception d'un nouveau message (avec ACK) - PHASE 3.1: MessagingService Integration
      socket.on(CLIENT_EVENTS.MESSAGE_SEND, async (data: {
        conversationId: string;
        content: string;
        originalLanguage?: string;
        messageType?: string;
        replyToId?: string;
        clientMessageId?: string;
      }, callback?: (response: SocketIOResponse<{ messageId: string; clientMessageId?: string; message?: any }>) => void) => {
        try {

          const userIdOrToken = this.socketToUser.get(socket.id);

          if (!userIdOrToken) {
            logger.error(`❌ [MESSAGE_SEND] Socket ${socket.id} non authentifié`);
            logger.error(`  └─ Sockets connectés:`, Array.from(this.socketToUser.keys()).slice(0, 5));

            const errorResponse: SocketIOResponse<{ messageId: string }> = {
              success: false,
              error: 'User not authenticated'
            };

            if (callback) callback(errorResponse);
            socket.emit(SERVER_EVENTS.ERROR, { message: 'User not authenticated' });
            return;
          }

          // Récupérer l'utilisateur (gère le cas sessionToken pour anonymes)
          const userResult = this._getConnectedUser(userIdOrToken);
          const user = userResult?.user;
          const userId = userResult?.realUserId || userIdOrToken;

          // Rate limiting: 20 messages/min par utilisateur (P3-39)
          const rateLimitAllowed = await this.rateLimiter.checkLimit(userId, SOCKET_RATE_LIMITS.MESSAGE_SEND);
          if (!rateLimitAllowed) {
            const info = this.rateLimiter.getRateLimitInfo(userId, SOCKET_RATE_LIMITS.MESSAGE_SEND);
            const errorResponse: SocketIOResponse<{ messageId: string }> = {
              success: false,
              error: 'Rate limit exceeded'
            };
            if (callback) callback(errorResponse);
            socket.emit(SERVER_EVENTS.ERROR, {
              message: `Rate limit exceeded. Please wait ${Math.ceil(info.resetIn / 1000)} seconds.`
            });
            return;
          }

          // Validation de la longueur du message
          const validation = validateMessageLength(data.content);
          if (!validation.isValid) {
            const errorResponse: SocketIOResponse<{ messageId: string }> = {
              success: false,
              error: validation.error || 'Message invalide'
            };

            if (callback) callback(errorResponse);
            socket.emit(SERVER_EVENTS.ERROR, { message: validation.error || 'Message invalide' });
            logger.warn(`⚠️ [WEBSOCKET] Message rejeté pour ${userId}: ${validation.error}`);
            return;
          }

          // Déterminer si l'utilisateur est anonyme
          const isAnonymous = user?.isAnonymous || false;

          // Envoi de message = activité détectable
          // → Mettre à jour lastActiveAt (throttled à 5s)
          if (this.statusService) {
            this.statusService.updateLastSeen(userId, isAnonymous);
          }

          // Pour les utilisateurs anonymes, utiliser le displayName mis en cache lors de l'auth socket (P3-42)
          let anonymousDisplayName: string | undefined;
          if (isAnonymous) {
            anonymousDisplayName = user?.displayName || 'Anonymous User';
          }

          // Mapper les données vers le format MessageRequest
          const messageRequest: MessageRequest = {
            conversationId: data.conversationId,
            content: data.content,
            originalLanguage: data.originalLanguage,
            messageType: data.messageType || 'text',
            replyToId: data.replyToId,
            isAnonymous: isAnonymous,
            anonymousDisplayName: anonymousDisplayName,
            metadata: {
              source: 'websocket',
              socketId: socket.id,
              clientTimestamp: Date.now()
            }
          };


          // PHASE 3.1.1: Extraction des tokens d'authentification pour détection robuste
          const jwtToken = this.extractJWTToken(socket);
          const sessionToken = this.extractSessionToken(socket);


          // PHASE 3.1: Utilisation du MessagingService unifié (Participant model)
          // userId here is participantId for anonymous, or resolved per-conversation for registered
          const response: MessageResponse = await this.messagingService.handleMessage(
            messageRequest,
            userId
          );

          // Réponse via callback - typage strict SocketIOResponse
          // Include clientMessageId in ack so sender can replace optimistic message
          if (callback) {
            if (response.success && response.data) {
              const ackData: { messageId: string; clientMessageId?: string } = {
                messageId: response.data.id,
              };
              if (data.clientMessageId) {
                ackData.clientMessageId = data.clientMessageId;
              }
              callback({ success: true, data: ackData });
            } else {
              callback({
                success: false,
                error: response.error || 'Failed to send message',
              });
            }
          }

          // Broadcast temps réel vers tous les clients de la conversation (y compris l'auteur)
          if (response.success && response.data?.id) {
            // Récupérer le message depuis la base de données pour le broadcast
            const message = await this.prisma.message.findUnique({
              where: { id: response.data.id },
              include: {
                sender: {
                  select: {
                    id: true,
                    displayName: true,
                    avatar: true,
                    type: true,
                    nickname: true,
                    userId: true,
                    user: {
                      select: {
                        id: true,
                        username: true,
                        displayName: true,
                        firstName: true,
                        lastName: true,
                        avatar: true
                      }
                    }
                  }
                },
                attachments: {
                  select: {
                    id: true,
                    messageId: true,
                    fileName: true,
                    originalName: true,
                    mimeType: true,
                    fileSize: true,
                    fileUrl: true,
                    thumbnailUrl: true,
                    width: true,
                    height: true,
                    duration: true,
                    bitrate: true,
                    sampleRate: true,
                    codec: true,
                    channels: true,
                    metadata: true, // Inclure le champ metadata pour audioEffectsTimeline
                    uploadedBy: true,
                    isAnonymous: true,
                    createdAt: true
                  }
                },
                // NOTE: validatedMentions est un champ String[] et est automatiquement inclus (pas besoin de include)
                replyTo: {
                  include: {
                    sender: {
                      select: {
                        id: true,
                        displayName: true,
                        avatar: true,
                        type: true,
                        nickname: true,
                        userId: true,
                        user: {
                          select: {
                            id: true,
                            username: true,
                            displayName: true,
                            firstName: true,
                            lastName: true,
                            avatar: true
                          }
                        }
                      }
                    }
                  }
                }
              }
            });

            if (message) {
              // Ajouter le champ timestamp requis par le type Message
              const messageWithTimestamp = {
                ...message,
                timestamp: message.createdAt
              } as any; // Cast temporaire pour éviter les conflits de types
              // FIX: Utiliser message.conversationId (déjà normalisé en base) au lieu de data.conversationId (peut être un identifier)
              await this._broadcastNewMessage(messageWithTimestamp, message.conversationId, socket);

              // Notifier le service agent (fire-and-forget)
              this._notifyAgent({
                id: message.id,
                conversationId: message.conversationId,
                senderId: message.senderId,
                senderDisplayName: (message.sender as any)?.displayName ?? (message.sender as any)?.username,
                senderUsername: (message.sender as any)?.username,
                content: message.content,
                originalLanguage: message.originalLanguage,
                replyToId: message.replyToId,
                mentionedUserIds: await this._resolveMentionUserIds(message.validatedMentions ?? []),
                createdAt: message.createdAt,
              });

              // Créer des notifications pour les autres participants de la conversation
              await this._createMessageNotifications(message, userId);
            }
          }

          this.stats.messages_processed++;
          
        } catch (error: any) {
          logger.error('[WEBSOCKET] Erreur envoi message', error);
          this.stats.errors++;

          if (callback) {
            const errorResponse: SocketIOResponse<{ messageId: string }> = {
              success: false,
              error: 'Failed to send message'
            };
            callback(errorResponse);
          }
        }
      });
      
      // Envoi de message avec attachments
      socket.on(CLIENT_EVENTS.MESSAGE_SEND_WITH_ATTACHMENTS, async (data: {
        conversationId: string;
        content: string;
        originalLanguage?: string;
        attachmentIds: string[];
        replyToId?: string;
        clientMessageId?: string;
      }, callback?: (response: SocketIOResponse<{ messageId: string; clientMessageId?: string }>) => void) => {
        try {
          const userIdOrToken = this.socketToUser.get(socket.id);
          if (!userIdOrToken) {
            const errorResponse: SocketIOResponse<{ messageId: string }> = {
              success: false,
              error: 'User not authenticated'
            };

            if (callback) callback(errorResponse);
            socket.emit(SERVER_EVENTS.ERROR, { message: 'User not authenticated' });
            return;
          }

          // Récupérer l'utilisateur (gère le cas sessionToken pour anonymes)
          const userResult = this._getConnectedUser(userIdOrToken);
          const user = userResult?.user;
          const userId = userResult?.realUserId || userIdOrToken;

          // Validation de la longueur du message (si du contenu texte est présent)
          if (data.content && data.content.trim()) {
            const validation = validateMessageLength(data.content);
            if (!validation.isValid) {
              const errorResponse: SocketIOResponse<{ messageId: string }> = {
                success: false,
                error: validation.error || 'Message invalide'
              };

              if (callback) callback(errorResponse);
              socket.emit(SERVER_EVENTS.ERROR, { message: validation.error || 'Message invalide' });
              logger.warn(`⚠️ [WEBSOCKET] Message avec attachments rejeté pour ${userId}: ${validation.error}`);
              return;
            }
          }

          // Vérifier que les attachments existent et appartiennent à l'utilisateur
          const attachmentService = new (await import('../services/attachments')).AttachmentService(this.prisma);

          for (const attachmentId of data.attachmentIds) {
            const attachment = await attachmentService.getAttachment(attachmentId);
            if (!attachment) {
              const errorResponse: SocketIOResponse<{ messageId: string }> = {
                success: false,
                error: `Attachment ${attachmentId} not found`
              };
              if (callback) callback(errorResponse);
              return;
            }

            // Vérifier que l'attachment appartient à l'utilisateur
            if (attachment.uploadedBy !== userId) {
              const errorResponse: SocketIOResponse<{ messageId: string }> = {
                success: false,
                error: `Attachment ${attachmentId} does not belong to user`
              };
              if (callback) callback(errorResponse);
              return;
            }
          }

          // Déterminer si l'utilisateur est anonyme
          const isAnonymous = user?.isAnonymous || false;

          let anonymousDisplayName: string | undefined;
          if (isAnonymous) {
            try {
              const userSessionToken = user?.sessionToken;
              if (!userSessionToken) {
                logger.error('SessionToken manquant pour utilisateur anonyme', userId);
                anonymousDisplayName = 'Anonymous User';
              } else {
                const anonymousParticipant = await this.prisma.participant.findFirst({
                  where: { id: userId, type: 'anonymous' },
                  select: { displayName: true, nickname: true }
                });
              
                if (anonymousParticipant) {
                  anonymousDisplayName = anonymousParticipant.nickname || anonymousParticipant.displayName || 'Anonymous User';
                } else {
                  anonymousDisplayName = 'Anonymous User';
                }
              }
            } catch (error) {
              logger.error('Erreur lors de la récupération du nom anonyme', error);
              anonymousDisplayName = 'Anonymous User';
            }
          }

          // Créer le message via MessagingService
          const messageRequest: MessageRequest = {
            conversationId: data.conversationId,
            content: data.content,
            originalLanguage: data.originalLanguage,
            messageType: 'text', // Peut être déduit des attachments
            replyToId: data.replyToId,
            isAnonymous: isAnonymous,
            anonymousDisplayName: anonymousDisplayName,
            // IMPORTANT: Inclure les attachmentIds pour la validation
            attachments: data.attachmentIds.map(id => ({ id } as any)),
            metadata: {
              source: 'websocket',
              socketId: socket.id,
              clientTimestamp: Date.now()
            }
          };


          const response: MessageResponse = await this.messagingService.handleMessage(
            messageRequest,
            userId
          );

          // Associer les attachments au message
          if (response.success && response.data?.id) {
            await attachmentService.associateAttachmentsToMessage(data.attachmentIds, response.data.id);

            // ═══════════════════════════════════════════════════════════════
            // AUDIO PROCESSING: Envoyer les attachements audio au Translator
            // ═══════════════════════════════════════════════════════════════
            try {
              // Récupérer les détails des attachments pour vérifier s'il y a des audios
              const attachmentsDetails = await this.prisma.messageAttachment.findMany({
                where: { id: { in: data.attachmentIds } },
                select: {
                  id: true,
                  mimeType: true,
                  fileUrl: true,
                  filePath: true,
                  duration: true,
                  metadata: true
                }
              });

              // Filtrer les attachements audio
              const audioAttachments = attachmentsDetails.filter(att =>
                att.mimeType && att.mimeType.startsWith('audio/')
              );

              // Pour chaque audio, envoyer au Translator
              for (const audioAtt of audioAttachments) {
                logger.info(`🎤 [WEBSOCKET] Envoi audio au Translator: ${audioAtt.id}`);

                // Extraire la transcription mobile si présente dans les metadata
                let mobileTranscription: any = undefined;
                if (audioAtt.metadata && typeof audioAtt.metadata === 'object') {
                  const metadata = audioAtt.metadata as any;
                  if (metadata.transcription) {
                    mobileTranscription = metadata.transcription;
                    logger.info(`   📝 Transcription mobile trouvée: "${mobileTranscription.text?.substring(0, 50)}..."`);
                  }
                }

                // Envoyer au Translator pour transcription, traduction et clonage vocal
                // UPLOAD_PATH doit être défini dans Docker, fallback sécurisé vers /app/uploads
                const uploadBasePath = process.env.UPLOAD_PATH || '/app/uploads';
                const audioPath = audioAtt.filePath ? path.join(uploadBasePath, audioAtt.filePath) : '';

                await this.translationService.processAudioAttachment({
                  messageId: response.data.id,
                  attachmentId: audioAtt.id,
                  conversationId: data.conversationId,
                  senderId: userId,
                  audioUrl: audioAtt.fileUrl || '',
                  audioPath: audioPath,
                  audioDurationMs: audioAtt.duration || 0,
                  mobileTranscription: mobileTranscription,
                  generateVoiceClone: true,
                  modelType: 'medium'
                });
              }

              if (audioAttachments.length > 0) {
                logger.info(`✅ [WEBSOCKET] ${audioAttachments.length} audio(s) envoyé(s) au Translator`);
              }
            } catch (audioError) {
              logger.error('⚠️ [WEBSOCKET] Erreur envoi audio au Translator', audioError);
              // Ne pas bloquer l'envoi du message si le traitement audio échoue
            }
          }

          // Réponse via callback — include clientMessageId for sender-side dedup
          if (callback) {
            if (response.success && response.data) {
              const ackData: { messageId: string; clientMessageId?: string } = {
                messageId: response.data.id,
              };
              if (data.clientMessageId) {
                ackData.clientMessageId = data.clientMessageId;
              }
              callback({ success: true, data: ackData });
            } else {
              callback({
                success: false,
                error: response.error || 'Failed to send message',
              });
            }
          }

          // Broadcast temps réel vers tous les clients de la conversation (y compris l'auteur)
          if (response.success && response.data?.id) {
            // Récupérer le message depuis la base de données avec les attachments ET replyTo
            const message = await this.prisma.message.findUnique({
              where: { id: response.data.id },
              include: {
                sender: {
                  select: {
                    id: true,
                    displayName: true,
                    avatar: true,
                    type: true,
                    nickname: true,
                    userId: true,
                    user: {
                      select: {
                        id: true,
                        username: true,
                        displayName: true,
                        firstName: true,
                        lastName: true,
                        avatar: true
                      }
                    }
                  }
                },
                attachments: {
                  select: {
                    id: true,
                    messageId: true,
                    fileName: true,
                    originalName: true,
                    mimeType: true,
                    fileSize: true,
                    fileUrl: true,
                    thumbnailUrl: true,
                    width: true,
                    height: true,
                    duration: true,
                    bitrate: true,
                    sampleRate: true,
                    codec: true,
                    channels: true,
                    fps: true,
                    videoCodec: true,
                    pageCount: true,
                    lineCount: true,
                    metadata: true, // Inclure audioEffectsTimeline et autres métadonnées JSON
                    uploadedBy: true,
                    isAnonymous: true,
                    createdAt: true
                  }
                },
                // NOTE: validatedMentions est un champ String[] et est automatiquement inclus (pas besoin de include)
                replyTo: {
                  include: {
                    sender: {
                      select: {
                        id: true,
                        displayName: true,
                        avatar: true,
                        type: true,
                        nickname: true,
                        userId: true,
                        user: {
                          select: {
                            id: true,
                            username: true,
                            displayName: true,
                            firstName: true,
                            lastName: true,
                            avatar: true
                          }
                        }
                      }
                    }
                  }
                }
              }
            });
            
            if (message) {

              // Utiliser la méthode _broadcastNewMessage pour un formatting cohérent
              const messageWithTimestamp = {
                ...message,
                timestamp: message.createdAt
              } as any;
              // FIX: Utiliser message.conversationId (déjà normalisé en base) au lieu de data.conversationId (peut être un identifier)
              await this._broadcastNewMessage(messageWithTimestamp, message.conversationId, socket);
            }
          }
        } catch (error: any) {
          logger.error('❌ [WEBSOCKET] Erreur envoi message avec attachments', error);
          
          if (callback) {
            const errorResponse: SocketIOResponse<{ messageId: string }> = {
              success: false,
              error: 'Failed to send message with attachments'
            };
            callback(errorResponse);
          }
        }
      });
      
      // Demande de traduction spécifique
      socket.on(CLIENT_EVENTS.REQUEST_TRANSLATION, async (data: { messageId: string; targetLanguage: string }) => {
        await this._handleTranslationRequest(socket, data);
      });

      // Gestion des rooms conversation: join
      socket.on(CLIENT_EVENTS.CONVERSATION_JOIN, async (data: { conversationId: string }) => {
        const normalizedId = await this.normalizeConversationId(data.conversationId);
        const room = ROOMS.conversation(normalizedId);
        socket.join(room);
        const userId = this.socketToUser.get(socket.id);
        if (userId) {
          socket.emit(SERVER_EVENTS.CONVERSATION_JOINED, {
            conversationId: normalizedId,
            userId
          });
          // Pré-charger/rafraîchir les stats - utiliser l'ID original pour Prisma
          this._sendConversationStatsToSocket(socket, data.conversationId).catch(() => {});
        }
      });

      // Gestion des rooms conversation: leave
      socket.on(CLIENT_EVENTS.CONVERSATION_LEAVE, async (data: { conversationId: string }) => {
        const normalizedId = await this.normalizeConversationId(data.conversationId);
        const room = ROOMS.conversation(normalizedId);
        socket.leave(room);
        const userId = this.socketToUser.get(socket.id);
        if (userId) {
          socket.emit(SERVER_EVENTS.CONVERSATION_LEFT, { 
            conversationId: normalizedId,
            userId 
          });
        }
      });

      // Setup video/audio call events (Phase 1A: P2P MVP)
      // CVE-004: Pass getUserInfo to provide isAnonymous flag
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

      // ===== ÉVÉNEMENTS FEED SOCIAL =====
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

      // Déconnexion
      socket.on('disconnect', () => {
        this._handleDisconnection(socket);
      });
      
      // Événements de frappe
      socket.on(CLIENT_EVENTS.TYPING_START, (data: { conversationId: string }) => {
        this._handleTypingStart(socket, data);
      });
      
      socket.on(CLIENT_EVENTS.TYPING_STOP, (data: { conversationId: string }) => {
        this._handleTypingStop(socket, data);
      });

      // Heartbeat pour présence
      socket.on(CLIENT_EVENTS.HEARTBEAT, () => {
        this._handleHeartbeat(socket);
      });

      // ===== ÉVÉNEMENTS DE RÉACTIONS =====
      
      // Ajouter une réaction
      socket.on(CLIENT_EVENTS.REACTION_ADD, async (data: {
        messageId: string;
        emoji: string;
      }, callback?: (response: SocketIOResponse<any>) => void) => {
        await this._handleReactionAdd(socket, data, callback);
      });

      // Retirer une réaction
      socket.on(CLIENT_EVENTS.REACTION_REMOVE, async (data: {
        messageId: string;
        emoji: string;
      }, callback?: (response: SocketIOResponse<any>) => void) => {
        await this._handleReactionRemove(socket, data, callback);
      });

      // Demander la synchronisation des réactions d'un message
      socket.on(CLIENT_EVENTS.REACTION_REQUEST_SYNC, async (messageId: string, callback?: (response: SocketIOResponse<any>) => void) => {
        await this._handleReactionSync(socket, messageId, callback);
      });
    });
  }

  private async _handleTokenAuthentication(socket: any): Promise<void> {
    
    try {
      // Debug complet de socket.handshake

      // Récupérer les tokens depuis différentes sources avec types précis
      const authToken = socket.handshake?.headers?.authorization?.replace('Bearer ', '') || 
                       socket.handshake?.auth?.authToken ||
                       socket.handshake?.auth?.token; // Support pour socket.handshake.auth.token
      const sessionToken = socket.handshake?.headers?.['x-session-token'] as string || 
                          socket.handshake?.auth?.sessionToken;
      
      // Récupérer les types de tokens pour validation précise
      const tokenType = socket.handshake?.auth?.tokenType;
      const sessionType = socket.handshake?.auth?.sessionType;
      

      // Tentative d'authentification avec Bearer token (utilisateur authentifié)
      if (authToken && (!tokenType || tokenType === 'jwt')) {
        try {
          const jwtSecret = process.env.JWT_SECRET || 'default-secret';
          const decoded = jwt.verify(authToken, jwtSecret) as any;
          

          // Récupérer l'utilisateur depuis la base de données
          const dbUser = await this.prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { 
              id: true, 
              username: true,
              systemLanguage: true,
              isActive: true
            }
          });

          if (dbUser && dbUser.isActive) {
            
            // Créer l'utilisateur Socket.IO
            const user: SocketUser = {
              id: dbUser.id,
              socketId: socket.id,
              isAnonymous: false,
              language: dbUser.systemLanguage
            };

            // CORRECTION CRITIQUE: Gérer les connexions multiples (même utilisateur, plusieurs onglets)
            const existingUser = this.connectedUsers.get(user.id);
            if (existingUser && existingUser.socketId !== socket.id) {
              // Déconnecter l'ancienne socket
              const oldSocket = this.io.sockets.sockets.get(existingUser.socketId);
              if (oldSocket) {
                oldSocket.disconnect(true);
              }
              this.socketToUser.delete(existingUser.socketId);
            }

            // Enregistrer l'utilisateur
            this.connectedUsers.set(user.id, user);
            this.socketToUser.set(socket.id, user.id);
            this._addUserSocket(user.id, socket.id);

            // IMPORTANT: Rejoindre la room personnelle pour les notifications + feed social
            try {
              if (user.id && typeof user.id === 'string') {
                socket.join(user.id);
                socket.join(ROOMS.user(user.id));
                socket.join(ROOMS.feed(user.id));
                logger.info(`[Socket.IO] User ${user.id} joined personal room + user_ room + feed room`);
              } else {
                logger.error(`[Socket.IO] Invalid userId for socket.join: ${JSON.stringify(user.id)}`);
              }
            } catch (error) {
              logger.error(`[Socket.IO] Failed to join personal room for user ${user.id}:`, error);
            }

            // Retirer le guard de disconnect (reconnexion)
            this.statusService.markConnected(user.id, false);

            // Mettre à jour l'état en ligne dans la base de données et broadcaster
            await this.maintenanceService.updateUserOnlineStatus(user.id, true, true);

            // Rejoindre les conversations de l'utilisateur
            await this._joinUserConversations(socket, user.id, false);

            // Rejoindre la room globale si elle existe (conversation "meeshy")
            try {
              socket.join('conversation:any');
            } catch {}

            // CORRECTION CRITIQUE: Émettre l'événement AUTHENTICATED IMMÉDIATEMENT
            const authResponse = { 
              success: true, 
              user: { id: user.id, language: user.language, isAnonymous: false } 
            };
            
            socket.emit(SERVER_EVENTS.AUTHENTICATED, authResponse);
            
            
            return; // Authentification réussie
          } else {
          }
        } catch (jwtError: any) {
        }
      }

      // Tentative d'authentification avec session token (participant anonyme)
      // Unified Participant model: lookup by sessionTokenHash
      if (sessionToken && (!sessionType || sessionType === 'anonymous')) {
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
            conversationId: true,
            anonymousSession: true
          }
        });

        if (participant) {

            // Créer l'utilisateur Socket.IO anonyme
            const user: SocketUser = {
              id: participant.id,
              socketId: socket.id,
              isAnonymous: true,
              language: participant.language,
              participantId: participant.id,
              displayName: participant.displayName,
              sessionToken
            };

            // CORRECTION CRITIQUE: Gérer les connexions multiples (même anonyme, plusieurs onglets)
            const existingUser = this.connectedUsers.get(user.id);
            if (existingUser && existingUser.socketId !== socket.id) {
              const oldSocket = this.io.sockets.sockets.get(existingUser.socketId);
              if (oldSocket) {
                oldSocket.disconnect(true);
              }
              this.socketToUser.delete(existingUser.socketId);
            }

            // Enregistrer l'utilisateur anonyme
            this.connectedUsers.set(user.id, user);
            this.socketToUser.set(socket.id, participant.id);
            this._addUserSocket(user.id, socket.id);

            // IMPORTANT: Rejoindre la room personnelle pour les notifications
            try {
              if (user.id && typeof user.id === 'string') {
                socket.join(user.id);
                logger.info(`[Socket.IO] Anonymous user ${user.id} joined personal room for notifications`);
              } else {
                logger.error(`[Socket.IO] Invalid userId for socket.join (anonymous): ${JSON.stringify(user.id)}`);
              }
            } catch (error) {
              logger.error(`[Socket.IO] Failed to join personal room for anonymous user ${user.id}:`, error);
            }

            // Update online status via participant
            await this.maintenanceService.updateAnonymousOnlineStatus(user.id, true, true);

            // Rejoindre la conversation spécifique du participant anonyme
            try {
              const conversationRoom = ROOMS.conversation(participant.conversationId);
              socket.join(conversationRoom);
            } catch {}

            // CORRECTION CRITIQUE: Émettre l'événement AUTHENTICATED IMMÉDIATEMENT
            const authResponse = {
              success: true,
              user: { id: user.id, language: user.language, isAnonymous: true }
            };

            socket.emit(SERVER_EVENTS.AUTHENTICATED, authResponse);


            return; // Authentification anonyme réussie
        } else {
        }
      }

      // Aucune authentification valide trouvée
      
      // CORRECTION CRITIQUE: Émettre l'événement AUTHENTICATED avec échec
      const failureResponse = { 
        success: false,
        error: 'Authentification requise. Veuillez fournir un Bearer token ou un x-session-token valide.'
      };
      
      socket.emit(SERVER_EVENTS.AUTHENTICATED, failureResponse);
      socket.emit(SERVER_EVENTS.ERROR, { 
        message: failureResponse.error
      });

    } catch (error: any) {
      
      // CORRECTION CRITIQUE: Émettre l'événement AUTHENTICATED avec erreur
      socket.emit(SERVER_EVENTS.AUTHENTICATED, { 
        success: false,
        error: 'Erreur d\'authentification'
      });
      
      socket.emit(SERVER_EVENTS.ERROR, { message: 'Erreur d\'authentification' });
    }
  }

  private async _handleAuthentication(socket: any, data: { userId?: string; sessionToken?: string; language?: string }) {
    try {
      let user: SocketUser | null = null;
      
      if (data.sessionToken) {
        // Tentative d'authentification avec Bearer token (utilisateur authentifié)
        try {
          const jwtSecret = process.env.JWT_SECRET || 'default-secret';
          const decoded = jwt.verify(data.sessionToken, jwtSecret) as any;
          
          
          // Récupérer l'utilisateur depuis la base de données
          const dbUser = await this.prisma.user.findUnique({
            where: { id: decoded.userId },
            select: { 
              id: true, 
              username: true,
              systemLanguage: true,
              isActive: true
            }
          });

          if (dbUser && dbUser.isActive) {
            user = {
              id: dbUser.id,
              socketId: socket.id,
              isAnonymous: false,
              language: data.language || dbUser.systemLanguage
            };
          } else {
          }
        } catch (jwtError) {
          
          // Si ce n'est pas un JWT valide, essayer comme sessionToken anonyme
          // Unified Participant model: lookup by sessionTokenHash
          const tokenHash = hashSessionToken(data.sessionToken);
          const anonymousParticipant = await this.prisma.participant.findFirst({
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

          if (anonymousParticipant) {
              user = {
                id: anonymousParticipant.id,
                socketId: socket.id,
                isAnonymous: true,
                language: data.language || anonymousParticipant.language || 'fr',
                participantId: anonymousParticipant.id,
                displayName: anonymousParticipant.displayName,
                sessionToken: data.sessionToken
              };
          } else {
          }
        }
      } else if (data.userId) {
        // Utilisateur authentifié (fallback)
        const dbUser = await this.prisma.user.findUnique({
          where: { id: data.userId },
          select: { id: true, systemLanguage: true }
        });
        
        if (dbUser) {
          user = {
            id: dbUser.id,
            socketId: socket.id,
            isAnonymous: false,
            language: data.language || dbUser.systemLanguage
          };
        }
      }
      
      if (user) {
        // CORRECTION CRITIQUE: Gérer les connexions multiples
        const existingUser = this.connectedUsers.get(user.id);
        if (existingUser && existingUser.socketId !== socket.id) {
          // Déconnecter l'ancienne socket
          const oldSocket = this.io.sockets.sockets.get(existingUser.socketId);
          if (oldSocket) {
            oldSocket.disconnect(true);
          }
          this.socketToUser.delete(existingUser.socketId);
        }

        // Enregistrer l'utilisateur
        this.connectedUsers.set(user.id, user);
        this.socketToUser.set(socket.id, user.id);
        
        // Retirer le guard de disconnect (reconnexion)
        this.statusService.markConnected(user.id, user.isAnonymous);

        // CORRECTION: Mettre à jour l'état en ligne selon le type d'utilisateur et broadcaster
        if (user.isAnonymous) {
          await this.maintenanceService.updateAnonymousOnlineStatus(user.id, true, true);
        } else {
          await this.maintenanceService.updateUserOnlineStatus(user.id, true, true);
        }

        // Rejoindre les conversations de l'utilisateur
        await this._joinUserConversations(socket, user.id, user.isAnonymous);

        // Rejoindre la room globale "meeshy"
        try {
          socket.join('conversation:any');
        } catch {}
        
        socket.emit(SERVER_EVENTS.AUTHENTICATED, { success: true, user: { id: user.id, language: user.language } });
        
      } else {
        socket.emit(SERVER_EVENTS.AUTHENTICATED, { success: false, error: 'Authentication failed' });
      }
      
    } catch (error) {
      logger.error(`❌ Erreur authentification: ${error}`);
      socket.emit(SERVER_EVENTS.AUTHENTICATED, { success: false, error: 'Authentication error' });
    }
  }

  private async _joinUserConversations(socket: any, userId: string, isAnonymous: boolean) {
    try {

      let conversations: { conversationId: string }[] = [];

      if (isAnonymous) {
        // For anonymous: userId is actually participantId
        conversations = await this.prisma.participant.findMany({
          where: { id: userId, isActive: true },
          select: { conversationId: true }
        });
      } else {
        // For registered users: find all participant rows by userId
        conversations = await this.prisma.participant.findMany({
          where: { userId: userId, isActive: true },
          select: { conversationId: true }
        });
      }

      // Rejoindre les rooms Socket.IO
      for (const conv of conversations) {
        socket.join(ROOMS.conversation(conv.conversationId));
      }


    } catch (error) {
      logger.error(`❌ [JOIN_CONVERSATIONS] Erreur jointure conversations pour ${userId}:`, error);
    }
  }

  private async _handleNewMessage(socket: any, data: {
    conversationId: string;
    content: string;
    originalLanguage?: string;
    messageType?: string;
    replyToId?: string;
  }): Promise<{ messageId: string }> {
    try {
      const userIdOrToken = this.socketToUser.get(socket.id);
      if (!userIdOrToken) {
        socket.emit(SERVER_EVENTS.ERROR, { message: 'User not authenticated' });
        throw new Error('User not authenticated');
      }

      // Récupérer l'utilisateur (gère le cas sessionToken pour anonymes)
      const userResult = this._getConnectedUser(userIdOrToken);
      const connectedUser = userResult?.user;
      const userId = userResult?.realUserId || userIdOrToken;

      // Préparer les données du message
      const messageData: MessageData = {
        conversationId: data.conversationId,
        content: data.content,
        // Utiliser ordre de priorité: payload -> langue socket utilisateur -> 'fr'
        originalLanguage: data.originalLanguage || connectedUser?.language || 'fr',
        messageType: data.messageType || 'text',
        replyToId: data.replyToId
      };

      // Unified Participant model: senderId is always set (Participant.id)
      messageData.senderId = userId;
      
      // 1. SAUVEGARDER LE MESSAGE ET LIBÉRER LE CLIENT
      const result = await this.translationService.handleNewMessage(messageData);
      this.stats.messages_processed++;
      
      // 2. (Optionnel) Notifier l'état de sauvegarde — laissé pour compat rétro
      socket.emit(SERVER_EVENTS.MESSAGE_SENT, {
        messageId: result.messageId,
        status: result.status,
        timestamp: new Date().toISOString()
      });
      
      // 3. RÉCUPÉRER LE MESSAGE SAUVEGARDÉ ET LE DIFFUSER À TOUS (Y COMPRIS L'AUTEUR)
      const saved = await this.prisma.message.findUnique({
        where: { id: result.messageId },
        include: {
          sender: {
            select: {
              id: true,
              displayName: true,
              avatar: true,
              type: true,
              nickname: true,
              userId: true,
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  firstName: true,
                  lastName: true,
                  avatar: true
                }
              }
            }
          },
          attachments: {
            select: {
              id: true,
              messageId: true,
              fileName: true,
              originalName: true,
              mimeType: true,
              fileSize: true,
              fileUrl: true,
              thumbnailUrl: true,
              width: true,
              height: true,
              duration: true,
              bitrate: true,
              sampleRate: true,
              codec: true,
              channels: true,
              fps: true,
              videoCodec: true,
              pageCount: true,
              lineCount: true,
              metadata: true,
              uploadedBy: true,
              isAnonymous: true,
              createdAt: true
            }
          }
        }
      });

      // 3.b Calculer/mettre à jour les statistiques de conversation (cache 1h) et les inclure en meta
      const updatedStats = await conversationStatsService.updateOnNewMessage(
        this.prisma,
        data.conversationId,
        (saved?.originalLanguage || messageData.originalLanguage || 'fr'),
        () => this.getConnectedUsers()
      );

      const participant = saved?.sender;
      const participantUser = participant?.user;
      const messagePayload = {
        id: saved?.id || result.messageId,
        conversationId: data.conversationId,
        senderId: saved?.senderId || messageData.senderId,
        content: saved?.content || data.content,
        originalLanguage: saved?.originalLanguage || messageData.originalLanguage || 'fr',
        messageType: saved?.messageType || data.messageType || 'text',
        isEdited: Boolean(saved?.isEdited),
        deletedAt: saved?.deletedAt || undefined,
        isBlurred: Boolean(saved?.isBlurred),
        isViewOnce: Boolean(saved?.isViewOnce),
        expiresAt: saved?.expiresAt || undefined,
        createdAt: saved?.createdAt || new Date(),
        updatedAt: saved?.updatedAt || new Date(),
        sender: participant
          ? {
              id: participant.id,
              username: participantUser?.username || participant.displayName || participant.nickname || 'Unknown',
              displayName: participant.displayName || participantUser?.displayName || participant.nickname || 'Unknown',
              avatar: participantUser?.avatar || participant.avatar,
              firstName: participantUser?.firstName || '',
              lastName: participantUser?.lastName || '',
              type: participant.type,
              userId: participant.userId,
              email: '',
              isOnline: false,
              lastActiveAt: new Date(),
              systemLanguage: 'fr',
              regionalLanguage: 'fr',
              autoTranslateEnabled: true,
              translateToSystemLanguage: true,
              translateToRegionalLanguage: false,
              useCustomDestination: false,
              isActive: true,
              createdAt: new Date(),
              updatedAt: new Date()
            }
          : undefined,
        attachments: (saved as any)?.attachments || [],
        meta: {
          conversationStats: updatedStats
        }
      } as any;

      this.io.to(ROOMS.conversation(data.conversationId)).emit(SERVER_EVENTS.MESSAGE_NEW, messagePayload);
      // S'assurer que l'auteur reçoit aussi (au cas où il ne serait pas dans la room encore)
      socket.emit(SERVER_EVENTS.MESSAGE_NEW, messagePayload);
      
      
      // 4. ENVOYER LES NOTIFICATIONS DE MESSAGE
      const senderId = saved?.senderId;
      if (senderId) {
        // Envoyer les notifications en asynchrone pour ne pas bloquer
        // Note: Les notifications sont gérées directement dans routes/notifications.ts
      }
      
      // 5. LES TRADUCTIONS SERONT TRAITÉES EN ASYNCHRONE PAR LE TRANSLATION SERVICE
      // ET LES RÉSULTATS SERONT ENVOYÉS VIA LES ÉVÉNEMENTS 'translationReady'
      
      return { messageId: result.messageId };
    } catch (error) {
      logger.error(`❌ Erreur traitement message: ${error}`);
      this.stats.errors++;
      socket.emit(SERVER_EVENTS.ERROR, { message: 'Failed to send message' });
      throw error;
    }
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
        socket.emit(SERVER_EVENTS.TRANSLATION_RECEIVED, {
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
            socket.emit(SERVER_EVENTS.TRANSLATION_ERROR, {
              messageId: data.messageId,
              targetLanguage: data.targetLanguage,
              error: 'Message not found or empty'
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
          socket.emit(SERVER_EVENTS.TRANSLATION_ERROR, {
            messageId: data.messageId,
            targetLanguage: data.targetLanguage,
            error: 'Translation request failed'
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
   * Récupère un utilisateur connecté par son ID ou sessionToken
   * Pour les utilisateurs anonymes, socketToUser stocke le sessionToken
   * mais connectedUsers utilise user.id comme clé
   */
  private _getConnectedUser(userIdOrToken: string): { user: SocketUser; realUserId: string } | null {
    // Essayer d'abord la recherche directe par ID
    const directUser = this.connectedUsers.get(userIdOrToken);
    if (directUser) {
      return { user: directUser, realUserId: userIdOrToken };
    }

    // Si non trouvé, chercher par sessionToken (cas des utilisateurs anonymes)
    for (const [realUserId, user] of this.connectedUsers) {
      if (user.sessionToken === userIdOrToken) {
        return { user, realUserId };
      }
    }

    return null;
  }

  private async _handleDisconnection(socket: any) {
    const userIdOrToken = this.socketToUser.get(socket.id);

    if (userIdOrToken) {
      // Récupérer l'utilisateur (gère le cas sessionToken pour anonymes)
      const result = this._getConnectedUser(userIdOrToken);
      const user = result?.user;
      const userId = result?.realUserId || userIdOrToken;
      const isAnonymous = user?.isAnonymous || false;

      // CORRECTION CRITIQUE: Ne supprimer que si c'est bien la socket active actuelle
      // (en cas de reconnexion rapide, une nouvelle socket peut avoir été créée)
      const currentUser = result?.user;
      if (currentUser && currentUser.socketId === socket.id) {
        // Guard race condition: marquer comme déconnecté AVANT le cleanup
        // Empêche les updates fire-and-forget de StatusService de s'exécuter après ce point
        this.statusService.markDisconnected(userId, isAnonymous);

        // IMPORTANT: Automatically leave any active video/audio calls
        // userId here may be a registered user's ID or an anonymous participant's ID
        // For registered users, find their participant records; for anonymous, userId IS participantId
        try {
          const activeParticipations = await this.prisma.callParticipant.findMany({
            where: {
              leftAt: null,
              participant: isAnonymous
                ? { id: userId }
                : { userId }
            },
            include: {
              callSession: true
            }
          });

          if (activeParticipations.length > 0) {

            for (const participation of activeParticipations) {
              try {
                await this.callService.leaveCall({
                  callId: participation.callSessionId,
                  userId,
                  participantId: participation.participantId
                });
              } catch (error) {
                logger.error(`❌ Error auto-leaving call ${participation.callSessionId}:`, error);
              }
            }
          }
        } catch (error) {
          logger.error(`❌ Error checking/leaving active calls for user ${userId}:`, error);
        }

        this._removeUserSocket(userId, socket.id);
        this.connectedUsers.delete(userId);
        this.socketToUser.delete(socket.id);

        // CORRECTION: Mettre à jour l'état en ligne/hors ligne selon le type d'utilisateur et broadcaster
        if (isAnonymous) {
          await this.maintenanceService.updateAnonymousOnlineStatus(userId, false, true);
        } else {
          await this.maintenanceService.updateUserOnlineStatus(userId, false, true);
        }
      } else {
        // Cette socket était déjà remplacée, juste nettoyer socketToUser
        this.socketToUser.delete(socket.id);
      }
    }

    this.stats.active_connections--;
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

  private async _handleHeartbeat(socket: any) {
    const userIdOrToken = this.socketToUser.get(socket.id);
    if (!userIdOrToken) return;

    try {
      const result = this._getConnectedUser(userIdOrToken);
      if (!result) return;
      const { user: connectedUser, realUserId: userId } = result;

      this.statusService.updateLastSeen(userId, connectedUser.isAnonymous);

      if (!connectedUser.isAnonymous) {
        await this.prisma.user.update({
          where: { id: userId },
          data: { lastActiveAt: new Date() }
        });
      }
    } catch {
      // Silent - heartbeat failure is not critical
    }
  }

  private async _handleTypingStart(socket: any, data: { conversationId: string }) {
    const userIdOrToken = this.socketToUser.get(socket.id);
    if (!userIdOrToken) {
      logger.warn('⚠️ [TYPING] Typing start sans userId pour socket', socket.id);
      return;
    }

    try {
      // Normaliser l'ID de conversation
      const normalizedId = await this.normalizeConversationId(data.conversationId);

      // Récupérer l'utilisateur depuis connectedUsers (gère le cas sessionToken pour anonymes)
      const result = this._getConnectedUser(userIdOrToken);
      if (!result) {
        logger.warn(`⚠️ Utilisateur non connecté userId=${userIdOrToken}`);
        return;
      }
      const { user: connectedUser, realUserId: userId } = result;

      // Typing = activité détectable
      // → Mettre à jour lastActiveAt (throttled à 5s)
      if (this.statusService) {
        this.statusService.updateLastSeen(userId, connectedUser.isAnonymous);
      }

      // PRIVACY: Vérifier si l'utilisateur a activé showTypingIndicator
      const shouldShowTyping = await this.privacyPreferencesService.shouldShowTypingIndicator(
        userId,
        connectedUser.isAnonymous
      );
      if (!shouldShowTyping) {
        // L'utilisateur a désactivé l'indicateur de frappe, ne pas broadcaster
        return;
      }

      let displayName: string;

      // FIXED: Gérer les utilisateurs anonymes
      if (connectedUser.isAnonymous) {
        // Récupérer depuis Participant
        const dbParticipant = await this.prisma.participant.findUnique({
          where: { id: userId },
          select: {
            id: true,
            displayName: true,
            nickname: true
          }
        });

        if (!dbParticipant) {
          logger.warn(`⚠️ Participant anonyme non trouvé userId=${userId}`);
          return;
        }

        // Construire le nom d'affichage pour anonyme
        displayName = dbParticipant.nickname || dbParticipant.displayName;
      } else {
        // Récupérer depuis User
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
          logger.warn(`⚠️ Utilisateur non trouvé userId=${userId}`);
          return;
        }

        // Construire le nom d'affichage
        displayName = dbUser.displayName ||
                     `${dbUser.firstName || ''} ${dbUser.lastName || ''}`.trim() ||
                     dbUser.username;
      }

      const typingEvent: TypingEvent = {
        userId: userId,
        username: displayName,
        conversationId: normalizedId,
        isTyping: true
      };

      const room = ROOMS.conversation(normalizedId);


      // Émettre vers tous les autres utilisateurs de la conversation (sauf l'émetteur)
      socket.to(room).emit(SERVER_EVENTS.TYPING_START, typingEvent);

    } catch (error) {
      logger.error('❌ [TYPING] Erreur handleTypingStart', error);
    }
  }

  private async _handleTypingStop(socket: any, data: { conversationId: string }) {
    const userIdOrToken = this.socketToUser.get(socket.id);
    if (!userIdOrToken) {
      logger.warn('⚠️ [TYPING] Typing stop sans userId pour socket', socket.id);
      return;
    }

    try {
      // Normaliser l'ID de conversation
      const normalizedId = await this.normalizeConversationId(data.conversationId);

      // Récupérer l'utilisateur depuis connectedUsers (gère le cas sessionToken pour anonymes)
      const result = this._getConnectedUser(userIdOrToken);
      if (!result) {
        logger.warn(`⚠️ Utilisateur non connecté userId=${userIdOrToken}`);
        return;
      }
      const { user: connectedUser, realUserId: userId } = result;

      // PRIVACY: Vérifier si l'utilisateur a activé showTypingIndicator
      // Note: On vérifie aussi pour typing:stop pour cohérence
      const shouldShowTyping = await this.privacyPreferencesService.shouldShowTypingIndicator(
        userId,
        connectedUser.isAnonymous
      );
      if (!shouldShowTyping) {
        // L'utilisateur a désactivé l'indicateur de frappe, ne pas broadcaster
        return;
      }

      let displayName: string;

      // FIXED: Gérer les utilisateurs anonymes
      if (connectedUser.isAnonymous) {
        // Récupérer depuis Participant
        const dbParticipant = await this.prisma.participant.findUnique({
          where: { id: userId },
          select: {
            id: true,
            displayName: true,
            nickname: true
          }
        });

        if (!dbParticipant) {
          logger.warn(`⚠️ Participant anonyme non trouvé userId=${userId}`);
          return;
        }

        // Construire le nom d'affichage pour anonyme
        displayName = dbParticipant.nickname || dbParticipant.displayName;
      } else {
        // Récupérer depuis User
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
          logger.warn(`⚠️ Utilisateur non trouvé userId=${userId}`);
          return;
        }

        // Construire le nom d'affichage
        displayName = dbUser.displayName ||
                     `${dbUser.firstName || ''} ${dbUser.lastName || ''}`.trim() ||
                     dbUser.username;
      }

      const typingEvent: TypingEvent = {
        userId: userId,
        username: displayName,
        conversationId: normalizedId,
        isTyping: false
      };

      const room = ROOMS.conversation(normalizedId);


      // Émettre vers tous les autres utilisateurs de la conversation (sauf l'émetteur)
      socket.to(room).emit(SERVER_EVENTS.TYPING_STOP, typingEvent);

    } catch (error) {
      logger.error('❌ [TYPING] Erreur handleTypingStop', error);
    }
  }

  // ✅ FIX BUG #3: Polling périodique SUPPRIMÉ
  // Le système utilise maintenant uniquement les événements (connect/disconnect/activity)
  // L'envoi périodique des stats toutes les 10s était du polling déguisé
  // Les stats sont maintenant envoyées UNIQUEMENT lors d'événements:
  // - Connexion/Déconnexion → broadcast USER_STATUS
  // - Activité (typing, message) → update lastActiveAt
  // - Maintenance (toutes les 15s) → détecte les inactifs > 30min

  // MÉTHODE SUPPRIMÉE: _ensureOnlineStatsTicker
  // private onlineStatsInterval: NodeJS.Timeout | null = null;
  // private _ensureOnlineStatsTicker(): void { ... }


  private async _sendConversationStatsToSocket(socket: any, conversationId: string): Promise<void> {
    // ✅ FIX BUG #3: Appel au ticker supprimé
    // Les stats sont envoyées uniquement à la demande, pas périodiquement
    const stats = await conversationStatsService.getOrCompute(
      this.prisma,
      conversationId,
      () => this.getConnectedUsers()
    );
    socket.emit(SERVER_EVENTS.CONVERSATION_STATS, { conversationId, stats } as any);
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
        messageType: message.messageType || 'text',
        isEdited: Boolean(message.isEdited),
        deletedAt: message.deletedAt || undefined,
        isBlurred: Boolean((message as any).isBlurred),
        isViewOnce: Boolean((message as any).isViewOnce),
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
          messageType: (message as any).replyTo.messageType || 'text',
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

          for (const participant of participants) {
            const roomTarget = participant.userId || participant.id;
            const unreadCount = await readStatusService.getUnreadCount(roomTarget, normalizedId);

            // Émettre vers le socket personnel de l'utilisateur
            this.io.to(ROOMS.user(roomTarget)).emit(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, {
              conversationId: normalizedId,
              unreadCount
            });
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
    await this._broadcastNewMessage(message, conversationId);
  }

  /**
   * PHASE 3.1.1: Extraction du JWT Token depuis le socket
   */
  private extractJWTToken(socket: any): string | undefined {
    return socket.handshake?.headers?.authorization?.replace('Bearer ', '') ||
           socket.handshake?.auth?.authToken ||
           socket.handshake?.auth?.token ||
           socket.auth?.token;
  }

  /**
   * PHASE 3.1.1: Extraction du Session Token depuis le socket  
   */
  private extractSessionToken(socket: any): string | undefined {
    return socket.handshake?.headers?.['x-session-token'] || 
           socket.handshake?.auth?.sessionToken || 
           socket.auth?.sessionToken;
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

  // ===== HANDLERS DE RÉACTIONS =====

  /**
   * Gère l'ajout d'une réaction à un message
   */
  private async _handleReactionAdd(
    socket: any,
    data: { messageId: string; emoji: string },
    callback?: (response: SocketIOResponse<any>) => void
  ): Promise<void> {
    try {

      const userIdOrToken = this.socketToUser.get(socket.id);

      if (!userIdOrToken) {
        logger.error('❌ [_handleReactionAdd] No userId found for socket', socket.id);

        const errorResponse: SocketIOResponse<any> = {
          success: false,
          error: 'User not authenticated'
        };
        if (callback) callback(errorResponse);
        return;
      }

      // Récupérer l'utilisateur (gère le cas sessionToken pour anonymes)
      const userResult = this._getConnectedUser(userIdOrToken);
      const user = userResult?.user;
      const userId = userResult?.realUserId || userIdOrToken;
      const isAnonymous = user?.isAnonymous || false;

      // Résoudre le participantId : pour les anonymes, il est sur le SocketUser ;
      // pour les registered, il faut le chercher en DB via le message → conversationId
      let participantId = user?.participantId;
      if (!participantId && !isAnonymous) {
        const msg = await this.prisma.message.findUnique({
          where: { id: data.messageId },
          select: { conversationId: true }
        });
        if (msg) {
          const participant = await this.prisma.participant.findFirst({
            where: { userId, conversationId: msg.conversationId, isActive: true },
            select: { id: true }
          });
          participantId = participant?.id;
        }
      }

      if (!participantId) {
        const errorResponse: SocketIOResponse<any> = {
          success: false,
          error: 'Could not resolve participant'
        };
        if (callback) callback(errorResponse);
        return;
      }

      // Importer le ReactionService
      const { ReactionService } = await import('../services/ReactionService.js');
      const reactionService = new ReactionService(this.prisma);

      // Ajouter la réaction (Participant model: participantId only)
      const reaction = await reactionService.addReaction({
        messageId: data.messageId,
        emoji: data.emoji,
        participantId
      });

      if (!reaction) {
        const errorResponse: SocketIOResponse<any> = {
          success: false,
          error: 'Failed to add reaction'
        };
        if (callback) callback(errorResponse);
        return;
      }

      // Récupérer le message pour le conversationId et le broadcast
      const message = await this.prisma.message.findUnique({
        where: { id: data.messageId },
        select: {
          conversationId: true,
          content: true,
          senderId: true,
          conversation: {
            select: {
              title: true
            }
          }
        }
      });

      // Créer l'événement de mise à jour
      const updateEvent = await reactionService.createUpdateEvent(
        data.messageId,
        data.emoji,
        'add',
        participantId,
        message?.conversationId ?? data.messageId
      );

      // Envoyer la réponse au client
      const successResponse: SocketIOResponse<any> = {
        success: true,
        data: reaction
      };
      if (callback) callback(successResponse);

      if (message) {
        const normalizedConversationId = await this.normalizeConversationId(message.conversationId);

        this.io.to(ROOMS.conversation(normalizedConversationId)).emit(SERVER_EVENTS.REACTION_ADDED, updateEvent);

        // Résoudre senderId (Participant.id) → User.id pour la notification
        if (!isAnonymous && message.senderId) {
          const [authorParticipant, reactorParticipant] = await Promise.all([
            this.prisma.participant.findUnique({
              where: { id: message.senderId },
              select: { userId: true }
            }),
            this.prisma.participant.findUnique({
              where: { id: participantId },
              select: { userId: true }
            })
          ]);

          const authorUserId = authorParticipant?.userId;
          const reactorUserId = reactorParticipant?.userId;

          if (authorUserId && reactorUserId && authorUserId !== reactorUserId) {
            this.notificationService.createReactionNotification({
              messageAuthorId: authorUserId,
              reactorUserId,
              messageId: data.messageId,
              conversationId: message.conversationId,
              reactionEmoji: data.emoji,
            }).catch((notifError) => {
              logger.error('❌ [REACTION_ADDED] Erreur lors de la création de la notification', notifError);
            });
          }
        }

      } else {
        logger.error(`❌ [REACTION_ADDED] Message ${data.messageId} non trouvé, impossible de broadcaster`);
      }
    } catch (error: any) {
      logger.error('❌ Erreur lors de l\'ajout de réaction:', error);
      const errorResponse: SocketIOResponse<any> = {
        success: false,
        error: error.message || 'Failed to add reaction'
      };
      if (callback) callback(errorResponse);
    }
  }

  /**
   * Gère la suppression d'une réaction d'un message
   */
  private async _handleReactionRemove(
    socket: any,
    data: { messageId: string; emoji: string },
    callback?: (response: SocketIOResponse<any>) => void
  ): Promise<void> {
    try {
      const userIdOrToken = this.socketToUser.get(socket.id);
      if (!userIdOrToken) {
        const errorResponse: SocketIOResponse<any> = {
          success: false,
          error: 'User not authenticated'
        };
        if (callback) callback(errorResponse);
        return;
      }

      // Récupérer l'utilisateur (gère le cas sessionToken pour anonymes)
      const userResult = this._getConnectedUser(userIdOrToken);
      const user = userResult?.user;
      const userId = userResult?.realUserId || userIdOrToken;
      const isAnonymous = user?.isAnonymous || false;

      // Résoudre le participantId pour les registered users
      let participantId = user?.participantId;
      if (!participantId && !isAnonymous) {
        const msg = await this.prisma.message.findUnique({
          where: { id: data.messageId },
          select: { conversationId: true }
        });
        if (msg) {
          const participant = await this.prisma.participant.findFirst({
            where: { userId, conversationId: msg.conversationId, isActive: true },
            select: { id: true }
          });
          participantId = participant?.id;
        }
      }

      if (!participantId) {
        const errorResponse: SocketIOResponse<any> = {
          success: false,
          error: 'Could not resolve participant'
        };
        if (callback) callback(errorResponse);
        return;
      }

      // Importer le ReactionService
      const { ReactionService } = await import('../services/ReactionService.js');
      const reactionService = new ReactionService(this.prisma);

      // Supprimer la réaction (Participant model: participantId only)
      const removed = await reactionService.removeReaction({
        messageId: data.messageId,
        emoji: data.emoji,
        participantId
      });

      if (!removed) {
        const errorResponse: SocketIOResponse<any> = {
          success: false,
          error: 'Reaction not found'
        };
        if (callback) callback(errorResponse);
        return;
      }

      // Récupérer le message pour le conversationId et le broadcast
      const message = await this.prisma.message.findUnique({
        where: { id: data.messageId },
        select: { conversationId: true }
      });

      // Créer l'événement de mise à jour
      const updateEvent = await reactionService.createUpdateEvent(
        data.messageId,
        data.emoji,
        'remove',
        participantId,
        message?.conversationId ?? data.messageId
      );

      // Envoyer la réponse au client
      const successResponse: SocketIOResponse<any> = {
        success: true,
        data: { message: 'Reaction removed successfully' }
      };
      if (callback) callback(successResponse);

      if (message) {
        const normalizedConversationId = await this.normalizeConversationId(message.conversationId);
        this.io.to(ROOMS.conversation(normalizedConversationId)).emit(SERVER_EVENTS.REACTION_REMOVED, updateEvent);
      }

    } catch (error: any) {
      logger.error('❌ Erreur lors de la suppression de réaction', error);
      const errorResponse: SocketIOResponse<any> = {
        success: false,
        error: error.message || 'Failed to remove reaction'
      };
      if (callback) callback(errorResponse);
    }
  }

  /**
   * Gère la synchronisation des réactions d'un message
   */
  private async _handleReactionSync(
    socket: any,
    messageId: string,
    callback?: (response: SocketIOResponse<any>) => void
  ): Promise<void> {
    try {

      const userIdOrToken = this.socketToUser.get(socket.id);
      if (!userIdOrToken) {
        logger.error(`❌ [REACTION_SYNC] Utilisateur non authentifié pour socket ${socket.id}`);
        const errorResponse: SocketIOResponse<any> = {
          success: false,
          error: 'User not authenticated'
        };
        if (callback) callback(errorResponse);
        return;
      }

      // Récupérer l'utilisateur (gère le cas sessionToken pour anonymes)
      const userResult = this._getConnectedUser(userIdOrToken);
      const user = userResult?.user;
      const userId = userResult?.realUserId || userIdOrToken;
      const isAnonymous = user?.isAnonymous || false;

      // Résoudre le participantId pour les registered users
      let participantId = user?.participantId;
      if (!participantId && !isAnonymous) {
        const msg = await this.prisma.message.findUnique({
          where: { id: messageId },
          select: { conversationId: true }
        });
        if (msg) {
          const participant = await this.prisma.participant.findFirst({
            where: { userId, conversationId: msg.conversationId, isActive: true },
            select: { id: true }
          });
          participantId = participant?.id;
        }
      }

      if (!participantId) {
        const errorResponse: SocketIOResponse<any> = {
          success: false,
          error: 'Could not resolve participant'
        };
        if (callback) callback(errorResponse);
        return;
      }

      // Importer le ReactionService
      const { ReactionService } = await import('../services/ReactionService.js');
      const reactionService = new ReactionService(this.prisma);

      // Récupérer les réactions avec agrégation (Participant model)
      const reactionSync = await reactionService.getMessageReactions({
        messageId,
        currentParticipantId: participantId
      });


      // Envoyer la réponse au client
      const successResponse: SocketIOResponse<any> = {
        success: true,
        data: reactionSync
      };
      if (callback) callback(successResponse);

    } catch (error: any) {
      logger.error('❌ Erreur lors de la synchronisation des réactions', error);
      const errorResponse: SocketIOResponse<any> = {
        success: false,
        error: error.message || 'Failed to sync reactions'
      };
      if (callback) callback(errorResponse);
    }
  }

  // ===== FIN HANDLERS DE RÉACTIONS =====

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

  /**
   * Créer des notifications pour un nouveau message
   */
  private async _createMessageNotifications(message: any, senderId: string): Promise<void> {
    try {
      // Récupérer la conversation avec ses informations
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: message.conversationId },
        select: {
          id: true,
          type: true,
          title: true
        }
      });

      // Récupérer les attachments du message pour les inclure dans la notification
      let messageAttachments: Array<{ id: string; filename: string; mimeType: string; fileSize: number }> = [];
      if (message.id) {
        try {
          const attachments = await this.prisma.messageAttachment.findMany({
            where: { messageId: message.id },
            select: {
              id: true,
              fileName: true,
              mimeType: true,
              fileSize: true
            }
          });
          // Mapper fileName vers filename pour correspondre à l'interface de la notification
          messageAttachments = attachments.map(att => ({
            id: att.id,
            filename: att.fileName,
            mimeType: att.mimeType,
            fileSize: att.fileSize
          }));
          if (attachments.length > 0) {
            logger.info(`📢 [NOTIFICATIONS] Message avec ${attachments.length} attachment(s)`);
          }
        } catch (err) {
          logger.error('❌ [NOTIFICATIONS] Erreur lors de la récupération des attachments', err);
        }
      }

      if (!conversation) {
        logger.error('❌ [NOTIFICATIONS] Conversation non trouvée', message.conversationId);
        return;
      }

      // Vérifier si c'est une réponse à un message
      let originalMessageAuthorId: string | null = null;
      if (message.replyToId) {
        try {
          const originalMessage = await this.prisma.message.findUnique({
            where: { id: message.replyToId },
            select: { senderId: true }
          });
          originalMessageAuthorId = originalMessage?.senderId || null;
        } catch (err) {
          logger.error('❌ [NOTIFICATIONS] Erreur lors de la récupération du message original', err);
        }
      }

      // Récupérer les participants mentionnés dans le message
      // Ils recevront une notification de mention spécifique, pas une notification de message générique
      // We collect userId (for registered users) to match against notification recipients
      const mentionedUserIds = new Set<string>();
      if (message.id) {
        try {
          const mentions = await this.prisma.mention.findMany({
            where: { messageId: message.id },
            select: {
              mentionedParticipantId: true,
              mentionedParticipant: {
                select: { userId: true }
              }
            }
          });
          mentions.forEach(m => {
            if (m.mentionedParticipant?.userId) {
              mentionedUserIds.add(m.mentionedParticipant.userId);
            }
            mentionedUserIds.add(m.mentionedParticipantId);
          });
          logger.info(`📢 [NOTIFICATIONS] ${mentionedUserIds.size} utilisateur(s) mentionné(s) - ils ne recevront QUE la notification de mention`);
        } catch (err) {
          logger.error('❌ [NOTIFICATIONS] Erreur lors de la récupération des mentions', err);
        }
      }

      // Récupérer les participants de la conversation (Participant model)
      // Only fetch participants with userId (registered users) for notifications
      const conversationMembers = await this.prisma.participant.findMany({
        where: {
          conversationId: message.conversationId,
          isActive: true,
          id: {
            not: message.senderId // Exclure l'expéditeur (senderId = participant.id)
          },
          userId: { not: null }
        },
        select: {
          id: true,
          userId: true,
          user: {
            select: {
              id: true,
              username: true
            }
          }
        }
      });

      // Récupérer les informations de l'expéditeur
      let senderUsername = 'Unknown';
      let senderAvatar: string | undefined;
      let senderDisplayName: string | undefined;
      let senderFirstName: string | undefined;
      let senderLastName: string | undefined;

      if (message.sender) {
        const participant = message.sender;
        const user = participant.user;
        senderUsername = user?.username || participant.displayName || participant.nickname || 'Unknown';
        senderAvatar = user?.avatar || participant.avatar || undefined;
        senderDisplayName = participant.displayName || user?.displayName || undefined;
        senderFirstName = user?.firstName || undefined;
        senderLastName = user?.lastName || undefined;
      }

      // Si c'est une réponse, créer une notification de réponse pour l'auteur du message original
      // SAUF si l'auteur est mentionné (la mention a la priorité)
      if (originalMessageAuthorId && originalMessageAuthorId !== senderId) {
        // Vérifier si l'auteur du message original est mentionné dans ce message
        const isOriginalAuthorMentioned = mentionedUserIds.has(originalMessageAuthorId);

        if (!isOriginalAuthorMentioned) {
          // L'auteur n'est pas mentionné, on crée une notification de réponse
          await this.notificationService.createReplyNotification({
            recipientUserId: originalMessageAuthorId,
            replierUserId: message.senderId || '',
            messageId: message.id,
            conversationId: message.conversationId,
            messagePreview: message.content,
            originalMessageId: message.replyToId!,
          });
          logger.info(`📢 [NOTIFICATIONS] Notification de réponse créée pour ${originalMessageAuthorId}`);
        } else {
          logger.info(`📢 [NOTIFICATIONS] Skip notification de réponse pour ${originalMessageAuthorId} (mentionné - priorité mention)`);
        }
      }

      // Filtrer les destinataires (exclure mentionnés et auteur du message original)
      const recipients = conversationMembers.filter(member => {
        const memberUserId = member.userId!;
        if (mentionedUserIds.has(memberUserId)) return false;
        if (originalMessageAuthorId && memberUserId === originalMessageAuthorId) return false;
        return true;
      });

      logger.info(`📢 [NOTIFICATIONS] Génération de ${recipients.length} notification(s) pour le message ${message.id} dans la conversation ${message.conversationId} (${conversationMembers.length} membres, ${mentionedUserIds.size} mentionné(s), sender exclu)`);

      // Resolve the sender's userId for notification purposes
      let senderUserIdForNotif = '';
      if (message.senderId) {
        const senderPart = await this.prisma.participant.findUnique({
          where: { id: message.senderId },
          select: { userId: true }
        });
        senderUserIdForNotif = senderPart?.userId || message.senderId;
      }

      for (const member of recipients) {
        await this.notificationService.createMessageNotification({
          recipientUserId: member.userId!,
          senderId: senderUserIdForNotif,
          messageId: message.id,
          conversationId: message.conversationId,
          messagePreview: message.content,
          hasAttachments: messageAttachments.length > 0,
          attachmentCount: messageAttachments.length,
          firstAttachmentType: messageAttachments[0]?.mimeType?.startsWith('image/') ? 'image' : 'document',
        });
      }

    } catch (error) {
      logger.error('❌ [NOTIFICATIONS] Erreur création notifications message', error);
    }
  }

  /**
   * Ajoute un socket au mapping utilisateur -> sockets
   */
  private _addUserSocket(userId: string, socketId: string): void {
    if (!this.userSockets.has(userId)) {
      this.userSockets.set(userId, new Set());
    }
    this.userSockets.get(userId)!.add(socketId);
  }

  /**
   * Supprime un socket du mapping utilisateur -> sockets
   */
  private _removeUserSocket(userId: string, socketId: string): void {
    const userSocketsSet = this.userSockets.get(userId);
    if (userSocketsSet) {
      userSocketsSet.delete(socketId);

      // Si l'utilisateur n'a plus de sockets, supprimer l'entrée
      if (userSocketsSet.size === 0) {
        this.userSockets.delete(userId);
      }
    }
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
      const messageWithTimestamp = { ...result.data, timestamp: result.data.createdAt } as any;
      await this._broadcastNewMessage(messageWithTimestamp, response.conversationId);

      // Notifications push (fire-and-forget)
      this._createMessageNotifications(result.data, response.asUserId).catch((err) => {
        logger.error('[Agent] Notification error:', err);
      });

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
