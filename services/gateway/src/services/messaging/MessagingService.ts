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
import { getCachedParticipant, cacheParticipant } from '../../utils/participant-lookup-cache';

const logger = enhancedLogger.child({ module: 'MessagingService' });

/**
 * Translation status reported in the send response. Translation is queued as
 * a post-save side effect (off the ACK path), so the response can only ever
 * report "pending" — the actual results arrive later via Socket.IO events.
 */
const PENDING_TRANSLATION_STATUS = {
  status: 'pending' as const,
  languagesRequested: [] as string[],
  languagesCompleted: [] as string[],
  languagesFailed: [] as string[],
  estimatedCompletionTime: 1000
};

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
          const cached = getCachedParticipant(participantId, conversationId);
          if (cached) return cached;

          let p = await this.prisma.participant.findUnique({
            where: { id: participantId },
            select: { id: true, conversationId: true, isActive: true }
          });
          if (!p || p.conversationId !== conversationId) {
            logger.error('DEPRECATED: userId passed as participantId — caller must pass Participant.id', { participantId, conversationId });
            p = await this.prisma.participant.findFirst({
              where: { userId: participantId, conversationId, isActive: true },
              select: { id: true, conversationId: true, isActive: true }
            });
          }
          if (!p) {
            p = await this.ensureParticipantFromMember(participantId, conversationId);
          }
          if (p) {
            cacheParticipant(participantId, conversationId, p);
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

      // 3.5. Early dedup — runs after participant verification (security gate
      //      stays intact) but before language detection, link processing, and
      //      encryption context. Handles sequential retries with one DB read.
      //      Concurrent retries still resolve via the P2002 catch in saveMessage.
      if (request.clientMessageId) {
        const earlyHit = await performanceLogger.withTiming(
          'messaging.earlyDedupCheck',
          () => this.prisma.message.findFirst({
            where: { conversationId, clientMessageId: request.clientMessageId }
          }),
          corr
        );
        if (earlyHit) {
          // Flag the in-process dedup marker so the caller (MessageHandler)
          // suppresses the `message:new` re-broadcast / agent-notify / stats
          // side effects. Without it, a sequential retry on the same
          // clientMessageId re-broadcasts the bubble to every recipient. This
          // mirrors the P2002 concurrent-retry path in MessageProcessor.saveMessage.
          (earlyHit as { isDuplicate?: boolean }).isDuplicate = true;
          const translations = (earlyHit as { translations?: unknown }).translations;
          if (this.isTranslationsEmpty(translations)) {
            void this.queueTranslation(earlyHit, earlyHit.originalLanguage ?? 'fr').catch((err) =>
              logger.error('background re-translation failed on early dedup', err as Error)
            );
          }
          logger.info('perf:messaging.handleMessage', {
            ...corr, step: 'messaging.handleMessage', phase: 'end',
            durationMs: Date.now() - startTime, messageId: earlyHit.id, earlyDedupHit: true
          });
          return this.createSuccessResponse(earlyHit, requestId, startTime, undefined, PENDING_TRANSLATION_STATUS);
        }
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

      // The client ACK must be returned the instant the message is persisted —
      // it is what flips the sender's bubble from the pending clock to the
      // single checkmark. Every post-save side effect (conversation bump,
      // sender read-cursor, translation queue, stats) is therefore moved OFF
      // the ACK path and runs in the background. Both the Socket.IO and the
      // REST entry points funnel through `handleMessage`, so both inherit the
      // fast ACK.

      if (isDuplicate) {
        // Dedup hit: the first attempt already ran the side effects (mark as
        // read, conversation bump, stats). Re-translate ONLY when the stored
        // record has no translations — the translator was likely down on the
        // first attempt — and do it off the ACK path.
        const translations = (message as { translations?: unknown }).translations;
        if (this.isTranslationsEmpty(translations)) {
          void this.queueTranslation(message, originalLanguage).catch((err) =>
            logger.error('background re-translation failed', err as Error)
          );
        }
        const response = await this.createSuccessResponse(
          message,
          requestId,
          startTime,
          /* stats: pas de double-comptage sur dedup hit */ undefined,
          PENDING_TRANSLATION_STATUS
        );
        logger.info('perf:messaging.handleMessage', {
          ...corr, step: 'messaging.handleMessage', phase: 'end',
          durationMs: Date.now() - startTime,
          messageId: message.id, dedupHit: true
        });
        return response;
      }

      // 6. Réponse unifiée — générée immédiatement après la persistance.
      const response = await this.createSuccessResponse(
        message,
        requestId,
        startTime,
        /* stats: calculées en arrière-plan */ undefined,
        PENDING_TRANSLATION_STATUS
      );

      // 7. Effets de bord post-save — exécutés en arrière-plan, JAMAIS sur le
      //    chemin de l'ACK (cf. note ci-dessus).
      this.runPostSaveSideEffects({
        message,
        conversationId,
        senderParticipantId: participant!.id,
        originalLanguage
      });

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
      logger.error('Error handling message', error as Error);
      return this.createErrorResponse(
        'Erreur interne lors de l\'envoi du message',
        requestId
      );
    }
  }

  /**
   * Effets de bord post-save qui ne doivent JAMAIS retarder l'ACK client :
   * bump du timestamp de conversation, marquage du message comme lu pour son
   * propre expéditeur, mise en file de la traduction, et mise à jour des
   * statistiques. Chacun s'exécute indépendamment avec sa propre capture
   * d'erreur — une défaillance n'empêche pas les autres, et aucun ne bloque
   * la réponse qui fait passer la coche de l'expéditeur.
   */
  private runPostSaveSideEffects(args: {
    message: Message;
    conversationId: string;
    senderParticipantId: string;
    originalLanguage: string;
  }): void {
    const { message, conversationId, senderParticipantId, originalLanguage } = args;

    void this.updateConversation(conversationId).catch((err) =>
      logger.error('post-save updateConversation failed', err as Error)
    );

    void this.readStatusService
      .markMessagesAsRead(senderParticipantId, conversationId, message.id)
      .catch((err) =>
        logger.error('post-save markMessagesAsRead failed', err as Error)
      );

    void this.queueTranslation(message, originalLanguage).catch((err) =>
      logger.error('post-save queueTranslation failed', err as Error)
    );

    void this.updateStats(conversationId, originalLanguage).catch((err) =>
      logger.error('post-save updateStats failed', err as Error)
    );
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
      logger.error('Error queuing translation', error as Error);
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
      logger.error('Error updating stats', error as Error);
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

    // CORRECTION senderId: message.senderId = Participant.id (FK Prisma).
    // Les clients comparent senderId avec leur userId → on normalise avant sérialisation.
    const senderObj = (message as any).sender;
    const resolvedSenderId = senderObj?.userId ?? senderObj?.user?.id ?? message.senderId;

    return {
      success: true,
      data: {
        ...message,
        senderId: resolvedSenderId,
        senderParticipantId: message.senderId,
        timestamp: message.createdAt
      } as any,
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

      logger.info('Auto-created Participant', { conversationId });
      return participant;
    } catch (error) {
      logger.error('Error auto-creating participant', error as Error);
      return null;
    }
  }
}
