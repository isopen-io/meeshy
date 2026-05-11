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
import { enhancedLogger, performanceLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'MessagingService' });

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
    this.processor = new MessageProcessor(prisma, notificationService, translationService);
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

    const corr: Record<string, any> = {
      clientMessageId: request.clientMessageId,
      conversationId: request.conversationId,
      participantId,
      requestId
    };

    logger.info('perf:messaging.handleMessage', {
      ...corr, step: 'messaging.handleMessage', phase: 'start'
    });

    try {
      // 1. Validation de la requête
      const validationResult = await performanceLogger.withTiming(
        'messaging.validateRequest',
        () => this.validator.validateRequest(request),
        corr
      );
      if (!validationResult.isValid) {
        return this.createErrorResponse(validationResult.errors[0].message, requestId);
      }

      // 2. Résolution de l'ID de conversation
      const conversationId = await performanceLogger.withTiming(
        'messaging.resolveConversationId',
        () => this.validator.resolveConversationId(request.conversationId),
        corr
      );
      if (!conversationId) {
        return this.createErrorResponse('Conversation non trouvée', requestId);
      }

      // 3. Vérification des permissions via Participant
      let participant = await performanceLogger.withTiming(
        'messaging.participantLookup',
        async () => {
          let p = await this.prisma.participant.findUnique({
            where: { id: participantId },
            select: { id: true, conversationId: true, isActive: true }
          });
          if (!p || p.conversationId !== conversationId) {
            console.error('[MessagingService] DEPRECATED: userId passed as participantId — caller MUST pass Participant.id. This fallback will be removed.', { participantId, conversationId });
            p = await this.prisma.participant.findFirst({
              where: { userId: participantId, conversationId, isActive: true },
              select: { id: true, conversationId: true, isActive: true }
            });
          }
          if (!p) {
            p = await this.ensureParticipantFromMember(participantId, conversationId);
          }
          return p;
        },
        { ...corr, conversationId }
      );

      if (!participant || !participant.isActive) {
        return this.createErrorResponse(
          'Permissions insuffisantes pour envoyer des messages',
          requestId
        );
      }

      // 4. Détection de langue — trust the client's `originalLanguage` when
      //    provided. iOS detects it locally (ConversationViewModel:
      //    detectKeyboardLanguage()) and the web via navigator.language ;
      //    calling the translator just to validate the claim costs a full
      //    HTTP round-trip per message (~266 ms cold, ~11 ms warm) for zero
      //    practical gain — the validation never reverted a legit client
      //    claim in observed prod traffic. The detector is now ONLY invoked
      //    when the client omits `originalLanguage` entirely (anon flows,
      //    legacy clients).
      const originalLanguage = request.originalLanguage
        ?? (request.content
            ? await performanceLogger.withTiming(
                'messaging.detectLanguage',
                () => this.validator.detectLanguage(request.content!),
                corr
              )
            : 'fr');

      // 5. Sauvegarde du message en base. Phase 4 §6.2 — `clientMessageId`
      //    est propagé pour permettre le pattern catch-P2002 atomique au
      //    niveau Prisma (cf MessageProcessor.saveMessage). Si l'INSERT
      //    déclenche un duplicate-key, MessageProcessor relit l'existant
      //    et flague `(message as any).isDuplicate = true`.
      const message = await performanceLogger.withTiming(
        'messaging.saveMessage',
        () => this.processor.saveMessage({
          ...request,
          originalLanguage,
          conversationId,
          senderId: participant!.id,
          mentionedUserIds: request.mentionedUserIds,
          encryptedContent: request.encryptedPayload?.ciphertext,
          encryptionMetadata: request.encryptedPayload ? {
            mode: 'e2ee',
            ...request.encryptedPayload
          } as unknown as import('@meeshy/shared/prisma/client').Prisma.InputJsonValue : undefined,
          clientMessageId: request.clientMessageId
        }),
        { ...corr, conversationId }
      );

      const isDuplicate =
        Boolean((message as { isDuplicate?: boolean }).isDuplicate);

      if (isDuplicate) {
        // Dedup hit: skip the post-create side effects (mark as read was
        // already done on the first attempt, conversation was already
        // bumped, stats were already incremented). Re-translate ONLY when
        // the existing record has no translations attached — the
        // translator was likely down on the first attempt and the message
        // would otherwise stay unilingual forever.
        const translations = (message as { translations?: unknown }).translations;
        const needsRetranslate = this.isTranslationsEmpty(translations);
        const translationStatus = await this.queueTranslation(
          message,
          originalLanguage,
          { skip: !needsRetranslate }
        );
        const response = await this.createSuccessResponse(
          message,
          requestId,
          startTime,
          /* stats: pas de double-comptage sur dedup hit */ undefined,
          translationStatus
        );
        logger.info('perf:messaging.handleMessage', {
          ...corr, step: 'messaging.handleMessage', phase: 'end',
          durationMs: Date.now() - startTime,
          messageId: message.id, dedupHit: true
        });
        return response;
      }

      // 6. Mise à jour de la conversation
      await performanceLogger.withTiming(
        'messaging.updateConversation',
        () => this.updateConversation(conversationId),
        { ...corr, conversationId }
      );

      // 7. Marquer comme reçu ET lu pour l'expéditeur
      await performanceLogger.withTiming(
        'messaging.markAsRead',
        () => this.readStatusService.markMessagesAsRead(
          participant!.id,
          conversationId,
          message.id
        ),
        { ...corr, conversationId, messageId: message.id }
      );

      // 8. Queue de traduction (async)
      const translationStatus = await performanceLogger.withTiming(
        'messaging.queueTranslation',
        () => this.queueTranslation(message, originalLanguage),
        { ...corr, messageId: message.id }
      );

      // 9. Mise à jour des statistiques (async)
      const stats = await performanceLogger.withTiming(
        'messaging.updateStats',
        () => this.updateStats(conversationId, originalLanguage),
        { ...corr, conversationId }
      );

      // 10. Génération de la réponse unifiée
      const response = await this.createSuccessResponse(
        message,
        requestId,
        startTime,
        stats,
        translationStatus
      );

      logger.info('perf:messaging.handleMessage', {
        ...corr, step: 'messaging.handleMessage', phase: 'end',
        durationMs: Date.now() - startTime, messageId: message.id
      });

      return response;

    } catch (error) {
      logger.warn('perf:messaging.handleMessage', {
        ...corr, step: 'messaging.handleMessage', phase: 'end',
        durationMs: Date.now() - startTime, errored: true,
        errorMessage: error instanceof Error ? error.message : String(error)
      });
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
   * Phase 4 §6.2.1 — `MessageTranslation` est un Json field embedded dans
   * `Message.translations` (cf prisma/schema.prisma). Le check de
   * "traductions absentes" est donc sur la taille du Json, pas sur un
   * `.length` de relation Prisma. Une dedup hit avec ce Json vide signifie
   * que le translator était down lors du premier insert : on re-pousse.
   */
  private isTranslationsEmpty(translations: unknown): boolean {
    if (!translations) return true;
    if (typeof translations !== 'object') return true;
    return Object.keys(translations as Record<string, unknown>).length === 0;
  }

  /**
   * Queue le message pour traduction asynchrone.
   * Phase 4 — `options.skip` permet aux dedup hits avec traductions déjà
   * présentes d'éviter le re-push ZMQ (les traductions existantes restent
   * la source de vérité).
   */
  private async queueTranslation(
    message: Message,
    originalLanguage: string,
    options: { skip?: boolean } = {}
  ): Promise<any> {
    if (options.skip) {
      return {
        status: 'skipped',
        languagesRequested: [],
        languagesCompleted: [],
        languagesFailed: []
      };
    }
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
          joinedAt: memberDoc.joinedAt ? new Date(memberDoc.joinedAt) : new Date(),
          // Materialise deletedForMe = null explicitement. Sans cela, Prisma
          // n'ecrit PAS le champ dans MongoDB pour les fields optional non
          // initialises. Les filters de listing (`deletedForMe: null`) peuvent
          // ne pas matcher les docs ou le champ est absent — bug observe le
          // 2026-05-11 (10 Participants invisibles, conversations DM
          // disparues de la liste).
          deletedForMe: null
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
