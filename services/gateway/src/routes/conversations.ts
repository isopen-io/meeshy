import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { TranslationService } from '../services/TranslationService';
import { TrackingLinkService } from '../services/TrackingLinkService';
import { AttachmentService } from '../services/AttachmentService';
import { conversationStatsService } from '../services/ConversationStatsService';
import { UserRoleEnum, ErrorCode } from '@meeshy/shared/types';
import { createError, sendErrorResponse } from '@meeshy/shared/utils/errors';
import { ConversationSchemas, validateSchema } from '@meeshy/shared/utils/validation';
import {
  resolveUserLanguage,
  generateConversationIdentifier as sharedGenerateConversationIdentifier,
  isValidMongoId,
  generateDefaultConversationTitle
} from '@meeshy/shared/utils/conversation-helpers';
import { createUnifiedAuthMiddleware, UnifiedAuthRequest } from '../middleware/auth';
import { messageValidationHook } from '../middleware/rate-limiter';
import { validatePagination, buildPaginationMeta } from '../utils/pagination';
import {
  conversationSchema,
  conversationMinimalSchema,
  conversationParticipantSchema,
  conversationSettingsSchema,
  createConversationRequestSchema,
  updateConversationRequestSchema,
  conversationListResponseSchema,
  conversationResponseSchema,
  errorResponseSchema,
  messageSchema
} from '@meeshy/shared/types/api-schemas';

/**
 * Vérifie si un utilisateur peut accéder à une conversation
 * @param prisma - Instance Prisma
 * @param authContext - Contexte d'authentification
 * @param conversationId - ID de la conversation
 * @param conversationIdentifier - Identifiant de la conversation (peut avoir le préfixe mshy_)
 * @returns Promise<boolean>
 */
async function canAccessConversation(
  prisma: any,
  authContext: any,
  conversationId: string,
  conversationIdentifier: string
): Promise<boolean> {
  // Si l'utilisateur n'est pas authentifié (pas de session token, pas de JWT token), aucun accès
  if (!authContext.isAuthenticated) {
    return false;
  }
  
  // Cas spécial : conversation globale "meeshy" - vérifier l'appartenance
  if (conversationIdentifier === "meeshy" || conversationId === "meeshy") {
    // Pour la conversation meeshy, vérifier que l'utilisateur est membre
    if (authContext.isAnonymous) {
      // Les utilisateurs anonymes n'ont pas accès à la conversation globale meeshy
      return false;
    } else {
      // Vérifier l'appartenance à la conversation meeshy
      const membership = await prisma.conversationMember.findFirst({
        where: {
          conversationId: conversationId,
          userId: authContext.userId,
          isActive: true
        }
      });

      return !!membership;
    }
  }
  
  if (authContext.isAnonymous) {
    // Utilisateurs anonymes authentifiés : vérifier l'accès via liens d'invitation
    // Le userId pour les anonymes est l'ID du participant anonyme
    const anonymousAccess = await prisma.anonymousParticipant.findFirst({
      where: {
        id: authContext.userId,
        isActive: true,
        conversationId: conversationId
      }
    });
    return !!anonymousAccess;
  } else {
    // Vérifier le préfixe mshy_ pour les identifiants de conversation
    if (conversationIdentifier.startsWith('mshy_')) {
      // Identifiant avec préfixe mshy_ - résoudre l'ID réel
      const conversation = await prisma.conversation.findFirst({
        where: {
          OR: [
            { id: conversationId },
            { identifier: conversationIdentifier }
          ]
        }
      });
      
      if (!conversation) {
        return false;
      } else {
        // Vérifier l'appartenance à la conversation
        const membership = await prisma.conversationMember.findFirst({
          where: {
            conversationId: conversation.id,
            userId: authContext.userId,
            isActive: true
          }
        });
        return !!membership;
      }
    } else {
      // Identifiant direct - vérifier l'appartenance à la conversation
      const membership = await prisma.conversationMember.findFirst({
        where: {
          conversationId: conversationId,
          userId: authContext.userId,
          isActive: true
        }
      });
      return !!membership;
    }
  }
}

// Fonction utilitaire pour générer le linkId avec le format demandé
// Étape 1: génère yymmddhhm_<random>
// Étape 2: sera mis à jour avec mshy_<conversationShareLink.Id>.yymmddhhm_<random> après création
function generateInitialLinkId(): string {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const hour = now.getHours().toString().padStart(2, '0');
  const minute = now.getMinutes().toString().padStart(2, '0');
  
  const timestamp = `${year}${month}${day}${hour}${minute}`;
  const randomSuffix = Math.random().toString(36).slice(2, 10);
  
  return `${timestamp}_${randomSuffix}`;
}

function generateFinalLinkId(conversationShareLinkId: string, initialId: string): string {
  return `mshy_${conversationShareLinkId}.${initialId}`;
}

/**
 * Génère un identifiant unique pour une conversation
 * Format: mshy_<titre_sanitisé>-YYYYMMDDHHMMSS ou mshy_<unique_id>-YYYYMMDDHHMMSS si pas de titre
 * @deprecated Utiliser sharedGenerateConversationIdentifier de shared/utils/conversation-helpers
 */
function generateConversationIdentifier(title?: string): string {
  return sharedGenerateConversationIdentifier(title);
}

/**
 * Vérifie l'unicité d'un identifiant de conversation et génère une variante avec suffixe hexadécimal si nécessaire
 */
async function ensureUniqueConversationIdentifier(prisma: any, baseIdentifier: string): Promise<string> {
  // Si l'identifiant a déjà un suffixe hexadécimal (8 caractères après le dernier tiret)
  const hexPattern = /-[a-f0-9]{8}$/;
  const hasHexSuffix = hexPattern.test(baseIdentifier);
  
  // Si pas de suffixe hex, vérifier l'unicité de l'identifiant tel quel
  let identifier = baseIdentifier;
  
  const existing = await prisma.conversation.findFirst({
    where: { identifier }
  });
  
  if (!existing) {
    return identifier;
  }
  
  // Si l'identifiant existe, ajouter/régénérer un suffixe hexadécimal aléatoire de 4 bytes (8 caractères)
  // Enlever l'ancien suffixe s'il existe
  const baseWithoutSuffix = hasHexSuffix ? baseIdentifier.replace(hexPattern, '') : baseIdentifier;
  
  // Générer un nouveau suffixe hexadécimal
  const crypto = require('crypto');
  const hexSuffix = crypto.randomBytes(4).toString('hex'); // 4 bytes = 8 caractères hex
  
  identifier = `${baseWithoutSuffix}-${hexSuffix}`;
  
  // Vérifier que le nouvel identifiant avec hex suffix n'existe pas non plus
  const existingWithHex = await prisma.conversation.findFirst({
    where: { identifier }
  });
  
  if (!existingWithHex) {
    return identifier;
  }
  
  // Si par une chance extrême le hex existe aussi, régénérer récursivement
  return ensureUniqueConversationIdentifier(prisma, baseWithoutSuffix);
}

/**
 * Vérifie l'unicité d'un identifiant de ConversationShareLink et génère une variante avec timestamp si nécessaire
 */
async function ensureUniqueShareLinkIdentifier(prisma: any, baseIdentifier: string): Promise<string> {
  // Si l'identifiant est vide, générer un identifiant par défaut
  if (!baseIdentifier || baseIdentifier.trim() === '') {
    const timestamp = Date.now().toString();
    const randomPart = Math.random().toString(36).substring(2, 8);
    baseIdentifier = `mshy_link-${timestamp}-${randomPart}`;
  }
  
  let identifier = baseIdentifier.trim();
  
  // Vérifier si l'identifiant existe déjà
  const existing = await prisma.conversationShareLink.findFirst({
    where: { identifier }
  });
  
  if (!existing) {
    return identifier;
  }
  
  // Si l'identifiant existe, ajouter un suffixe timestamp YYYYmmddHHMMSS
  const now = new Date();
  const timestamp = now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0') +
    now.getHours().toString().padStart(2, '0') +
    now.getMinutes().toString().padStart(2, '0') +
    now.getSeconds().toString().padStart(2, '0');
  
  identifier = `${baseIdentifier}-${timestamp}`;
  
  // Vérifier que le nouvel identifiant avec timestamp n'existe pas non plus
  const existingWithTimestamp = await prisma.conversationShareLink.findFirst({
    where: { identifier }
  });
  
  if (!existingWithTimestamp) {
    return identifier;
  }
  
  // Si même avec le timestamp il y a un conflit, ajouter un suffixe numérique
  let counter = 1;
  while (true) {
    const newIdentifier = `${baseIdentifier}-${timestamp}-${counter}`;
    const existingWithCounter = await prisma.conversationShareLink.findFirst({
      where: { identifier: newIdentifier }
    });
    
    if (!existingWithCounter) {
      return newIdentifier;
    }
    
    counter++;
  }
}

// Prisma et TranslationService sont décorés et fournis par le serveur principal


// Fonction utilitaire pour prédire le type de modèle
function getPredictedModelType(textLength: number): 'basic' | 'medium' | 'premium' {
  if (textLength < 20) return 'basic';
  if (textLength <= 100) return 'medium';
  return 'premium';
}

interface EditMessageBody {
  content: string;
  originalLanguage?: string;
}

interface ConversationParams {
  id: string;
}

interface CreateConversationBody {
  type: 'direct' | 'group' | 'public' | 'global';
  title?: string;
  description?: string;
  participantIds?: string[];
  communityId?: string;
  identifier?: string;
}

interface SendMessageBody {
  content: string;
  originalLanguage?: string;
  messageType?: 'text' | 'image' | 'file' | 'system';
  replyToId?: string;
  // Encryption fields
  encryptedContent?: string;
  encryptionMode?: 'e2ee' | 'server' | 'hybrid';
  encryptionMetadata?: Record<string, any>;
  isEncrypted?: boolean;
}

interface MessagesQuery {
  limit?: string;
  offset?: string;
  before?: string; // messageId pour pagination
  include_reactions?: string;
  include_translations?: string;
  include_status?: string;
  include_replies?: string;
}

interface SearchQuery {
  q?: string;
}

export async function conversationRoutes(fastify: FastifyInstance) {
  // Récupérer prisma et le service de traduction décorés par le serveur
  const prisma = fastify.prisma;
  const translationService: TranslationService = (fastify as any).translationService;
  const trackingLinkService = new TrackingLinkService(prisma);
  const attachmentService = new AttachmentService(prisma);
  const socketIOHandler = fastify.socketIOHandler;
  
  // Middleware d'authentification optionnel pour les conversations
  const optionalAuth = createUnifiedAuthMiddleware(prisma, { 
    requireAuth: false, 
    allowAnonymous: true 
  });
  
  // Middleware d'authentification requis pour les conversations
  const requiredAuth = createUnifiedAuthMiddleware(prisma, { 
    requireAuth: true, 
    allowAnonymous: false 
  });

  /**
   * Résout l'ID de conversation réel à partir d'un identifiant (peut être un ObjectID ou un identifier)
   */
  async function resolveConversationId(identifier: string): Promise<string | null> {
    // Si c'est déjà un ObjectID valide (24 caractères hexadécimaux), le retourner directement
    if (isValidMongoId(identifier)) {
      return identifier;
    }

    // Sinon, chercher par le champ identifier
    const conversation = await prisma.conversation.findFirst({
      where: { identifier: identifier }
    });

    return conversation ? conversation.id : null;
  }

  // Route pour vérifier la disponibilité d'un identifiant de conversation
  fastify.get('/conversations/check-identifier/:identifier', {
    schema: {
      description: 'Check if a conversation identifier is available for use',
      tags: ['conversations'],
      summary: 'Check identifier availability',
      params: {
        type: 'object',
        required: ['identifier'],
        properties: {
          identifier: { type: 'string', description: 'Conversation identifier to check' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                available: { type: 'boolean', description: 'Whether the identifier is available' },
                identifier: { type: 'string', description: 'The checked identifier' }
              }
            }
          }
        },
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { identifier } = request.params as { identifier: string };

      // Vérifier si l'identifiant existe déjà
      const existingConversation = await prisma.conversation.findFirst({
        where: {
          identifier: {
            equals: identifier,
            mode: 'insensitive'
          }
        }
      });

      return reply.send({
        success: true,
        data: {
          available: !existingConversation,
          identifier
        }
      });
    } catch (error) {
      console.error('[CONVERSATIONS] Error checking identifier availability:', error);
      return reply.status(500).send({
        success: false,
        error: 'Failed to check identifier availability'
      });
    }
  });

  // Route pour obtenir toutes les conversations de l'utilisateur
  fastify.get<{ Querystring: { limit?: string; offset?: string; includeCount?: string } }>('/conversations', {
    schema: {
      description: 'Get all conversations for the authenticated user with pagination support',
      tags: ['conversations'],
      summary: 'List user conversations',
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'string', description: 'Maximum number of conversations to return (max 50, default 15)' },
          offset: { type: 'string', description: 'Number of conversations to skip for pagination (default 0)' },
          includeCount: { type: 'string', enum: ['true', 'false'], description: 'Include total count of conversations' }
        }
      },
      response: {
        200: conversationListResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [optionalAuth]
  }, async (request: FastifyRequest<{ Querystring: { limit?: string; offset?: string; includeCount?: string } }>, reply) => {
    try {
      const authRequest = request as UnifiedAuthRequest;

      // Vérifier que l'utilisateur est authentifié
      if (!authRequest.authContext.isAuthenticated) {
        return reply.status(403).send({
          success: false,
          error: 'Authentification requise pour accéder aux conversations'
        });
      }

      const userId = authRequest.authContext.userId;

      // Paramètres de pagination (réduit à 15 par défaut pour améliorer la performance)
      const limit = Math.min(parseInt(request.query.limit || '15', 10), 50); // Max 50
      const offset = parseInt(request.query.offset || '0', 10);
      const includeCount = request.query.includeCount === 'true';

      // First, get all valid user IDs to filter orphaned members
      const validUserIds = await prisma.user.findMany({
        select: { id: true }
      }).then(users => new Set(users.map(u => u.id)));

      const conversations = await prisma.conversation.findMany({
        where: {
          OR: [
            // Conversations dont l'utilisateur est membre
            {
              members: {
                some: {
                  userId: userId,
                  isActive: true
                }
              }
            }
          ],
          isActive: true
        },
        skip: offset,
        take: limit,
        select: {
          id: true,
          title: true,
          type: true,
          identifier: true,
          isActive: true,
          createdAt: true,
          lastMessageAt: true,
          banner: true,
          avatar: true,
          communityId: true,
          members: {
            take: 10, // Fetch more to account for filtering orphans
            where: {
              isActive: true
            },
            select: {
              id: true,
              userId: true,
              role: true,
              nickname: true,
              canSendMessage: true,
              canSendFiles: true,
              canSendImages: true,
              canSendVideos: true,
              canSendAudios: true,
              canSendLocations: true,
              canSendLinks: true,
              joinedAt: true,
              isActive: true
            }
          },
          // User preferences (isPinned, isMuted, isArchived)
          userPreferences: {
            where: { userId: userId },
            take: 1,
            select: {
              isPinned: true,
              isMuted: true,
              isArchived: true,
              isDeletedForUser: true
            }
          },
          anonymousParticipants: {
            take: 3, // Réduit à 3 participants anonymes
            where: {
              isActive: true
            },
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              isOnline: true
            }
          },
          messages: {
            where: {
              isDeleted: false
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              content: true,
              createdAt: true,
              senderId: true,
              sender: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  avatar: true
                }
              },
              attachments: {
                select: {
                  id: true,
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
                  metadata: true, // Contient audioEffectsTimeline
                  uploadedBy: true,
                  isAnonymous: true,
                  createdAt: true
                }
              }
            }
          }
        },
        orderBy: { lastMessageAt: 'desc' }
      });

      // Optimisation : Calculer tous les unreadCounts avec le système de curseur
      const conversationIds = conversations.map(c => c.id);

      // Collect all unique member userIds and fetch user data separately (avoids orphan crash)
      const allMemberUserIds = new Set<string>();
      for (const conv of conversations) {
        for (const member of conv.members) {
          if (validUserIds.has(member.userId)) {
            allMemberUserIds.add(member.userId);
          }
        }
      }

      // Fetch user data for all valid member userIds
      const memberUsers = allMemberUserIds.size > 0
        ? await prisma.user.findMany({
            where: { id: { in: Array.from(allMemberUserIds) } },
            select: {
              id: true,
              username: true,
              displayName: true,
              firstName: true,
              lastName: true,
              avatar: true,
              isOnline: true,
              lastActiveAt: true
            }
          })
        : [];
      const userMap = new Map(memberUsers.map(u => [u.id, u]));

      // Utiliser MessageReadStatusService pour calculer les unreadCounts
      const { MessageReadStatusService } = await import('../services/MessageReadStatusService.js');
      const readStatusService = new MessageReadStatusService(prisma);
      const unreadCountMap = await readStatusService.getUnreadCountsForConversations(userId, conversationIds);

      // Compter le nombre total de conversations (optionnel pour performance)
      let totalCount = 0;
      let hasMore = true;

      if (includeCount || offset === 0) {
        totalCount = await prisma.conversation.count({
          where: {
            OR: [
              {
                members: {
                  some: {
                    userId: userId,
                    isActive: true
                  }
                }
              }
            ],
            isActive: true
          }
        });
        hasMore = offset + conversations.length < totalCount;
      } else {
        // Si on ne compte pas, on estime hasMore en vérifiant si on a reçu le nombre limit
        hasMore = conversations.length === limit;
      }

      // Mapper les conversations avec unreadCount et merge user data
      const conversationsWithUnreadCount = conversations.map((conversation) => {
        const unreadCount = unreadCountMap.get(conversation.id) || 0;

        // Filter out orphaned members and merge user data
        const membersWithUser = conversation.members
          .filter((m: any) => validUserIds.has(m.userId))
          .slice(0, 5) // Limit to 5 members as originally intended
          .map((m: any) => ({
            ...m,
            user: userMap.get(m.userId) || null
          }));

        // S'assurer qu'un titre existe toujours
        const displayTitle = conversation.title && conversation.title.trim() !== ''
          ? conversation.title
          : generateDefaultConversationTitle(
              membersWithUser.map((m: any) => ({
                id: m.userId,
                displayName: m.user?.displayName,
                username: m.user?.username,
                firstName: m.user?.firstName,
                lastName: m.user?.lastName
              })),
              userId
            );

        return {
          ...conversation,
          members: membersWithUser,
          title: displayTitle,
          lastMessage: conversation.messages[0] || null,
          unreadCount
        };
      });

      reply.send({
        success: true,
        data: conversationsWithUnreadCount,
        pagination: {
          limit,
          offset,
          total: totalCount,
          hasMore
        }
      });

    } catch (error) {
      console.error('[GATEWAY] Error fetching conversations:', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur lors de la récupération des conversations'
      });
    }
  });

  // Route pour obtenir une conversation par ID
  fastify.get<{ Params: ConversationParams }>('/conversations/:id', {
    schema: {
      description: 'Get a specific conversation by ID including participants, settings, and last message',
      tags: ['conversations'],
      summary: 'Get conversation details',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      response: {
        200: conversationResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [optionalAuth]
  }, async (request, reply) => {
    try {
      const authRequest = request as UnifiedAuthRequest;
      
      // Vérifier que l'utilisateur est authentifié
      if (!authRequest.authContext.isAuthenticated) {
        return reply.status(403).send({
          success: false,
          error: 'Authentification requise pour accéder à cette conversation'
        });
      }
      
      const { id } = request.params;
      const userId = authRequest.authContext.userId;

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(id);
      if (!conversationId) {
        return reply.status(404).send({
          success: false,
          error: 'Conversation not found'
        });
      }

      // Vérifier les permissions d'accès
      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);

      if (!canAccess) {
          return reply.status(403).send({
          success: false,
          error: 'Unauthorized access to this conversation'
        });
      }

      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                  isOnline: true,
                  lastActiveAt: true,
                  role: true
                }
              }
            }
          },
          userPreferences: {
            where: { userId: authRequest.authContext.userId },
            take: 1
          }
        }
      });

      if (!conversation) {
        return reply.status(404).send({
          success: false,
          error: 'Conversation not found'
        });
      }

      // S'assurer qu'un titre existe toujours
      const displayTitle = conversation.title && conversation.title.trim() !== ''
        ? conversation.title
        : generateDefaultConversationTitle(
            conversation.members.map((m: any) => ({
              id: m.userId,
              displayName: m.user?.displayName,
              username: m.user?.username,
              firstName: m.user?.firstName,
              lastName: m.user?.lastName
            })),
            userId
          );

      // Ajouter les statistiques de conversation dans les métadonnées (via cache 1h)
      const stats = await conversationStatsService.getOrCompute(
        prisma,
        id,
        () => [] // REST ne connaît pas les sockets ici; la partie onlineUsers sera vide si non connue par cache
      );

      // Marquer automatiquement toutes les notifications de cette conversation comme lues
      try {
        const notificationsMarked = await prisma.notification.updateMany({
          where: {
            userId,
            conversationId,
            isRead: false
          },
          data: { isRead: true }
        });

        if (notificationsMarked.count > 0) {
          fastify.log.info(`✅ Auto-marqué ${notificationsMarked.count} notification(s) comme lues pour conversation ${conversationId}, userId ${userId}`);
        }
      } catch (notifError) {
        // Ne pas bloquer la réponse si le marquage des notifications échoue
        console.error(`❌ Erreur lors du marquage auto des notifications pour conversation ${conversationId}:`, notifError);
      }

      reply.send({
        success: true,
        data: {
          ...conversation,
          title: displayTitle,
          meta: {
            conversationStats: stats
          }
        }
      });

    } catch (error) {
      console.error('[GATEWAY] Error fetching conversation:', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur lors de la récupération de la conversation'
      });
    }
  });

  // Route pour créer une nouvelle conversation
  fastify.post<{ Body: CreateConversationBody }>('/conversations', {
    schema: {
      description: 'Create a new conversation (direct, group, or public) with specified participants',
      tags: ['conversations'],
      summary: 'Create conversation',
      body: createConversationRequestSchema,
      response: {
        200: conversationResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [optionalAuth]
  }, async (request, reply) => {
    try {
      // Valider les données avec Zod
      const validatedData = validateSchema(
        ConversationSchemas.create,
        request.body,
        'create-conversation'
      );
      
      const { type, title, description, participantIds = [], communityId, identifier } = validatedData;
      
      // Utiliser le nouveau système d'authentification unifié
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        throw createError(ErrorCode.UNAUTHORIZED, 'Authentication required to create conversation');
      }
      
      const userId = authContext.userId;

      // Prevent creating conversation with oneself
      if (type === 'direct' && participantIds.length === 1 && participantIds[0] === userId) {
        throw createError(ErrorCode.INVALID_OPERATION, 'Vous ne pouvez pas créer une conversation avec vous-même');
      }

      // Also check if userId is in participantIds (in case of manipulation)
      if (participantIds.includes(userId)) {
        throw createError(ErrorCode.INVALID_OPERATION, 'Vous ne devez pas vous inclure dans la liste des participants');
      }

      // Note: La validation de l'identifier est maintenant gérée par CommonSchemas.conversationIdentifier dans Zod

      // Validate community access if communityId is provided
      if (communityId) {
        const community = await prisma.community.findFirst({
          where: { id: communityId },
          include: { members: true }
        });

        if (!community) {
          return reply.status(404).send({
            success: false,
            error: 'Communauté non trouvée'
          });
        }

        // Check if user is member of the community
        const isMember = community.createdBy === userId || 
                        community.members.some(member => member.userId === userId);
        
        if (!isMember) {
          return reply.status(403).send({
            success: false,
            error: 'Vous devez être membre de cette communauté pour y créer une conversation'
          });
        }
      }

      // Generate identifier
      let finalIdentifier: string;
      if (identifier) {
        // Use custom identifier with mshy_ prefix
        finalIdentifier = `mshy_${identifier}`;
        // Ensure uniqueness
        finalIdentifier = await ensureUniqueConversationIdentifier(prisma, finalIdentifier);
      } else {
        // Generate automatic identifier
        const identifierTitle = type === 'direct' ? `direct-${userId}-${participantIds[0] || 'unknown'}` : title;
        const baseIdentifier = generateConversationIdentifier(identifierTitle);
        finalIdentifier = await ensureUniqueConversationIdentifier(prisma, baseIdentifier);
      }

      // S'assurer que participantIds ne contient pas de doublons, n'inclut pas le créateur,
      // et ne contient pas de valeurs null/undefined/empty
      const uniqueParticipantIds = [...new Set(participantIds)]
        .filter((id: any) => id && id !== userId && typeof id === 'string' && id.trim().length > 0);

      const conversation = await prisma.conversation.create({
        data: {
          identifier: finalIdentifier,
          type,
          title,
          description,
          communityId: communityId || null,
          members: {
            create: [
              // Créateur de la conversation
              {
                userId,
                role: UserRoleEnum.CREATOR
              },
              // Autres participants (sans doublons et sans le créateur)
              ...uniqueParticipantIds.map((participantId: string) => ({
                userId: participantId,
                role: UserRoleEnum.MEMBER
              }))
            ]
          }
        },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  avatar: true
                }
              }
            }
          }
        }
      });

      // Si la conversation est créée dans une communauté, ajouter automatiquement 
      // tous les participants à la communauté s'ils n'y sont pas déjà
      if (communityId) {
        const allUserIds = [userId, ...uniqueParticipantIds];
        
        // Récupérer les membres actuels de la communauté
        const existingMembers = await prisma.communityMember.findMany({
          where: {
            communityId,
            userId: { in: allUserIds }
          },
          select: { userId: true }
        });
        
        const existingUserIds = existingMembers.map(member => member.userId);
        const newUserIds = allUserIds.filter(id => !existingUserIds.includes(id));
        
        // Ajouter les nouveaux membres à la communauté
        if (newUserIds.length > 0) {
          await prisma.communityMember.createMany({
            data: newUserIds.map(userId => ({
              communityId,
              userId
            }))
          });
        }
      }

      // S'assurer qu'un titre existe toujours
      const displayTitle = conversation.title && conversation.title.trim() !== ''
        ? conversation.title
        : generateDefaultConversationTitle(
            conversation.members.map((m: any) => ({
              id: m.userId,
              displayName: m.user?.displayName,
              username: m.user?.username,
              firstName: m.user?.firstName,
              lastName: m.user?.lastName
            })),
            userId
          );

      // Envoyer des notifications aux participants invités
      const notificationService = (fastify as any).notificationService;
      if (notificationService && uniqueParticipantIds.length > 0) {
        try {
          // Récupérer les informations du créateur
          const creator = await prisma.user.findUnique({
            where: { id: userId },
            select: {
              username: true,
              displayName: true,
              avatar: true
            }
          });

          if (creator) {
            // Envoyer une notification à chaque participant invité
            for (const participantId of uniqueParticipantIds) {
              await notificationService.createConversationInviteNotification({
                invitedUserId: participantId,
                inviterId: userId,
                inviterUsername: creator.displayName || creator.username,
                inviterAvatar: creator.avatar || undefined,
                conversationId: conversation.id,
                conversationTitle: displayTitle,
                conversationType: type
              });
              console.log(`[GATEWAY] 📩 Notification d'invitation envoyée à ${participantId} pour la conversation ${conversation.id}`);
            }
          }
        } catch (notifError) {
          console.error('[GATEWAY] Erreur lors de l\'envoi des notifications d\'invitation:', notifError);
          // Ne pas bloquer la création de la conversation
        }
      }

      reply.status(201).send({
        success: true,
        data: {
          ...conversation,
          title: displayTitle
        }
      });

    } catch (error) {
      sendErrorResponse(reply, error as Error, 'create-conversation');
    }
  });

  // Route pour obtenir les messages d'une conversation avec pagination
  fastify.get<{
    Params: ConversationParams;
    Querystring: MessagesQuery;
  }>('/conversations/:id/messages', {
    schema: {
      description: 'Get paginated messages from a conversation with optional cursor-based pagination',
      tags: ['conversations', 'messages'],
      summary: 'Get conversation messages',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'string', description: 'Maximum number of messages to return (default 20)' },
          offset: { type: 'string', description: 'Number of messages to skip (default 0)' },
          before: { type: 'string', description: 'Cursor for pagination: get messages before this timestamp' },
          include_reactions: { type: 'string', enum: ['true', 'false'], description: 'Include detailed reactions list (default false). Note: reactionSummary and reactionCount are always included.' },
          include_translations: { type: 'string', enum: ['true', 'false'], description: 'Include translations (default true)' },
          include_status: { type: 'string', enum: ['true', 'false'], description: 'Include per-user read status entries (default false)' },
          include_replies: { type: 'string', enum: ['true', 'false'], description: 'Include replyTo message details (default true)' }
        }
      },
      response: {
        200: {
          type: 'object',
          description: 'MessagesListResponse - aligned with @meeshy/shared/types/api-responses.ts',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              description: 'Array of messages directly',
              items: messageSchema
            },
            pagination: {
              type: 'object',
              description: 'Pagination metadata',
              properties: {
                total: { type: 'integer', description: 'Total number of messages in conversation' },
                offset: { type: 'integer', description: 'Current offset' },
                limit: { type: 'integer', description: 'Page size limit' },
                hasMore: { type: 'boolean', description: 'Whether more messages are available' }
              }
            },
            meta: {
              type: 'object',
              description: 'Response metadata',
              properties: {
                userLanguage: { type: 'string', description: 'User preferred language for translations' }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [optionalAuth]
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const {
        limit: limitStr = '20',
        offset: offsetStr = '0',
        before,
        include_reactions: includeReactionsStr = 'false',
        include_translations: includeTranslationsStr = 'true',
        include_status: includeStatusStr = 'false',
        include_replies: includeRepliesStr = 'true'
      } = request.query;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Parser les paramètres optionnels d'inclusion
      const includeReactions = includeReactionsStr === 'true';
      const includeTranslations = includeTranslationsStr === 'true';
      const includeStatus = includeStatusStr === 'true';
      const includeReplies = includeRepliesStr === 'true';

      // Valider et parser les paramètres de pagination
      const { offset, limit } = validatePagination(offsetStr, limitStr, 50);

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(id);
      if (!conversationId) {
        return reply.status(403).send({
          success: false,
          error: 'Accès non autorisé à cette conversation'
        });
      }

      // Vérifier les permissions d'accès
      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);

      if (!canAccess) {
        return reply.status(403).send({
          success: false,
          error: 'Accès non autorisé à cette conversation'
        });
      }

      // Construire la requête avec pagination
      const whereClause: any = {
        conversationId: conversationId, // Utiliser l'ID résolu
        isDeleted: false
      };

      if (before) {
        // Pagination par curseur (pour défilement historique)
        const beforeMessage = await prisma.message.findFirst({
          where: { id: before },
          select: { createdAt: true }
        });

        if (beforeMessage) {
          whereClause.createdAt = {
            lt: beforeMessage.createdAt
          };
        }
      }

      // Construire le select Prisma dynamiquement selon les paramètres d'inclusion
      // (avant les requêtes pour permettre la parallélisation)
      const messageSelect: any = {
        // ===== CHAMPS DE BASE =====
        id: true,
        content: true,
        originalLanguage: true,
        conversationId: true,
        senderId: true,
        anonymousSenderId: true,
        messageType: true,
        messageSource: true,

        // ===== ÉDITION / SUPPRESSION =====
        isEdited: true,
        editedAt: true,
        isDeleted: true,
        deletedAt: true,

        // ===== REPLY / FORWARD =====
        replyToId: true,
        forwardedFromId: true,
        forwardedFromConversationId: true,

        // ===== VIEW-ONCE / BLUR / EXPIRATION =====
        isViewOnce: true,
        maxViewOnceCount: true,
        viewOnceCount: true,
        isBlurred: true,
        expiresAt: true,

        // ===== ÉPINGLAGE =====
        pinnedAt: true,
        pinnedBy: true,

        // ===== STATUTS AGRÉGÉS (dénormalisés) =====
        deliveredToAllAt: true,
        receivedByAllAt: true,
        readByAllAt: true,
        deliveredCount: true,
        readCount: true,

        // ===== RÉACTIONS (dénormalisées - toujours incluses) =====
        reactionSummary: true,
        reactionCount: true,

        // ===== CHIFFREMENT =====
        isEncrypted: true,
        encryptionMode: true,

        // ===== TIMESTAMPS =====
        createdAt: true,
        updatedAt: true,

        // ===== MENTIONS =====
        validatedMentions: true,

        // ===== RELATIONS OBLIGATOIRES =====
        sender: {
          select: {
            id: true,
            username: true,
            displayName: true,
            avatar: true,
            role: true
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
        _count: {
          select: {
            reactions: true,
            statusEntries: true
          }
        }
      };

      // ===== RELATIONS OPTIONNELLES (selon paramètres include_*) =====
      if (includeTranslations) {
        messageSelect.translations = {
          select: {
            id: true,
            targetLanguage: true,
            translatedContent: true,
            translationModel: true
          }
        };
      }

      if (includeReactions) {
        messageSelect.reactions = {
          select: {
            id: true,
            emoji: true,
            userId: true,
            anonymousId: true,
            createdAt: true
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 20
        };
      }

      if (includeStatus) {
        // Charger les statusEntries détaillés (par utilisateur)
        messageSelect.statusEntries = {
          select: {
            id: true,
            userId: true,
            anonymousId: true,
            deliveredAt: true,
            receivedAt: true,
            readAt: true,
            readDurationMs: true,
            readDevice: true,
            viewedOnceAt: true,
            revealedAt: true,
            createdAt: true,
            updatedAt: true
          }
        };
      }

      if (includeReplies) {
        // Charger les détails du message de réponse
        messageSelect.replyTo = {
          select: {
            id: true,
            content: true,
            originalLanguage: true,
            createdAt: true,
            senderId: true,
            anonymousSenderId: true,
            validatedMentions: true,
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
                lastName: true
              }
            },
            attachments: {
              select: {
                id: true,
                fileName: true,
                mimeType: true,
                fileUrl: true,
                thumbnailUrl: true,
                metadata: true
              },
              take: 3
            },
            _count: {
              select: {
                reactions: true
              }
            }
          }
        };
      }

      // ===== OPTIMISATION: Exécuter les requêtes en parallèle =====
      // Évite le problème N+1 séquentiel (count -> messages -> user)
      const shouldFetchUserPrefs = authRequest.authContext.isAuthenticated && !authRequest.authContext.isAnonymous;
      const isAnonymousUser = authRequest.authContext.isAnonymous;

      const [totalCount, messages, userPrefs] = await Promise.all([
        // 1. Compter le total des messages (pour pagination)
        prisma.message.count({
          where: {
            conversationId: conversationId,
            isDeleted: false
          }
        }),
        // 2. Récupérer les messages avec toutes les relations
        prisma.message.findMany({
          where: whereClause,
          select: messageSelect,
          orderBy: { createdAt: 'desc' },
          take: limit,
          skip: before ? 0 : offset
        }),
        // 3. Récupérer les préférences linguistiques (si authentifié)
        shouldFetchUserPrefs
          ? prisma.user.findFirst({
              where: { id: userId },
              select: {
                systemLanguage: true,
                regionalLanguage: true,
                customDestinationLanguage: true
              }
            })
          : Promise.resolve(null)
      ]);

      // ===== RÉCUPÉRER LES RÉACTIONS DE L'UTILISATEUR CONNECTÉ =====
      // Permet d'afficher les réactions de l'utilisateur sans requête de sync Socket.IO
      let userReactionsMap: Map<string, string[]> = new Map();

      if (authRequest.authContext.isAuthenticated && messages.length > 0) {
        const messageIds: string[] = (messages as any[]).map(m => m.id);

        // Requête pour obtenir les réactions de l'utilisateur sur ces messages
        const userReactions = await prisma.reaction.findMany({
          where: {
            messageId: { in: messageIds },
            ...(isAnonymousUser
              ? { anonymousId: userId }
              : { userId: userId }
            )
          },
          select: {
            messageId: true,
            emoji: true
          }
        });

        // Grouper par messageId
        for (const reaction of userReactions) {
          const existing = userReactionsMap.get(reaction.messageId) || [];
          existing.push(reaction.emoji);
          userReactionsMap.set(reaction.messageId, existing);
        }
      }

      // Déterminer la langue préférée de l'utilisateur
      const userPreferredLanguage = userPrefs
        ? resolveUserLanguage(userPrefs)
        : 'en';

      // DEBUG: Log pour vérifier les attachments et metadata
      if (messages.length > 0) {
        const firstMessage = messages[0] as any;
        if (firstMessage.attachments && firstMessage.attachments.length > 0) {
          const firstAttachment = firstMessage.attachments[0];
          console.log('🔍 [CONVERSATIONS] Premier message avec attachments:', {
            messageId: firstMessage.id,
            attachmentCount: firstMessage.attachments.length,
            firstAttachment: {
              id: firstAttachment.id,
              hasMetadata: !!firstAttachment.metadata,
              metadata: firstAttachment.metadata,
              metadataType: typeof firstAttachment.metadata,
              metadataKeys: firstAttachment.metadata ? Object.keys(firstAttachment.metadata) : [],
              fullAttachment: JSON.stringify(firstAttachment, null, 2)
            }
          });
        }
      }

      // Mapper les messages avec les champs alignés au type GatewayMessage de @meeshy/shared/types
      const mappedMessages = messages.map((message: any) => {
        // Construire l'objet de réponse aligné avec GatewayMessage
        const mappedMessage: any = {
          // Identifiants
          id: message.id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          anonymousSenderId: message.anonymousSenderId,

          // Contenu
          content: message.content,
          originalLanguage: message.originalLanguage || 'fr',
          messageType: message.messageType,
          messageSource: message.messageSource,

          // Édition/Suppression
          isEdited: message.isEdited,
          editedAt: message.editedAt,
          isDeleted: message.isDeleted,
          deletedAt: message.deletedAt,

          // Reply/Forward
          replyToId: message.replyToId,
          forwardedFromId: message.forwardedFromId,
          forwardedFromConversationId: message.forwardedFromConversationId,

          // View-once / Blur / Expiration
          isViewOnce: message.isViewOnce,
          maxViewOnceCount: message.maxViewOnceCount,
          viewOnceCount: message.viewOnceCount,
          isBlurred: message.isBlurred,
          expiresAt: message.expiresAt,

          // Épinglage
          pinnedAt: message.pinnedAt,
          pinnedBy: message.pinnedBy,

          // Statuts agrégés (dénormalisés)
          deliveredToAllAt: message.deliveredToAllAt,
          receivedByAllAt: message.receivedByAllAt,
          readByAllAt: message.readByAllAt,
          deliveredCount: message.deliveredCount,
          readCount: message.readCount,

          // Réactions (dénormalisées - toujours incluses)
          reactionSummary: message.reactionSummary,
          reactionCount: message.reactionCount,
          // Réactions de l'utilisateur connecté (pour affichage instantané sans sync Socket.IO)
          currentUserReactions: userReactionsMap.get(message.id) || [],

          // Chiffrement
          isEncrypted: message.isEncrypted,
          encryptionMode: message.encryptionMode,

          // Timestamps
          createdAt: message.createdAt,
          updatedAt: message.updatedAt,

          // Mentions
          validatedMentions: message.validatedMentions,

          // Relations obligatoires
          sender: message.sender,
          anonymousSender: message.anonymousSender,
          attachments: message.attachments,
          _count: message._count
        };

        // Relations optionnelles (selon paramètres include_*)
        if (includeTranslations && message.translations) {
          mappedMessage.translations = message.translations;
        }
        if (includeReactions && message.reactions) {
          mappedMessage.reactions = message.reactions;
        }
        if (includeStatus && message.statusEntries) {
          mappedMessage.statusEntries = message.statusEntries;
        }
        if (includeReplies && message.replyTo) {
          mappedMessage.replyTo = {
            ...message.replyTo,
            originalLanguage: message.replyTo.originalLanguage || 'fr'
          };
        }

        return mappedMessage;
      });

      // Marquer les messages comme lus (optimisé - ne marquer que les messages non lus)
      if (messages.length > 0 && !authRequest.authContext.isAnonymous) {
        const messageIds = messages.map(m => m.id);

        try {
          // Utiliser le nouveau MessageReadStatusService (système de curseur)
          const { MessageReadStatusService } = await import('../services/MessageReadStatusService.js');
          const readStatusService = new MessageReadStatusService(prisma);

          // Marquer les messages comme reçus (curseur automatiquement placé sur le dernier message)
          await readStatusService.markMessagesAsReceived(userId, conversationId);
        } catch (error) {
          console.warn('[GATEWAY] Error marking messages as received:', error);
        }
      }

      // Construire les métadonnées de pagination standard
      const paginationMeta = buildPaginationMeta(totalCount, offset, limit, messages.length);

      // Format optimisé: data directement = Message[], meta pour userLanguage
      // Aligné avec MessagesListResponse de @meeshy/shared/types
      reply.send({
        success: true,
        data: mappedMessages,
        pagination: paginationMeta,
        meta: {
          userLanguage: userPreferredLanguage
        }
      });

    } catch (error) {
      console.error('[GATEWAY] Error fetching messages:', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur lors de la récupération des messages'
      });
    }
  });

  // Route pour marquer tous les messages d'une conversation comme lus
  fastify.post<{
    Params: ConversationParams;
  }>('/conversations/:id/mark-read', {
    schema: {
      description: 'Mark all messages in a conversation as read for the authenticated user',
      tags: ['conversations', 'messages'],
      summary: 'Mark conversation as read',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                markedCount: { type: 'number', description: 'Number of messages marked as read' }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(id);
      if (!conversationId) {
        return reply.status(403).send({
          success: false,
          error: 'Accès non autorisé à cette conversation'
        });
      }

      // Vérifier les permissions d'accès
      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!canAccess) {
        return reply.status(403).send({
          success: false,
          error: 'Accès non autorisé à cette conversation'
        });
      }

      // Récupérer tous les messages non lus de cette conversation pour cet utilisateur
      const unreadMessages = await prisma.message.findMany({
        where: {
          conversationId: conversationId,
          isDeleted: false,
          senderId: { not: userId }, // Ne pas marquer ses propres messages
          statusEntries: {
            none: {
              userId: userId,
              readAt: { not: null }
            }
          }
        },
        select: {
          id: true
        }
      });

      if (unreadMessages.length === 0) {
        return reply.send({
          success: true,
          data: { message: 'Aucun message non lu à marquer', markedCount: 0 }
        });
      }

      // Marquer tous les messages comme lus (utiliser le nouveau système de curseur)
      try {
        const { MessageReadStatusService } = await import('../services/MessageReadStatusService.js');
        const readStatusService = new MessageReadStatusService(prisma);

        // Marquer comme lu (curseur automatiquement placé sur le dernier message)
        await readStatusService.markMessagesAsRead(userId, conversationId);
      } catch (err) {
        console.warn('[GATEWAY] Error marking messages as read:', err);
      }

      return reply.send({
        success: true,
        data: { message: `${unreadMessages.length} message(s) marqué(s) comme lu(s)`, markedCount: unreadMessages.length }
      });

    } catch (error) {
      console.error('[GATEWAY] Error marking conversation as read:', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur lors du marquage des messages comme lus'
      });
    }
  });

  // Route pour envoyer un message dans une conversation
  fastify.post<{
    Params: ConversationParams;
    Body: SendMessageBody;
  }>('/conversations/:id/messages', {
    schema: {
      description: 'Send a new message to a conversation with optional encryption and attachments',
      tags: ['conversations', 'messages'],
      summary: 'Send message',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', description: 'Message content', minLength: 1 },
          originalLanguage: { type: 'string', description: 'Language code (e.g., fr, en)', default: 'fr' },
          messageType: { type: 'string', enum: ['text', 'image', 'file', 'audio', 'video'], default: 'text' },
          replyToId: { type: 'string', description: 'ID of message being replied to' },
          encryptedContent: { type: 'string', description: 'Encrypted message content' },
          encryptionMode: { type: 'string', enum: ['e2e', 'server'], description: 'Encryption mode' },
          encryptionMetadata: { type: 'object', description: 'Encryption metadata' },
          isEncrypted: { type: 'boolean', description: 'Whether message is encrypted' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'object', description: 'Created message object' }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [optionalAuth],
    preHandler: [messageValidationHook]
  }, async (request, reply) => {
    try {
      const authRequest = request as UnifiedAuthRequest;
      
      // Vérifier que l'utilisateur est authentifié
      if (!authRequest.authContext.isAuthenticated) {
        return reply.status(403).send({
          success: false,
          error: 'Authentification requise pour envoyer des messages'
        });
      }
      
      const { id } = request.params;
      const {
        content,
        originalLanguage = 'fr',
        messageType = 'text',
        replyToId,
        encryptedContent,
        encryptionMode,
        encryptionMetadata,
        isEncrypted
      } = request.body;
      const userId = authRequest.authContext.userId;

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(id);
      if (!conversationId) {
        return reply.status(403).send({
          success: false,
          error: 'Accès non autorisé à cette conversation'
        });
      }

      // Vérifier les permissions d'accès et d'écriture
      let canSend = false;
      
      // Règle simple : seuls les utilisateurs faisant partie de la conversation peuvent y écrire
      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!canAccess) {
        canSend = false;
      } else {
        // Vérifier les permissions d'écriture spécifiques
        if (authRequest.authContext.isAnonymous) {
          // Pour les utilisateurs anonymes, vérifier les permissions d'écriture
          const anonymousParticipant = await prisma.anonymousParticipant.findFirst({
            where: {
              id: authRequest.authContext.userId,
              isActive: true,
              canSendMessages: true
            }
          });
          canSend = !!anonymousParticipant;
        } else {
          // Pour les utilisateurs connectés, l'accès implique l'écriture
          canSend = true;
        }
      }

      if (!canSend) {
        return reply.status(403).send({
          success: false,
          error: 'Vous n\'êtes pas autorisé à envoyer des messages dans cette conversation'
        });
      }

      // Validation du contenu (plaintext ou encrypted)
      if (isEncrypted) {
        // For encrypted messages, validate encrypted content
        if (!encryptedContent || encryptedContent.trim().length === 0) {
          return reply.status(400).send({
            success: false,
            error: 'Encrypted content cannot be empty'
          });
        }
        if (!encryptionMode || !['e2ee', 'server', 'hybrid'].includes(encryptionMode)) {
          return reply.status(400).send({
            success: false,
            error: 'Invalid encryption mode. Must be e2ee, server, or hybrid'
          });
        }
        if (!encryptionMetadata) {
          return reply.status(400).send({
            success: false,
            error: 'Encryption metadata is required for encrypted messages'
          });
        }
      } else {
        // For plaintext messages, validate content
        if (!content || content.trim().length === 0) {
          return reply.status(400).send({
            success: false,
            error: 'Le contenu du message ne peut pas être vide'
          });
        }
      }

      // ÉTAPE 1: Traiter les liens dans le message AVANT la sauvegarde (skip for E2EE)
      let processedContent = content;
      let trackingLinks: any[] = [];

      if (!isEncrypted || encryptionMode !== 'e2ee') {
        const linkResult = await trackingLinkService.processMessageLinks({
          content: content.trim(),
          conversationId,
          createdBy: userId
        });
        processedContent = linkResult.processedContent;
        trackingLinks = linkResult.trackingLinks;
      }

      // ÉTAPE 2: Créer le message avec le contenu transformé
      const messageData: any = {
        conversationId: conversationId,
        senderId: userId,
        content: processedContent,
        originalLanguage,
        messageType,
        replyToId
      };

      // Add encryption fields if message is encrypted
      if (isEncrypted) {
        messageData.isEncrypted = true;
        messageData.encryptedContent = encryptedContent;
        messageData.encryptionMode = encryptionMode;
        messageData.encryptionMetadata = encryptionMetadata;
      }

      const message = await prisma.message.create({
        data: messageData,
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true,
              role: true
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
              }
            }
          }
        }
      });

      // ÉTAPE 3: Mettre à jour les messageIds des TrackingLinks
      if (trackingLinks.length > 0) {
        const tokens = trackingLinks.map(link => link.token);
        await trackingLinkService.updateTrackingLinksMessageId(tokens, message.id);
      }

      // Mettre à jour le timestamp de la conversation
      await prisma.conversation.update({
        where: { id: conversationId }, // Utiliser l'ID résolu
        data: { lastMessageAt: new Date() }
      });

      // Marquer le message comme lu pour l'expéditeur (nouveau système de curseur)
      try {
        const { MessageReadStatusService } = await import('../services/MessageReadStatusService.js');
        const readStatusService = new MessageReadStatusService(prisma);
        await readStatusService.markMessagesAsRead(userId, conversationId, message.id);
      } catch (err) {
        console.warn('[GATEWAY] Error marking message as read for sender:', err);
      }

      // TRAITEMENT DES MENTIONS ET NOTIFICATIONS
      const mentionService = (fastify as any).mentionService;
      const notificationService = (fastify as any).notificationService;

      if (mentionService && notificationService) {
        try {
          console.log('[GATEWAY REST] ===== TRAITEMENT DES MENTIONS =====');

          // Extraire les mentions du contenu
          const mentionedUsernames = mentionService.extractMentions(processedContent);
          console.log('[GATEWAY REST] Mentions extraites:', mentionedUsernames);

          if (mentionedUsernames.length > 0) {
            // Résoudre les usernames en utilisateurs
            const userMap = await mentionService.resolveUsernames(mentionedUsernames);
            const mentionedUserIds = Array.from(userMap.values()).map((user: any) => user.id);
            console.log('[GATEWAY REST] UserIds trouvés:', mentionedUserIds);

            if (mentionedUserIds.length > 0) {
              // Valider les permissions de mention
              const validationResult = await mentionService.validateMentionPermissions(
                conversationId,
                mentionedUserIds,
                userId
              );

              if (validationResult.validUserIds.length > 0) {
                // Créer les mentions en DB
                await mentionService.createMentions(message.id, validationResult.validUserIds);

                // Extraire les usernames validés
                const validatedUsernames = Array.from(userMap.entries())
                  .filter(([_, user]: [string, any]) => validationResult.validUserIds.includes(user.id))
                  .map(([username, _]: [string, any]) => username);

                // Mettre à jour le message avec validatedMentions
                await prisma.message.update({
                  where: { id: message.id },
                  data: { validatedMentions: validatedUsernames }
                });

                // Mettre à jour l'objet message en mémoire
                (message as any).validatedMentions = validatedUsernames;

                console.log(`[GATEWAY REST] ✅ ${validationResult.validUserIds.length} mention(s) créée(s)`);

                // Envoyer les notifications de mention
                const sender = await prisma.user.findUnique({
                  where: { id: userId },
                  select: { username: true, displayName: true, avatar: true }
                });

                if (sender) {
                  const conversation = await prisma.conversation.findUnique({
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

                  if (conversation) {
                    const memberIds = conversation.members.map((m: any) => m.userId);

                    // PERFORMANCE: Créer toutes les notifications de mention en batch
                    const count = await notificationService.createMentionNotificationsBatch(
                      validationResult.validUserIds,
                      {
                        senderId: userId,
                        senderUsername: sender.displayName || sender.username,
                        senderAvatar: sender.avatar || undefined,
                        messageContent: processedContent,
                        conversationId,
                        conversationTitle: conversation.title,
                        messageId: message.id
                      },
                      memberIds
                    );
                    console.log(`[GATEWAY REST] 📩 ${count} notifications de mention créées en batch`);
                  }
                }
              }
            }
          }
        } catch (mentionError) {
          console.error('[GATEWAY REST] Erreur traitement mentions:', mentionError);
          // Ne pas bloquer l'envoi du message
        }
      }

      // Déclencher les traductions via le TranslationService (gère les langues des participants)
      try {
        await translationService.handleNewMessage({
          id: message.id,
          conversationId: conversationId, // Utiliser l'ID résolu
          senderId: userId,
          content: message.content,
          originalLanguage,
          messageType,
          replyToId
        } as any);
      } catch (error) {
        console.error('[GATEWAY] Error queuing translations via TranslationService:', error);
        // Ne pas faire échouer l'envoi du message si la traduction échoue
      }

      // Mettre à jour les stats dans le cache (et les calculer si entrée absente)
      const stats = await conversationStatsService.updateOnNewMessage(
        prisma,
        conversationId, // Utiliser l'ID résolu
        originalLanguage,
        () => []
      );

      reply.status(201).send({
        success: true,
        data: {
          ...message,
          meta: { conversationStats: stats }
        }
      });

    } catch (error) {
      console.error('[GATEWAY] Error sending message:', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur lors de l\'envoi du message'
      });
    }
  });

  // Marquer une conversation comme lue (tous les messages non lus)
  fastify.post<{ Params: ConversationParams }>('/conversations/:id/read', {
    schema: {
      description: 'Mark conversation as read (alias for mark-read endpoint)',
      tags: ['conversations', 'messages'],
      summary: 'Mark as read',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(id);
      if (!conversationId) {
        return reply.status(403).send({
          success: false,
          error: 'Accès non autorisé à cette conversation'
        });
      }

      // Vérifier les permissions d'accès
      let canAccess = false;

      if (id === "meeshy") {
        canAccess = true; // Conversation globale accessible à tous les utilisateurs connectés
      } else {
        const membership = await prisma.conversationMember.findFirst({
          where: { conversationId: conversationId, userId, isActive: true }
        });
        canAccess = !!membership;
      }

      if (!canAccess) {
        return reply.status(403).send({ success: false, error: 'Accès non autorisé à cette conversation' });
      }

      // ✅ FIX: Utiliser uniquement le nouveau système de curseur
      // Pas besoin de compter les messages - on marque simplement comme lu
      const { MessageReadStatusService } = await import('../services/MessageReadStatusService.js');
      const readStatusService = new MessageReadStatusService(prisma);

      // Calculer le nombre de messages non lus AVANT de marquer comme lu
      const unreadCount = await readStatusService.getUnreadCount(userId, conversationId);

      // Marquer la conversation comme lue (déplace le curseur au dernier message)
      await readStatusService.markMessagesAsRead(userId, conversationId);

      reply.send({ success: true, data: { markedCount: unreadCount } });
    } catch (error) {
      console.error('[GATEWAY] Error marking conversation as read:', error);
      reply.status(500).send({ success: false, error: 'Erreur lors du marquage comme lu' });
    }
  });

  // Recherche de conversations accessibles par l'utilisateur courant
  fastify.get<{ Querystring: SearchQuery }>('/conversations/search', {
    schema: {
      description: 'Search conversations by title or participant names',
      tags: ['conversations'],
      summary: 'Search conversations',
      querystring: {
        type: 'object',
        required: ['q'],
        properties: {
          q: { type: 'string', description: 'Search query string', minLength: 1 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: conversationMinimalSchema
            }
          }
        },
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { q } = request.query;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      if (!q || q.trim().length === 0) {
        return reply.send({ success: true, data: [] });
      }

      // Rechercher dans TOUTES les conversations publiques/globales + celles dont l'utilisateur est membre
      const conversations = await prisma.conversation.findMany({
        where: {
          isActive: true,
          AND: [
            {
              OR: [
                { title: { contains: q, mode: 'insensitive' } },
                {
                  members: {
                    some: {
                      user: {
                        OR: [
                          { firstName: { contains: q, mode: 'insensitive' } },
                          { lastName: { contains: q, mode: 'insensitive' } },
                          { username: { contains: q, mode: 'insensitive' } },
                          { displayName: { contains: q, mode: 'insensitive' } }
                        ],
                        isActive: true
                      }
                    }
                  }
                }
              ]
            },
            {
              OR: [
                // Conversations publiques ou globales (accessibles à tous)
                { type: 'public' },
                { type: 'global' },
                // OU conversations dont l'utilisateur est membre
                { members: { some: { userId, isActive: true } } }
              ]
            }
          ]
        },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  avatar: true,
                  isOnline: true,
                  lastActiveAt: true
                }
              }
            },
            take: 10 // Limiter le nombre de membres retournés pour les performances
          },
          messages: { orderBy: { createdAt: 'desc' }, take: 1 }
        },
        orderBy: { lastMessageAt: 'desc' },
        take: 50 // Limiter le nombre de résultats
      });

      // Transformer les conversations pour garantir qu'un titre existe toujours
      const conversationsWithTitle = conversations.map((conversation) => {
        const displayTitle = conversation.title && conversation.title.trim() !== ''
          ? conversation.title
          : generateDefaultConversationTitle(
              conversation.members.map((m: any) => ({
                id: m.userId,
                displayName: m.user?.displayName,
                username: m.user?.username,
                firstName: m.user?.firstName,
                lastName: m.user?.lastName
              })),
              userId
            );

        // Calculer le unreadCount pour l'utilisateur
        const unreadCount = conversation.messages[0] ? 0 : 0; // TODO: Implémenter le vrai compteur

        return {
          ...conversation,
          title: displayTitle,
          lastMessage: conversation.messages[0] || null,
          unreadCount
        };
      });

      reply.send({ success: true, data: conversationsWithTitle });
    } catch (error) {
      console.error('[GATEWAY] Error searching conversations:', error);
      reply.status(500).send({ success: false, error: 'Erreur lors de la recherche de conversations' });
    }
  });

  // NOTE: route déplacée vers communities.ts → GET /communities/:id/conversations

  // Route pour modifier un message (permis depuis la gateway)
  fastify.put<{
    Params: ConversationParams & { messageId: string };
    Body: EditMessageBody;
  }>('/conversations/:id/messages/:messageId', {
    schema: {
      description: 'Edit an existing message in a conversation (only by message sender)',
      tags: ['conversations', 'messages'],
      summary: 'Edit message',
      params: {
        type: 'object',
        required: ['id', 'messageId'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' },
          messageId: { type: 'string', description: 'Message ID to edit' }
        }
      },
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', description: 'Updated message content', minLength: 1 },
          originalLanguage: { type: 'string', description: 'Language code', default: 'fr' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'object', description: 'Updated message object' }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth],
    preHandler: [messageValidationHook]
  }, async (request, reply) => {
    try {
      const { id, messageId } = request.params;
      const { content, originalLanguage = 'fr' } = request.body;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(id);
      if (!conversationId) {
        return reply.status(404).send({
          success: false,
          error: 'Conversation non trouvée'
        });
      }

      // Vérifier que le message existe
      const existingMessage = await prisma.message.findFirst({
        where: {
          id: messageId,
          conversationId: conversationId,
          isDeleted: false
        },
        include: {
          sender: {
            select: { id: true, role: true }
          }
        }
      });

      if (!existingMessage) {
        return reply.status(404).send({
          success: false,
          error: 'Message non trouvé'
        });
      }

      // Vérifier la restriction temporelle (24 heures max pour les utilisateurs normaux)
      const isAuthor = existingMessage.senderId === userId;
      const messageAge = Date.now() - new Date(existingMessage.createdAt).getTime();
      const twentyFourHoursInMs = 24 * 60 * 60 * 1000; // 24 heures en millisecondes

      if (isAuthor && messageAge > twentyFourHoursInMs) {
        // Vérifier si l'utilisateur a des privilèges spéciaux
        const userRole = existingMessage.sender.role;
        // Support both MODO and MODERATOR for backward compatibility
        const hasSpecialPrivileges = userRole === 'MODO' || userRole === 'MODERATOR' || userRole === 'ADMIN' || userRole === 'CREATOR' || userRole === 'BIGBOSS';

        if (!hasSpecialPrivileges) {
          return reply.status(403).send({
            success: false,
            error: 'Vous ne pouvez plus modifier ce message (délai de 24 heures dépassé)'
          });
        }
      }

      // Vérifier les permissions : l'auteur peut modifier, ou les modérateurs/admins/créateurs
      let canModify = isAuthor;

      if (!canModify) {
        // Vérifier si l'utilisateur est modérateur/admin/créateur dans cette conversation
        const membership = await prisma.conversationMember.findFirst({
          where: {
            conversationId: conversationId,
            userId: userId,
            isActive: true
          },
          include: {
            user: {
              select: { role: true }
            }
          }
        });

        if (membership) {
          const userRole = membership.user.role;
          // Support both MODO and MODERATOR for backward compatibility
          canModify = userRole === 'MODO' || userRole === 'MODERATOR' || userRole === 'ADMIN' || userRole === 'CREATOR' || userRole === 'BIGBOSS';
        }
      }

      if (!canModify) {
        return reply.status(403).send({
          success: false,
          error: 'Vous n\'êtes pas autorisé à modifier ce message'
        });
      }

      // Validation du contenu
      if (!content || content.trim().length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'Le contenu du message ne peut pas être vide'
        });
      }

      // ÉTAPE: Traiter les liens [[url]] et <url> AVANT de sauvegarder le message
      let processedContent = content.trim();
      console.log('[GATEWAY] Edit - Original content:', content.trim());

      try {
        console.log('[GATEWAY] ===== ENTERED TRY BLOCK FOR MENTIONS =====');
        console.log('[GATEWAY] Processing tracking links in edited message:', messageId);
        const { processedContent: contentWithLinks, trackingLinks } = await trackingLinkService.processExplicitLinksInContent({
          content: content.trim(),
          conversationId: conversationId,
          messageId: messageId,
          createdBy: userId
        });
        processedContent = contentWithLinks;
        console.log('[GATEWAY] Edit - Processed content after links:', processedContent);

        if (trackingLinks.length > 0) {
          console.log(`[GATEWAY] ✅ ${trackingLinks.length} tracking link(s) created/reused in edited message`);
        }
      } catch (linkError) {
        console.error('[GATEWAY] Error processing tracking links in edit:', linkError);
        // Continue with unprocessed content if tracking links fail
      }

      // Mettre à jour le message avec le contenu traité
      const updatedMessage = await prisma.message.update({
        where: { id: messageId },
        data: {
          content: processedContent,
          originalLanguage,
          isEdited: true,
          editedAt: new Date()
        },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true,
              role: true
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
              }
            }
          }
        }
      });

      console.log('[GATEWAY] ===== POST MESSAGE UPDATE - BEFORE MENTIONS =====');
      console.log('[GATEWAY] Message updated successfully, ID:', messageId);
      // ÉTAPE: Traitement des mentions @username lors de l'édition
      console.log('[GATEWAY] ===== STARTING MENTION PROCESSING BLOCK =====');
      try {
        console.log('[GATEWAY] ===== ENTERED TRY BLOCK FOR MENTIONS =====');
        const mentionService = (fastify as any).mentionService;
        console.log('[GATEWAY] Edit - MentionService available:', !!mentionService);

        if (mentionService) {
          console.log('[GATEWAY] Edit - Processing mentions for edited message:', messageId);

          // Supprimer les anciennes mentions
          await prisma.mention.deleteMany({
            where: { messageId: messageId }
          });

          // Extraire les nouvelles mentions du contenu traité (avec tracking links déjà remplacés)
          const mentionedUsernames = mentionService.extractMentions(processedContent);
          console.log('[GATEWAY] Edit - Extracting mentions from:', processedContent);
          console.log('[GATEWAY] Edit - Mentions extracted:', mentionedUsernames);
          console.log('[GATEWAY] Edit - Number of mentions:', mentionedUsernames.length);

          if (mentionedUsernames.length > 0) {
            // Résoudre les usernames en utilisateurs réels
            const userMap = await mentionService.resolveUsernames(mentionedUsernames);
            console.log('[GATEWAY] UserMap size:', userMap.size);
            const mentionedUserIds = Array.from(userMap.values()).map((user: any) => user.id);

            if (mentionedUserIds.length > 0) {
              // Valider les permissions de mention
              const validationResult = await mentionService.validateMentionPermissions(
                conversationId,
                mentionedUserIds,
                userId
              );
              console.log('[GATEWAY] Validation result:', {
                isValid: validationResult.isValid,
                validUserIdsCount: validationResult.validUserIds.length
              });

              if (validationResult.validUserIds.length > 0) {
                // Créer les nouvelles entrées de mention
                await mentionService.createMentions(
                  messageId,
                  validationResult.validUserIds
                );

                // Extraire les usernames validés
                const validatedUsernames = Array.from(userMap.entries())
                  .filter(([_, user]) => validationResult.validUserIds.includes(user.id))
                  .map(([username, _]) => username);

                console.log('[GATEWAY] Mise à jour avec validatedMentions:', validatedUsernames);

                // Mettre à jour le message avec les usernames validés
                await prisma.message.update({
                  where: { id: messageId },
                  data: { validatedMentions: validatedUsernames }
                });

                // IMPORTANT: Mettre à jour l'objet en mémoire
                updatedMessage.validatedMentions = validatedUsernames;

                console.log(`[GATEWAY] ✅ ${validationResult.validUserIds.length} mention(s) mise(s) à jour`);
                console.log(`[GATEWAY] updatedMessage.validatedMentions =`, updatedMessage.validatedMentions);

                // Déclencher les notifications de mention pour les utilisateurs mentionnés
                const notificationService = (fastify as any).notificationService;
                if (notificationService) {
                  try {
                    // Récupérer les informations de l'expéditeur
                    const sender = await prisma.user.findUnique({
                      where: { id: userId },
                      select: {
                        username: true,
                        avatar: true
                      }
                    });

                    if (sender) {
                      // Récupérer les informations de la conversation
                      const conversationInfo = await prisma.conversation.findUnique({
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

                      if (conversationInfo) {
                        const memberIds = conversationInfo.members.map((m: any) => m.userId);

                        // PERFORMANCE: Créer toutes les notifications de mention en batch
                        const count = await notificationService.createMentionNotificationsBatch(
                          validationResult.validUserIds,
                          {
                            senderId: userId,
                            senderUsername: sender.username,
                            senderAvatar: sender.avatar || undefined,
                            messageContent: processedContent,
                            conversationId,
                            conversationTitle: conversationInfo.title,
                            messageId
                          },
                          memberIds
                        );
                        console.log(`[GATEWAY] 📩 ${count} notifications de mention créées en batch`);
                      }
                    }
                  } catch (notifError) {
                    console.error('[GATEWAY] Erreur notifications mentions:', notifError);
                  }
                }
              }
            } else {
              console.log('[GATEWAY] Aucun utilisateur trouvé pour les mentions');
              // Mettre à jour avec un tableau vide
              await prisma.message.update({
                where: { id: messageId },
                data: { validatedMentions: [] }
              });
              updatedMessage.validatedMentions = [];
            }
          } else {
            console.log('[GATEWAY] Aucune mention dans le message édité');
            // Mettre à jour avec un tableau vide
            await prisma.message.update({
              where: { id: messageId },
              data: { validatedMentions: [] }
            });
            updatedMessage.validatedMentions = [];
          }
        } else {
          console.warn('[GATEWAY] Edit - MentionService NOT AVAILABLE - mentions will not be processed!');
          // Clear mentions if service not available
          await prisma.message.update({
            where: { id: messageId },
            data: { validatedMentions: [] }
          });
          updatedMessage.validatedMentions = [];
        }
      } catch (mentionError) {
        console.error('[GATEWAY] Edit - Error processing mentions:', mentionError);
        console.error('[GATEWAY] Edit - Stack trace:', mentionError.stack);
        // Ne pas faire échouer l'édition si les mentions échouent
        // Clear mentions on error to avoid stale data
        try {
          await prisma.message.update({
            where: { id: messageId },
            data: { validatedMentions: [] }
          });
          updatedMessage.validatedMentions = [];
        } catch (e) {
          console.error('[GATEWAY] Edit - Error clearing mentions:', e);
        }
      }

      // Déclencher la retraduction automatique du message modifié
      try {
        console.log('[GATEWAY] ===== ENTERED TRY BLOCK FOR MENTIONS =====');
        // Utiliser les instances déjà disponibles dans le contexte Fastify
        const translationService: TranslationService = (fastify as any).translationService;

        // Invalider les traductions existantes en base de données
        const deletedCount = await prisma.messageTranslation.deleteMany({
          where: {
            messageId: messageId
          }
        });

        // Créer un objet message pour la retraduction (avec contenu traité incluant tracking links)
        const messageForRetranslation = {
          id: messageId,
          content: processedContent,
          originalLanguage: originalLanguage,
          conversationId: conversationId,
          senderId: userId
        };

        // Déclencher la retraduction via la méthode privée existante
        await (translationService as any)._processRetranslationAsync(messageId, messageForRetranslation);
        console.log(`[GATEWAY] Edit - Retranslation queued for message ${messageId}`);

      } catch (translationError) {
        console.error('[GATEWAY] Erreur lors de la retraduction:', translationError);
        // Ne pas faire échouer l'édition si la retraduction échoue
      }

      // Invalider et recalculer les stats pour refléter l'édition
      const stats = await conversationStatsService.getOrCompute(
        prisma,
        id,
        () => []
      );

      // Construire la réponse avec mentions validées (PAS de traductions - elles arriveront via socket)
      const messageResponse = {
        ...updatedMessage,
        conversationId,
        validatedMentions: updatedMessage.validatedMentions || [],
        meta: { conversationStats: stats }
      };

      console.log(`[GATEWAY] Edit - Response includes ${(updatedMessage.validatedMentions || []).length} validated mentions`);

      // Diffuser la mise à jour via Socket.IO
      try {
        console.log('[GATEWAY] ===== ENTERED TRY BLOCK FOR MENTIONS =====');
        const socketIOManager = socketIOHandler.getManager();
        if (socketIOManager) {
          const room = `conversation_${conversationId}`;
          (socketIOManager as any).io.to(room).emit('message:edited', messageResponse);
          console.log(`[GATEWAY] Edit - Broadcasted message:edited to room ${room}`);
        }
      } catch (socketError) {
        console.error('[CONVERSATIONS] Erreur lors de la diffusion Socket.IO:', socketError);
        // Ne pas faire échouer l'édition si la diffusion échoue
      }

      reply.send({
        success: true,
        data: messageResponse
      });

    } catch (error) {
      console.error('[GATEWAY] Error updating message:', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur lors de la modification du message'
      });
    }
  });

  // Route pour supprimer un message (soft delete)
  fastify.delete<{
    Params: ConversationParams & { messageId: string };
  }>('/conversations/:id/messages/:messageId', {
    schema: {
      description: 'Delete a message from a conversation (soft delete - marks as deleted)',
      tags: ['conversations', 'messages'],
      summary: 'Delete message',
      params: {
        type: 'object',
        required: ['id', 'messageId'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' },
          messageId: { type: 'string', description: 'Message ID to delete' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Message supprimé avec succès' }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { id, messageId } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(id);
      if (!conversationId) {
        return reply.status(404).send({
          success: false,
          error: 'Conversation non trouvée'
        });
      }

      // Vérifier que le message existe
      const existingMessage = await prisma.message.findFirst({
        where: {
          id: messageId,
          conversationId: conversationId,
          isDeleted: false
        },
        include: {
          sender: {
            select: { id: true }
          },
          attachments: {
            select: { id: true }
          }
        }
      });

      if (!existingMessage) {
        return reply.status(404).send({
          success: false,
          error: 'Message non trouvé'
        });
      }

      // Vérifier les permissions : l'auteur peut supprimer, ou les modérateurs/admins/créateurs
      const isAuthor = existingMessage.senderId === userId;
      let canDelete = isAuthor;

      if (!canDelete) {
        // Vérifier si l'utilisateur est modérateur/admin/créateur dans cette conversation
        const membership = await prisma.conversationMember.findFirst({
          where: {
            conversationId: conversationId,
            userId: userId,
            isActive: true
          },
          include: {
            user: {
              select: { role: true }
            }
          }
        });

        if (membership) {
          const userRole = membership.user.role;
          // Support both MODO and MODERATOR for backward compatibility
          canDelete = userRole === 'MODO' || userRole === 'MODERATOR' || userRole === 'ADMIN' || userRole === 'CREATOR' || userRole === 'BIGBOSS';
        }
      }

      if (!canDelete) {
        return reply.status(403).send({
          success: false,
          error: 'Vous n\'êtes pas autorisé à supprimer ce message'
        });
      }

      // Supprimer les attachments et leurs fichiers physiques
      if (existingMessage.attachments && existingMessage.attachments.length > 0) {
        for (const attachment of existingMessage.attachments) {
          try {
            await attachmentService.deleteAttachment(attachment.id);
          } catch (error) {
            console.error(`❌ [CONVERSATIONS] Erreur lors de la suppression de l'attachment ${attachment.id}:`, error);
            // Continuer même en cas d'erreur pour supprimer les autres
          }
        }
      }

      // Supprimer les traductions du message
      const deletedTranslations = await prisma.messageTranslation.deleteMany({
        where: {
          messageId: messageId
        }
      });

      // Soft delete du message
      await prisma.message.update({
        where: { id: messageId },
        data: {
          isDeleted: true,
          deletedAt: new Date()
        }
      });

      // Invalider et recalculer les stats
      const stats = await conversationStatsService.getOrCompute(
        prisma,
        conversationId,
        () => []
      );

      // Diffuser la suppression via Socket.IO
      try {
        console.log('[GATEWAY] ===== ENTERED TRY BLOCK FOR MENTIONS =====');
        const socketIOManager = socketIOHandler.getManager();
        if (socketIOManager) {
          const room = `conversation_${conversationId}`;
          (socketIOManager as any).io.to(room).emit('message:deleted', {
            messageId,
            conversationId
          });
        }
      } catch (socketError) {
        console.error('[CONVERSATIONS] Erreur lors de la diffusion Socket.IO:', socketError);
        // Ne pas faire échouer la suppression si la diffusion échoue
      }

      reply.send({
        success: true,
        data: { messageId, deleted: true, meta: { conversationStats: stats } }
      });

    } catch (error) {
      console.error('[GATEWAY] Error deleting message:', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur lors de la suppression du message'
      });
    }
  });

  // NOTE: ancienne route /conversations/create-link supprimée (remplacée par /links)

  // Route pour mettre à jour une conversation
  fastify.put<{
    Params: ConversationParams;
    Body: Partial<CreateConversationBody>;
  }>('/conversations/:id', {
    schema: {
      description: 'Update conversation details (title, description) - requires admin/moderator role',
      tags: ['conversations'],
      summary: 'Update conversation',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      body: updateConversationRequestSchema,
      response: {
        200: conversationResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { title, description } = request.body;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Vérifier les permissions d'administration
      const membership = await prisma.conversationMember.findFirst({
        where: {
          conversationId: id,
          userId: userId,
          role: { in: ['CREATOR', 'ADMIN', 'MODERATOR'] },
          isActive: true
        }
      });

      if (!membership && id !== "meeshy") {
        return reply.status(403).send({
          success: false,
          error: 'Vous n\'êtes pas autorisé à modifier cette conversation'
        });
      }

      // Interdire la modification de la conversation globale
      if (id === "meeshy") {
        return reply.status(403).send({
          success: false,
          error: 'La conversation globale ne peut pas être modifiée'
        });
      }

      const updatedConversation = await prisma.conversation.update({
        where: { id },
        data: {
          title,
          description
        },
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  avatar: true
                }
              }
            }
          }
        }
      });

      reply.send({
        success: true,
        data: updatedConversation
      });

    } catch (error) {
      console.error('[GATEWAY] Error updating conversation:', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur lors de la mise à jour de la conversation'
      });
    }
  });

  // Route pour supprimer une conversation
  fastify.delete<{ Params: ConversationParams }>('/conversations/:id', {
    schema: {
      description: 'Delete a conversation (soft delete - marks as inactive) - requires creator role',
      tags: ['conversations'],
      summary: 'Delete conversation',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Conversation supprimée avec succès' }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Interdire la suppression de la conversation globale
      if (id === "meeshy") {
        return reply.status(403).send({
          success: false,
          error: 'La conversation globale ne peut pas être supprimée'
        });
      }

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(id);
      if (!conversationId) {
        return reply.status(403).send({
          success: false,
          error: 'Accès non autorisé à cette conversation'
        });
      }

      // Vérifier les permissions d'administration
      const membership = await prisma.conversationMember.findFirst({
        where: {
          conversationId: conversationId,
          userId: userId,
          role: { in: ['CREATOR', 'ADMIN'] },
          isActive: true
        }
      });

      if (!membership) {
        return reply.status(403).send({
          success: false,
          error: 'Vous n\'êtes pas autorisé à supprimer cette conversation'
        });
      }

      // Marquer la conversation comme inactive plutôt que de la supprimer
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { isActive: false }
      });

      reply.send({
        success: true,
        data: { message: 'Conversation supprimée avec succès' }
      });

    } catch (error) {
      console.error('[GATEWAY] Error deleting conversation:', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur lors de la suppression de la conversation'
      });
    }
  });

  // Route pour modifier un message
  fastify.patch<{
    Params: { messageId: string };
    Body: { content: string };
  }>('/messages/:messageId', {
    schema: {
      description: 'Edit a message by message ID (alternative to PUT /conversations/:id/messages/:messageId)',
      tags: ['messages'],
      summary: 'Edit message by ID',
      params: {
        type: 'object',
        required: ['messageId'],
        properties: {
          messageId: { type: 'string', description: 'Message ID to edit' }
        }
      },
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', description: 'Updated message content', minLength: 1 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'object', description: 'Updated message object' }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth],
    preHandler: [messageValidationHook]
  }, async (request, reply) => {
    try {
      const { messageId } = request.params;
      const { content } = request.body;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Vérifier que le message existe et appartient à l'utilisateur
      const message = await prisma.message.findFirst({
        where: { id: messageId },
        include: {
          conversation: {
            include: {
              members: {
                where: {
                  userId: userId,
                  isActive: true
                }
              }
            }
          }
        }
      });

      if (!message) {
        return reply.status(404).send({
          success: false,
          error: 'Message introuvable'
        });
      }

      // Vérifier que l'utilisateur est l'auteur du message
      if (message.senderId !== userId) {
        return reply.status(403).send({
          success: false,
          error: 'Vous ne pouvez modifier que vos propres messages'
        });
      }

      // Vérifier que l'utilisateur est membre de la conversation
      // Pour la conversation globale "meeshy", l'accès est autorisé
      if (message.conversation.identifier !== "meeshy") {
        const membership = await prisma.conversationMember.findFirst({
          where: {
            conversationId: message.conversationId,
            userId: userId,
            isActive: true
          }
        });
        
        if (!membership) {
          return reply.status(403).send({
            success: false,
            error: 'Accès non autorisé à cette conversation'
          });
        }
      }

      // Mettre à jour le contenu du message
      const updatedMessage = await prisma.message.update({
        where: { id: messageId },
        data: {
          content: content.trim(),
          isEdited: true,
          editedAt: new Date()
        },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true,
              role: true
            }
          }
        }
      });

      // Note: Les traductions existantes restent inchangées
      // Le service de traduction sera notifié si nécessaire via WebSocket

      reply.send({
        success: true,
        data: updatedMessage
      });

    } catch (error) {
      console.error('[GATEWAY] Error updating message:', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur lors de la modification du message'
      });
    }
  });

  // Route pour récupérer les participants d'une conversation
  fastify.get<{
    Params: { id: string };
    Querystring: {
      onlineOnly?: string;
      role?: string;
      search?: string;
      limit?: string;
    };
  }>('/conversations/:id/participants', {
    schema: {
      description: 'Get participants in a conversation with optional filtering by online status, role, or search query',
      tags: ['conversations', 'participants'],
      summary: 'Get conversation participants',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          onlineOnly: { type: 'string', enum: ['true', 'false'], description: 'Filter to only online participants' },
          role: { type: 'string', enum: ['CREATOR', 'ADMIN', 'MODERATOR', 'MEMBER'], description: 'Filter by participant role' },
          search: { type: 'string', description: 'Search participants by name or username' },
          limit: { type: 'string', description: 'Maximum number of participants to return' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: conversationParticipantSchema
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [optionalAuth]
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { onlineOnly, role, search, limit } = request.query;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(id);
      if (!conversationId) {
        return reply.status(403).send({
          success: false,
          error: 'Accès non autorisé à cette conversation'
        });
      }

      // Vérifier que l'utilisateur a accès à cette conversation
      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!canAccess) {
        return reply.status(403).send({
          success: false,
          error: 'Accès non autorisé à cette conversation'
        });
      }

      // Construire les filtres dynamiquement
      const whereConditions: any = {
        conversationId: conversationId,
        isActive: true,
        user: {
          isActive: true
        }
      };

      // Filtre par statut en ligne
      if (onlineOnly === 'true') {
        whereConditions.user.isOnline = true;
      }

      // Filtre par rôle
      if (role) {
        whereConditions.user.role = role.toUpperCase();
      }

      // Filtre par recherche (nom, prénom, username, email)
      if (search && search.trim().length > 0) {
        const searchTerm = search.trim();
        whereConditions.user.OR = [
          {
            firstName: {
              contains: searchTerm,
              mode: 'insensitive'
            }
          },
          {
            lastName: {
              contains: searchTerm,
              mode: 'insensitive'
            }
          },
          {
            username: {
              contains: searchTerm,
              mode: 'insensitive'
            }
          },
          {
            email: {
              contains: searchTerm,
              mode: 'insensitive'
            }
          },
          {
            displayName: {
              contains: searchTerm,
              mode: 'insensitive'
            }
          }
        ];
      }

      // Récupérer les participants avec filtres
      const participants = await prisma.conversationMember.findMany({
        where: whereConditions,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              displayName: true,
              avatar: true,
              email: true,
              role: true,
              isOnline: true,
              lastActiveAt: true,
              systemLanguage: true,
              regionalLanguage: true,
              customDestinationLanguage: true,
              isActive: true,
              createdAt: true,
              updatedAt: true,
              userFeature: {
                select: { textTranslationEnabledAt: true }
              }
            }
          }
        },
        orderBy: [
          { user: { isOnline: 'desc' } }, // Utilisateurs en ligne en premier
          { user: { firstName: 'asc' } },  // Puis par prénom
          { user: { lastName: 'asc' } },   // Puis par nom
          { joinedAt: 'asc' }              // Enfin par date d'entrée
        ],
        ...(limit && { take: parseInt(limit, 10) }) // Limite optionnelle
      });

      // Transformer les données pour correspondre au format attendu
      const formattedParticipants = participants.map(participant => ({
        id: participant.user.id,
        userId: participant.userId, // Ajouter l'ID utilisateur pour la correspondance
        username: participant.user.username,
        firstName: participant.user.firstName,
        lastName: participant.user.lastName,
        displayName: participant.user.displayName,
        avatar: participant.user.avatar,
        email: participant.user.email,
        role: participant.user.role, // Rôle global de l'utilisateur
        conversationRole: participant.role, // Rôle dans cette conversation spécifique
        isOnline: participant.user.isOnline,
        lastActiveAt: participant.user.lastActiveAt,
        systemLanguage: participant.user.systemLanguage,
        regionalLanguage: participant.user.regionalLanguage,
        customDestinationLanguage: participant.user.customDestinationLanguage,
        // Traduction activée si textTranslationEnabledAt n'est pas null (dans UserFeature)
        autoTranslateEnabled: participant.user.userFeature?.textTranslationEnabledAt != null,
        isActive: participant.user.isActive,
        createdAt: participant.user.createdAt,
        updatedAt: participant.user.updatedAt,
        // Permissions par défaut si non définies
        permissions: {
          canAccessAdmin: participant.user.role === 'ADMIN' || participant.user.role === 'BIGBOSS',
          canManageUsers: participant.user.role === 'ADMIN' || participant.user.role === 'BIGBOSS',
          canManageGroups: participant.user.role === 'ADMIN' || participant.user.role === 'BIGBOSS',
          canManageConversations: participant.user.role === 'ADMIN' || participant.user.role === 'BIGBOSS',
          canViewAnalytics: participant.user.role === 'ADMIN' || participant.user.role === 'BIGBOSS',
          canModerateContent: participant.user.role === 'ADMIN' || participant.user.role === 'BIGBOSS',
          canViewAuditLogs: participant.user.role === 'ADMIN' || participant.user.role === 'BIGBOSS',
          canManageNotifications: participant.user.role === 'ADMIN' || participant.user.role === 'BIGBOSS',
          canManageTranslations: participant.user.role === 'ADMIN' || participant.user.role === 'BIGBOSS',
        }
      }));

      // Récupérer les participants anonymes
      const anonymousParticipants = await prisma.anonymousParticipant.findMany({
        where: {
          conversationId: conversationId, // Utiliser l'ID résolu
          isActive: true
        },
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            language: true,
            isOnline: true,
            joinedAt: true,
            lastActiveAt: true,
            canSendMessages: true,
            canSendFiles: true,
            canSendImages: true
          },
          orderBy: { joinedAt: 'desc' }
        });

      // Transformer les participants anonymes pour correspondre au format attendu
      const formattedAnonymousParticipants = anonymousParticipants.map(participant => ({
        id: participant.id,
        username: participant.username,
        firstName: participant.firstName,
        lastName: participant.lastName,
        displayName: participant.username, // Utiliser username comme displayName pour les anonymes
        avatar: null,
        email: '',
        role: 'MEMBER',
        isOnline: participant.isOnline,
        lastActiveAt: participant.lastActiveAt ?? participant.joinedAt,
        systemLanguage: participant.language,
        regionalLanguage: participant.language,
        customDestinationLanguage: participant.language,
        autoTranslateEnabled: true,
        translateToSystemLanguage: true,
        translateToRegionalLanguage: false,
        useCustomDestination: false,
        isActive: true,
        createdAt: participant.joinedAt,
        updatedAt: participant.joinedAt,
        // Permissions pour les participants anonymes
        permissions: {
          canAccessAdmin: false,
          canManageUsers: false,
          canManageGroups: false,
          canManageConversations: false,
          canViewAnalytics: false,
          canModerateContent: false,
          canViewAuditLogs: false,
          canManageNotifications: false,
          canManageTranslations: false,
        },
        // Propriétés spécifiques aux participants anonymes
        isAnonymous: true,
        canSendMessages: participant.canSendMessages,
        canSendFiles: participant.canSendFiles,
        canSendImages: participant.canSendImages
      }));

      // Combiner les participants authentifiés et anonymes
      const allParticipants = [...formattedParticipants, ...formattedAnonymousParticipants];


      reply.send({
        success: true,
        data: allParticipants
      });

    } catch (error) {
      console.error('[GATEWAY] Error fetching conversation participants:', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur lors de la récupération des participants'
      });
    }
  });

  // Route pour ajouter un participant à une conversation
  fastify.post<{
    Params: { id: string };
    Body: { userId: string };
  }>('/conversations/:id/participants', {
    schema: {
      description: 'Add a participant to a conversation - requires admin/moderator role',
      tags: ['conversations', 'participants'],
      summary: 'Add participant',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      body: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string', description: 'User ID to add to conversation' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Participant ajouté avec succès' },
                participant: conversationParticipantSchema
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const { userId } = request.body;
      const authRequest = request as UnifiedAuthRequest;
      const currentUserId = authRequest.authContext.userId;

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(id);
      if (!conversationId) {
        return reply.status(403).send({
          success: false,
          error: 'Accès non autorisé à cette conversation'
        });
      }

      // Vérifier que l'utilisateur actuel a les droits pour ajouter des participants
      const currentUserMembership = await prisma.conversationMember.findFirst({
        where: {
          conversationId: conversationId,
          userId: currentUserId,
          isActive: true
        }
      });

      if (!currentUserMembership) {
        return reply.status(403).send({
          success: false,
          error: 'Accès non autorisé à cette conversation'
        });
      }

      // Vérifier que l'utilisateur à ajouter existe
      const userToAdd = await prisma.user.findFirst({
        where: { id: userId }
      });

      if (!userToAdd) {
        return reply.status(404).send({
          success: false,
          error: 'Utilisateur non trouvé'
        });
      }

      // Vérifier que l'utilisateur n'est pas déjà membre
      const existingMembership = await prisma.conversationMember.findFirst({
        where: {
          conversationId: conversationId,
          userId: userId,
          isActive: true
        }
      });

      if (existingMembership) {
        return reply.status(400).send({
          success: false,
          error: 'L\'utilisateur est déjà membre de cette conversation'
        });
      }

      // Ajouter le participant
      await prisma.conversationMember.create({
        data: {
          conversationId: conversationId,
          userId: userId,
          role: 'MEMBER',
          joinedAt: new Date()
        }
      });

      reply.send({
        success: true,
        data: { message: 'Participant ajouté avec succès' }
      });

    } catch (error) {
      console.error('[GATEWAY] Error adding participant:', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur lors de l\'ajout du participant'
      });
    }
  });

  // Route pour supprimer un participant d'une conversation
  fastify.delete<{
    Params: { id: string; userId: string };
  }>('/conversations/:id/participants/:userId', {
    schema: {
      description: 'Remove a participant from a conversation - requires admin/moderator role or self-removal',
      tags: ['conversations', 'participants'],
      summary: 'Remove participant',
      params: {
        type: 'object',
        required: ['id', 'userId'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' },
          userId: { type: 'string', description: 'User ID to remove from conversation' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Participant supprimé avec succès' }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { id, userId } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const currentUserId = authRequest.authContext.userId;

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(id);
      if (!conversationId) {
        return reply.status(403).send({
          success: false,
          error: 'Accès non autorisé à cette conversation'
        });
      }

      // Vérifier que l'utilisateur actuel a les droits pour supprimer des participants
      const currentUserMembership = await prisma.conversationMember.findFirst({
        where: {
          conversationId: conversationId,
          userId: currentUserId,
          isActive: true
        },
        include: {
          user: true
        }
      });

      if (!currentUserMembership) {
        return reply.status(403).send({
          success: false,
          error: 'Accès non autorisé à cette conversation'
        });
      }

      // Seuls les admins ou le créateur peuvent supprimer des participants
      const isAdmin = currentUserMembership.user.role === 'ADMIN' || currentUserMembership.user.role === 'BIGBOSS';
      const isCreator = currentUserMembership.role === 'CREATOR';

      if (!isAdmin && !isCreator) {
        return reply.status(403).send({
          success: false,
          error: 'Vous n\'avez pas les droits pour supprimer des participants'
        });
      }

      // Empêcher de se supprimer soi-même
      if (userId === currentUserId) {
        return reply.status(400).send({
          success: false,
          error: 'Vous ne pouvez pas vous supprimer de la conversation'
        });
      }

      // Supprimer le participant
      await prisma.conversationMember.updateMany({
        where: {
          conversationId: conversationId,
          userId: userId,
          isActive: true
        },
        data: {
          isActive: false,
          leftAt: new Date()
        }
      });

      reply.send({
        success: true,
        data: { message: 'Participant supprimé avec succès' }
      });

    } catch (error) {
      console.error('[GATEWAY] Error removing participant:', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur lors de la suppression du participant'
      });
    }
  });

  // Route pour mettre à jour le rôle d'un participant
  fastify.patch<{
    Params: { id: string; userId: string };
    Body: { role: 'ADMIN' | 'MODERATOR' | 'MEMBER' };
  }>('/conversations/:id/participants/:userId/role', {
    schema: {
      description: 'Update participant role in a conversation - requires creator or admin role',
      tags: ['conversations', 'participants'],
      summary: 'Update participant role',
      params: {
        type: 'object',
        required: ['id', 'userId'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' },
          userId: { type: 'string', description: 'User ID to update role for' }
        }
      },
      body: {
        type: 'object',
        required: ['role'],
        properties: {
          role: { type: 'string', enum: ['ADMIN', 'MODERATOR', 'MEMBER'], description: 'New role for participant' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Rôle du participant modifié avec succès' },
                participant: conversationParticipantSchema
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { id, userId } = request.params;
      const { role } = request.body;
      const authRequest = request as UnifiedAuthRequest;
      const currentUserId = authRequest.authContext.userId;

      // Valider le rôle
      if (!['ADMIN', 'MODERATOR', 'MEMBER'].includes(role)) {
        return reply.status(400).send({
          success: false,
          error: 'Rôle invalide. Les rôles acceptés sont: ADMIN, MODERATOR, MEMBER'
        });
      }

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(id);
      if (!conversationId) {
        return reply.status(403).send({
          success: false,
          error: 'Accès non autorisé à cette conversation'
        });
      }

      // Vérifier que l'utilisateur actuel a les droits pour modifier les rôles
      const currentUserMembership = await prisma.conversationMember.findFirst({
        where: {
          conversationId: conversationId,
          userId: currentUserId,
          isActive: true
        },
        include: {
          user: true
        }
      });

      if (!currentUserMembership) {
        return reply.status(403).send({
          success: false,
          error: 'Accès non autorisé à cette conversation'
        });
      }

      // Seuls les admins ou le créateur peuvent modifier les rôles
      const isAdmin = currentUserMembership.user.role === 'ADMIN' || currentUserMembership.user.role === 'BIGBOSS';
      const isCreator = currentUserMembership.role === 'CREATOR';

      if (!isAdmin && !isCreator) {
        return reply.status(403).send({
          success: false,
          error: 'Vous n\'avez pas les droits pour modifier les rôles des participants'
        });
      }

      // Empêcher de modifier son propre rôle
      if (userId === currentUserId) {
        return reply.status(400).send({
          success: false,
          error: 'Vous ne pouvez pas modifier votre propre rôle'
        });
      }

      // Vérifier que le participant cible existe et est actif
      const targetMembership = await prisma.conversationMember.findFirst({
        where: {
          conversationId: conversationId,
          userId: userId,
          isActive: true
        }
      });

      if (!targetMembership) {
        return reply.status(404).send({
          success: false,
          error: 'Participant non trouvé ou inactif'
        });
      }

      // Empêcher de modifier le rôle du créateur de la conversation
      if (targetMembership.role === 'CREATOR') {
        return reply.status(403).send({
          success: false,
          error: 'Impossible de modifier le rôle du créateur de la conversation'
        });
      }

      // Mettre à jour le rôle du participant
      await prisma.conversationMember.update({
        where: {
          id: targetMembership.id
        },
        data: {
          role: role
        }
      });

      // Récupérer le participant mis à jour avec ses informations complètes
      const updatedMembership = await prisma.conversationMember.findUnique({
        where: { id: targetMembership.id },
        include: {
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
      });

      // Notifier via Socket.IO
      const io = (request.server as any).io;
      if (io) {
        io.to(conversationId).emit('participant:role-updated', {
          conversationId,
          userId,
          newRole: role,
          updatedBy: currentUserId,
          participant: updatedMembership
        });
      }

      reply.send({
        success: true,
        data: {
          message: 'Rôle du participant mis à jour avec succès',
          userId,
          role,
          participant: updatedMembership
        }
      });

    } catch (error) {
      console.error('[GATEWAY] Error updating participant role:', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur lors de la mise à jour du rôle du participant'
      });
    }
  });

  // Route pour créer un nouveau lien pour une conversation existante
  fastify.post<{
    Params: { id: string };
    Body: {
      name?: string;
      description?: string;
      maxUses?: number;
      maxConcurrentUsers?: number;
      maxUniqueSessions?: number;
      expiresAt?: string;
      allowAnonymousMessages?: boolean;
      allowAnonymousFiles?: boolean;
      allowAnonymousImages?: boolean;
      allowViewHistory?: boolean;
      requireNickname?: boolean;
      requireEmail?: boolean;
      allowedCountries?: string[];
      allowedLanguages?: string[];
      allowedIpRanges?: string[];
    };
  }>('/conversations/:id/new-link', {
    schema: {
      description: 'Create a new shareable invitation link for a conversation with configurable permissions',
      tags: ['conversations', 'links'],
      summary: 'Create share link',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Link name for identification' },
          description: { type: 'string', description: 'Link description' },
          maxUses: { type: 'number', description: 'Maximum number of times link can be used' },
          maxConcurrentUsers: { type: 'number', description: 'Maximum concurrent users via this link' },
          maxUniqueSessions: { type: 'number', description: 'Maximum unique sessions' },
          expiresAt: { type: 'string', format: 'date-time', description: 'Link expiration date' },
          allowAnonymousMessages: { type: 'boolean', description: 'Allow anonymous users to send messages' },
          allowAnonymousFiles: { type: 'boolean', description: 'Allow anonymous users to send files' },
          allowAnonymousImages: { type: 'boolean', description: 'Allow anonymous users to send images' },
          allowViewHistory: { type: 'boolean', description: 'Allow viewing message history' },
          requireNickname: { type: 'boolean', description: 'Require nickname for anonymous users' },
          requireEmail: { type: 'boolean', description: 'Require email for anonymous users' },
          allowedCountries: { type: 'array', items: { type: 'string' }, description: 'Allowed country codes' },
          allowedLanguages: { type: 'array', items: { type: 'string' }, description: 'Allowed language codes' },
          allowedIpRanges: { type: 'array', items: { type: 'string' }, description: 'Allowed IP ranges' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                link: { type: 'object', description: 'Created share link object' }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const body = request.body || {};
      const authRequest = request as UnifiedAuthRequest;
      const currentUserId = authRequest.authContext.userId;

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(id);
      if (!conversationId) {
        return reply.status(403).send({
          success: false,
          error: 'Accès non autorisé à cette conversation'
        });
      }

      // Récupérer les informations de la conversation et du membre
      const [conversation, membership] = await Promise.all([
        prisma.conversation.findUnique({
          where: { id: conversationId },
          select: { id: true, type: true, title: true }
        }),
        prisma.conversationMember.findFirst({
          where: {
            conversationId: conversationId,
            userId: currentUserId,
            isActive: true
          }
        })
      ]);

      if (!conversation) {
        return reply.status(404).send({
          success: false,
          error: 'Conversation non trouvée'
        });
      }

      if (!membership) {
        return reply.status(403).send({
          success: false,
          error: 'Accès non autorisé à cette conversation'
        });
      }

      // Récupérer le rôle de l'utilisateur
      const user = await prisma.user.findUnique({
        where: { id: currentUserId },
        select: { role: true }
      });

      if (!user) {
        return reply.status(403).send({
          success: false,
          error: 'Utilisateur non trouvé'
        });
      }

      // Vérifier les permissions pour créer des liens de partage
      const conversationType = conversation.type;
      const userRole = user.role as UserRoleEnum;

      // Interdire la création de liens pour les conversations directes
      if (conversationType === 'direct') {
        return reply.status(403).send({
          success: false,
          error: 'Cannot create share links for direct conversations'
        });
      }

      // Pour les conversations globales, seuls les BIGBOSS peuvent créer des liens
      if (conversationType === 'global') {
        if (userRole !== UserRoleEnum.BIGBOSS) {
          return reply.status(403).send({
            success: false,
            error: 'You do not have the necessary rights to perform this operation'
          });
        }
      }

      // Pour tous les autres types de conversations (group, public, etc.),
      // n'importe qui ayant accès à la conversation peut créer des liens
      // L'utilisateur doit juste être membre de la conversation (déjà vérifié plus haut)

      // Générer le linkId initial
      const initialLinkId = generateInitialLinkId();

      // Générer un identifiant unique (basé sur le nom du lien, ou le titre, ou généré)
      let baseIdentifier: string;
      if (body.name) {
        baseIdentifier = `mshy_${body.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')}`;
      } else if (body.description) {
        // Utiliser la description comme base si pas de nom
        baseIdentifier = `mshy_${body.description.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').substring(0, 30)}`;
      } else {
        // Générer un identifiant unique si ni nom ni description
        const timestamp = Date.now().toString();
        const randomPart = Math.random().toString(36).substring(2, 8);
        baseIdentifier = `mshy_link-${timestamp}-${randomPart}`;
      }
      const uniqueIdentifier = await ensureUniqueShareLinkIdentifier(prisma, baseIdentifier);

      // Créer le lien avec toutes les options configurables
      const shareLink = await prisma.conversationShareLink.create({
        data: {
          linkId: initialLinkId, // Temporaire
          conversationId: conversationId,
          createdBy: currentUserId,
          name: body.name,
          description: body.description,
          maxUses: body.maxUses ?? undefined,
          maxConcurrentUsers: body.maxConcurrentUsers ?? undefined,
          maxUniqueSessions: body.maxUniqueSessions ?? undefined,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
          allowAnonymousMessages: body.allowAnonymousMessages ?? true,
          allowAnonymousFiles: body.allowAnonymousFiles ?? false,
          allowAnonymousImages: body.allowAnonymousImages ?? true,
          allowViewHistory: body.allowViewHistory ?? true,
          requireNickname: body.requireNickname ?? true,
          requireEmail: body.requireEmail ?? false,
          allowedCountries: body.allowedCountries ?? [],
          allowedLanguages: body.allowedLanguages ?? [],
          allowedIpRanges: body.allowedIpRanges ?? [],
          identifier: uniqueIdentifier
        }
      });

      // Mettre à jour avec le linkId final
      const finalLinkId = generateFinalLinkId(shareLink.id, initialLinkId);
      await prisma.conversationShareLink.update({
        where: { id: shareLink.id },
        data: { linkId: finalLinkId }
      });

      // Retour compatible avec le frontend de service conversations (string du lien complet)
      const inviteLink = `${process.env.FRONTEND_URL || 'http://localhost:3100'}/join/${finalLinkId}`;
      reply.send({
        success: true,
        data: {
          link: inviteLink,
          code: finalLinkId,
          shareLink: {
            id: shareLink.id,
            linkId: finalLinkId,
            name: shareLink.name,
            description: shareLink.description,
            maxUses: shareLink.maxUses,
            expiresAt: shareLink.expiresAt,
            allowAnonymousMessages: shareLink.allowAnonymousMessages,
            allowAnonymousFiles: shareLink.allowAnonymousFiles,
            allowAnonymousImages: shareLink.allowAnonymousImages,
            allowViewHistory: shareLink.allowViewHistory,
            requireNickname: shareLink.requireNickname,
            requireEmail: shareLink.requireEmail
          }
        }
      });

    } catch (error) {
      console.error('[GATEWAY] Error creating new conversation link:', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur lors de la création du lien'
      });
    }
  });

  // Route pour mettre à jour une conversation
  fastify.patch<{
    Params: { id: string };
    Body: {
      title?: string;
      description?: string;
      type?: 'direct' | 'group' | 'public' | 'global';
    };
  }>('/conversations/:id', {
    schema: {
      description: 'Partially update conversation properties (alternative to PUT) - requires admin/moderator role',
      tags: ['conversations'],
      summary: 'Partially update conversation',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      body: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'New conversation title', minLength: 1, maxLength: 100 },
          description: { type: 'string', description: 'New conversation description', maxLength: 500 },
          type: { type: 'string', enum: ['direct', 'group', 'public', 'global'], description: 'Conversation type' }
        }
      },
      response: {
        200: conversationResponseSchema,
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [optionalAuth]
  }, async (request, reply) => {
    const { id } = request.params;
    const { title, description, type } = request.body;
    const authRequest = request as UnifiedAuthRequest;
    
    try {
      // Vérifier que l'utilisateur est authentifié
      if (!authRequest.authContext.isAuthenticated) {
        return reply.status(401).send({
          success: false,
          error: 'Authentification requise'
        });
      }
      
      const currentUserId = authRequest.authContext.userId;


      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(id);
      if (!conversationId) {
        return reply.status(403).send({
          success: false,
          error: 'Accès non autorisé à cette conversation'
        });
      }

      // Vérifier que l'utilisateur a accès à cette conversation
      const membership = await prisma.conversationMember.findFirst({
        where: {
          conversationId: conversationId,
          userId: currentUserId,
          isActive: true
        },
        include: {
          user: true
        }
      });

      if (!membership) {
        return reply.status(403).send({
          success: false,
          error: 'Accès non autorisé à cette conversation'
        });
      }


      // Pour la modification du nom, permettre à tous les membres de la conversation
      // Seuls les admins ou créateurs peuvent modifier le type de conversation
      if (type !== undefined) {
        const isAdmin = membership.user.role === 'ADMIN' || membership.user.role === 'BIGBOSS';
        const isCreator = membership.role === 'CREATOR';
        
        if (!isAdmin && !isCreator) {
          return reply.status(403).send({
            success: false,
            error: 'Seuls les administrateurs peuvent modifier le type de conversation'
          });
        }
      }

      // Préparer les données de mise à jour
      const updateData: any = {};
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (type !== undefined) updateData.type = type;

      // Mettre à jour la conversation
      const updatedConversation = await prisma.conversation.update({
        where: { id: conversationId },
        data: updateData,
        include: {
          members: {
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                  systemLanguage: true,
                  isOnline: true,
                  lastActiveAt: true,
                  role: true
                }
              }
            }
          }
        }
      });

      reply.send({
        success: true,
        data: updatedConversation
      });

    } catch (error) {
      console.error('[GATEWAY] Error updating conversation:', error);
      
      // Gestion d'erreur améliorée avec détails spécifiques
      let errorMessage = 'Erreur lors de la mise à jour de la conversation';
      let statusCode = 500;
      
      if (error.code === 'P2002') {
        errorMessage = 'Une conversation avec ce nom existe déjà';
        statusCode = 409;
      } else if (error.code === 'P2025') {
        errorMessage = 'Conversation non trouvée';
        statusCode = 404;
      } else if (error.code === 'P2003') {
        errorMessage = 'Erreur de référence - conversation invalide';
        statusCode = 400;
      } else if (error.name === 'ValidationError') {
        errorMessage = 'Données de mise à jour invalides';
        statusCode = 400;
      }
      
      console.error('[GATEWAY] Detailed error info:', {
        code: error.code,
        message: error.message,
        meta: error.meta,
        conversationId: id,
        currentUserId: authRequest.authContext.userId,
        updateData: { title, description, type }
      });
      
      reply.status(statusCode).send({
        success: false,
        error: errorMessage,
        details: process.env.NODE_ENV === 'development' ? {
          code: error.code,
          message: error.message,
          meta: error.meta
        } : undefined
      });
    }
  });

  // Récupérer les liens de partage d'une conversation (pour les admins)
  fastify.get('/conversations/:conversationId/links', {
    schema: {
      description: 'Get all shareable links for a conversation (moderators see all links, members see only their own)',
      tags: ['conversations', 'links'],
      summary: 'Get conversation share links',
      params: {
        type: 'object',
        required: ['conversationId'],
        properties: {
          conversationId: { type: 'string', description: 'Conversation ID' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  linkId: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  maxUses: { type: 'number' },
                  currentUses: { type: 'number' },
                  expiresAt: { type: 'string', format: 'date-time' },
                  isActive: { type: 'boolean' },
                  createdAt: { type: 'string', format: 'date-time' }
                }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { conversationId } = request.params as { conversationId: string };
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Vérifier que l'utilisateur est membre de la conversation
      const membership = await prisma.conversationMember.findFirst({
        where: {
          conversationId,
          userId,
          isActive: true
        }
      });

      if (!membership) {
        return reply.status(403).send({
          success: false,
          error: 'Vous devez être membre de cette conversation pour voir ses liens de partage'
        });
      }

      // Vérifier si l'utilisateur est modérateur/admin de la conversation
      const isModerator = ['CREATOR', 'ADMIN', 'MODERATOR'].includes(membership.role as string);

      // Filtrer les liens selon les droits:
      // - Modérateurs: voient TOUS les liens
      // - Membres normaux: voient uniquement leurs propres liens
      const links = await prisma.conversationShareLink.findMany({
        where: {
          conversationId,
          ...(isModerator ? {} : { creatorId: userId }) // Si pas modérateur, filtrer par créateur
        },
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              displayName: true,
              avatar: true
            }
          },
          conversation: {
            select: {
              id: true,
              title: true,
              type: true
            }
          },
          _count: {
            select: {
              anonymousParticipants: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return reply.send({
        success: true,
        data: links,
        isModerator // Indiquer au frontend si l'utilisateur peut gérer les liens
      });
    } catch (error) {
      console.error('[GATEWAY] Error fetching conversation links:', error);
      return reply.status(500).send({ 
        success: false, 
        error: 'Erreur lors de la récupération des liens de la conversation' 
      });
    }
  });

  // Route pour rejoindre une conversation via un lien partagé (utilisateurs authentifiés)
  fastify.post('/conversations/join/:linkId', {
    schema: {
      description: 'Join a conversation using an invitation link - validates link permissions and adds user as member',
      tags: ['conversations', 'links'],
      summary: 'Join conversation via link',
      params: {
        type: 'object',
        required: ['linkId'],
        properties: {
          linkId: { type: 'string', description: 'Share link ID to join conversation' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                conversation: conversationSchema,
                membership: conversationParticipantSchema
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { linkId } = request.params as { linkId: string };
      const authRequest = request as UnifiedAuthRequest;
      const userToken = authRequest.authContext;

      if (!userToken) {
        return reply.status(401).send({
          success: false,
          error: 'Authentification requise'
        });
      }

      // Vérifier que le lien existe et est valide
      const shareLink = await prisma.conversationShareLink.findFirst({
        where: { linkId },
        include: {
          conversation: true
        }
      });

      if (!shareLink) {
        return reply.status(404).send({
          success: false,
          error: 'Lien de conversation introuvable'
        });
      }

      if (!shareLink.isActive) {
        return reply.status(410).send({
          success: false,
          error: 'Ce lien n\'est plus actif'
        });
      }

      if (shareLink.expiresAt && shareLink.expiresAt < new Date()) {
        return reply.status(410).send({
          success: false,
          error: 'Ce lien a expiré'
        });
      }

      // Vérifier si l'utilisateur est déjà membre de la conversation
      const existingMember = await prisma.conversationMember.findFirst({
        where: {
          conversationId: shareLink.conversationId,
          userId: userToken.userId
        }
      });

      if (existingMember) {
        return reply.send({
          success: true,
          data: { message: 'Vous êtes déjà membre de cette conversation', conversationId: shareLink.conversationId }
        });
      }

      // Ajouter l'utilisateur à la conversation
      await prisma.conversationMember.create({
        data: {
          conversationId: shareLink.conversationId,
          userId: userToken.userId,
          role: UserRoleEnum.MEMBER,
          joinedAt: new Date()
        }
      });

      // Incrémenter le compteur d'utilisation du lien
      await prisma.conversationShareLink.update({
        where: { id: shareLink.id },
        data: { currentUses: { increment: 1 } }
      });

      // Envoyer des notifications
      const notificationService = (fastify as any).notificationService;
      if (notificationService) {
        try {
          // Récupérer les informations de l'utilisateur qui rejoint
          const joiningUser = await prisma.user.findUnique({
            where: { id: userToken.userId },
            select: {
              username: true,
              displayName: true,
              avatar: true
            }
          });

          if (joiningUser) {
            const userName = joiningUser.displayName || joiningUser.username;

            // 1. Notification de confirmation pour l'utilisateur qui rejoint
            await notificationService.createConversationJoinNotification({
              userId: userToken.userId,
              conversationId: shareLink.conversationId,
              conversationTitle: shareLink.conversation.title,
              conversationType: shareLink.conversation.type,
              isJoiner: true // C'est l'utilisateur qui rejoint
            });

            // 2. Notifier les admins et créateurs de la conversation
            const adminsAndCreators = await prisma.conversationMember.findMany({
              where: {
                conversationId: shareLink.conversationId,
                role: { in: ['ADMIN', 'CREATOR'] },
                isActive: true,
                userId: { not: userToken.userId } // Ne pas notifier l'utilisateur lui-même
              },
              select: { userId: true }
            });

            // Envoyer une notification à chaque admin/créateur
            for (const member of adminsAndCreators) {
              await notificationService.createConversationJoinNotification({
                userId: member.userId,
                conversationId: shareLink.conversationId,
                conversationTitle: shareLink.conversation.title,
                conversationType: shareLink.conversation.type,
                isJoiner: false, // C'est une notification pour un admin
                joinerUsername: userName,
                joinerAvatar: joiningUser.avatar || undefined
              });
              console.log(`[GATEWAY] 📩 Notification "membre a rejoint" envoyée à l'admin ${member.userId}`);
            }

            console.log(`[GATEWAY] 📩 Notification de confirmation envoyée à ${userToken.userId}`);
          }
        } catch (notifError) {
          console.error('[GATEWAY] Erreur lors de l\'envoi des notifications de jointure:', notifError);
          // Ne pas bloquer la jointure
        }
      }

      return reply.send({
        success: true,
        data: { message: 'Vous avez rejoint la conversation avec succès', conversationId: shareLink.conversationId }
      });

    } catch (error) {
      console.error('[GATEWAY] Error joining conversation via link:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la jointure de la conversation'
      });
    }
  });

  // Route pour inviter un utilisateur à une conversation
  fastify.post('/conversations/:id/invite', {
    schema: {
      description: 'Invite a user to join a conversation - creates membership and sends notification',
      tags: ['conversations', 'participants'],
      summary: 'Invite user to conversation',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID' }
        }
      },
      body: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string', description: 'ID of user to invite' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'User invited successfully' },
                membership: conversationParticipantSchema
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    onRequest: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: 'Utilisateur non authentifié'
        });
      }

      const { id: conversationId } = request.params as { id: string };
      const { userId } = request.body as { userId: string };
      const inviterId = authContext.userId;

      // Vérifier que la conversation existe
      const conversation = await fastify.prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          members: {
            where: { isActive: true },
            include: {
              user: {
                select: {
                  id: true,
                  username: true,
                  role: true
                }
              }
            }
          }
        }
      });

      if (!conversation) {
        return reply.status(404).send({
          success: false,
          error: 'Conversation non trouvée'
        });
      }

      // Vérifier que l'inviteur est membre de la conversation
      const inviterMember = conversation.members.find(m => m.userId === inviterId);
      if (!inviterMember) {
        return reply.status(403).send({
          success: false,
          error: 'Vous n\'êtes pas membre de cette conversation'
        });
      }

      // Vérifier que l'inviteur a les permissions pour inviter
      const canInvite = 
        inviterMember.role === 'ADMIN' ||
        inviterMember.role === 'CREATOR' ||
        authContext.registeredUser.role === 'ADMIN' ||
        authContext.registeredUser.role === 'BIGBOSS';

      if (!canInvite) {
        return reply.status(403).send({
          success: false,
          error: 'Vous n\'avez pas les permissions pour inviter des utilisateurs'
        });
      }

      // Vérifier que l'utilisateur à inviter existe
      const userToInvite = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          displayName: true,
          firstName: true,
          lastName: true
        }
      });

      if (!userToInvite) {
        return reply.status(404).send({
          success: false,
          error: 'Utilisateur non trouvé'
        });
      }

      // Vérifier que l'utilisateur n'est pas déjà membre
      const existingMember = conversation.members.find(m => m.userId === userId);
      if (existingMember) {
        return reply.status(400).send({
          success: false,
          error: 'Cet utilisateur est déjà membre de la conversation'
        });
      }

      // Ajouter l'utilisateur à la conversation
      const newMember = await fastify.prisma.conversationMember.create({
        data: {
          conversationId: conversationId,
          userId: userId,
          role: 'MEMBER',
          joinedAt: new Date(),
          isActive: true
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              firstName: true,
              lastName: true,
              avatar: true,
              isOnline: true
            }
          }
        }
      });

      // Envoyer une notification à l'utilisateur invité
      const notificationService = (fastify as any).notificationService;
      if (notificationService) {
        try {
          // Récupérer les informations de l'inviteur
          const inviter = await fastify.prisma.user.findUnique({
            where: { id: inviterId },
            select: {
              username: true,
              displayName: true,
              avatar: true
            }
          });

          if (inviter) {
            await notificationService.createConversationInviteNotification({
              invitedUserId: userId,
              inviterId: inviterId,
              inviterUsername: inviter.displayName || inviter.username,
              inviterAvatar: inviter.avatar || undefined,
              conversationId: conversationId,
              conversationTitle: conversation.title,
              conversationType: conversation.type
            });
            console.log(`[GATEWAY] 📩 Notification d'invitation envoyée à ${userId} pour la conversation ${conversationId}`);
          }
        } catch (notifError) {
          console.error('[GATEWAY] Erreur lors de l\'envoi de la notification d\'invitation:', notifError);
          // Ne pas bloquer l'invitation
        }
      }

      // PERFORMANCE: Invalider le cache d'autocomplete car la liste des membres a changé
      const mentionService = (fastify as any).mentionService;
      if (mentionService) {
        try {
          await mentionService.invalidateCacheForConversation(conversationId);
          console.log(`[GATEWAY] 🔄 Cache d'autocomplete invalidé pour la conversation ${conversationId}`);
        } catch (cacheError) {
          console.error('[GATEWAY] Erreur lors de l\'invalidation du cache:', cacheError);
          // Ne pas bloquer l'invitation
        }
      }

      return reply.send({
        success: true,
        data: {
          member: newMember,
          message: `${userToInvite.displayName || userToInvite.username} a été invité à la conversation`
        }
      });

    } catch (error) {
      console.error('Erreur lors de l\'invitation:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur interne du serveur'
      });
    }
  });


}
