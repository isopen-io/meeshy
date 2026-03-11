/**
 * Messaging Service - Orchestrator
 * Main entry point for message handling with composition of validator and processor
 */

import { PrismaClient, Message } from '@meeshy/shared/prisma/client';
import type {
  MessageRequest,
  MessageResponse,
  MessageResponseMetadata
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
   *
   * @param participantId - The Participant.id of the sender (resolved by auth middleware)
   */
  async handleMessage(
    request: MessageRequest,
    participantId: string
  ): Promise<MessageResponse> {
    const startTime = Date.now();
    const requestId = this.generateRequestId();

    try {
      // 1. Validation de la requête
      const validationResult = await this.validator.validateRequest(request);
      if (!validationResult.isValid) {
        return this.createErrorResponse(validationResult.errors[0].message, requestId);
      }

      // 2. Résolution de l'ID de conversation
      const conversationId = await this.validator.resolveConversationId(request.conversationId);
      if (!conversationId) {
        return this.createErrorResponse('Conversation non trouvée', requestId);
      }

      // 3. Vérification des permissions via Participant
      // participantId can be a Participant.id OR a User.id (legacy callers)
      let participant = await this.prisma.participant.findUnique({
        where: { id: participantId },
        select: { id: true, conversationId: true, isActive: true }
      });

      // Fallback: participantId might be a userId — resolve via conversationId + userId
      if (!participant || participant.conversationId !== conversationId) {
        participant = await this.prisma.participant.findFirst({
          where: { userId: participantId, conversationId, isActive: true },
          select: { id: true, conversationId: true, isActive: true }
        });
      }

      // Auto-create Participant from legacy ConversationMember if needed
      if (!participant) {
        participant = await this.ensureParticipantFromMember(participantId, conversationId);
      }

      if (!participant || !participant.isActive) {
        return this.createErrorResponse(
          'Permissions insuffisantes pour envoyer des messages',
          requestId
        );
      }

      // 4. Détection de langue
      const detectedLanguage = request.content
        ? await this.validator.detectLanguage(request.content)
        : 'fr';
      const originalLanguage = request.originalLanguage
        && request.originalLanguage === detectedLanguage
        ? request.originalLanguage
        : detectedLanguage;

      // 5. Sauvegarde du message en base
      const message = await this.processor.saveMessage({
        ...request,
        originalLanguage,
        conversationId,
        senderId: participantId,
        mentionedUserIds: request.mentionedUserIds,
        encryptedContent: request.encryptedPayload?.ciphertext,
        encryptionMetadata: request.encryptedPayload ? {
          mode: 'e2ee',
          ...request.encryptedPayload
        } as unknown as import('@meeshy/shared/prisma/client').Prisma.InputJsonValue : undefined
      });

      // 6. Mise à jour de la conversation
      await this.updateConversation(conversationId);

      // 7. Marquer comme reçu ET lu pour l'expéditeur
      await this.readStatusService.markMessagesAsRead(
        participantId,
        conversationId,
        message.id
      );

      // 8. Queue de traduction (async)
      const translationStatus = await this.queueTranslation(message, originalLanguage);

      // 9. Mise à jour des statistiques (async)
      const stats = await this.updateStats(conversationId, originalLanguage);

      // 10. Génération de la réponse unifiée
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
        content: message.content,
        originalLanguage,
        messageType: message.messageType,
        replyToId: message.replyToId
      });

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
        userId: message.senderId,
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

  /**
   * Auto-create a Participant from legacy ConversationMember data.
   * This bridges the gap between the old ConversationMember model and
   * the new unified Participant model during migration.
   */
  private async ensureParticipantFromMember(
    userId: string,
    conversationId: string
  ): Promise<{ id: string; conversationId: string; isActive: boolean } | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, displayName: true, firstName: true, lastName: true, avatar: true, systemLanguage: true }
      });
      if (!user) return null;

      // Check legacy ConversationMember collection via raw query
      const members = await (this.prisma as any).$runCommandRaw({
        find: 'ConversationMember',
        filter: {
          userId: { $oid: userId },
          conversationId: { $oid: conversationId },
          isActive: true
        },
        limit: 1
      });

      const memberDoc = members?.cursor?.firstBatch?.[0];
      if (!memberDoc) return null;

      const roleMap: Record<string, string> = {
        'CREATOR': 'admin',
        'ADMIN': 'admin',
        'MODERATOR': 'moderator',
        'MEMBER': 'member',
        'USER': 'member'
      };

      const participant = await this.prisma.participant.create({
        data: {
          conversationId,
          type: 'user',
          userId: user.id,
          displayName: user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.username,
          avatar: user.avatar,
          role: roleMap[memberDoc.role] || 'member',
          language: user.systemLanguage || 'fr',
          permissions: {
            canSendMessages: memberDoc.canSendMessage ?? true,
            canSendFiles: memberDoc.canSendFiles ?? true,
            canSendImages: memberDoc.canSendImages ?? true,
            canSendVideos: memberDoc.canSendVideos ?? false,
            canSendAudios: memberDoc.canSendAudios ?? false,
            canSendLocations: memberDoc.canSendLocations ?? false,
            canSendLinks: memberDoc.canSendLinks ?? false
          },
          isActive: true,
          joinedAt: memberDoc.joinedAt ? new Date(memberDoc.joinedAt) : new Date()
        },
        select: { id: true, conversationId: true, isActive: true }
      });

      console.log(`[MessagingService] Auto-created Participant ${participant.id} for user ${userId} in conversation ${conversationId}`);
      return participant;
    } catch (error) {
      console.error('[MessagingService] Error auto-creating participant:', error);
      return null;
    }
  }
}
