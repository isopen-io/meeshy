/**
 * Service de gestion des messages - Version simplifiée Phase 2.2
 * 
 * Centralise la logique de messaging avec les champs disponibles dans le schéma
 */

import { PrismaClient, Message } from '@meeshy/shared/prisma/client';
import type {
  MessageRequest,
  MessageResponse,
  MessageValidationResult,
  MessagePermissionResult,
  MessageResponseMetadata,
  AuthenticationContext,
  AuthenticationType
} from '@meeshy/shared/types';
import { TranslationService } from './TranslationService';
import { conversationStatsService } from './ConversationStatsService';
import { TrackingLinkService } from './TrackingLinkService';
import { MentionService } from './MentionService';
import { NotificationService } from './NotificationService';
import { MessageReadStatusService } from './MessageReadStatusService';

export class MessagingService {
  private trackingLinkService: TrackingLinkService;
  private mentionService: MentionService;
  private notificationService?: NotificationService;
  private readStatusService: MessageReadStatusService;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly translationService: TranslationService,
    notificationService?: NotificationService
  ) {
    this.trackingLinkService = new TrackingLinkService(prisma);
    this.mentionService = new MentionService(prisma);
    this.notificationService = notificationService;
    this.readStatusService = new MessageReadStatusService(prisma);
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
    // Déterminer le type d'authentification
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
      // Fallback: détecter selon le format du senderId
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
      
      // Enrichir la requête avec le contexte d'authentification
      const enrichedRequest: MessageRequest = {
        ...request,
        authContext,
        isAnonymous: authContext.isAnonymous  // Override pour compatibilité
      };

      // 2. Validation de la requête
      const validationResult = await this.validateRequest(enrichedRequest);
      if (!validationResult.isValid) {
        return this.createErrorResponse(validationResult.errors[0].message, requestId);
      }

      // 3. Résolution de l'ID de conversation
      const conversationId = await this.resolveConversationId(enrichedRequest.conversationId);
      if (!conversationId) {
        return this.createErrorResponse('Conversation non trouvée', requestId);
      }

      // 4. Vérification des permissions avec contexte d'authentification
      const permissionResult = await this.checkPermissions(
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

      // 4. Détection de langue automatique si nécessaire
      const originalLanguage = enrichedRequest.originalLanguage || await this.detectLanguage(enrichedRequest.content);

      // 5. Déterminer les IDs pour la sauvegarde selon le type d'authentification
      let actualSenderId: string | undefined = undefined;
      let actualAnonymousSenderId: string | undefined = undefined;

      if (authContext.isAnonymous) {
        // Récupérer l'ID de l'AnonymousParticipant via le sessionToken
        const identifier = authContext.sessionToken || senderId;
        
        const anonymousParticipant = await this.prisma.anonymousParticipant.findFirst({
          where: {
            sessionToken: identifier,
            conversationId: conversationId,
            isActive: true
          },
          select: { id: true }
        });

        if (anonymousParticipant) {
          actualAnonymousSenderId = anonymousParticipant.id;
        } else {
          throw new Error('Participant anonyme non trouvé pour la sauvegarde');
        }
      } else {
        // Utilisateur enregistré - utiliser l'ID depuis le JWT
        actualSenderId = authContext.userId || senderId;
      }

      // 6. Sauvegarde du message en base avec les bons IDs
      const message = await this.saveMessage({
        ...request,
        originalLanguage,
        conversationId,
        senderId: actualSenderId,
        anonymousSenderId: actualAnonymousSenderId,
        mentionedUserIds: request.mentionedUserIds
      });

      // 7. Mise à jour de la conversation
      await this.updateConversation(conversationId);

      // 8. Marquer comme reçu ET lu pour l'expéditeur (User ou AnonymousParticipant)
      // L'expéditeur est considéré comme ayant lu son propre message
      await this.readStatusService.markMessagesAsRead(
        actualSenderId || actualAnonymousSenderId || senderId,
        conversationId,
        message.id
      );

      // 9. Queue de traduction (async)
      const translationStatus = await this.queueTranslation(message, originalLanguage);

      // 10. Mise à jour des statistiques (async)
      const stats = await this.updateStats(conversationId, originalLanguage);

      // 11. Génération de la réponse unifiée
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
   * Validation complète d'une requête de message
   */
  private async validateRequest(request: MessageRequest): Promise<MessageValidationResult> {
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

    if (request.content && request.content.length > 2000) {
      errors.push({
        field: 'content',
        message: 'Message content cannot exceed 2000 characters',
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
   * PHASE 3.1.1: Support authentication context robuste
   */
  private async checkPermissions(
    authContext: AuthenticationContext,
    conversationId: string,
    request: MessageRequest
  ): Promise<MessagePermissionResult> {
    try {
      // Résoudre l'ID de conversation d'abord
      const resolvedConversationId = await this.resolveConversationId(request.conversationId);
      if (!resolvedConversationId) {
        return {
          canSend: false,
          canSendAnonymous: false,
          canAttachFiles: false,
          canMentionUsers: false,
          canUseHighPriority: false,
          reason: 'Conversation non trouvée'
        };
      }

      // Récupérer les informations de la conversation
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: resolvedConversationId },
        select: { type: true, identifier: true }
      });

      if (!conversation) {
        return {
          canSend: false,
          canSendAnonymous: false,
          canAttachFiles: false,
          canMentionUsers: false,
          canUseHighPriority: false,
          reason: 'Conversation non trouvée'
        };
      }

      // Cas spécial : conversation globale
      if (conversation.type === 'global') {
        return {
          canSend: true,
          canSendAnonymous: authContext.isAnonymous,
          canAttachFiles: !authContext.isAnonymous, // Seuls les enregistrés peuvent attacher dans les conversations globales
          canMentionUsers: !authContext.isAnonymous,
          canUseHighPriority: false
        };
      }

      if (authContext.isAnonymous) {
        // LOGIQUE ANONYME: Vérifier via AnonymousParticipant et ShareLink
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
          return {
            canSend: false,
            reason: 'Utilisateur anonyme non autorisé dans cette conversation ou lien invalide'
          };
        }

        const shareLink = anonymousParticipant.shareLink;

        // Vérifier si le lien est toujours actif et valide
        if (!shareLink.isActive) {
          return {
            canSend: false,
            reason: 'Le lien de partage a été désactivé'
          };
        }

        // Vérifier la date d'expiration
        if (shareLink.expiresAt && shareLink.expiresAt < new Date()) {
          return {
            canSend: false,
            reason: 'Le lien de partage a expiré'
          };
        }

        // Vérifier les limites d'utilisation
        if (shareLink.maxUses && shareLink.currentUses >= shareLink.maxUses) {
          return {
            canSend: false,
            reason: 'Limite d\'utilisation du lien atteinte'
          };
        }

        // Vérifier les permissions spécifiques du lien pour l'envoi de messages
        if (!shareLink.allowAnonymousMessages) {
          return {
            canSend: false,
            reason: 'Ce lien ne permet pas l\'envoi de messages'
          };
        }

        // Vérifier les permissions spécifiques du participant
        if (!anonymousParticipant.canSendMessages) {
          return {
            canSend: false,
            reason: 'Vos permissions d\'envoi de messages ont été révoquées'
          };
        }

        // Permissions accordées selon le lien et les capacités du participant
        return {
          canSend: true,
          canSendAnonymous: true,
          canAttachFiles: shareLink.allowAnonymousFiles && anonymousParticipant.canSendFiles,
          canMentionUsers: false, // Les anonymes ne peuvent pas mentionner par défaut
          canUseHighPriority: false,
          restrictions: {
            maxContentLength: 1000, // Limite pour anonymes
            maxAttachments: shareLink.allowAnonymousFiles ? 5 : 0,
            allowedAttachmentTypes: shareLink.allowAnonymousFiles ? 
              (shareLink.allowAnonymousImages ? ['image', 'file'] : ['file']) : [],
            rateLimitRemaining: 20 // Rate limit pour anonymes
          }
        };
      } else {
        // LOGIQUE UTILISATEUR ENREGISTRÉ: Vérifier via ConversationMember
        const userId = authContext.userId!;
        
        const membership = await this.prisma.conversationMember.findFirst({
          where: {
            conversationId,
            userId,
            isActive: true
          }
        });

      if (!membership) {
        return {
          canSend: false,
          reason: 'Vous n\'êtes pas membre de cette conversation'
        };
      }

      // Récupérer les infos de la conversation pour les permissions
      const conversation = await this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { type: true }
      });

      if (!conversation) {
        return {
          canSend: false,
          reason: 'Conversation non trouvée'
        };
      }

        return {
          canSend: membership.canSendMessage,
          canSendAnonymous: false,
          canAttachFiles: membership.canSendFiles,
          canMentionUsers: true,
          canUseHighPriority: conversation.type !== 'public',
          restrictions: {
            maxContentLength: 2000,
            maxAttachments: 100,
            allowedAttachmentTypes: ['image', 'file', 'audio', 'video'],
            rateLimitRemaining: 100
          }
        };
      }

    } catch (error) {
      console.error('[MessagingService] Error checking permissions:', error);
      console.error('[MessagingService] Auth context:', {
        type: authContext.type,
        isAnonymous: authContext.isAnonymous,
        userId: authContext.userId,
        sessionToken: authContext.sessionToken ? 'present' : 'missing'
      });
      console.error('[MessagingService] Conversation ID:', conversationId);
      console.error('[MessagingService] Request:', {
        conversationId: request.conversationId,
        isAnonymous: request.isAnonymous,
        contentLength: request.content?.length
      });
      
      return {
        canSend: false,
        reason: `Erreur lors de la vérification des permissions: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
      };
    }
  }

  /**
   * Résout l'ID de conversation réel à partir de différents formats
   */
  private async resolveConversationId(identifier: string): Promise<string | null> {
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
  private async detectLanguage(content: string): Promise<string> {
    try {
      // TODO: Implémenter détection via service de traduction
      // Pour l'instant, return default français
      return 'fr';
    } catch (error) {
      console.error('[UnifiedMessageHandler] Language detection failed:', error);
      return 'fr'; // Fallback
    }
  }

  /**
   * Traite les liens dans le contenu du message selon les règles suivantes:
   * - Règle 1: Markdown [texte](url) → Lien normal (pas de tracking)
   * - Règle 2: URLs brutes → Aucun tracking automatique
   * - Règle 3: [[url]] → Force le tracking → m+token
   * - Règle 4: <url> → Force le tracking → m+token
   */
  private async processLinksInContent(
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

          // Check if we already processed this URL in this message
          if (urlTokenMap.has(url)) {
            token = urlTokenMap.get(url)!;
            console.log(`[MessagingService] Reusing token ${token} for duplicate URL in same message: ${url}`);
          } else {
            // Find or create tracking link
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
          console.error(`[MessagingService] ❌ Erreur lors du traitement du lien [[url]]:`, linkError);
          // En cas d'erreur, remplacer par l'URL sans les doubles crochets
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

          // Check if we already processed this URL in this message
          if (urlTokenMap.has(url)) {
            token = urlTokenMap.get(url)!;
            console.log(`[MessagingService] Reusing token ${token} for duplicate URL in same message: ${url}`);
          } else {
            // Find or create tracking link
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
          console.error(`[MessagingService] ❌ Erreur lors du traitement du lien <url>:`, linkError);
          // En cas d'erreur, remplacer par l'URL sans les chevrons
          processedContent = processedContent.replace(fullMatch, url);
        }
      }

      // ÉTAPE 4: Règle 2 - Les URLs brutes ne sont PAS trackées automatiquement
      // On ne fait rien, elles restent telles quelles

      // ÉTAPE 5: Restaurer les liens markdown protégés
      for (const { placeholder, original } of protectedItems) {
        processedContent = processedContent.replace(placeholder, original);
      }

      return processedContent;
    } catch (error) {
      console.error('[MessagingService] Erreur lors du traitement des liens:', error);
      return content;
    }
  }

  /**
   * Sauvegarde du message en base avec toutes les relations
   */
  private async saveMessage(data: {
    conversationId: string;
    senderId?: string;
    anonymousSenderId?: string;
    content: string;
    originalLanguage: string;
    messageType?: string;
    replyToId?: string;
    encrypted?: boolean;
    mentionedUserIds?: readonly string[];  // IDs des utilisateurs mentionnés depuis le frontend
  }): Promise<Message> {
    // ÉTAPE 1: Traiter les liens AVANT de sauvegarder le message
    const processedContent = await this.processLinksInContent(
      data.content,
      data.conversationId,
      data.senderId || data.anonymousSenderId,
      undefined // messageId sera mis à jour après création
    );

    // ÉTAPE 2: Créer le message avec le contenu traité
    const message = await this.prisma.message.create({
      data: {
        conversationId: data.conversationId,
        senderId: data.senderId,
        anonymousSenderId: data.anonymousSenderId,
        content: processedContent.trim(),
        originalLanguage: data.originalLanguage,
        messageType: data.messageType || 'text',
        replyToId: data.replyToId
        // Note: priority et encrypted ne sont pas dans le schéma actuel
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
            metadata: true, // IMPORTANT: Inclure audioEffectsTimeline et autres métadonnées
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

    // ÉTAPE 3: Mettre à jour les liens de tracking avec le messageId
    if (processedContent !== data.content) {
      try {
        // Extraire tous les tokens Meeshy du contenu modifié
        const meeshyTokenRegex = /m\+([a-zA-Z0-9+\-_=]{6})/gi;
        const matches = processedContent.matchAll(meeshyTokenRegex);

        for (const match of matches) {
          const token = match[1];
          try {
            // Mettre à jour le lien de tracking avec le messageId
            await this.prisma.trackingLink.updateMany({
              where: {
                token,
                conversationId: data.conversationId,
                messageId: null // Seulement ceux qui n'ont pas encore de messageId
              },
              data: { messageId: message.id }
            });
          } catch (updateError) {
            console.error(`[MessagingService] Erreur lors de la mise à jour du messageId pour le token ${token}:`, updateError);
          }
        }
      } catch (error) {
        console.error('[MessagingService] Erreur lors de la mise à jour des messageIds:', error);
      }
    }

    // ÉTAPE 4: Traiter les mentions d'utilisateurs
    try {
      console.log('[MessagingService] ÉTAPE 4: Début traitement mentions');

      let mentionedUserIds: string[] = [];
      let validatedUsernames: string[] = [];

      // NOUVEAU : Utiliser les mentions envoyées par le frontend si disponibles
      if (data.mentionedUserIds && data.mentionedUserIds.length > 0) {
        console.log('[MessagingService] ✨ Utilisation mentions depuis frontend:', data.mentionedUserIds);
        mentionedUserIds = Array.from(data.mentionedUserIds); // Convertir readonly en array
        console.log('[MessagingService] senderId:', data.senderId);
      } else {
        // LEGACY : Parser le contenu pour extraire les mentions (compatibilité)
        console.log('[MessagingService] Content pour extraction:', processedContent);
        const mentionedUsernames = this.mentionService.extractMentions(processedContent);
        console.log('[MessagingService] Mentions extraites (legacy):', mentionedUsernames);
        console.log('[MessagingService] senderId:', data.senderId);

        if (mentionedUsernames.length > 0 && data.senderId) {
          console.log('[MessagingService] → Résolution des usernames...');
          // Résoudre les usernames en utilisateurs réels
          const userMap = await this.mentionService.resolveUsernames(mentionedUsernames);
          console.log('[MessagingService] UserMap size:', userMap.size);
          mentionedUserIds = Array.from(userMap.values()).map(user => user.id);
          console.log('[MessagingService] UserIds trouvés:', mentionedUserIds);

          // Extraire les usernames validés pour le champ validatedMentions
          validatedUsernames = Array.from(userMap.keys());
        }
      }

      if (mentionedUserIds.length > 0 && data.senderId) {
        console.log('[MessagingService] → Validation des permissions...');
        // Valider les permissions de mention
        const validationResult = await this.mentionService.validateMentionPermissions(
          data.conversationId,
          mentionedUserIds,
          data.senderId
        );
        console.log('[MessagingService] Validation result:', {
          isValid: validationResult.isValid,
          validUserIdsCount: validationResult.validUserIds.length,
          errors: validationResult.errors
        });

        if (validationResult.validUserIds.length > 0) {
          console.log('[MessagingService] → Création des mentions en DB...');
          // Créer les entrées de mention dans la DB
          await this.mentionService.createMentions(
            message.id,
            validationResult.validUserIds
          );

          // Récupérer les usernames des utilisateurs validés pour le champ validatedMentions
          let finalValidatedUsernames: string[] = validatedUsernames;

          // Si mentions depuis frontend, récupérer les usernames depuis les IDs
          if (data.mentionedUserIds && data.mentionedUserIds.length > 0) {
            const users = await this.prisma.user.findMany({
              where: {
                id: { in: validationResult.validUserIds }
              },
              select: { username: true }
            });
            finalValidatedUsernames = users.map(u => u.username);
          }

          console.log('[MessagingService] → Mise à jour du message avec validatedMentions:', finalValidatedUsernames);

          // Mettre à jour le message avec les usernames validés (scalable avec millions d'users)
          await this.prisma.message.update({
            where: { id: message.id },
            data: { validatedMentions: finalValidatedUsernames }
          });

          // IMPORTANT: Mettre à jour l'objet message en mémoire pour que le retour inclue validatedMentions
          message.validatedMentions = finalValidatedUsernames;

          console.log(`[MessagingService] ✅ ${validationResult.validUserIds.length} mention(s) créée(s) pour le message ${message.id}`);

          // Déclencher les notifications de mention
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
          console.warn(`[MessagingService] ⚠️ Certaines mentions invalides:`, validationResult.errors);
        }
      } else {
        console.log('[MessagingService] ℹ️ Aucune mention à traiter:', {
          mentionCount: mentionedUserIds.length,
          hasSenderId: !!data.senderId
        });
      }
    } catch (mentionError) {
      console.error('[MessagingService] ❌ Erreur lors du traitement des mentions:', mentionError);
      // Ne pas bloquer l'envoi du message si les mentions échouent
    }

    // Convertir au format unifié avec timestamp
    return {
      ...message,
      timestamp: message.createdAt,
      // Tous les autres champs sont déjà compatibles
    } as Message;
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
   * Expose le service de statuts de lecture pour utilisation externe
   */
  public getReadStatusService(): MessageReadStatusService {
    return this.readStatusService;
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
        languagesRequested: [], // TODO: Déterminer depuis participants
        languagesCompleted: [],
        languagesFailed: [],
        estimatedCompletionTime: 1000 // 1 seconde
      };

    } catch (error) {
      console.error('[UnifiedMessageHandler] Error queuing translation:', error);
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
      // Note: ConversationStats du service existant ne correspond pas à notre interface
      // On utilise any pour l'instant et on retourne juste undefined
      return await conversationStatsService.updateOnNewMessage(
        this.prisma,
        conversationId,
        language,
        () => [] // TODO: Récupérer les langues des participants
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
        recipientCount: 1, // TODO: Calculer depuis participants
        deliveredCount: 1,
        readCount: 1
      },
      performance: {
        processingTime,
        dbQueryTime: processingTime * 0.6, // Estimation
        translationQueueTime: processingTime * 0.2,
        validationTime: processingTime * 0.1
      },
      context: {
        isFirstMessage: false, // TODO: Vérifier
        triggerNotifications: true,
        mentionedUsers: this.extractMentions(message.content),
        containsLinks: this.containsLinks(message.content)
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
      data: null as any, // Sera géré par le type union
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
   * Envoie les notifications de mention à tous les utilisateurs mentionnés
   */
  private async sendMentionNotifications(
    mentionedUserIds: string[],
    senderId: string,
    conversationId: string,
    messageId: string,
    messageContent: string
  ): Promise<void> {
    if (!this.notificationService) {
      return;
    }

    try {
      // Récupérer les informations de l'expéditeur
      const sender = await this.prisma.user.findUnique({
        where: { id: senderId },
        select: {
          username: true,
          avatar: true
        }
      });

      if (!sender) {
        console.error('[MessagingService] Sender not found for mention notifications');
        return;
      }

      // Récupérer les informations de la conversation
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
        console.error('[MessagingService] Conversation not found for mention notifications');
        return;
      }

      // Récupérer les attachments du message
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
        console.error('[MessagingService] Erreur récupération attachments pour mention:', err);
      }

      const memberIds = conversation.members.map(m => m.userId);

      // PERFORMANCE: Créer toutes les notifications de mention en batch (une seule query)
      try {
        const count = await this.notificationService.createMentionNotificationsBatch(
          mentionedUserIds,
          {
            senderId,
            senderUsername: sender.username,
            senderAvatar: sender.avatar || undefined,
            messageContent,
            conversationId,
            conversationTitle: conversation.title,
            messageId,
            attachments: messageAttachments.length > 0 ? messageAttachments : undefined
          },
          memberIds
        );

        console.log(`[MessagingService] 📩 ${count} notifications de mention créées en batch`);
      } catch (notifError) {
        console.error('[MessagingService] Erreur lors de l\'envoi des notifications de mention en batch:', notifError);
      }
    } catch (error) {
      console.error('[MessagingService] Erreur lors de l\'envoi des notifications de mention:', error);
    }
  }

  /**
   * Utilitaires
   */
  private generateRequestId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  private extractMentions(content: string): string[] {
    return this.mentionService.extractMentions(content);
  }

  private containsLinks(content: string): boolean {
    return /https?:\/\/[^\s]+/.test(content);
  }
}
