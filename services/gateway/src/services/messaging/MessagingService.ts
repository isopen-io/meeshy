/**
 * Messaging Service - Orchestrator
 * Main entry point for message handling with composition of validator and processor
 */

import { PrismaClient, Message } from '@meeshy/shared/prisma/client';
import type {
  MessageRequest,
  MessageResponse,
  MessageResponseMetadata,
  AuthenticationContext
} from '@meeshy/shared/types';
import { MessageTranslationService } from '../message-translation/MessageTranslationService';
import { conversationStatsService } from '../ConversationStatsService';
import { MessageReadStatusService } from '../MessageReadStatusService';
import { NotificationService } from '../notifications/NotificationService';
import { MessageValidator } from './MessageValidator';
import { MessageProcessor } from './MessageProcessor';

export class MessagingService {
  private validator: MessageValidator;
  private processor: MessageProcessor;
  private readStatusService: MessageReadStatusService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly translationService: MessageTranslationService,
    notificationService?: NotificationService
  ) {
    this.validator = new MessageValidator(prisma);
    this.processor = new MessageProcessor(prisma, notificationService);
    this.readStatusService = new MessageReadStatusService(prisma);
  }

  /**
   * Point d'entrée principal pour l'envoi de messages
   * Utilisé par REST et WebSocket endpoints
   */
  async handleMessage(
    request: MessageRequest,
    senderId: string,
    isAuthenticated: boolean = true,
    jwtToken?: string,
    sessionToken?: string
  ): Promise<MessageResponse> {
    const startTime = Date.now();
    const requestId = this.generateRequestId();

    try {
      // 1. Création du contexte d'authentification robuste
      const authContext = this.createAuthenticationContext(senderId, jwtToken, sessionToken);

      const enrichedRequest: MessageRequest = {
        ...request,
        authContext,
        isAnonymous: authContext.isAnonymous
      };

      // 2. Validation de la requête
      const validationResult = await this.validator.validateRequest(enrichedRequest);
      if (!validationResult.isValid) {
        return this.createErrorResponse(validationResult.errors[0].message, requestId);
      }

      // 3. Résolution de l'ID de conversation
      const conversationId = await this.validator.resolveConversationId(enrichedRequest.conversationId);
      if (!conversationId) {
        return this.createErrorResponse('Conversation non trouvée', requestId);
      }

      // 4. Vérification des permissions avec contexte d'authentification
      const permissionResult = await this.validator.checkPermissions(
        authContext,
        conversationId,
        enrichedRequest
      );
      if (!permissionResult.canSend) {
        return this.createErrorResponse(
          permissionResult.reason || 'Permissions insuffisantes pour envoyer des messages',
          requestId
        );
      }

      // 5. Détection de langue automatique si nécessaire
      const originalLanguage = enrichedRequest.originalLanguage ||
        await this.validator.detectLanguage(enrichedRequest.content);

      // 6. Déterminer les IDs pour la sauvegarde selon le type d'authentification
      const { actualSenderId, actualAnonymousSenderId } = await this.resolveSenderIds(
        authContext,
        senderId,
        conversationId
      );

      // 7. Sauvegarde du message en base avec les bons IDs
      const message = await this.processor.saveMessage({
        ...request,
        originalLanguage,
        conversationId,
        senderId: actualSenderId,
        anonymousSenderId: actualAnonymousSenderId,
        mentionedUserIds: request.mentionedUserIds,
        // Map E2EE encrypted payload to DB fields if present
        encryptedContent: request.encryptedPayload?.ciphertext,
        encryptionMetadata: request.encryptedPayload ? {
          mode: 'e2ee',
          ...request.encryptedPayload
        } as any : undefined
      });

      // 8. Mise à jour de la conversation
      await this.updateConversation(conversationId);

      // 9. Marquer comme reçu ET lu pour l'expéditeur
      await this.readStatusService.markMessagesAsRead(
        actualSenderId || actualAnonymousSenderId || senderId,
        conversationId,
        message.id
      );

      // 10. Queue de traduction (async)
      const translationStatus = await this.queueTranslation(message, originalLanguage);

      // 11. Mise à jour des statistiques (async)
      const stats = await this.updateStats(conversationId, originalLanguage);

      // 12. Génération de la réponse unifiée
      const response = await this.createSuccessResponse(
        message,
        requestId,
        startTime,
        stats,
        translationStatus
      );

      return response;

    } catch (error) {
      console.error('[MessagingService] Error handling message:', error);
      return this.createErrorResponse(
        'Erreur interne lors de l\'envoi du message',
        requestId
      );
    }
  }

  /**
   * Crée le contexte d'authentification basé sur les tokens
   * JWT Token = utilisateur enregistré
   * Session Token = utilisateur anonyme
   */
  private createAuthenticationContext(
    senderId: string,
    jwtToken?: string,
    sessionToken?: string
  ): AuthenticationContext {
    if (jwtToken) {
      return {
        type: 'jwt',
        userId: senderId,
        jwtToken: jwtToken,
        isAnonymous: false
      };
    } else if (sessionToken) {
      return {
        type: 'session',
        sessionToken: sessionToken,
        isAnonymous: true
      };
    } else {
      if (senderId.startsWith('anon_') || senderId.length > 24) {
        return {
          type: 'session',
          sessionToken: senderId,
          isAnonymous: true
        };
      } else {
        return {
          type: 'jwt',
          userId: senderId,
          isAnonymous: false
        };
      }
    }
  }

  /**
   * Résoudre les IDs de l'expéditeur selon le type d'authentification
   */
  private async resolveSenderIds(
    authContext: AuthenticationContext,
    senderId: string,
    conversationId: string
  ): Promise<{ actualSenderId?: string; actualAnonymousSenderId?: string }> {
    if (authContext.isAnonymous) {
      const identifier = authContext.sessionToken || senderId;

      const anonymousParticipant = await this.prisma.anonymousParticipant.findFirst({
        where: {
          sessionToken: identifier,
          conversationId: conversationId,
          isActive: true
        },
        select: { id: true }
      });

      if (!anonymousParticipant) {
        throw new Error('Participant anonyme non trouvé pour la sauvegarde');
      }

      return { actualAnonymousSenderId: anonymousParticipant.id };
    } else {
      return { actualSenderId: authContext.userId || senderId };
    }
  }

  /**
   * Met à jour le timestamp de dernière activité de la conversation
   */
  private async updateConversation(conversationId: string): Promise<void> {
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() }
    });
  }

  /**
   * Queue le message pour traduction asynchrone
   */
  private async queueTranslation(message: Message, originalLanguage: string): Promise<any> {
    try {
      await this.translationService.handleNewMessage({
        id: message.id,
        conversationId: message.conversationId,
        senderId: message.senderId,
        anonymousSenderId: message.anonymousSenderId,
        content: message.content,
        originalLanguage,
        messageType: message.messageType,
        replyToId: message.replyToId
      } as any);

      return {
        status: 'pending',
        languagesRequested: [],
        languagesCompleted: [],
        languagesFailed: [],
        estimatedCompletionTime: 1000
      };

    } catch (error) {
      console.error('[MessagingService] Error queuing translation:', error);
      return {
        status: 'failed',
        languagesRequested: [],
        languagesCompleted: [],
        languagesFailed: ['unknown']
      };
    }
  }

  /**
   * Met à jour les statistiques de conversation
   */
  private async updateStats(conversationId: string, language: string): Promise<any> {
    try {
      return await conversationStatsService.updateOnNewMessage(
        this.prisma,
        conversationId,
        language,
        () => []
      );
    } catch (error) {
      console.error('[MessagingService] Error updating stats:', error);
      return undefined;
    }
  }

  /**
   * Génère une réponse de succès
   */
  private async createSuccessResponse(
    message: Message,
    requestId: string,
    startTime: number,
    stats?: any,
    translationStatus?: any
  ): Promise<MessageResponse> {
    const processingTime = Date.now() - startTime;

    const metadata: MessageResponseMetadata = {
      conversationStats: stats,
      translationStatus,
      deliveryStatus: {
        status: 'sent',
        sentAt: message.createdAt,
        recipientCount: 1,
        deliveredCount: 1,
        readCount: 1
      },
      performance: {
        processingTime,
        dbQueryTime: processingTime * 0.6,
        translationQueueTime: processingTime * 0.2,
        validationTime: processingTime * 0.1
      },
      context: {
        isFirstMessage: false,
        triggerNotifications: true,
        mentionedUsers: this.processor.extractMentions(message.content),
        containsLinks: this.processor.containsLinks(message.content)
      },
      debug: {
        requestId,
        serverTime: new Date(),
        userId: message.senderId || message.anonymousSenderId || '',
        conversationId: message.conversationId,
        messageId: message.id
      }
    };

    return {
      success: true,
      data: { ...message, timestamp: message.createdAt } as any,
      message: 'Message envoyé avec succès',
      metadata
    };
  }

  /**
   * Génère une réponse d'erreur
   */
  private createErrorResponse(error: string, requestId: string): MessageResponse {
    return {
      success: false,
      error,
      data: null as any,
      metadata: {
        debug: {
          requestId,
          serverTime: new Date(),
          userId: '',
          conversationId: '',
          messageId: ''
        }
      }
    };
  }

  /**
   * Expose le service de statuts de lecture pour utilisation externe
   */
  public getReadStatusService(): MessageReadStatusService {
    return this.readStatusService;
  }

  /**
   * Utilitaires
   */
  private generateRequestId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}
