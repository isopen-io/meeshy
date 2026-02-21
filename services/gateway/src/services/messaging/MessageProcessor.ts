/**
 * Message Processing Module
 * Handles message content processing, encryption, links, mentions, and persistence
 */

import { PrismaClient, Message } from '@meeshy/shared/prisma/client';
import type { Prisma } from '@meeshy/shared/prisma/client';
import type { MessageRequest } from '@meeshy/shared/types';
import { TrackingLinkService } from '../TrackingLinkService';
import { MentionService } from '../MentionService';
import { EncryptionService } from '../EncryptionService';
import { NotificationService } from '../notifications/NotificationService';
import { enhancedLogger } from '../../utils/logger-enhanced';

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

  constructor(
    private readonly prisma: PrismaClient,
    private readonly notificationService?: NotificationService
  ) {
    this.trackingLinkService = new TrackingLinkService(prisma);
    this.mentionService = new MentionService(prisma);
    this.encryptionService = new EncryptionService(prisma);
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
   * Handles encryption based on conversation settings
   */
  async saveMessage(data: {
    conversationId: string;
    senderId?: string;
    anonymousSenderId?: string;
    content: string;
    originalLanguage: string;
    messageType?: string;
    replyToId?: string;
    forwardedFromId?: string;
    forwardedFromConversationId?: string;
    mentionedUserIds?: readonly string[];
    encryptedContent?: string;
    encryptionMetadata?: Prisma.InputJsonValue;
  }): Promise<Message> {
    // ÉTAPE 1: Traiter les liens AVANT de sauvegarder le message
    const processedContent = await this.processLinksInContent(
      data.content,
      data.conversationId,
      data.senderId || data.anonymousSenderId,
      undefined
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
      encryptionContext = await this.getEncryptionContext(
        data.conversationId,
        processedContent.trim(),
        data.messageType || 'text'
      );
    }

    // ÉTAPE 3: Créer le message avec le contenu traité et encryption
    const message = await this.prisma.message.create({
      data: {
        conversationId: data.conversationId,
        senderId: data.senderId,
        anonymousSenderId: data.anonymousSenderId,
        content: encryptionContext.isEncrypted ? '' : processedContent.trim(),
        originalLanguage: data.originalLanguage,
        messageType: data.messageType || 'text',
        replyToId: data.replyToId,
        forwardedFromId: data.forwardedFromId,
        forwardedFromConversationId: data.forwardedFromConversationId,
        isEncrypted: encryptionContext.isEncrypted,
        encryptionMode: encryptionContext.mode,
        encryptedContent: encryptionContext.encryptedContent,
        encryptionMetadata: encryptionContext.encryptionMetadata
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
            role: true,
            isOnline: true
          }
        },
        anonymousSender: {
          select: {
            id: true,
            conversationId: true,
            username: true,
            firstName: true,
            lastName: true,
            language: true
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
        },
        replyTo: {
          include: {
            sender: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true
              }
            },
            anonymousSender: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                language: true
              }
            }
          }
        }
      }
    });

    // ÉTAPE 4: Mettre à jour les liens de tracking avec le messageId
    await this.updateTrackingLinksWithMessageId(processedContent, data, message.id);

    // ÉTAPE 5: Traiter les mentions d'utilisateurs
    await this.processMentions(data, message, processedContent);

    return {
      ...message,
      timestamp: message.createdAt
    } as Message;
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
   * Traiter les mentions d'utilisateurs
   */
  private async processMentions(
    data: { senderId?: string; conversationId: string; mentionedUserIds?: readonly string[] },
    message: Message,
    processedContent: string
  ): Promise<void> {
    try {
      logger.info('[MessageProcessor] Processing mentions');

      let mentionedUserIds: string[] = [];
      let validatedUsernames: string[] = [];

      // Utiliser les mentions envoyées par le frontend si disponibles
      if (data.mentionedUserIds && data.mentionedUserIds.length > 0) {
        logger.info('[MessageProcessor] Using mentions from frontend:', data.mentionedUserIds);
        mentionedUserIds = Array.from(data.mentionedUserIds);
      } else {
        // Parser le contenu pour extraire les mentions (compatibilité)
        const mentionedUsernames = this.mentionService.extractMentions(processedContent);
        logger.info('[MessageProcessor] Extracted mentions (legacy):', mentionedUsernames);

        if (mentionedUsernames.length > 0 && data.senderId) {
          const userMap = await this.mentionService.resolveUsernames(mentionedUsernames);
          mentionedUserIds = Array.from(userMap.values()).map(user => user.id);
          validatedUsernames = Array.from(userMap.keys());
        }
      }

      if (mentionedUserIds.length > 0 && data.senderId) {
        const validationResult = await this.mentionService.validateMentionPermissions(
          data.conversationId,
          mentionedUserIds,
          data.senderId
        );

        if (validationResult.validUserIds.length > 0) {
          await this.mentionService.createMentions(
            message.id,
            validationResult.validUserIds
          );

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

          message.validatedMentions = finalValidatedUsernames;

          logger.info(`[MessageProcessor] ${validationResult.validUserIds.length} mention(s) created`);

          if (this.notificationService) {
            await this.sendMentionNotifications(
              validationResult.validUserIds,
              data.senderId,
              data.conversationId,
              message.id,
              processedContent
            );
          }
        }

        if (!validationResult.isValid) {
          logger.warn(`[MessageProcessor] Some mentions invalid:`, validationResult.errors);
        }
      }
    } catch (mentionError) {
      logger.error('[MessageProcessor] Error processing mentions', mentionError);
    }
  }

  /**
   * Envoie les notifications de mention à tous les utilisateurs mentionnés
   */
  private async sendMentionNotifications(
    mentionedUserIds: string[],
    senderId: string,
    conversationId: string,
    messageId: string,
    messageContent: string
  ): Promise<void> {
    if (!this.notificationService) return;

    try {
      const sender = await this.prisma.user.findUnique({
        where: { id: senderId },
        select: { username: true, avatar: true }
      });

      if (!sender) {
        logger.error('[MessageProcessor] Sender not found for mention notifications');
        return;
      }

      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: {
          title: true,
          type: true,
          members: {
            where: { isActive: true },
            select: { userId: true }
          }
        }
      });

      if (!conversation) {
        logger.error('[MessageProcessor] Conversation not found for mention notifications');
        return;
      }

      let messageAttachments: Array<{ id: string; filename: string; mimeType: string; fileSize: number }> = [];
      try {
        const attachments = await this.prisma.messageAttachment.findMany({
          where: { messageId },
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            fileSize: true
          }
        });
        messageAttachments = attachments.map(att => ({
          id: att.id,
          filename: att.fileName,
          mimeType: att.mimeType,
          fileSize: att.fileSize
        }));
      } catch (err) {
        logger.error('[MessageProcessor] Error fetching attachments for mention', err);
      }

      const memberIds = conversation.members.map(m => m.userId);

      const count = await this.notificationService.createMentionNotificationsBatch(
        mentionedUserIds,
        {
          senderId,
          senderUsername: sender.username,
          senderAvatar: sender.avatar || undefined,
          messageContent,
          conversationId,
          messageId,
        },
        memberIds
      );

      logger.info(`[MessageProcessor] ${count} mention notifications created`);
    } catch (error) {
      logger.error('[MessageProcessor] Error sending mention notifications', error);
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
}
