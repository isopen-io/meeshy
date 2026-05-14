/**
 * Message Processing Module
 * Handles message content processing, encryption, links, mentions, and persistence
 */

import * as path from 'path';
import { PrismaClient, Message } from '@meeshy/shared/prisma/client';
import type { Prisma } from '@meeshy/shared/prisma/client';
import type { MessageRequest } from '@meeshy/shared/types';
import { TrackingLinkService } from '../TrackingLinkService';
import { MentionService } from '../MentionService';
import { EncryptionService } from '../EncryptionService';
import { NotificationService } from '../notifications/NotificationService';
import { MessageTranslationService } from '../message-translation/MessageTranslationService';
import { AttachmentService } from '../attachments';
import { enhancedLogger, performanceLogger } from '../../utils/logger-enhanced';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

// Logger dédié pour MessageProcessor
const logger = enhancedLogger.child({ module: 'MessageProcessor' });


type EncryptionMode = 'e2ee' | 'server' | 'hybrid';

/**
 * Encryption context for a message
 */
interface MessageEncryptionContext {
  isEncrypted: boolean;
  mode: EncryptionMode | null;
  encryptedContent: string | null;
  encryptionMetadata: Prisma.InputJsonValue | null;
}

export class MessageProcessor {
  private trackingLinkService: TrackingLinkService;
  private mentionService: MentionService;
  private encryptionService: EncryptionService;
  private attachmentService: AttachmentService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly notificationService?: NotificationService,
    private readonly translationService?: MessageTranslationService
  ) {
    this.trackingLinkService = new TrackingLinkService(prisma);
    this.mentionService = new MentionService(prisma);
    this.encryptionService = new EncryptionService(prisma);
    this.attachmentService = new AttachmentService(prisma);
  }

  /**
   * Traite les liens dans le contenu du message selon les règles suivantes:
   * - Règle 1: Markdown [texte](url) → Lien normal (pas de tracking)
   * - Règle 2: URLs brutes → Aucun tracking automatique
   * - Règle 3: [[url]] → Force le tracking → m+token
   * - Règle 4: <url> → Force le tracking → m+token
   */
  async processLinksInContent(
    content: string,
    conversationId: string,
    senderId?: string,
    messageId?: string
  ): Promise<string> {
    try {
      let processedContent = content;
      const protectedItems: Array<{ placeholder: string; original: string }> = [];
      let placeholderCounter = 0;

      // Track URLs already processed in this message to reuse tokens for identical URLs
      const urlTokenMap = new Map<string, string>();

      // ÉTAPE 1: Protéger les liens markdown [texte](url) - Règle 1
      const MARKDOWN_LINK_REGEX = /\[([^\]]+)\]\(([^)]+)\)/g;
      processedContent = processedContent.replace(MARKDOWN_LINK_REGEX, (match) => {
        const placeholder = `__PROTECTED_MD_${placeholderCounter++}__`;
        protectedItems.push({ placeholder, original: match });
        return placeholder;
      });

      // ÉTAPE 2: Traiter [[url]] - Règle 3: Force le tracking
      const DOUBLE_BRACKET_REGEX = /\[\[(https?:\/\/[^\]]+)\]\]/gi;
      const doubleBracketMatches = [...processedContent.matchAll(DOUBLE_BRACKET_REGEX)];

      for (const match of doubleBracketMatches) {
        const fullMatch = match[0];
        const url = match[1];

        try {
          let token: string;

          if (urlTokenMap.has(url)) {
            token = urlTokenMap.get(url)!;
            logger.info(`[MessageProcessor] Reusing token ${token} for duplicate URL: ${url}`);
          } else {
            let trackingLink = await this.trackingLinkService.findExistingTrackingLink(
              url,
              conversationId
            );

            if (!trackingLink) {
              trackingLink = await this.trackingLinkService.createTrackingLink({
                originalUrl: url,
                conversationId,
                createdBy: senderId,
                messageId
              });
            }

            token = trackingLink.token;
            urlTokenMap.set(url, token);
          }

          const meeshyShortLink = `m+${token}`;
          processedContent = processedContent.replace(fullMatch, meeshyShortLink);
        } catch (linkError) {
          logger.error(`[MessageProcessor] Error processing [[url]]:`, linkError);
          processedContent = processedContent.replace(fullMatch, url);
        }
      }

      // ÉTAPE 3: Traiter <url> - Règle 4: Force le tracking
      const ANGLE_BRACKET_REGEX = /<(https?:\/\/[^>]+)>/gi;
      const angleBracketMatches = [...processedContent.matchAll(ANGLE_BRACKET_REGEX)];

      for (const match of angleBracketMatches) {
        const fullMatch = match[0];
        const url = match[1];

        try {
          let token: string;

          if (urlTokenMap.has(url)) {
            token = urlTokenMap.get(url)!;
            logger.info(`[MessageProcessor] Reusing token ${token} for duplicate URL: ${url}`);
          } else {
            let trackingLink = await this.trackingLinkService.findExistingTrackingLink(
              url,
              conversationId
            );

            if (!trackingLink) {
              trackingLink = await this.trackingLinkService.createTrackingLink({
                originalUrl: url,
                conversationId,
                createdBy: senderId,
                messageId
              });
            }

            token = trackingLink.token;
            urlTokenMap.set(url, token);
          }

          const meeshyShortLink = `m+${token}`;
          processedContent = processedContent.replace(fullMatch, meeshyShortLink);
        } catch (linkError) {
          logger.error(`[MessageProcessor] Error processing <url>:`, linkError);
          processedContent = processedContent.replace(fullMatch, url);
        }
      }

      // ÉTAPE 4: Restaurer les liens markdown protégés
      for (const { placeholder, original } of protectedItems) {
        processedContent = processedContent.replace(placeholder, original);
      }

      return processedContent;
    } catch (error) {
      logger.error('[MessageProcessor] Error processing links', error);
      return content;
    }
  }

  /**
   * Get encryption context for a conversation
   * Determines if and how a message should be encrypted
   */
  async getEncryptionContext(
    conversationId: string,
    content: string,
    messageType: string
  ): Promise<MessageEncryptionContext> {
    // System messages are NEVER encrypted
    if (messageType === 'system') {
      return {
        isEncrypted: false,
        mode: null,
        encryptedContent: null,
        encryptionMetadata: null
      };
    }

    // Check if conversation has encryption enabled
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        encryptionMode: true,
        encryptionEnabledAt: true,
        serverEncryptionKeyId: true
      }
    });

    // No encryption enabled
    if (!conversation?.encryptionEnabledAt || !conversation.encryptionMode) {
      return {
        isEncrypted: false,
        mode: null,
        encryptedContent: null,
        encryptionMetadata: null
      };
    }

    const mode = conversation.encryptionMode as EncryptionMode;

    // E2EE mode: encryption happens client-side
    if (mode === 'e2ee') {
      logger.warn('[MessageProcessor] E2EE message received as plaintext - client should encrypt');
      return {
        isEncrypted: false,
        mode: 'e2ee',
        encryptedContent: null,
        encryptionMetadata: null
      };
    }

    try {
      // Server mode: encrypt content server-side
      if (mode === 'server') {
        const encrypted = await this.encryptionService.encryptMessage(
          content,
          'server',
          conversationId
        );

        return {
          isEncrypted: true,
          mode: 'server',
          encryptedContent: encrypted.ciphertext,
          encryptionMetadata: encrypted.metadata as Prisma.InputJsonValue
        };
      }

      // Hybrid mode: encrypt the server layer
      if (mode === 'hybrid') {
        const serverLayer = await this.encryptionService.encryptHybridServerLayer(
          content,
          conversationId
        );

        return {
          isEncrypted: true,
          mode: 'hybrid',
          encryptedContent: serverLayer.ciphertext,
          encryptionMetadata: {
            mode: 'hybrid',
            protocol: 'aes-256-gcm',
            keyId: serverLayer.keyId,
            iv: serverLayer.iv,
            authTag: serverLayer.authTag,
            canTranslate: true,
            timestamp: Date.now()
          } as Prisma.InputJsonValue
        };
      }

      // Unknown mode - fallback to plaintext
      logger.warn(`[MessageProcessor] Unknown encryption mode: ${mode}`);
      return {
        isEncrypted: false,
        mode: null,
        encryptedContent: null,
        encryptionMetadata: null
      };
    } catch (error) {
      logger.error('[MessageProcessor] Encryption failed', error);
      return {
        isEncrypted: false,
        mode: null,
        encryptedContent: null,
        encryptionMetadata: null
      };
    }
  }

  /**
   * Sauvegarde du message en base avec toutes les relations
   * Handles encryption based on conversation settings.
   *
   * Phase 4 §6.2 — when `clientMessageId` is supplied, the create is wrapped
   * in a `catch P2002` clause so concurrent retries with the same id resolve
   * to the same server record (idempotent dedup). The returned tuple
   * includes `isDuplicate: true` for hits — the caller skips broadcast and
   * post-processing for hits while still re-pushing translation if the
   * existing record's `translations` blob is empty (translator was down on
   * the first attempt).
   */
  async saveMessage(data: {
    conversationId: string;
    senderId: string;
    content: string;
    originalLanguage: string;
    messageType?: string;
    messageSource?: string;
    replyToId?: string;
    storyReplyToId?: string;
    forwardedFromId?: string;
    forwardedFromConversationId?: string;
    mentionedUserIds?: readonly string[];
    encryptedContent?: string;
    encryptionMetadata?: Prisma.InputJsonValue;
    attachmentIds?: string[];
    isBlurred?: boolean;
    effectFlags?: number;
    expiresAt?: Date;
    clientMessageId?: string;
  }): Promise<Message> {
    const corr: Record<string, any> = {
      clientMessageId: data.clientMessageId,
      conversationId: data.conversationId,
      senderId: data.senderId
    };

    // ÉTAPE 1: Traiter les liens AVANT de sauvegarder le message
    const processedContent = await performanceLogger.withTiming(
      'messaging.processLinks',
      () => this.processLinksInContent(
        data.content,
        data.conversationId,
        data.senderId,
        undefined
      ),
      corr
    );

    // ÉTAPE 2: Get encryption context for this message
    let encryptionContext: MessageEncryptionContext;

    if (data.encryptedContent && data.encryptionMetadata) {
      const metadata = data.encryptionMetadata as Record<string, unknown>;
      encryptionContext = {
        isEncrypted: true,
        mode: (metadata.mode as EncryptionMode) || 'e2ee',
        encryptedContent: data.encryptedContent,
        encryptionMetadata: data.encryptionMetadata
      };
    } else {
      encryptionContext = await performanceLogger.withTiming(
        'messaging.encryptionContext',
        () => this.getEncryptionContext(
          data.conversationId,
          processedContent.trim(),
          data.messageType || 'text'
        ),
        corr
      );
    }

    // Compute effectFlags: use provided value or derive from legacy fields
    let effectFlags = data.effectFlags ?? 0;
    if (data.isBlurred && !(effectFlags & MESSAGE_EFFECT_FLAGS.BLURRED)) effectFlags |= MESSAGE_EFFECT_FLAGS.BLURRED;
    if (data.expiresAt && !(effectFlags & MESSAGE_EFFECT_FLAGS.EPHEMERAL)) effectFlags |= MESSAGE_EFFECT_FLAGS.EPHEMERAL;

    // ÉTAPE 3: Créer le message avec le contenu traité et encryption.
    //
    // Phase 4 §6.2 — INSERT direct + catch P2002 atomique. Le findUnique
    // pré-INSERT n'est PAS atomique (deux requêtes concurrentes avec le
    // même clientMessageId passent toutes les deux le findUnique avant que
    // l'une INSERT et que l'autre échoue) — on s'appuie sur la contrainte
    // unique partielle MongoDB pour détecter le doublon en une seule
    // round-trip. Sur P2002 on relit l'existant et on flague isDuplicate.
    const messageData = {
      conversationId: data.conversationId,
      senderId: data.senderId,
      content: encryptionContext.isEncrypted ? '' : processedContent.trim(),
      originalLanguage: data.originalLanguage,
      messageType: data.messageType || 'text',
      messageSource: data.messageSource || 'user',
      replyToId: data.replyToId,
      storyReplyToId: data.storyReplyToId || null,
      forwardedFromId: data.forwardedFromId,
      forwardedFromConversationId: data.forwardedFromConversationId,
      isEncrypted: encryptionContext.isEncrypted,
      encryptionMode: encryptionContext.mode,
      encryptedContent: encryptionContext.encryptedContent,
      encryptionMetadata: encryptionContext.encryptionMetadata,
      isBlurred: data.isBlurred || false,
      expiresAt: data.expiresAt || null,
      effectFlags,
      deletedAt: null,
      ...(data.clientMessageId ? { clientMessageId: data.clientMessageId } : {})
    } as const;

    let message: Message;
    let isDuplicate = false;
    try {
      message = await performanceLogger.withTiming(
        'messaging.prismaMessageCreate',
        () => this.prisma.message.create({
          data: messageData,
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
            attachments: true,
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
        }),
        corr
      );
    } catch (e) {
      const isP2002 =
        typeof e === 'object' && e !== null
          && 'code' in e && (e as { code?: unknown }).code === 'P2002';
      if (!isP2002 || !data.clientMessageId) {
        throw e;
      }
      // Use `findFirst` instead of `findUnique` because the unique
      // constraint on `(conversationId, clientMessageId)` lives in a
      // partial MongoDB index (managed by the manual migration), not
      // a Prisma `@@unique` directive — so the `findUnique` compound
      // type is not generated. The compound `@@index` declared in the
      // schema still backs this query for performance.
      const existing = await performanceLogger.withTiming(
        'messaging.dedupFindFirst',
        () => this.prisma.message.findFirst({
          where: {
            conversationId: data.conversationId,
            clientMessageId: data.clientMessageId
          },
          include: {
            sender: {
              select: {
                id: true, displayName: true, avatar: true, type: true,
                nickname: true, userId: true,
                user: {
                  select: {
                    id: true, username: true, displayName: true,
                    firstName: true, lastName: true, avatar: true
                  }
                }
              }
            },
            attachments: true,
            replyTo: {
              include: {
                sender: {
                  select: {
                    id: true, displayName: true, avatar: true, type: true,
                    nickname: true, userId: true,
                    user: {
                      select: {
                        id: true, username: true, displayName: true,
                        firstName: true, lastName: true, avatar: true
                      }
                    }
                  }
                }
              }
            }
          }
        }),
        corr
      );
      if (!existing) {
        // Race condition we cannot reconcile — bubble up the original error.
        logger.error('P2002 raised but no existing record found for clientMessageId', {
          conversationId: data.conversationId,
          clientMessageId: data.clientMessageId
        });
        throw e;
      }
      message = existing;
      isDuplicate = true;
      logger.info('Idempotent dedup hit on clientMessageId', {
        conversationId: data.conversationId,
        clientMessageId: data.clientMessageId,
        messageId: existing.id
      });
    }

    // Stash the dedup flag on the message object so the caller can branch
    // on it (broadcast / translate decisions). The field is non-persistent
    // and only travels in-process.
    (message as Message & { isDuplicate?: boolean }).isDuplicate = isDuplicate;

    if (isDuplicate) {
      // Skip side-effects on dedup hits: attachments are already linked,
      // tracking links and mentions/notifications were processed on the
      // first attempt. The translation re-push (if needed) is decided at
      // the caller level (`MessagingService.handleMessage`).
      return {
        ...message,
        timestamp: message.createdAt
      } as Message;
    }

    const corrWithMsg = { ...corr, messageId: message.id };

    // ÉTAPE 4: Gérer les attachments (Lier ou Copier pour forward)
    await performanceLogger.withTiming(
      'messaging.handleAttachments',
      () => this.handleAttachments(data, message),
      corrWithMsg
    );

    // ÉTAPE 4 bis: Rafraîchir les attachments en mémoire. `prisma.message.create`
    // a capturé `attachments: []` AVANT que `handleAttachments` ne fasse le
    // lien (`updateMany`/`create`), donc l'objet renvoyé ici porte un
    // tableau vide. Sans ce refresh, le broadcast `message:new` et la
    // réponse REST diffusent un message sans attachments — ce qui fait
    // disparaître les médias côté client (iOS écrase les attachments
    // optimistes avec `null`).
    const hasAttachmentLinks =
      (data.attachmentIds && data.attachmentIds.length > 0) ||
      Boolean(data.forwardedFromId);
    if (hasAttachmentLinks) {
      const refreshedAttachments = await performanceLogger.withTiming(
        'messaging.refreshAttachments',
        () => this.prisma.messageAttachment.findMany({
          where: { messageId: message.id }
        }),
        corrWithMsg
      );
      (message as Message & { attachments: unknown[] }).attachments = refreshedAttachments;
    }

    // ÉTAPE 5: Mettre à jour les liens de tracking avec le messageId
    await performanceLogger.withTiming(
      'messaging.trackingLinks',
      () => this.updateTrackingLinksWithMessageId(processedContent, data, message.id),
      corrWithMsg
    );

    // ÉTAPE 6: Traiter les mentions et déclencher TOUTES les notifications
    // (Mentions, Réponses, Messages réguliers)
    await performanceLogger.withTiming(
      'messaging.mentionsAndNotifications',
      () => this.handleMentionsAndNotifications(data, message, processedContent),
      corrWithMsg
    );

    return {
      ...message,
      timestamp: message.createdAt
    } as Message;
  }

  /**
   * Gère l'association ou la copie des attachments pour un nouveau message
   */
  private async handleAttachments(
    data: {
      senderId: string;
      attachmentIds?: string[];
      forwardedFromId?: string;
      conversationId: string;
    },
    message: Message
  ): Promise<void> {
    try {
      // 1. Lier les attachments pré-uploadés
      if (data.attachmentIds && data.attachmentIds.length > 0) {
        await this.attachmentService.associateAttachmentsToMessage(data.attachmentIds, message.id);

        // Déclencher le traitement audio si nécessaire
        if (this.translationService) {
          this.processAudioAttachments(data.attachmentIds, message.id, data.conversationId, data.senderId)
            .catch(err => logger.error('[MessageProcessor] Audio processing failed', err));
        }
      }
      // 2. Copier les attachments si c'est un forward et qu'aucun nouvel attachment n'est fourni
      else if (data.forwardedFromId) {
        await this.copyForwardedAttachments(data.forwardedFromId, message.id, data.senderId);
      }
    } catch (error) {
      logger.error('[MessageProcessor] Error handling attachments', error);
    }
  }

  /**
   * Copie les attachments d'un message original vers un nouveau message (Forward)
   */
  private async copyForwardedAttachments(originalMessageId: string, newMessageId: string, senderId: string): Promise<void> {
    try {
      const originalAttachments = await this.prisma.messageAttachment.findMany({
        where: { messageId: originalMessageId }
      });

      if (originalAttachments.length === 0) return;

      const createdAttachments = await Promise.all(
        originalAttachments.map(att =>
          this.prisma.messageAttachment.create({
            data: {
              messageId: newMessageId,
              fileName: att.fileName,
              originalName: att.originalName,
              mimeType: att.mimeType,
              fileSize: att.fileSize,
              filePath: att.filePath,
              fileUrl: att.fileUrl,
              title: att.title,
              alt: att.alt,
              caption: att.caption,
              forwardedFromAttachmentId: att.id,
              isForwarded: true,
              width: att.width,
              height: att.height,
              thumbnailPath: att.thumbnailPath,
              thumbnailUrl: att.thumbnailUrl,
              duration: att.duration,
              bitrate: att.bitrate,
              sampleRate: att.sampleRate,
              codec: att.codec,
              channels: att.channels,
              fps: att.fps,
              videoCodec: att.videoCodec,
              pageCount: att.pageCount,
              lineCount: att.lineCount,
              uploadedBy: senderId,
              isAnonymous: false,
              transcription: att.transcription ?? undefined,
              translations: att.translations ?? undefined,
              metadata: att.metadata ?? undefined,
            }
          })
        )
      );

      // Mettre à jour le messageType si le premier attachment est un média
      const firstMime = createdAttachments[0].mimeType;
      let detectedType = 'text';
      if (firstMime.startsWith('image/')) detectedType = 'image';
      else if (firstMime.startsWith('audio/')) detectedType = 'audio';
      else if (firstMime.startsWith('video/')) detectedType = 'video';
      else if (firstMime.startsWith('application/')) detectedType = 'file';

      if (detectedType !== 'text') {
        await this.prisma.message.update({
          where: { id: newMessageId },
          data: { messageType: detectedType }
        });
      }

      logger.info(`[MessageProcessor] Copied ${createdAttachments.length} attachments for forward`);
    } catch (error) {
      logger.error('[MessageProcessor] Error copying forwarded attachments', error);
    }
  }

  /**
   * Envoie les audios au service de traduction pour transcription/clonage
   */
  private async processAudioAttachments(
    attachmentIds: string[],
    messageId: string,
    conversationId: string,
    senderId: string
  ): Promise<void> {
    if (!this.translationService) return;

    try {
      const attachments = await this.prisma.messageAttachment.findMany({
        where: { id: { in: attachmentIds } },
        select: { id: true, mimeType: true, fileUrl: true, filePath: true, duration: true, metadata: true }
      });

      const audioAttachments = attachments.filter(att => att.mimeType && att.mimeType.startsWith('audio/'));

      for (const audioAtt of audioAttachments) {
        let mobileTranscription: any = undefined;
        if (audioAtt.metadata && typeof audioAtt.metadata === 'object') {
          const metadata = audioAtt.metadata as any;
          if (metadata.transcription) {
            mobileTranscription = metadata.transcription;
          }
        }

        const uploadBasePath = process.env.UPLOAD_PATH || '/app/uploads';
        const audioPath = audioAtt.filePath ? path.join(uploadBasePath, audioAtt.filePath) : '';

        // Resolve sender userId if needed
        let resolvedSenderId = senderId;
        const senderParticipant = await this.prisma.participant.findUnique({
          where: { id: senderId },
          select: { userId: true }
        });
        if (senderParticipant?.userId) {
          resolvedSenderId = senderParticipant.userId;
        }

        await this.translationService.processAudioAttachment({
          messageId,
          attachmentId: audioAtt.id,
          conversationId,
          senderId: resolvedSenderId,
          audioUrl: audioAtt.fileUrl || '',
          audioPath: audioPath,
          audioDurationMs: audioAtt.duration || 0,
          mobileTranscription: mobileTranscription,
          generateVoiceClone: true,
          modelType: 'medium'
        });
      }
    } catch (error) {
      logger.error('[MessageProcessor] Error processing audio attachments', error);
    }
  }

  /**
   * Met à jour les liens de tracking avec l'ID du message
   */
  private async updateTrackingLinksWithMessageId(
    processedContent: string,
    data: { conversationId: string; content: string },
    messageId: string
  ): Promise<void> {
    if (processedContent === data.content) return;

    try {
      const meeshyTokenRegex = /m\+([a-zA-Z0-9_-]{2,50})/gi;
      const matches = processedContent.matchAll(meeshyTokenRegex);

      for (const match of matches) {
        const token = match[1];
        try {
          await this.prisma.trackingLink.updateMany({
            where: {
              token,
              conversationId: data.conversationId,
              messageId: null
            },
            data: { messageId }
          });
        } catch (updateError) {
          logger.error(`[MessageProcessor] Error updating messageId for token ${token}:`, updateError);
        }
      }
    } catch (error) {
      logger.error('[MessageProcessor] Error updating messageIds', error);
    }
  }

  /**
   * Traiter les mentions et déclencher TOUTES les notifications nécessaires
   * (Mentions, Réponses, Messages réguliers)
   */
  private async handleMentionsAndNotifications(
    data: { senderId: string; conversationId: string; mentionedUserIds?: readonly string[] },
    message: Message,
    processedContent: string
  ): Promise<void> {
    try {
      // 1. Gérer les mentions en DB (validation + création)
      const validatedMentionUserIds = await this.processMentionsInDB(data, message, processedContent);

      // 2. Déclencher les notifications (Mentions, Réponses, Messages)
      if (this.notificationService) {
        // Fire-and-forget pour ne pas bloquer le retour API
        this.triggerAllNotifications(message, data, processedContent, validatedMentionUserIds)
          .catch(err => logger.error('[MessageProcessor] Fire-and-forget notifications failed', err));
      }
    } catch (error) {
      logger.error('[MessageProcessor] Error in handleMentionsAndNotifications', error);
    }
  }

  /**
   * Valide et crée les mentions en base de données
   */
  private async processMentionsInDB(
    data: { senderId: string; conversationId: string; mentionedUserIds?: readonly string[] },
    message: Message,
    processedContent: string
  ): Promise<string[]> {
    try {
      let mentionedUserIds: string[] = [];
      let validatedUsernames: string[] = [];

      if (data.mentionedUserIds && data.mentionedUserIds.length > 0) {
        mentionedUserIds = Array.from(data.mentionedUserIds);
      } else {
        const participants = await this.getConversationParticipants(data.conversationId);
        const mentionedUsernames = this.mentionService.extractMentionsWithParticipants(processedContent, participants);
        if (mentionedUsernames.length > 0) {
          const userMap = await this.mentionService.resolveUsernames(mentionedUsernames);
          mentionedUserIds = Array.from(userMap.values()).map(user => user.id);
          validatedUsernames = Array.from(userMap.keys());
        }
      }

      if (mentionedUserIds.length > 0) {
        const validationResult = await this.mentionService.validateMentionPermissions(
          data.conversationId,
          mentionedUserIds,
          data.senderId
        );

        if (validationResult.validUserIds.length > 0) {
          await this.mentionService.createMentions(message.id, validationResult.validUserIds);

          let finalValidatedUsernames: string[] = validatedUsernames;
          if (data.mentionedUserIds && data.mentionedUserIds.length > 0) {
            const users = await this.prisma.user.findMany({
              where: { id: { in: validationResult.validUserIds } },
              select: { username: true }
            });
            finalValidatedUsernames = users.map(u => u.username);
          }

          await this.prisma.message.update({
            where: { id: message.id },
            data: { validatedMentions: finalValidatedUsernames }
          });

          (message as any).validatedMentions = finalValidatedUsernames;
          return validationResult.validUserIds;
        }
      }
      return [];
    } catch (error) {
      logger.error('[MessageProcessor] Error processing mentions in DB', error);
      return [];
    }
  }

  /**
   * Déclenche les notifications pour tous les types de destinataires
   */
  private async triggerAllNotifications(
    message: Message,
    data: { senderId: string; conversationId: string },
    processedContent: string,
    validatedMentionUserIds: string[]
  ): Promise<void> {
    if (!this.notificationService) return;

    try {
      // Sanitize notification preview for protected messages.
      // Use loc-key identifiers so the iOS NSE can resolve them to the
      // user's preferred language via Localizable.xcstrings. The gateway
      // does not know the recipient's locale — localisation is client-side.
      let notificationPreview = processedContent;
      let notificationLocKey: string | undefined;

      if (message.isEncrypted || message.encryptionMode === 'e2ee') {
        notificationPreview = 'Encrypted message';
        notificationLocKey = 'notification.encrypted_message';
      }

      if (message.isViewOnce) {
        notificationPreview = 'View-once message';
        notificationLocKey = 'notification.view_once_message';
      }

      if (message.isBlurred || (message.effectFlags && (message.effectFlags & 0x02) !== 0)) {
        notificationPreview = 'Hidden message';
        notificationLocKey = 'notification.hidden_message';
      }
      // 1. Résoudre le senderId en userId
      let senderUserId = data.senderId;
      const senderParticipant = await this.prisma.participant.findUnique({
        where: { id: data.senderId },
        select: { userId: true }
      });
      if (senderParticipant?.userId) {
        senderUserId = senderParticipant.userId;
      }

      // 2. Charger les infos de l'expéditeur et de la conversation
      const [sender, conversation] = await Promise.all([
        this.prisma.user.findUnique({
          where: { id: senderUserId },
          select: { username: true, displayName: true, avatar: true }
        }),
        this.prisma.conversation.findUnique({
          where: { id: data.conversationId },
          select: {
            title: true,
            type: true,
            participants: {
              where: { isActive: true, type: 'user' },
              select: { userId: true }
            }
          }
        })
      ]);

      if (!sender || !conversation) return;

      const memberIds = conversation.participants
        .map(p => p.userId)
        .filter((id): id is string => id !== null);

      // 3. Déterminer l'auteur du message original pour les réponses
      let originalMessageAuthorUserId: string | null = null;
      if (message.replyToId) {
        const originalMessage = await this.prisma.message.findUnique({
          where: { id: message.replyToId },
          select: { senderId: true }
        });
        if (originalMessage?.senderId) {
          const originalAuthorPart = await this.prisma.participant.findUnique({
            where: { id: originalMessage.senderId },
            select: { userId: true }
          });
          originalMessageAuthorUserId = originalAuthorPart?.userId || null;
        }
      }

      // 4. Préparer les infos d'attachments
      // Phase A — fileUrl + transcription added to the select so iOS rich-push
      // can attach the media inline (audio waveform, image preview, video thumb)
      // and use the transcription as the body for audio messages when available.
      const attachments = await this.prisma.messageAttachment.findMany({
        where: { messageId: message.id },
        select: { mimeType: true, fileName: true, fileSize: true, duration: true, width: true, height: true, fileUrl: true, transcription: true }
      });

      const first = attachments[0];
      const attachmentInfo = {
        hasAttachments: attachments.length > 0,
        attachmentCount: attachments.length,
        firstAttachmentType: first?.mimeType?.startsWith('image/') ? 'image' as const :
                            first?.mimeType?.startsWith('video/') ? 'video' as const :
                            first?.mimeType?.startsWith('audio/') ? 'audio' as const : 'document' as const,
        firstAttachmentFilename: first?.fileName,
        firstAttachmentFileSize: first?.fileSize,
        firstAttachmentDuration: first?.duration,
        firstAttachmentWidth: first?.width,
        firstAttachmentHeight: first?.height,
        // Phase A — rich-push fields propagated to APN payload via NotificationService.
        firstAttachmentUrl: first?.fileUrl || undefined,
        firstAttachmentMimeType: first?.mimeType || undefined,
      };

      // Phase A — if the first attachment is audio and already has a transcription
      // (pre-transcribed upload path, or transcription already completed by the
      // time the notification fan-out runs), use the transcript text as the
      // push body so the recipient sees the content immediately on the lock
      // screen — the audio file is still attached for inline playback.
      const firstAttachmentTranscript =
        first?.mimeType?.startsWith('audio/')
          ? extractTranscriptionText(first as { transcription?: unknown })
          : undefined;
      const notificationPreviewForPush = firstAttachmentTranscript ?? notificationPreview;

      // 5. Notification de RÉPONSE (prioritaire sur message régulier)
      if (originalMessageAuthorUserId &&
          originalMessageAuthorUserId !== senderUserId &&
          !validatedMentionUserIds.includes(originalMessageAuthorUserId)) {

        await this.notificationService.createReplyNotification({
          recipientUserId: originalMessageAuthorUserId,
          replierUserId: senderUserId,
          messageId: message.id,
          conversationId: data.conversationId,
          messagePreview: notificationPreview,
          originalMessageId: message.replyToId!,
        });
      }

      // 6. Notifications de MENTION (Batch)
      if (validatedMentionUserIds.length > 0) {
        await this.notificationService.createMentionNotificationsBatch(
          validatedMentionUserIds,
          {
            senderId: senderUserId,
            senderUsername: sender.displayName || sender.username,
            senderAvatar: sender.avatar || undefined,
            messageContent: notificationPreview,
            conversationId: data.conversationId,
            messageId: message.id,
          },
          memberIds
        );
      }

      // 7. Notifications de MESSAGE RÉGULIER
      const alreadyNotified = new Set([senderUserId, ...validatedMentionUserIds]);
      if (originalMessageAuthorUserId) alreadyNotified.add(originalMessageAuthorUserId);

      const candidateRegularRecipients = memberIds.filter(id => !alreadyNotified.has(id));

      // Fetch mentionsOnly preferences for all candidate recipients
      const conversationPrefs = candidateRegularRecipients.length > 0
        ? await this.prisma.userConversationPreferences.findMany({
            where: {
              conversationId: data.conversationId,
              userId: { in: candidateRegularRecipients },
              mentionsOnly: true,
            },
            select: { userId: true },
          })
        : [];

      const mentionsOnlyUserIds = new Set(conversationPrefs.map(p => p.userId));
      const regularRecipients = candidateRegularRecipients.filter(id => !mentionsOnlyUserIds.has(id));

      if (regularRecipients.length > 0) {
        await Promise.all(regularRecipients.map(recipientUserId =>
          this.notificationService!.createMessageNotification({
            recipientUserId,
            senderId: senderUserId,
            messageId: message.id,
            conversationId: data.conversationId,
            messagePreview: notificationPreviewForPush,
            encryptedContent: message.encryptedContent || undefined,
            notificationLocKey: notificationLocKey,
            ...attachmentInfo as any
          })
        ));
      }

      logger.info(`[MessageProcessor] Notifications triggered for ${message.id}: ${validatedMentionUserIds.length} mentions, ${regularRecipients.length} messages, reply=${!!originalMessageAuthorUserId}`);

    } catch (error) {
      logger.error('[MessageProcessor] Error triggering notifications', error);
    }
  }

  /**
   * Extract mentions from content
   */
  extractMentions(content: string): string[] {
    return this.mentionService.extractMentions(content);
  }

  /**
   * Check if content contains links
   */
  containsLinks(content: string): boolean {
    return /https?:\/\/[^\s]+/.test(content);
  }

  /**
   * Récupère les participants actifs d'une conversation pour la résolution des mentions.
   */
  private async getConversationParticipants(
    conversationId: string
  ): Promise<import('@meeshy/shared/utils/mention-parser').MentionParticipant[]> {
    try {
      const participants = await this.prisma.participant.findMany({
        where: { conversationId, isActive: true, type: 'user' },
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
}

/**
 * Best-effort plain-text extraction from an AttachmentTranscription blob.
 * Returns undefined if the structure isn't recognized — caller falls back
 * to the original preview. Used to inline voice-message transcripts in the
 * push body for Phase A rich notifications (Communication Notifications iOS).
 */
function extractTranscriptionText(att: { transcription?: unknown } | null | undefined): string | undefined {
  if (!att?.transcription || typeof att.transcription !== 'object') return undefined;
  const t = att.transcription as Record<string, unknown>;
  if (typeof t.text === 'string' && t.text.trim().length > 0) return t.text.trim();
  if (Array.isArray(t.segments)) {
    const joined = t.segments
      .map(seg => (typeof seg === 'object' && seg && typeof (seg as Record<string, unknown>).text === 'string'
        ? (seg as Record<string, unknown>).text as string
        : ''))
      .join(' ')
      .trim();
    if (joined.length > 0) return joined;
  }
  return undefined;
}
