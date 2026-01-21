/**
 * Message Validation Module
 * Handles all validation logic for message requests
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type {
  MessageRequest,
  MessageValidationResult,
  MessagePermissionResult,
  AuthenticationContext
} from '@meeshy/shared/types';
import { MESSAGE_LIMITS } from '../../config/message-limits';

export class MessageValidator {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Validation complète d'une requête de message
   */
  async validateRequest(request: MessageRequest): Promise<MessageValidationResult> {
    const errors: MessageValidationResult['errors'] = [];
    const warnings: MessageValidationResult['warnings'] = [];

    // Validation du contenu - permettre les messages sans contenu si il y a des attachements
    if ((!request.content || request.content.trim().length === 0) && (!request.attachments || request.attachments.length === 0)) {
      errors.push({
        field: 'content',
        message: 'Message content cannot be empty (unless attachments are included)',
        code: 'CONTENT_EMPTY'
      });
    }

    if (request.content && request.content.length > MESSAGE_LIMITS.MAX_MESSAGE_LENGTH) {
      errors.push({
        field: 'content',
        message: `Message content cannot exceed ${MESSAGE_LIMITS.MAX_MESSAGE_LENGTH} characters`,
        code: 'CONTENT_TOO_LONG'
      });
    }

    // Validation conversationId
    if (!request.conversationId) {
      errors.push({
        field: 'conversationId',
        message: 'Conversation ID is required',
        code: 'CONVERSATION_ID_REQUIRED'
      });
    }

    // Validation messaging anonyme
    if (request.isAnonymous && !request.anonymousDisplayName) {
      errors.push({
        field: 'anonymousDisplayName',
        message: 'Anonymous display name is required for anonymous messages',
        code: 'ANONYMOUS_NAME_REQUIRED'
      });
    }

    // Validation des pièces jointes
    if (request.attachments && request.attachments.length > 10) {
      errors.push({
        field: 'attachments',
        message: 'Maximum 10 attachments per message',
        code: 'TOO_MANY_ATTACHMENTS'
      });
    }

    // Warnings pour optimisation
    if (request.content && request.content.length > 1000) {
      warnings.push({
        field: 'content',
        message: 'Long message - premium translation recommended',
        code: 'LONG_CONTENT_WARNING'
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: warnings.length > 0 ? warnings : undefined
    };
  }

  /**
   * Vérification des permissions d'envoi de message
   * Support authentication context robuste
   */
  async checkPermissions(
    authContext: AuthenticationContext,
    conversationId: string,
    request: MessageRequest
  ): Promise<MessagePermissionResult> {
    try {
      // Résoudre l'ID de conversation d'abord
      const resolvedConversationId = await this.resolveConversationId(request.conversationId);
      if (!resolvedConversationId) {
        return this.createPermissionDenied('Conversation non trouvée');
      }

      // Récupérer les informations de la conversation
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: resolvedConversationId },
        select: { type: true, identifier: true }
      });

      if (!conversation) {
        return this.createPermissionDenied('Conversation non trouvée');
      }

      // Cas spécial : conversation globale
      if (conversation.type === 'global') {
        return {
          canSend: true,
          canSendAnonymous: authContext.isAnonymous,
          canAttachFiles: !authContext.isAnonymous,
          canMentionUsers: !authContext.isAnonymous,
          canUseHighPriority: false
        };
      }

      // Vérifier les permissions selon le type d'authentification
      if (authContext.isAnonymous) {
        return await this.checkAnonymousPermissions(authContext, conversationId);
      } else {
        return await this.checkRegisteredUserPermissions(authContext, conversationId);
      }

    } catch (error) {
      console.error('[MessageValidator] Error checking permissions:', error);
      console.error('[MessageValidator] Auth context:', {
        type: authContext.type,
        isAnonymous: authContext.isAnonymous,
        userId: authContext.userId,
        sessionToken: authContext.sessionToken ? 'present' : 'missing'
      });

      return this.createPermissionDenied(
        `Erreur lors de la vérification des permissions: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
      );
    }
  }

  /**
   * Vérifier les permissions pour un utilisateur anonyme
   */
  private async checkAnonymousPermissions(
    authContext: AuthenticationContext,
    conversationId: string
  ): Promise<MessagePermissionResult> {
    const identifier = authContext.sessionToken || authContext.userId || '';

    const anonymousParticipant = await this.prisma.anonymousParticipant.findFirst({
      where: {
        sessionToken: identifier,
        conversationId: conversationId,
        isActive: true
      },
      include: {
        shareLink: {
          select: {
            id: true,
            isActive: true,
            allowAnonymousMessages: true,
            allowAnonymousFiles: true,
            allowAnonymousImages: true,
            maxUses: true,
            currentUses: true,
            expiresAt: true,
            maxConcurrentUsers: true,
            currentConcurrentUsers: true
          }
        }
      }
    });

    if (!anonymousParticipant || !anonymousParticipant.shareLink) {
      return this.createPermissionDenied(
        'Utilisateur anonyme non autorisé dans cette conversation ou lien invalide'
      );
    }

    const shareLink = anonymousParticipant.shareLink;

    // Vérifier si le lien est toujours actif et valide
    if (!shareLink.isActive) {
      return this.createPermissionDenied('Le lien de partage a été désactivé');
    }

    // Vérifier la date d'expiration
    if (shareLink.expiresAt && shareLink.expiresAt < new Date()) {
      return this.createPermissionDenied('Le lien de partage a expiré');
    }

    // Vérifier les limites d'utilisation
    if (shareLink.maxUses && shareLink.currentUses >= shareLink.maxUses) {
      return this.createPermissionDenied('Limite d\'utilisation du lien atteinte');
    }

    // Vérifier les permissions spécifiques du lien
    if (!shareLink.allowAnonymousMessages) {
      return this.createPermissionDenied('Ce lien ne permet pas l\'envoi de messages');
    }

    // Vérifier les permissions spécifiques du participant
    if (!anonymousParticipant.canSendMessages) {
      return this.createPermissionDenied('Vos permissions d\'envoi de messages ont été révoquées');
    }

    // Permissions accordées selon le lien et les capacités du participant
    return {
      canSend: true,
      canSendAnonymous: true,
      canAttachFiles: shareLink.allowAnonymousFiles && anonymousParticipant.canSendFiles,
      canMentionUsers: false,
      canUseHighPriority: false,
      restrictions: {
        maxContentLength: 1000,
        maxAttachments: shareLink.allowAnonymousFiles ? 5 : 0,
        allowedAttachmentTypes: shareLink.allowAnonymousFiles ?
          (shareLink.allowAnonymousImages ? ['image', 'file'] : ['file']) : [],
        rateLimitRemaining: 20
      }
    };
  }

  /**
   * Vérifier les permissions pour un utilisateur enregistré
   */
  private async checkRegisteredUserPermissions(
    authContext: AuthenticationContext,
    conversationId: string
  ): Promise<MessagePermissionResult> {
    const userId = authContext.userId!;

    const membership = await this.prisma.conversationMember.findFirst({
      where: {
        conversationId,
        userId,
        isActive: true
      }
    });

    if (!membership) {
      return this.createPermissionDenied('Vous n\'êtes pas membre de cette conversation');
    }

    // Récupérer les infos de la conversation pour les permissions
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { type: true }
    });

    if (!conversation) {
      return this.createPermissionDenied('Conversation non trouvée');
    }

    return {
      canSend: membership.canSendMessage,
      canSendAnonymous: false,
      canAttachFiles: membership.canSendFiles,
      canMentionUsers: true,
      canUseHighPriority: conversation.type !== 'public',
      restrictions: {
        maxContentLength: MESSAGE_LIMITS.MAX_MESSAGE_LENGTH,
        maxAttachments: 100,
        allowedAttachmentTypes: ['image', 'file', 'audio', 'video'],
        rateLimitRemaining: 100
      }
    };
  }

  /**
   * Résout l'ID de conversation réel à partir de différents formats
   */
  async resolveConversationId(identifier: string): Promise<string | null> {
    // Si c'est déjà un ObjectId MongoDB, on le retourne
    if (/^[0-9a-fA-F]{24}$/.test(identifier)) {
      return identifier;
    }

    // Sinon, chercher par le champ identifier
    const conversation = await this.prisma.conversation.findFirst({
      where: { identifier: identifier }
    });

    return conversation ? conversation.id : null;
  }

  /**
   * Détection automatique de la langue
   */
  async detectLanguage(content: string): Promise<string> {
    try {
      // TODO: Implémenter détection via service de traduction
      return 'fr';
    } catch (error) {
      console.error('[MessageValidator] Language detection failed:', error);
      return 'fr';
    }
  }

  /**
   * Helper pour créer une réponse de permission refusée
   */
  private createPermissionDenied(reason: string): MessagePermissionResult {
    return {
      canSend: false,
      canSendAnonymous: false,
      canAttachFiles: false,
      canMentionUsers: false,
      canUseHighPriority: false,
      reason
    };
  }
}
