/**
 * Gestionnaire Socket.IO pour Meeshy
 * Gestion des connexions, conversations et traductions en temps réel
 */

import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import * as path from 'path';
import { PrismaClient } from '@meeshy/shared/prisma/client';
import { MessageTranslationService, MessageData } from '../services/message-translation/MessageTranslationService';
import { MaintenanceService } from '../services/MaintenanceService';
import { StatusService } from '../services/StatusService';
import { MessagingService } from '../services/MessagingService';
import { CallEventsHandler } from './CallEventsHandler';
import { CallService } from '../services/CallService';
import { AttachmentService } from '../services/attachments';
import { NotificationService } from '../services/notifications/NotificationService';
import { PrivacyPreferencesService } from '../services/PrivacyPreferencesService';
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
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { conversationStatsService } from '../services/ConversationStatsService';
import type { MessageRequest, MessageResponse } from '@meeshy/shared/types/messaging';
import type { Message } from '@meeshy/shared/types/index';

export interface SocketUser {
  id: string;
  socketId: string;
  isAnonymous: boolean;
  language: string;
  sessionToken?: string; // Pour les utilisateurs anonymes
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
  private privacyPreferencesService: PrivacyPreferencesService;

  // Mapping des utilisateurs connectés
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
    this.maintenanceService = new MaintenanceService(prisma, attachmentService);

    // Initialiser StatusService pour throttling des updates lastActiveAt
    this.statusService = new StatusService(prisma);

    // Initialiser PrivacyPreferencesService pour vérifier les préférences de confidentialité
    this.privacyPreferencesService = new PrivacyPreferencesService(prisma);

    // CORRECTION: Créer NotificationService AVANT MessagingService pour que les mentions génèrent des notifications
    this.notificationService = new NotificationService(prisma);
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

  }

  /**
   * Normalise l'identifiant de conversation pour créer une room cohérente
   * Résout identifier/ObjectId vers l'identifier canonique
   */
  private async normalizeConversationId(conversationId: string): Promise<string> {
    try {
      // Si c'est un ObjectId MongoDB (24 caractères hex)
      if (/^[0-9a-fA-F]{24}$/.test(conversationId)) {
        // C'est déjà un ObjectId, le retourner directement
        return conversationId;
      }
      
      // C'est un identifier, chercher l'ObjectId correspondant
      const conversation = await this.prisma.conversation.findUnique({
        where: { identifier: conversationId },
        select: { id: true, identifier: true }
      });
      
      if (conversation) {
        return conversation.id; // Retourner l'ObjectId
      }
      
      // Si non trouvé, retourner tel quel (peut-être un ObjectId invalide ou identifier inconnu)
      return conversationId;
    } catch (error) {
      console.error('❌ [NORMALIZE] Erreur normalisation:', error);
      // En cas d'erreur, retourner l'identifiant original
      return conversationId;
    }
  }

  /**
   * Expose NotificationService for use in routes
   */
  public getNotificationService(): NotificationService {
    return this.notificationService;
  }

  async initialize(): Promise<void> {
    try {
      // Initialiser le service de traduction
      await this.translationService.initialize();

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

      // DEPRECATED: Conservé pour rétrocompatibilité
      this.translationService.on('translationReady', this._handleTranslationReady.bind(this));

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
        console.error('[GATEWAY] ❌ Erreur lors du démarrage des tâches de maintenance:', error);
        console.error('[GATEWAY] ❌ Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
      }
      
      // Note: Les événements de traduction sont gérés via le singleton ZMQ
      
      
    } catch (error) {
      console.error('[GATEWAY] ❌ Erreur initialisation MeeshySocketIOManager:', error);
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
      }, callback?: (response: SocketIOResponse<{ messageId: string }>) => void) => {
        try {

          const userIdOrToken = this.socketToUser.get(socket.id);

          if (!userIdOrToken) {
            console.error(`❌ [MESSAGE_SEND] Socket ${socket.id} non authentifié`);
            console.error(`  └─ Sockets connectés:`, Array.from(this.socketToUser.keys()).slice(0, 5));

            const errorResponse: SocketIOResponse<{ messageId: string }> = {
              success: false,
              error: 'User not authenticated'
            };

            if (callback) callback(errorResponse);
            socket.emit('error', { message: 'User not authenticated' });
            return;
          }

          // Récupérer l'utilisateur (gère le cas sessionToken pour anonymes)
          const userResult = this._getConnectedUser(userIdOrToken);
          const user = userResult?.user;
          const userId = userResult?.realUserId || userIdOrToken;

          // Validation de la longueur du message
          const validation = validateMessageLength(data.content);
          if (!validation.isValid) {
            const errorResponse: SocketIOResponse<{ messageId: string }> = {
              success: false,
              error: validation.error || 'Message invalide'
            };

            if (callback) callback(errorResponse);
            socket.emit('error', { message: validation.error || 'Message invalide' });
            console.warn(`⚠️ [WEBSOCKET] Message rejeté pour ${userId}: ${validation.error}`);
            return;
          }

          // Déterminer si l'utilisateur est anonyme
          const isAnonymous = user?.isAnonymous || false;

          // Envoi de message = activité détectable
          // → Mettre à jour lastActiveAt (throttled à 5s)
          if (this.statusService) {
            this.statusService.updateLastSeen(userId, isAnonymous);
          }

          // Pour les utilisateurs anonymes, récupérer le nom d'affichage depuis la base de données
          let anonymousDisplayName: string | undefined;
          if (isAnonymous) {
            try {
              // Utiliser le sessionToken stocké dans l'objet utilisateur
              const userSessionToken = user?.sessionToken;
              if (!userSessionToken) {
                console.error('SessionToken manquant pour utilisateur anonyme:', userId);
                anonymousDisplayName = 'Anonymous User';
              } else {
                const anonymousUser = await this.prisma.anonymousParticipant.findUnique({
                  where: { sessionToken: userSessionToken },
                  select: { username: true, firstName: true, lastName: true }
                });
              
                if (anonymousUser) {
                  // Construire le nom d'affichage à partir du prénom/nom ou username
                  const fullName = `${anonymousUser.firstName || ''} ${anonymousUser.lastName || ''}`.trim();
                  anonymousDisplayName = fullName || anonymousUser.username || 'Anonymous User';
                } else {
                  anonymousDisplayName = 'Anonymous User';
                }
              }
            } catch (error) {
              console.error('Erreur lors de la récupération du nom anonyme:', error);
              anonymousDisplayName = 'Anonymous User';
            }
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


          // PHASE 3.1: Utilisation du MessagingService unifié avec contexte d'auth
          const response: MessageResponse = await this.messagingService.handleMessage(
            messageRequest,
            userId,
            true,
            jwtToken,
            sessionToken
          );

          // Réponse via callback - typage strict SocketIOResponse
          if (callback) {
            if (response.success && response.data) {
              const socketResponse: SocketIOResponse<{ messageId: string }> = { 
                success: true, 
                data: { messageId: response.data.id } 
              };
              callback(socketResponse);
            } else {
              const socketResponse: SocketIOResponse<{ messageId: string }> = {
                success: false,
                error: response.error || 'Failed to send message'
              };
              callback(socketResponse);
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
                    username: true,
                    displayName: true,
                    firstName: true,
                    lastName: true,
                    avatar: true
                  }
                },
                anonymousSender: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    username: true
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
                        username: true,
                        displayName: true,
                        firstName: true,
                        lastName: true,
                        avatar: true
                      }
                    },
                    anonymousSender: {
                      select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        username: true
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

              // Créer des notifications pour les autres participants de la conversation
              await this._createMessageNotifications(message, userId);
            }
          }

          this.stats.messages_processed++;
          
        } catch (error: any) {
          console.error('[WEBSOCKET] Erreur envoi message:', error);
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
      }, callback?: (response: SocketIOResponse<{ messageId: string }>) => void) => {
        try {
          const userIdOrToken = this.socketToUser.get(socket.id);
          if (!userIdOrToken) {
            const errorResponse: SocketIOResponse<{ messageId: string }> = {
              success: false,
              error: 'User not authenticated'
            };

            if (callback) callback(errorResponse);
            socket.emit('error', { message: 'User not authenticated' });
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
              socket.emit('error', { message: validation.error || 'Message invalide' });
              console.warn(`⚠️ [WEBSOCKET] Message avec attachments rejeté pour ${userId}: ${validation.error}`);
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
                console.error('SessionToken manquant pour utilisateur anonyme:', userId);
                anonymousDisplayName = 'Anonymous User';
              } else {
                const anonymousUser = await this.prisma.anonymousParticipant.findUnique({
                  where: { sessionToken: userSessionToken },
                  select: { username: true, firstName: true, lastName: true }
                });
              
                if (anonymousUser) {
                  const fullName = `${anonymousUser.firstName || ''} ${anonymousUser.lastName || ''}`.trim();
                  anonymousDisplayName = fullName || anonymousUser.username || 'Anonymous User';
                } else {
                  anonymousDisplayName = 'Anonymous User';
                }
              }
            } catch (error) {
              console.error('Erreur lors de la récupération du nom anonyme:', error);
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


          const jwtToken = this.extractJWTToken(socket);
          const sessionToken = this.extractSessionToken(socket);

          const response: MessageResponse = await this.messagingService.handleMessage(
            messageRequest, 
            userId, 
            true,
            jwtToken,
            sessionToken
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
                console.log(`🎤 [WEBSOCKET] Envoi audio au Translator: ${audioAtt.id}`);

                // Extraire la transcription mobile si présente dans les metadata
                let mobileTranscription: any = undefined;
                if (audioAtt.metadata && typeof audioAtt.metadata === 'object') {
                  const metadata = audioAtt.metadata as any;
                  if (metadata.transcription) {
                    mobileTranscription = metadata.transcription;
                    console.log(`   📝 Transcription mobile trouvée: "${mobileTranscription.text?.substring(0, 50)}..."`);
                  }
                }

                // Envoyer au Translator pour transcription, traduction et clonage vocal
                // Construire le chemin ABSOLU du fichier audio (décoder l'URL encodée)
                const relativePath = audioAtt.fileUrl
                  ? `uploads/attachments${decodeURIComponent(audioAtt.fileUrl.replace('/api/v1/attachments/file', ''))}`
                  : audioAtt.filePath || '';
                const audioPath = relativePath ? path.resolve(process.cwd(), relativePath) : '';

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
                console.log(`✅ [WEBSOCKET] ${audioAttachments.length} audio(s) envoyé(s) au Translator`);
              }
            } catch (audioError) {
              console.error('⚠️ [WEBSOCKET] Erreur envoi audio au Translator:', audioError);
              // Ne pas bloquer l'envoi du message si le traitement audio échoue
            }
          }

          // Réponse via callback
          if (callback) {
            if (response.success && response.data) {
              const socketResponse: SocketIOResponse<{ messageId: string }> = { 
                success: true, 
                data: { messageId: response.data.id } 
              };
              callback(socketResponse);
            } else {
              const socketResponse: SocketIOResponse<{ messageId: string }> = {
                success: false,
                error: response.error || 'Failed to send message'
              };
              callback(socketResponse);
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
                    username: true,
                    displayName: true,
                    firstName: true,
                    lastName: true,
                    avatar: true
                  }
                },
                anonymousSender: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    username: true
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
                        username: true,
                        displayName: true,
                        firstName: true,
                        lastName: true,
                        avatar: true
                      }
                    },
                    anonymousSender: {
                      select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        username: true
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
          console.error('❌ [WEBSOCKET] Erreur envoi message avec attachments:', error);
          
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
        const room = `conversation_${normalizedId}`;
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
        const room = `conversation_${normalizedId}`;
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

            // Mettre à jour l'état en ligne dans la base de données et broadcaster
            await this.maintenanceService.updateUserOnlineStatus(user.id, true, true);

            // Rejoindre les conversations de l'utilisateur
            await this._joinUserConversations(socket, user.id, false);

            // Rejoindre la room globale si elle existe (conversation "meeshy")
            try {
              socket.join(`conversation_any`);
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
      if (sessionToken && (!sessionType || sessionType === 'anonymous')) {
        
        const participant = await this.prisma.anonymousParticipant.findUnique({
          where: { sessionToken },
          include: {
            shareLink: {
              select: { 
                id: true,
                linkId: true,
                isActive: true,
                expiresAt: true
              }
            }
          }
        });

        if (participant && participant.isActive && participant.shareLink.isActive) {
          // Vérifier l'expiration du lien
          if (!participant.shareLink.expiresAt || participant.shareLink.expiresAt > new Date()) {
            
            // Créer l'utilisateur Socket.IO anonyme
            const user: SocketUser = {
              id: participant.id,
              socketId: socket.id,
              isAnonymous: true,
              language: participant.language,
              sessionToken: participant.sessionToken
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
            // CORRECTION: Stocker le sessionToken au lieu de user.id pour les anonymes
            // Cela permet au MessagingService de détecter correctement le type d'authentification
            this.connectedUsers.set(user.id, user);
            this.socketToUser.set(socket.id, participant.sessionToken); // Utiliser sessionToken au lieu de user.id
            this._addUserSocket(user.id, socket.id);

            // CORRECTION: Mettre à jour l'état en ligne dans la base de données pour les anonymes et broadcaster
            await this.maintenanceService.updateAnonymousOnlineStatus(user.id, true, true);

            // Rejoindre la conversation spécifique du lien de partage
            try {
              const conversationRoom = `conversation_${participant.shareLink.id}`;
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
          const anonymousUser = await this.prisma.anonymousParticipant.findUnique({
            where: { sessionToken: data.sessionToken },
            include: {
              shareLink: {
                select: { 
                  id: true,
                  linkId: true,
                  isActive: true,
                  expiresAt: true
                }
              }
            }
          });
          
          if (anonymousUser && anonymousUser.isActive && anonymousUser.shareLink.isActive) {
            // Vérifier l'expiration du lien
            if (!anonymousUser.shareLink.expiresAt || anonymousUser.shareLink.expiresAt > new Date()) {
              user = {
                id: anonymousUser.id,
                socketId: socket.id,
                isAnonymous: true,
                language: data.language || anonymousUser.language || 'fr',
                sessionToken: anonymousUser.sessionToken
              };
            } else {
            }
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
        // CORRECTION: Pour les anonymes, stocker le sessionToken au lieu de user.id
        this.connectedUsers.set(user.id, user);
        this.socketToUser.set(socket.id, user.isAnonymous ? user.sessionToken! : user.id);
        
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
          socket.join(`conversation_any`);
        } catch {}
        
        socket.emit(SERVER_EVENTS.AUTHENTICATED, { success: true, user: { id: user.id, language: user.language } });
        
      } else {
        socket.emit(SERVER_EVENTS.AUTHENTICATED, { success: false, error: 'Authentication failed' });
      }
      
    } catch (error) {
      console.error(`❌ Erreur authentification: ${error}`);
      socket.emit(SERVER_EVENTS.AUTHENTICATED, { success: false, error: 'Authentication error' });
    }
  }

  private async _joinUserConversations(socket: any, userId: string, isAnonymous: boolean) {
    try {

      let conversations: any[] = [];

      if (isAnonymous) {
        // Conversations pour participants anonymes
        conversations = await this.prisma.anonymousParticipant.findMany({
          where: { id: userId },
          select: { conversationId: true }
        });
      } else {
        // Conversations pour utilisateurs authentifiés
        conversations = await this.prisma.conversationMember.findMany({
          where: { userId: userId, isActive: true },
          select: { conversationId: true }
        });
      }

      // Rejoindre les rooms Socket.IO
      for (const conv of conversations) {
        socket.join(`conversation_${conv.conversationId}`);
      }


    } catch (error) {
      console.error(`❌ [JOIN_CONVERSATIONS] Erreur jointure conversations pour ${userId}:`, error);
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
        socket.emit('error', { message: 'User not authenticated' });
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

      // Déterminer le type d'expéditeur
      if (connectedUser?.isAnonymous) {
        messageData.anonymousSenderId = userId;
      } else {
        messageData.senderId = userId;
      }
      
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
              username: true,
              displayName: true,
              avatar: true,
              role: true
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
              metadata: true, // IMPORTANT: Inclure audioEffectsTimeline
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

      const messagePayload = {
        id: saved?.id || result.messageId,
        conversationId: data.conversationId,
        senderId: saved?.senderId || messageData.senderId,
        content: saved?.content || data.content,
        originalLanguage: saved?.originalLanguage || messageData.originalLanguage || 'fr',
        messageType: saved?.messageType || data.messageType || 'text',
        isEdited: Boolean(saved?.isEdited),
        isDeleted: Boolean(saved?.isDeleted),
        createdAt: saved?.createdAt || new Date(),
        updatedAt: saved?.updatedAt || new Date(),
        sender: saved?.sender
          ? {
              id: saved.sender.id,
              username: saved.sender.username,
              displayName: (saved.sender as any).displayName || saved.sender.username,
              avatar: (saved.sender as any).avatar,
              role: (saved.sender as any).role,
              // champs additionnels non critiques
              firstName: '',
              lastName: '',
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

      // Support pour anonymousSender si présent
      if (saved?.anonymousSenderId) {
        (messagePayload as any).anonymousSenderId = saved.anonymousSenderId;
        // Inclure l'objet anonymousSender complet si disponible
        if ((saved as any).anonymousSender) {
          (messagePayload as any).anonymousSender = {
            id: (saved as any).anonymousSender.id,
            username: (saved as any).anonymousSender.username,
            firstName: (saved as any).anonymousSender.firstName,
            lastName: (saved as any).anonymousSender.lastName,
            language: (saved as any).anonymousSender.language
          };
        }
      }

      this.io.to(`conversation_${data.conversationId}`).emit(SERVER_EVENTS.MESSAGE_NEW, messagePayload);
      // S'assurer que l'auteur reçoit aussi (au cas où il ne serait pas dans la room encore)
      socket.emit(SERVER_EVENTS.MESSAGE_NEW, messagePayload);
      
      
      // 4. ENVOYER LES NOTIFICATIONS DE MESSAGE
      const senderId = saved?.senderId || saved?.anonymousSenderId;
      const isAnonymousSender = !!saved?.anonymousSenderId;
      if (senderId) {
        // Envoyer les notifications en asynchrone pour ne pas bloquer
        // Note: Les notifications sont gérées directement dans routes/notifications.ts
      }
      
      // 5. LES TRADUCTIONS SERONT TRAITÉES EN ASYNCHRONE PAR LE TRANSLATION SERVICE
      // ET LES RÉSULTATS SERONT ENVOYÉS VIA LES ÉVÉNEMENTS 'translationReady'
      
      return { messageId: result.messageId };
    } catch (error) {
      console.error(`❌ Erreur traitement message: ${error}`);
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
        socket.emit(SERVER_EVENTS.TRANSLATION_ERROR, {
          messageId: data.messageId,
          targetLanguage: data.targetLanguage,
          error: 'Translation not available'
        });
        
      }
      
    } catch (error) {
      console.error(`❌ Erreur demande traduction: ${error}`);
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
        console.error(`❌ [SocketIOManager] Erreur récupération conversation:`, error);
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
        const roomName = `conversation_${normalizedId}`;
        const roomClients = this.io.sockets.adapter.rooms.get(roomName);
        const clientCount = roomClients ? roomClients.size : 0;
        
        
        // Log des clients dans la room pour debug
        if (clientCount > 0 && roomClients) {
          const clientSocketIds = Array.from(roomClients);
        }
        
        this.io.to(roomName).emit(SERVER_EVENTS.MESSAGE_TRANSLATION, translationData);
        this.stats.translations_sent += clientCount;
        
      } else {
        console.warn(`⚠️ [SocketIOManager] Aucune conversation trouvée pour le message ${result.messageId}`);
        
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
            console.error(`❌ Erreur envoi notification traduction ${result.messageId}:`, error);
          }
        });
      }
      
    } catch (error) {
      console.error(`❌ Erreur envoi traduction: ${error}`);
      this.stats.errors++;
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
    };
    processingTimeMs?: number;
  }) {
    try {
      console.log(`📝 [SocketIOManager] ======== DIFFUSION TRANSCRIPTION VERS CLIENTS ========`);
      console.log(`📝 [SocketIOManager] Transcription ready pour message ${data.messageId}, attachment ${data.attachmentId}`);
      console.log(`   📝 Transcription ID: ${data.transcription.id}`);
      console.log(`   📝 Texte: "${data.transcription.text?.substring(0, 100)}..."`);
      console.log(`   📝 Langue: ${data.transcription.language}`);
      console.log(`   📝 Confiance: ${data.transcription.confidence}`);
      console.log(`   📝 Segments: ${data.transcription.segments?.length || 0} segments`);

      // Récupérer la conversation du message pour broadcast
      let conversationId: string | null = null;
      try {
        const msg = await this.prisma.message.findUnique({
          where: { id: data.messageId },
          select: { conversationId: true }
        });
        conversationId = msg?.conversationId || null;
      } catch (error) {
        console.error(`❌ [SocketIOManager] Erreur récupération conversation pour transcription:`, error);
      }

      if (!conversationId) {
        console.warn(`⚠️ [SocketIOManager] Aucune conversation trouvée pour le message ${data.messageId}`);
        return;
      }

      // Normaliser l'ID de conversation
      const normalizedId = await this.normalizeConversationId(conversationId);
      const roomName = `conversation_${normalizedId}`;
      const roomClients = this.io.sockets.adapter.rooms.get(roomName);
      const clientCount = roomClients ? roomClients.size : 0;

      console.log(`📢 [SocketIOManager] Diffusion transcription vers room ${roomName} (${clientCount} clients)`);

      // Préparer les données au format TranscriptionReadyEventData
      const transcriptionData = {
        messageId: data.messageId,
        attachmentId: data.attachmentId,
        conversationId: normalizedId,
        transcription: data.transcription,
        processingTimeMs: data.processingTimeMs
      };

      // Diffuser dans la room de conversation
      console.log(`📡 [SocketIOManager] Émission événement '${SERVER_EVENTS.TRANSCRIPTION_READY}' vers room '${roomName}' (${clientCount} clients)`);
      this.io.to(roomName).emit(SERVER_EVENTS.TRANSCRIPTION_READY, transcriptionData);

      console.log(`✅ [SocketIOManager] ======== ÉVÉNEMENT TRANSCRIPTION DIFFUSÉ ========`);
      console.log(`✅ [SocketIOManager] Transcription diffusée vers ${clientCount} client(s)`);

    } catch (error) {
      console.error(`❌ [SocketIOManager] Erreur envoi transcription:`, error);
      this.stats.errors++;
    }
  }

  /**
   * Gère la réception d'une traduction individuelle prête depuis le Translator (PROGRESSIVE)
   * @deprecated Utilisez _handleAudioTranslationReady, _handleAudioTranslationsProgressive ou _handleAudioTranslationsCompleted
   * Délègue au helper générique avec un événement générique
   */
  private async _handleTranslationReady(data: {
    taskId: string;
    messageId: string;
    attachmentId: string;
    language: string;
    translatedAudio: any;
    phase?: string;
  }) {
    console.log(`🌍 [DEPRECATED] _handleTranslationReady appelé - délégation au nouveau système`);
    // Déléguer au handler audioTranslationsProgressive par défaut pour rétrocompatibilité
    await this._handleAudioTranslationsProgressive(data);
  }

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
    },
    eventName: string,
    eventConstant:
      | typeof SERVER_EVENTS.AUDIO_TRANSLATION_READY
      | typeof SERVER_EVENTS.AUDIO_TRANSLATIONS_PROGRESSIVE
      | typeof SERVER_EVENTS.AUDIO_TRANSLATIONS_COMPLETED,
    logPrefix: string
  ) {
    try {
      console.log(`${logPrefix} [SocketIOManager] ======== DIFFUSION TRADUCTION VERS CLIENTS ========`);
      console.log(`${logPrefix} [SocketIOManager] Translation ready pour message ${data.messageId}, attachment ${data.attachmentId}`);
      console.log(`   🔊 Langue: ${data.language}`);
      console.log(`   📝 Segments: ${data.translatedAudio.segments?.length || 0}`);

      // Récupérer la conversation du message pour broadcast
      let conversationId: string | null = null;
      try {
        const msg = await this.prisma.message.findUnique({
          where: { id: data.messageId },
          select: { conversationId: true }
        });
        conversationId = msg?.conversationId || null;
      } catch (error) {
        console.error(`❌ [SocketIOManager] Erreur récupération conversation pour traduction:`, error);
      }

      if (!conversationId) {
        console.warn(`⚠️ [SocketIOManager] Aucune conversation trouvée pour le message ${data.messageId}`);
        return;
      }

      // Normaliser l'ID de conversation
      const normalizedId = await this.normalizeConversationId(conversationId);
      const roomName = `conversation_${normalizedId}`;
      const roomClients = this.io.sockets.adapter.rooms.get(roomName);
      const clientCount = roomClients ? roomClients.size : 0;

      console.log(`📢 [SocketIOManager] Diffusion traduction ${data.language} vers room ${roomName} (${clientCount} clients)`);

      // Préparer les données au format structure officielle de shared
      // Note: AudioTranslationReadyEventData, AudioTranslationsProgressiveEventData, AudioTranslationsCompletedEventData
      // sont des type aliases de AudioTranslationEventData, donc on peut utiliser n'importe lequel
      const translationData: import('@meeshy/shared/types/socketio-events').AudioTranslationEventData = {
        messageId: data.messageId,
        attachmentId: data.attachmentId,
        conversationId: normalizedId,
        language: data.language,
        translatedAudio: {
          id: data.attachmentId,
          targetLanguage: data.translatedAudio.targetLanguage || data.language,
          url: data.translatedAudio.url,
          path: data.translatedAudio.path,
          transcription: data.translatedAudio.transcription || '',
          durationMs: data.translatedAudio.durationMs || 0,
          format: data.translatedAudio.format || 'mp3',
          cloned: data.translatedAudio.cloned || false,
          quality: data.translatedAudio.quality || 0,
          voiceModelId: data.translatedAudio.voiceModelId,
          ttsModel: data.translatedAudio.ttsModel || 'xtts',
          segments: data.translatedAudio.segments  // ← SEGMENTS COMPLETS
        },
        processingTimeMs: data.phase ? undefined : 0
      };

      // Vérification et log des segments
      if (translationData.translatedAudio.segments && translationData.translatedAudio.segments.length > 0) {
        console.log(`   ✅ Segments inclus: ${translationData.translatedAudio.segments.length}`);
        const firstSeg = translationData.translatedAudio.segments[0];
        console.log(`   📝 Premier segment: "${firstSeg.text}" (${firstSeg.startMs}ms-${firstSeg.endMs}ms, speaker=${firstSeg.speakerId}, score=${firstSeg.voiceSimilarityScore})`);
      } else {
        console.warn(`   ⚠️ Aucun segment dans translatedAudio!`);
      }

      // Diffuser dans la room de conversation
      console.log(`📡 [SocketIOManager] Émission événement '${eventConstant}' vers room '${roomName}' (${clientCount} clients)`);
      this.io.to(roomName).emit(eventConstant, translationData);

      console.log(`✅ [SocketIOManager] ======== ÉVÉNEMENT TRADUCTION DIFFUSÉ ========`);
      console.log(`✅ [SocketIOManager] Traduction ${data.language} diffusée vers ${clientCount} client(s)`);

    } catch (error) {
      console.error(`❌ [SocketIOManager] Erreur envoi traduction:`, error);
      this.stats.errors++;
    }
  }

  /**
   * Gère un événement de traduction audio unique (1 seule langue demandée).
   */
  private async _handleAudioTranslationReady(data: {
    taskId: string;
    messageId: string;
    attachmentId: string;
    language: string;
    translatedAudio: any;
    phase?: string;
  }) {
    await this._broadcastTranslationEvent(
      data,
      'audioTranslationReady',
      SERVER_EVENTS.AUDIO_TRANSLATION_READY,
      '🎯'
    );
  }

  /**
   * Gère un événement de traduction progressive (multi-langues, pas la dernière).
   */
  private async _handleAudioTranslationsProgressive(data: {
    taskId: string;
    messageId: string;
    attachmentId: string;
    language: string;
    translatedAudio: any;
    phase?: string;
  }) {
    await this._broadcastTranslationEvent(
      data,
      'audioTranslationsProgressive',
      SERVER_EVENTS.AUDIO_TRANSLATIONS_PROGRESSIVE,
      '🔄'
    );
  }

  /**
   * Gère un événement de dernière traduction terminée (multi-langues).
   */
  private async _handleAudioTranslationsCompleted(data: {
    taskId: string;
    messageId: string;
    attachmentId: string;
    language: string;
    translatedAudio: any;
    phase?: string;
  }) {
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
        // IMPORTANT: Automatically leave any active video/audio calls
        try {
          const activeParticipations = await this.prisma.callParticipant.findMany({
            where: {
              userId,
              leftAt: null // Still in call
            },
            include: {
              callSession: true
            }
          });

          if (activeParticipations.length > 0) {

            for (const participation of activeParticipations) {
              try {
                // Use CallService to properly leave the call
                await this.callService.leaveCall({
                  callId: participation.callSessionId,
                  userId
                });
              } catch (error) {
                console.error(`❌ Error auto-leaving call ${participation.callSessionId}:`, error);
              }
            }
          }
        } catch (error) {
          console.error(`❌ Error checking/leaving active calls for user ${userId}:`, error);
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
        const participant = await this.prisma.anonymousParticipant.findUnique({
          where: { id: userId },
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            lastActiveAt: true,
            conversationId: true
          }
        });

        if (participant) {
          const displayName = `${participant.firstName} ${participant.lastName}`.trim() || participant.username;

          // PRIVACY: Ne pas envoyer lastActiveAt si showLastSeen est désactivé
          const lastActiveAt = privacyPrefs.showLastSeen ? participant.lastActiveAt : null;

          // Broadcaster uniquement dans la conversation du participant anonyme
          this.io.to(`conversation_${participant.conversationId}`).emit(SERVER_EVENTS.USER_STATUS, {
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
            lastActiveAt: true,
            conversations: {
              select: {
                conversationId: true
              }
            }
          }
        });

        if (user) {
          const displayName = user.displayName || `${user.firstName} ${user.lastName}`.trim() || user.username;

          // PRIVACY: Ne pas envoyer lastActiveAt si showLastSeen est désactivé
          const lastActiveAt = privacyPrefs.showLastSeen ? user.lastActiveAt : null;

          // Broadcaster dans toutes les conversations de l'utilisateur
          for (const conv of user.conversations) {
            this.io.to(`conversation_${conv.conversationId}`).emit(SERVER_EVENTS.USER_STATUS, {
              userId: user.id,
              username: displayName,
              isOnline,
              lastActiveAt
            });
          }

        }
      }
    } catch (error) {
      console.error('❌ [STATUS] Erreur lors du broadcast du statut:', error);
    }
  }

  private async _handleTypingStart(socket: any, data: { conversationId: string }) {
    const userIdOrToken = this.socketToUser.get(socket.id);
    if (!userIdOrToken) {
      console.warn('⚠️ [TYPING] Typing start sans userId pour socket', socket.id);
      return;
    }

    try {
      // Normaliser l'ID de conversation
      const normalizedId = await this.normalizeConversationId(data.conversationId);

      // Récupérer l'utilisateur depuis connectedUsers (gère le cas sessionToken pour anonymes)
      const result = this._getConnectedUser(userIdOrToken);
      if (!result) {
        console.warn('⚠️ [TYPING] Utilisateur non connecté:', userIdOrToken);
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
        // Récupérer depuis AnonymousParticipant
        const dbAnonymousUser = await (this.prisma as any).anonymousParticipant.findUnique({
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
          return;
        }

        // Construire le nom d'affichage pour anonyme
        displayName = `${dbAnonymousUser.firstName || ''} ${dbAnonymousUser.lastName || ''}`.trim() ||
                      dbAnonymousUser.username;
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
          console.warn('⚠️ [TYPING] Utilisateur non trouvé:', userId);
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

      const room = `conversation_${normalizedId}`;


      // Émettre vers tous les autres utilisateurs de la conversation (sauf l'émetteur)
      socket.to(room).emit(SERVER_EVENTS.TYPING_START, typingEvent);

    } catch (error) {
      console.error('❌ [TYPING] Erreur handleTypingStart:', error);
    }
  }

  private async _handleTypingStop(socket: any, data: { conversationId: string }) {
    const userIdOrToken = this.socketToUser.get(socket.id);
    if (!userIdOrToken) {
      console.warn('⚠️ [TYPING] Typing stop sans userId pour socket', socket.id);
      return;
    }

    try {
      // Normaliser l'ID de conversation
      const normalizedId = await this.normalizeConversationId(data.conversationId);

      // Récupérer l'utilisateur depuis connectedUsers (gère le cas sessionToken pour anonymes)
      const result = this._getConnectedUser(userIdOrToken);
      if (!result) {
        console.warn('⚠️ [TYPING] Utilisateur non connecté:', userIdOrToken);
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
        // Récupérer depuis AnonymousParticipant
        const dbAnonymousUser = await (this.prisma as any).anonymousParticipant.findUnique({
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
          return;
        }

        // Construire le nom d'affichage pour anonyme
        displayName = `${dbAnonymousUser.firstName || ''} ${dbAnonymousUser.lastName || ''}`.trim() ||
                      dbAnonymousUser.username;
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
          console.warn('⚠️ [TYPING] Utilisateur non trouvé:', userId);
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

      const room = `conversation_${normalizedId}`;


      // Émettre vers tous les autres utilisateurs de la conversation (sauf l'émetteur)
      socket.to(room).emit(SERVER_EVENTS.TYPING_STOP, typingEvent);

    } catch (error) {
      console.error('❌ [TYPING] Erreur handleTypingStop:', error);
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
        // Récupérer les traductions existantes du message
        (async () => {
          if (!message.id) return [];
          try {
            const messageWithTranslations = await this.prisma.message.findUnique({
              where: { id: message.id },
              include: {
                translations: {
                  select: {
                    id: true,
                    targetLanguage: true,
                    translatedContent: true,
                    translationModel: true,
                    confidenceScore: true
                  }
                }
              }
            });
            return (messageWithTranslations as any)?.translations || [];
          } catch (error) {
            console.warn(`⚠️ [DEBUG] Erreur récupération traductions pour ${message.id}:`, error);
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
          console.warn(`⚠️ [PERF] Erreur calcul stats (non-bloquant): ${error}`);
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
        console.warn(`⚠️ [PERF] Stats non disponibles, broadcast sans stats`);
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
        isDeleted: Boolean(message.isDeleted),
        createdAt: message.createdAt || new Date(),
        updatedAt: message.updatedAt || new Date(),
        // CORRECTION CRITIQUE: Inclure validatedMentions pour rendre les mentions cliquables en temps réel
        validatedMentions: (message as any).validatedMentions || [],
        // CORRECTION CRITIQUE: Inclure les traductions dans le payload
        translations: messageTranslations,
        sender: message.sender ? {
          id: message.sender.id,
          username: message.sender.username,
          firstName: (message.sender as any).firstName || '',
          lastName: (message.sender as any).lastName || '',
          email: (message.sender as any).email || '',
          displayName: (message.sender as any).displayName || message.sender.username,
          avatar: (message.sender as any).avatar,
          role: (message.sender as any).role || 'USER',
          isOnline: false,
          lastActiveAt: new Date(),
          systemLanguage: (message.sender as any).systemLanguage || 'fr',
          regionalLanguage: (message.sender as any).regionalLanguage || 'fr',
          autoTranslateEnabled: (message.sender as any).autoTranslateEnabled ?? true,
          translateToSystemLanguage: (message.sender as any).translateToSystemLanguage ?? true,
          translateToRegionalLanguage: (message.sender as any).translateToRegionalLanguage ?? false,
          useCustomDestination: (message.sender as any).useCustomDestination ?? false,
          isActive: (message.sender as any).isActive ?? true,
          createdAt: (message.sender as any).createdAt || new Date(),
          updatedAt: (message.sender as any).updatedAt || new Date()
        } : undefined,
        // CORRECTION: Inclure les attachments dans le payload avec metadata brut
        attachments: (message as any).attachments || [],
        // CORRECTION: Inclure l'objet replyTo complet ET replyToId
        replyToId: message.replyToId || undefined,
        replyTo: (message as any).replyTo ? {
          id: (message as any).replyTo.id,
          conversationId: normalizedId,  // ← FIX: Utiliser l'ObjectId normalisé cohérent
          senderId: (message as any).replyTo.senderId || undefined,
          anonymousSenderId: (message as any).replyTo.anonymousSenderId || undefined,
          content: (message as any).replyTo.content,
          originalLanguage: (message as any).replyTo.originalLanguage || 'fr',
          messageType: (message as any).replyTo.messageType || 'text',
          createdAt: (message as any).replyTo.createdAt || new Date(),
          sender: (message as any).replyTo.sender ? {
            id: (message as any).replyTo.sender.id,
            username: (message as any).replyTo.sender.username,
            firstName: (message as any).replyTo.sender.firstName || '',
            lastName: (message as any).replyTo.sender.lastName || '',
            displayName: (message as any).replyTo.sender.displayName || (message as any).replyTo.sender.username,
          } : undefined,
          anonymousSender: (message as any).replyTo.anonymousSender ? {
            id: (message as any).replyTo.anonymousSender.id,
            username: (message as any).replyTo.anonymousSender.username,
            firstName: (message as any).replyTo.anonymousSender.firstName,
            lastName: (message as any).replyTo.anonymousSender.lastName,
          } : undefined
        } : undefined,
        meta: {
          conversationStats: updatedStats
        }
      };

      // DEBUG: Log pour vérifier les attachments et metadata
      if ((message as any).attachments && (message as any).attachments.length > 0) {
        console.log('🔍 [WEBSOCKET] Broadcasting message avec attachments:', {
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

      // Support pour anonymousSender si présent
      if (message.anonymousSenderId) {
        (messagePayload as any).anonymousSenderId = message.anonymousSenderId;
        // Inclure l'objet anonymousSender complet si disponible
        if ((message as any).anonymousSender) {
          (messagePayload as any).anonymousSender = {
            id: (message as any).anonymousSender.id,
            username: (message as any).anonymousSender.username,
            firstName: (message as any).anonymousSender.firstName,
            lastName: (message as any).anonymousSender.lastName,
            language: (message as any).anonymousSender.language
          };
        }
      }

      // COMPORTEMENT SIMPLE ET FIABLE DE L'ANCIENNE MÉTHODE
      const room = `conversation_${normalizedId}`;
      // 1. Broadcast vers tous les clients de la conversation
      this.io.to(room).emit(SERVER_EVENTS.MESSAGE_NEW, messagePayload);

      // 2. S'assurer que l'auteur reçoit aussi (au cas où il ne serait pas dans la room encore)
      if (senderSocket) {
        senderSocket.emit(SERVER_EVENTS.MESSAGE_NEW, messagePayload);
      } else {
      }

      const roomClients = this.io.sockets.adapter.rooms.get(room);

      // 3. Mettre à jour le unreadCount pour tous les membres (sauf l'expéditeur)
      // Cela permet d'incrémenter le badge en temps réel pour les conversations non ouvertes
      try {
        const senderId = message.senderId || message.anonymousSenderId;
        if (senderId) {
          // Récupérer tous les membres de la conversation
          const members = await this.prisma.conversationMember.findMany({
            where: {
              conversationId: normalizedId,
              isActive: true,
              userId: { not: senderId } // Exclure l'expéditeur
            },
            select: { userId: true }
          });

          // Calculer le unreadCount pour chaque membre et émettre l'événement
          const { MessageReadStatusService } = await import('../services/MessageReadStatusService.js');
          const readStatusService = new MessageReadStatusService(this.prisma);

          for (const member of members) {
            const unreadCount = await readStatusService.getUnreadCount(member.userId, normalizedId);

            // Émettre vers le socket personnel de l'utilisateur
            this.io.to(`user_${member.userId}`).emit(SERVER_EVENTS.CONVERSATION_UNREAD_UPDATED, {
              conversationId: normalizedId,
              unreadCount
            });
          }
        }
      } catch (unreadError) {
        console.warn('⚠️ [UNREAD_COUNT] Erreur calcul unreadCount (non-bloquant):', unreadError);
      }

      // Envoyer les notifications de message pour les utilisateurs non connectés à la conversation
      const isAnonymousSender = !!message.anonymousSenderId;
      if (message.senderId) {
        // Note: Les notifications sont gérées directement dans routes/notifications.ts
      }
      
    } catch (error) {
      console.error('[PHASE 3.1] Erreur broadcast message:', error);
    }
  }

  /**
   * PHASE 3.1.1: Extraction du JWT Token depuis le socket
   */
  private extractJWTToken(socket: any): string | undefined {
    return socket.handshake?.headers?.authorization?.replace('Bearer ', '') || 
           socket.handshake?.auth?.authToken || 
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
        console.error('❌ [_handleReactionAdd] No userId found for socket:', socket.id);

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
      const sessionToken = user?.sessionToken;


      // Importer le ReactionService
      const { ReactionService } = await import('../services/ReactionService.js');
      const reactionService = new ReactionService(this.prisma);

      // Ajouter la réaction
      const reaction = await reactionService.addReaction({
        messageId: data.messageId,
        emoji: data.emoji,
        userId: !isAnonymous ? userId : undefined,
        anonymousId: isAnonymous && sessionToken ? sessionToken : undefined
      });

      if (!reaction) {
        const errorResponse: SocketIOResponse<any> = {
          success: false,
          error: 'Failed to add reaction'
        };
        if (callback) callback(errorResponse);
        return;
      }

      // Créer l'événement de mise à jour
      const updateEvent = await reactionService.createUpdateEvent(
        data.messageId,
        data.emoji,
        'add',
        !isAnonymous ? userId : undefined,
        isAnonymous && sessionToken ? sessionToken : undefined
      );

      // Envoyer la réponse au client
      const successResponse: SocketIOResponse<any> = {
        success: true,
        data: reaction
      };
      if (callback) callback(successResponse);

      // Broadcaster l'événement à tous les participants de la conversation
      const message = await this.prisma.message.findUnique({
        where: { id: data.messageId },
        select: {
          conversationId: true,
          content: true,
          senderId: true,
          anonymousSenderId: true,
          conversation: {
            select: {
              title: true
            }
          }
        }
      });

      if (message) {
        const normalizedConversationId = await this.normalizeConversationId(message.conversationId);

        this.io.to(normalizedConversationId).emit(SERVER_EVENTS.REACTION_ADDED, updateEvent);

        // Créer une notification pour l'auteur du message (si ce n'est pas lui qui réagit)
        // Ne notifier que les utilisateurs authentifiés (pas les anonymes)
        const messageAuthorId = message.senderId;
        const reactorId = !isAnonymous ? userId : null;

        if (messageAuthorId && reactorId && messageAuthorId !== reactorId) {
          // Créer la notification de manière asynchrone sans bloquer
          // Fire-and-forget pour éviter les timeouts
          this.notificationService.createReactionNotification({
            messageAuthorId,
            reactorId,
            reactorUsername: '', // sera récupéré par fetchSenderInfo
            reactorAvatar: undefined,
            emoji: data.emoji,
            messageContent: message.content,
            conversationId: message.conversationId,
            conversationTitle: message.conversation.title || undefined,
            messageId: data.messageId,
            reactionId: reaction.id
          }).catch((notifError) => {
            console.error('❌ [REACTION_ADDED] Erreur lors de la création de la notification:', notifError);
          });
        }

      } else {
        console.error(`❌ [REACTION_ADDED] Message ${data.messageId} non trouvé, impossible de broadcaster`);
      }
    } catch (error: any) {
      console.error('❌ Erreur lors de l\'ajout de réaction:', error);
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
      const sessionToken = user?.sessionToken;

      // Importer le ReactionService
      const { ReactionService } = await import('../services/ReactionService.js');
      const reactionService = new ReactionService(this.prisma);

      // Supprimer la réaction
      const removed = await reactionService.removeReaction({
        messageId: data.messageId,
        emoji: data.emoji,
        userId: !isAnonymous ? userId : undefined,
        anonymousId: isAnonymous && sessionToken ? sessionToken : undefined
      });

      if (!removed) {
        const errorResponse: SocketIOResponse<any> = {
          success: false,
          error: 'Reaction not found'
        };
        if (callback) callback(errorResponse);
        return;
      }

      // Créer l'événement de mise à jour
      const updateEvent = await reactionService.createUpdateEvent(
        data.messageId,
        data.emoji,
        'remove',
        !isAnonymous ? userId : undefined,
        isAnonymous && sessionToken ? sessionToken : undefined
      );

      // Envoyer la réponse au client
      const successResponse: SocketIOResponse<any> = {
        success: true,
        data: { message: 'Reaction removed successfully' }
      };
      if (callback) callback(successResponse);

      // Broadcaster l'événement à tous les participants de la conversation
      const message = await this.prisma.message.findUnique({
        where: { id: data.messageId },
        select: { conversationId: true }
      });

      if (message) {
        const normalizedConversationId = await this.normalizeConversationId(message.conversationId);
        this.io.to(normalizedConversationId).emit(SERVER_EVENTS.REACTION_REMOVED, updateEvent);
      }

    } catch (error: any) {
      console.error('❌ Erreur lors de la suppression de réaction:', error);
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
        console.error(`❌ [REACTION_SYNC] Utilisateur non authentifié pour socket ${socket.id}`);
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
      const sessionToken = user?.sessionToken;


      // Importer le ReactionService
      const { ReactionService } = await import('../services/ReactionService.js');
      const reactionService = new ReactionService(this.prisma);

      // Récupérer les réactions avec agrégation
      const reactionSync = await reactionService.getMessageReactions({
        messageId,
        currentUserId: !isAnonymous ? userId : undefined,
        currentAnonymousUserId: isAnonymous && sessionToken ? sessionToken : undefined
      });


      // Envoyer la réponse au client
      const successResponse: SocketIOResponse<any> = {
        success: true,
        data: reactionSync
      };
      if (callback) callback(successResponse);

    } catch (error: any) {
      console.error('❌ Erreur lors de la synchronisation des réactions:', error);
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
            console.log(`📢 [NOTIFICATIONS] Message avec ${attachments.length} attachment(s)`);
          }
        } catch (err) {
          console.error('❌ [NOTIFICATIONS] Erreur lors de la récupération des attachments:', err);
        }
      }

      if (!conversation) {
        console.error('❌ [NOTIFICATIONS] Conversation non trouvée:', message.conversationId);
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
          console.error('❌ [NOTIFICATIONS] Erreur lors de la récupération du message original:', err);
        }
      }

      // Récupérer les utilisateurs mentionnés dans le message
      // Ils recevront une notification de mention spécifique, pas une notification de message générique
      const mentionedUserIds = new Set<string>();
      if (message.id) {
        try {
          const mentions = await this.prisma.mention.findMany({
            where: { messageId: message.id },
            select: { mentionedUserId: true }
          });
          mentions.forEach(m => mentionedUserIds.add(m.mentionedUserId));
          console.log(`📢 [NOTIFICATIONS] ${mentionedUserIds.size} utilisateur(s) mentionné(s) - ils ne recevront QUE la notification de mention`);
        } catch (err) {
          console.error('❌ [NOTIFICATIONS] Erreur lors de la récupération des mentions:', err);
        }
      }

      // Récupérer les membres de la conversation
      const conversationMembers = await this.prisma.conversationMember.findMany({
        where: {
          conversationId: message.conversationId,
          userId: {
            not: message.senderId // Exclure l'expéditeur des notifications
          }
        },
        include: {
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
        senderUsername = message.sender.username || 'Unknown';
        senderAvatar = message.sender.avatar || undefined;
        senderDisplayName = message.sender.displayName || undefined;
        senderFirstName = message.sender.firstName || undefined;
        senderLastName = message.sender.lastName || undefined;
      } else if (message.anonymousSender) {
        const fullName = `${message.anonymousSender.firstName || ''} ${message.anonymousSender.lastName || ''}`.trim();
        senderUsername = message.anonymousSender.username || 'Anonymous';
        senderFirstName = message.anonymousSender.firstName || undefined;
        senderLastName = message.anonymousSender.lastName || undefined;
      }

      // Si c'est une réponse, créer une notification de réponse pour l'auteur du message original
      // SAUF si l'auteur est mentionné (la mention a la priorité)
      if (originalMessageAuthorId && originalMessageAuthorId !== senderId) {
        // Vérifier si l'auteur du message original est mentionné dans ce message
        const isOriginalAuthorMentioned = mentionedUserIds.has(originalMessageAuthorId);

        if (!isOriginalAuthorMentioned) {
          // L'auteur n'est pas mentionné, on crée une notification de réponse
          await this.notificationService.createReplyNotification({
            originalMessageAuthorId,
            replierId: message.senderId || '',
            replierUsername: senderUsername,
            replierAvatar: senderAvatar,
            replyContent: message.content,
            conversationId: message.conversationId,
            conversationTitle: conversation.title || undefined,
            originalMessageId: message.replyToId!,
            replyMessageId: message.id,
            attachments: messageAttachments.length > 0 ? messageAttachments : undefined
          });
          console.log(`📢 [NOTIFICATIONS] Notification de réponse créée pour ${originalMessageAuthorId}`);
        } else {
          console.log(`📢 [NOTIFICATIONS] Skip notification de réponse pour ${originalMessageAuthorId} (mentionné - priorité mention)`);
        }
      }

      // Créer une notification pour chaque membre (sauf l'expéditeur, les utilisateurs mentionnés ET l'auteur du message original en cas de réponse)
      for (const member of conversationMembers) {
        // Ne pas envoyer de notification de message générique aux utilisateurs mentionnés
        // Ils recevront une notification de mention plus spécifique
        if (mentionedUserIds.has(member.userId)) {
          console.log(`📢 [NOTIFICATIONS] Skip notification générique pour ${member.userId} (mentionné)`);
          continue;
        }

        // Ne pas envoyer de notification de message générique à l'auteur du message original
        // Il recevra une notification de réponse spécifique
        if (originalMessageAuthorId && member.userId === originalMessageAuthorId) {
          console.log(`📢 [NOTIFICATIONS] Skip notification générique pour ${member.userId} (auteur du message original)`);
          continue;
        }

        await this.notificationService.createMessageNotification({
          recipientId: member.userId,
          senderId: message.senderId || '',
          senderUsername,
          senderAvatar,
          senderDisplayName,
          senderFirstName,
          senderLastName,
          messageContent: message.content,
          conversationId: message.conversationId,
          messageId: message.id,
          conversationType: conversation.type,
          conversationTitle: conversation.title || undefined,
          attachments: messageAttachments.length > 0 ? messageAttachments : undefined
        });
      }

    } catch (error) {
      console.error('❌ [NOTIFICATIONS] Erreur création notifications message:', error);
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
      console.error(`❌ Health check échoué: ${error}`);
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
      console.error(`❌ Erreur fermeture MeeshySocketIOManager: ${error}`);
    }
  }
}
