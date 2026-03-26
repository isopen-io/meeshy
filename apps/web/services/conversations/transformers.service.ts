/**
 * Service de transformation des données
 * Responsabilité: Convertir les données backend vers le format frontend
 */

import {
  UserRoleEnum,
  MemberRole,
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
import type {
  AttachmentTranscription,
  AttachmentTranslations,
  SocketIOTranslatedAudio,
} from '@meeshy/shared/types/attachment-audio';
import { getSenderUserId } from '@meeshy/shared/utils/sender-identity';
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
   * Cache pour les transformations de messages
   */
  private messageCache = new WeakMap<object, Message>();

  /**
   * Cache pour les transformations de conversations
   */
  private conversationCache = new WeakMap<object, Conversation>();

  /**
   * Map statique pour la conversion des rôles (O(1) lookup)
   */
  private static readonly ROLE_MAP = new Map<string, string>([
    ['ADMIN', UserRoleEnum.ADMIN],
    ['MODERATOR', UserRoleEnum.MODERATOR],
    ['BIGBOSS', UserRoleEnum.BIGBOSS],
    ['CREATOR', MemberRole.CREATOR],
    ['AUDIT', UserRoleEnum.AUDIT],
    ['ANALYST', UserRoleEnum.ANALYST],
    ['USER', UserRoleEnum.USER],
    ['MEMBER', MemberRole.MEMBER],
  ]);

  /**
   * Map statique pour la conversion des rôles en string
   */
  private static readonly ROLE_TO_STRING_MAP = new Map<string, 'admin' | 'moderator' | 'member'>([
    ['ADMIN', 'admin'],
    ['BIGBOSS', 'admin'],
    ['CREATOR', 'admin'],
    ['MODERATOR', 'moderator'],
    ['AUDIT', 'moderator'],
    ['ANALYST', 'moderator'],
    ['USER', 'member'],
    ['MEMBER', 'member'],
  ]);

  /**
   * Map statique pour la conversion des types de conversation
   */
  private static readonly CONVERSATION_TYPE_MAP = new Map<string, ConversationType>([
    ['group', 'group'],
    ['public', 'broadcast'],
    ['global', 'broadcast'],
    ['direct', 'direct'],
    ['anonymous', 'direct'],
    ['broadcast', 'broadcast'],
  ]);

  /**
   * Map statique pour la visibilité des conversations
   */
  private static readonly CONVERSATION_VISIBILITY_MAP = new Map<string, 'public' | 'private' | 'restricted'>([
    ['public', 'public'],
    ['global', 'public'],
    ['direct', 'private'],
    ['group', 'private'],
    ['anonymous', 'private'],
  ]);

  /**
   * Convertir un rôle string en UserRoleEnum
   */
  stringToUserRole(role: string): string {
    return TransformersService.ROLE_MAP.get(role.toUpperCase()) ?? MemberRole.MEMBER;
  }

  /**
   * Convertir un rôle UserRoleEnum en string pour ConversationParticipant
   */
  mapUserRoleToString(role: string): 'admin' | 'moderator' | 'member' {
    return TransformersService.ROLE_TO_STRING_MAP.get(role.toUpperCase()) ?? 'member';
  }

  /**
   * Convertir un type de conversation en format valide
   */
  mapConversationType(type: string): ConversationType {
    return TransformersService.CONVERSATION_TYPE_MAP.get(type.toLowerCase()) ?? 'direct';
  }

  /**
   * Convertir un type de conversation en visibility
   */
  mapConversationVisibility(type: string): 'public' | 'private' | 'restricted' {
    return TransformersService.CONVERSATION_VISIBILITY_MAP.get(type.toLowerCase()) ?? 'private';
  }

  /**
   * Créer un utilisateur par défaut
   */
  private createDefaultUser(id: string): User {
    return {
      id,
      userId: id, // Preserve for getSenderUserId() resolution
      username: '',
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
  private transformSender(sender: any, _unused: any, defaultId: string): User {
    if (sender) {
      // sender can be a flat User object (Socket.IO) or a Participant with nested .user (REST API)
      const nestedUser = sender.user as Record<string, unknown> | undefined;

      // Resolve User ID deterministically via shared utility
      const id = getSenderUserId(sender) || defaultId;
      const username = sender.username || nestedUser?.username;
      const firstName = sender.firstName || nestedUser?.firstName || '';
      const lastName = sender.lastName || nestedUser?.lastName || '';
      const displayName = sender.nickname || sender.displayName || nestedUser?.displayName || username || '';
      const avatar = sender.avatar || nestedUser?.avatar;
      const role = sender.role || nestedUser?.role || 'USER';
      const systemLanguage = sender.systemLanguage || nestedUser?.systemLanguage || 'fr';
      const regionalLanguage = sender.regionalLanguage || nestedUser?.regionalLanguage || 'fr';

      return {
        id: String(id),
        userId: String(id), // Preserve userId for getSenderUserId() resolution
        username: username ? String(username) : '',
        firstName: String(firstName),
        lastName: String(lastName),
        displayName: String(displayName),
        email: String(sender.email || ''),
        phoneNumber: String(sender.phoneNumber || ''),
        role: String(role),
        permissions: this.DEFAULT_PERMISSIONS,
        systemLanguage: String(systemLanguage),
        regionalLanguage: String(regionalLanguage),
        customDestinationLanguage: undefined,
        autoTranslateEnabled: Boolean(sender.autoTranslateEnabled),
        isOnline: Boolean(sender.isOnline),
        avatar: avatar as string | undefined,
        createdAt: new Date(sender.createdAt || Date.now()),
        lastActiveAt: new Date(sender.lastActiveAt || Date.now()),
        isActive: Boolean(sender.isActive ?? true),
        updatedAt: new Date(sender.updatedAt || Date.now()),
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

    return attachments.map((att: any): Attachment => {
      return {
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

      // ✅ V2: Transcription et translations - passés tels quels depuis la BD
      transcription: att.transcription as any,
      translations: att.translations as AttachmentTranslations | undefined,
    };
  });
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

    // Vérifier le cache
    if (typeof msg === 'object' && msg !== null && this.messageCache.has(msg)) {
      return this.messageCache.get(msg)!;
    }

    const messageId = String(msg.id);
    const senderId = String(msg.senderId || 'unknown');

    const sender = msg.sender as Record<string, unknown> | undefined;

    const finalSender = this.transformSender(sender, undefined, senderId);
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

      const replyToFinalSender = this.transformSender(
        replyToSender,
        undefined,
        String(replyToMsg.senderId || 'unknown')
      );

      replyTo = {
        id: String(replyToMsg.id),
        content: String(replyToMsg.content),
        senderId: String(replyToMsg.senderId || ''),
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
        updatedAt: new Date(String(replyToMsg.updatedAt || replyToMsg.createdAt)),
      };
    }

    const createdAt = new Date(String(msg.createdAt));

    // Transformer validatedMentions en array readonly string[] selon l'interface Message
    const validatedMentions = Array.isArray(msg.validatedMentions)
      ? msg.validatedMentions.map(m => String(m))
      : undefined;

    // Resolve the User ID for this message (for alignment: isOwnMessage checks)
    // senderId from DB is a Participant ID; the actual User ID comes from sender relation
    const senderUserId = getSenderUserId(sender as Record<string, unknown>) || senderId;

    const transformedMessage: Message = {
      id: messageId,
      content: String(msg.content),
      senderId: senderUserId,
      conversationId: String(msg.conversationId),
      originalLanguage,
      messageType: (String(msg.messageType) || 'text') as MessageType,
      messageSource: (String(msg.messageSource) || 'user') as MessageSource,
      isEdited: Boolean(msg.isEdited),
      deletedAt: msg.deletedAt ? new Date(String(msg.deletedAt)) : undefined,
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
      sender: finalSender as any,
      translations,
      replyTo,
      attachments,
      validatedMentions,
      timestamp: createdAt,
    };

    // Mettre en cache
    if (typeof msg === 'object' && msg !== null) {
      this.messageCache.set(msg, transformedMessage);
    }

    return transformedMessage;
  }

  /**
   * Transforme les données de conversation du backend vers le format frontend
   */
  transformConversationData(backendConversation: unknown): Conversation {
    const conv = backendConversation as Record<string, unknown>;

    // Vérifier le cache
    if (typeof conv === 'object' && conv !== null && this.conversationCache.has(conv)) {
      return this.conversationCache.get(conv)!;
    }

    // Extract participants with user data merged
    const participants = Array.isArray(conv.participants)
      ? conv.participants.map((p: unknown) => {
          const participant = p as Record<string, unknown>;
          const user = participant.user as Record<string, unknown>;

          return {
            ...participant,
            user: user ? {
              id: String(user.id),
              username: String(user.username || ''),
              displayName: String(user.displayName || user.username || ''),
              firstName: String(user.firstName || ''),
              lastName: String(user.lastName || ''),
              avatar: user.avatar as string | undefined,
              isOnline: Boolean(user.isOnline),
              lastActiveAt: user.lastActiveAt ? new Date(String(user.lastActiveAt)) : undefined,
            } : undefined
          };
        })
      : [];

    const transformedConversation: Conversation = {
      id: String(conv.id),
      identifier: conv.identifier as string | undefined,
      type: this.mapConversationType(String(conv.type) || 'direct'),
      visibility: this.mapConversationVisibility(String(conv.type) || 'direct'),
      status: 'active' as const,
      title: conv.title as string,
      description: conv.description as string,
      image: conv.image as string,
      avatar: conv.avatar as string,
      banner: conv.banner as string,
      communityId: conv.communityId as string,
      isActive: Boolean(conv.isActive ?? true),
      isArchived: Boolean(conv.isArchived ?? false),
      isGroup: String(conv.type) === 'group',
      isPrivate: this.mapConversationVisibility(String(conv.type) || 'direct') === 'private',
      memberCount: (conv.memberCount as number) || (conv._count as any)?.participants || participants.length,
      lastMessageAt: conv.lastMessageAt ? new Date(String(conv.lastMessageAt)) : new Date(String(conv.updatedAt)),
      createdAt: new Date(String(conv.createdAt)),
      updatedAt: new Date(String(conv.updatedAt)),

      // Unified participants
      participants: participants as any,

      // Last message transformé
      lastMessage: conv.lastMessage ? this.transformMessageData(conv.lastMessage) : undefined,

      // Unread count
      unreadCount: Number(conv.unreadCount) || 0,

      // User preferences si présentes
      userPreferences: Array.isArray(conv.userPreferences) && conv.userPreferences.length > 0
        ? conv.userPreferences[0] as any
        : undefined,
    };

    // Mettre en cache
    if (typeof conv === 'object' && conv !== null) {
      this.conversationCache.set(conv, transformedConversation);
    }

    return transformedConversation;
  }
}

export const transformersService = new TransformersService();
