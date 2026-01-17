/**
 * Service de transformation des données
 * Responsabilité: Convertir les données backend vers le format frontend
 */

import { socketIOUserToUser } from '@/utils/user-adapter';
import {
  UserRoleEnum,
} from '@meeshy/shared/types';
import type {
  Conversation,
  Message,
  User,
  UserRole,
  MessageType,
  MessageSource,
  TranslationModel,
  Attachment,
  ConversationType,
} from '@meeshy/shared/types';
import type { BackendMessageData, BackendConversationData } from './types';

/**
 * Service de transformation des données backend vers frontend
 */
export class TransformersService {
  /**
   * Permissions par défaut pour un utilisateur
   */
  private readonly DEFAULT_PERMISSIONS = {
    canAccessAdmin: false,
    canManageUsers: false,
    canManageGroups: false,
    canManageConversations: false,
    canViewAnalytics: false,
    canModerateContent: false,
    canViewAuditLogs: false,
    canManageNotifications: false,
    canManageTranslations: false,
  };

  /**
   * Convertir un rôle string en UserRoleEnum
   */
  stringToUserRole(role: string): UserRoleEnum {
    switch (role.toUpperCase()) {
      case 'ADMIN':
        return UserRoleEnum.ADMIN;
      case 'MODERATOR':
        return UserRoleEnum.MODERATOR;
      case 'BIGBOSS':
        return UserRoleEnum.BIGBOSS;
      case 'CREATOR':
        return UserRoleEnum.CREATOR;
      case 'AUDIT':
        return UserRoleEnum.AUDIT;
      case 'ANALYST':
        return UserRoleEnum.ANALYST;
      case 'USER':
        return UserRoleEnum.USER;
      case 'MEMBER':
      default:
        return UserRoleEnum.MEMBER;
    }
  }

  /**
   * Convertir un rôle UserRoleEnum en string pour ConversationParticipant
   */
  mapUserRoleToString(role: string): 'admin' | 'moderator' | 'member' {
    switch (role.toUpperCase()) {
      case 'ADMIN':
      case 'BIGBOSS':
      case 'CREATOR':
        return 'admin';
      case 'MODERATOR':
      case 'AUDIT':
      case 'ANALYST':
        return 'moderator';
      case 'USER':
      case 'MEMBER':
      default:
        return 'member';
    }
  }

  /**
   * Convertir un type de conversation en format valide
   */
  mapConversationType(type: string): ConversationType {
    switch (type.toLowerCase()) {
      case 'group':
        return 'group';
      case 'public':
        return 'broadcast';
      case 'global':
        return 'broadcast';
      case 'direct':
        return 'direct';
      case 'anonymous':
        return 'direct'; // Map anonymous to direct
      case 'broadcast':
        return 'broadcast';
      default:
        return 'direct';
    }
  }

  /**
   * Convertir un type de conversation en visibility
   */
  mapConversationVisibility(type: string): 'public' | 'private' | 'restricted' {
    switch (type.toLowerCase()) {
      case 'public':
      case 'global':
        return 'public';
      case 'direct':
      case 'group':
      case 'anonymous':
      default:
        return 'private';
    }
  }

  /**
   * Créer un utilisateur par défaut
   */
  private createDefaultUser(id: string): User {
    return {
      id,
      username: 'Unknown User',
      firstName: '',
      lastName: '',
      displayName: 'Utilisateur Inconnu',
      email: 'unknown@example.com',
      phoneNumber: '',
      role: 'USER',
      permissions: this.DEFAULT_PERMISSIONS,
      systemLanguage: 'fr',
      regionalLanguage: 'fr',
      customDestinationLanguage: undefined,
      autoTranslateEnabled: false,
      translateToSystemLanguage: false,
      translateToRegionalLanguage: false,
      useCustomDestination: false,
      isOnline: false,
      avatar: undefined,
      createdAt: new Date(),
      lastActiveAt: new Date(),
      isActive: true,
      updatedAt: new Date(),
    };
  }

  /**
   * Transformer les données d'un sender (authentifié ou anonyme)
   */
  private transformSender(sender: any, anonymousSender: any, defaultId: string): User {
    if (sender) {
      return {
        id: String(sender.id || defaultId),
        username: String(sender.username || 'Unknown'),
        firstName: String(sender.firstName || ''),
        lastName: String(sender.lastName || ''),
        displayName: String(sender.displayName || sender.username || 'Unknown'),
        email: String(sender.email || 'unknown@example.com'),
        phoneNumber: String(sender.phoneNumber || ''),
        role: (sender.role as any) || 'USER',
        permissions: this.DEFAULT_PERMISSIONS,
        systemLanguage: String(sender.systemLanguage || 'fr'),
        regionalLanguage: String(sender.regionalLanguage || 'fr'),
        customDestinationLanguage: undefined,
        autoTranslateEnabled: Boolean(sender.autoTranslateEnabled ?? false),
        translateToSystemLanguage: Boolean(sender.translateToSystemLanguage ?? false),
        translateToRegionalLanguage: Boolean(sender.translateToRegionalLanguage ?? false),
        useCustomDestination: Boolean(sender.useCustomDestination ?? false),
        isOnline: Boolean(sender.isOnline ?? false),
        avatar: sender.avatar as string | undefined,
        createdAt: new Date(sender.createdAt as any || Date.now()),
        lastActiveAt: new Date(sender.lastActiveAt as any || Date.now()),
        isActive: Boolean(sender.isActive ?? true),
        updatedAt: new Date(sender.updatedAt as any || Date.now()),
      };
    }

    if (anonymousSender) {
      const displayName = `${String(anonymousSender.firstName || '')} ${String(anonymousSender.lastName || '')}`.trim() ||
                         String(anonymousSender.username) ||
                         'Utilisateur anonyme';

      return {
        id: String(anonymousSender.id || defaultId),
        username: String(anonymousSender.username || 'Anonymous'),
        firstName: String(anonymousSender.firstName || ''),
        lastName: String(anonymousSender.lastName || ''),
        displayName,
        email: '',
        phoneNumber: '',
        role: 'USER',
        permissions: this.DEFAULT_PERMISSIONS,
        systemLanguage: String(anonymousSender.language || 'fr'),
        regionalLanguage: String(anonymousSender.language || 'fr'),
        customDestinationLanguage: undefined,
        autoTranslateEnabled: false,
        translateToSystemLanguage: false,
        translateToRegionalLanguage: false,
        useCustomDestination: false,
        isOnline: false,
        avatar: undefined,
        createdAt: new Date(),
        lastActiveAt: new Date(),
        isActive: true,
        updatedAt: new Date(),
      };
    }

    return this.createDefaultUser(defaultId);
  }

  /**
   * Transformer les attachments
   */
  private transformAttachments(attachments: any[], messageId: string, senderId: string): Attachment[] | undefined {
    if (!Array.isArray(attachments) || attachments.length === 0) {
      return undefined;
    }

    return attachments.map((att: any): Attachment => ({
      id: String(att.id || ''),
      messageId,
      fileName: String(att.fileName || ''),
      originalName: String(att.originalName || att.fileName || ''),
      fileUrl: String(att.fileUrl || ''),
      mimeType: String(att.mimeType || ''),
      fileSize: Number(att.fileSize) || 0,
      thumbnailUrl: att.thumbnailUrl ? String(att.thumbnailUrl) : undefined,
      width: att.width ? Number(att.width) : undefined,
      height: att.height ? Number(att.height) : undefined,
      duration: att.duration ? Number(att.duration) : undefined,
      bitrate: att.bitrate ? Number(att.bitrate) : undefined,
      sampleRate: att.sampleRate ? Number(att.sampleRate) : undefined,
      codec: att.codec ? String(att.codec) : undefined,
      channels: att.channels ? Number(att.channels) : undefined,
      fps: att.fps ? Number(att.fps) : undefined,
      videoCodec: att.videoCodec ? String(att.videoCodec) : undefined,
      pageCount: att.pageCount ? Number(att.pageCount) : undefined,
      lineCount: att.lineCount ? Number(att.lineCount) : undefined,
      metadata: att.metadata || undefined,
      uploadedBy: String(att.uploadedBy || senderId),
      isAnonymous: Boolean(att.isAnonymous),
      createdAt: String(att.createdAt || new Date().toISOString()),
      isForwarded: Boolean(att.isForwarded),
      isViewOnce: Boolean(att.isViewOnce),
      viewOnceCount: Number(att.viewOnceCount) || 0,
      isBlurred: Boolean(att.isBlurred),
      viewedCount: Number(att.viewedCount) || 0,
      downloadedCount: Number(att.downloadedCount) || 0,
      consumedCount: Number(att.consumedCount) || 0,
      isEncrypted: Boolean(att.isEncrypted),
    }));
  }

  /**
   * Transformer les traductions
   */
  private transformTranslations(translations: any[], messageId: string, originalLanguage: string): any[] {
    if (!Array.isArray(translations)) {
      return [];
    }

    return translations.map((t: any) => ({
      id: String(t.id || ''),
      messageId,
      sourceLanguage: String(t.sourceLanguage || originalLanguage),
      targetLanguage: String(t.targetLanguage || ''),
      translatedContent: String(t.translatedContent || ''),
      translationModel: (t.translationModel || 'basic') as TranslationModel,
      cacheKey: String(t.cacheKey || ''),
      confidenceScore: Number(t.confidenceScore) || undefined,
      createdAt: new Date(String(t.createdAt || new Date())),
      cached: Boolean(t.cached)
    }));
  }

  /**
   * Transforme les données d'un message du backend vers le format frontend
   */
  transformMessageData(backendMessage: unknown): Message {
    const msg = backendMessage as Record<string, unknown>;
    const messageId = String(msg.id);
    const senderId = String(msg.senderId || msg.anonymousSenderId || 'unknown');

    const sender = msg.sender as Record<string, unknown> | undefined;
    const anonymousSender = msg.anonymousSender as Record<string, unknown> | undefined;

    const finalSender = this.transformSender(sender, anonymousSender, senderId);
    const originalLanguage = msg.originalLanguage ? String(msg.originalLanguage) : 'fr';

    const translations = this.transformTranslations(
      msg.translations as any[],
      messageId,
      originalLanguage
    );

    const attachments = this.transformAttachments(
      msg.attachments as any[],
      messageId,
      senderId
    );

    let replyTo: any = undefined;
    if (msg.replyTo) {
      const replyToMsg = msg.replyTo as Record<string, unknown>;
      const replyToSender = replyToMsg.sender as Record<string, unknown> | undefined;
      const replyToAnonymousSender = replyToMsg.anonymousSender as Record<string, unknown> | undefined;

      const replyToFinalSender = this.transformSender(
        replyToSender,
        replyToAnonymousSender,
        String(replyToMsg.senderId || replyToMsg.anonymousSenderId || 'unknown')
      );

      replyTo = {
        id: String(replyToMsg.id),
        content: String(replyToMsg.content),
        senderId: String(replyToMsg.senderId || replyToMsg.anonymousSenderId || ''),
        conversationId: String(replyToMsg.conversationId),
        originalLanguage: String(replyToMsg.originalLanguage || 'fr'),
        messageType: String(replyToMsg.messageType || 'text') as MessageType,
        createdAt: new Date(String(replyToMsg.createdAt)),
        timestamp: new Date(String(replyToMsg.createdAt)),
        sender: {
          id: replyToFinalSender.id,
          username: replyToFinalSender.username,
          displayName: replyToFinalSender.displayName,
          firstName: replyToFinalSender.firstName,
          lastName: replyToFinalSender.lastName,
        },
        translations: [],
        isEdited: false,
        isDeleted: false,
        updatedAt: new Date(String(replyToMsg.updatedAt || replyToMsg.createdAt)),
      };
    }

    const createdAt = new Date(String(msg.createdAt));

    return {
      id: messageId,
      content: String(msg.content),
      senderId,
      conversationId: String(msg.conversationId),
      originalLanguage,
      messageType: (String(msg.messageType) || 'text') as MessageType,
      messageSource: (String(msg.messageSource) || 'user') as MessageSource,
      isEdited: Boolean(msg.isEdited),
      isDeleted: Boolean(msg.isDeleted),
      isViewOnce: Boolean(msg.isViewOnce),
      viewOnceCount: Number(msg.viewOnceCount) || 0,
      isBlurred: Boolean(msg.isBlurred),
      deliveredCount: Number(msg.deliveredCount) || 0,
      readCount: Number(msg.readCount) || 0,
      reactionCount: Number(msg.reactionCount) || 0,
      reactionSummary: msg.reactionSummary as Record<string, number> | undefined,
      isEncrypted: Boolean(msg.isEncrypted),
      encryptedContent: msg.encryptedContent as string | undefined,
      encryptionMode: msg.encryptionMode as 'server' | 'e2ee' | 'hybrid' | undefined,
      encryptionMetadata: msg.encryptionMetadata as Record<string, unknown> | undefined,
      createdAt,
      updatedAt: new Date(String(msg.updatedAt)),
      sender: finalSender,
      translations,
      replyTo,
      attachments,
      timestamp: createdAt,
    };
  }

  /**
   * Transforme les données de conversation du backend vers le format frontend
   */
  transformConversationData(backendConversation: unknown): Conversation {
    const conv = backendConversation as Record<string, unknown>;

    return {
      id: String(conv.id),
      type: this.mapConversationType(String(conv.type) || 'direct'),
      visibility: this.mapConversationVisibility(String(conv.type) || 'direct'),
      status: 'active' as const,
      title: conv.title as string,
      description: conv.description as string,
      image: conv.image as string,
      avatar: conv.avatar as string,
      communityId: conv.communityId as string,
      isActive: Boolean(conv.isActive),
      isArchived: Boolean(conv.isArchived),
      isGroup: Boolean(conv.isGroup) || String(conv.type) === 'group',
      isPrivate: Boolean(conv.isPrivate),
      memberCount: Array.isArray(conv.members) ? conv.members.length : 0,
      lastMessageAt: conv.lastMessageAt ? new Date(String(conv.lastMessageAt)) : new Date(String(conv.updatedAt)),
      createdAt: new Date(String(conv.createdAt)),
      updatedAt: new Date(String(conv.updatedAt)),
      participants: Array.isArray(conv.members) ? conv.members.map((p: unknown) => {
        const participant = p as Record<string, unknown>;
        const user = participant.user as Record<string, unknown>;

        return {
          userId: String(participant.userId),
          role: String(participant.role || 'MEMBER').toUpperCase() as UserRole,
          joinedAt: new Date(String(participant.joinedAt)),
          isActive: Boolean(participant.isActive ?? true),
        };
      }) : [],
      lastMessage: conv.lastMessage ? this.transformMessageData(conv.lastMessage) : undefined,
      unreadCount: Number(conv.unreadCount) || 0
    };
  }
}

export const transformersService = new TransformersService();
