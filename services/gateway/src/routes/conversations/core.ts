import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { MessageTranslationService } from '../../services/message-translation/MessageTranslationService';
import { conversationStatsService } from '../../services/ConversationStatsService';
import { UserRoleEnum, ErrorCode, MemberRole } from '@meeshy/shared/types';
import { createError, sendErrorResponse } from '@meeshy/shared/utils/errors';
import { ConversationSchemas, validateSchema } from '@meeshy/shared/utils/validation';
import {
  generateDefaultConversationTitle,
  isValidMongoId
} from '@meeshy/shared/utils/conversation-helpers';
import { UnifiedAuthRequest } from '../../middleware/auth';
import {
  conversationListResponseSchema,
  conversationResponseSchema,
  errorResponseSchema,
  createConversationRequestSchema,
  updateConversationRequestSchema
} from '@meeshy/shared/types/api-schemas';
import { canAccessConversation } from './utils/access-control';
import {
  generateConversationIdentifier,
  ensureUniqueConversationIdentifier
} from './utils/identifier-generator';
import type {
  ConversationParams,
  CreateConversationBody
} from './types';
import { conversationListCache, invalidateConversationCacheAsync } from '../../services/ConversationListCache';

/**
 * Résout l'ID de conversation réel à partir d'un identifiant (peut être un ObjectID ou un identifier)
 */
async function resolveConversationId(prisma: PrismaClient, identifier: string): Promise<string | null> {
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

/**
 * Enregistre les routes CRUD de base pour les conversations
 */
export function registerCoreRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  optionalAuth: any,
  requiredAuth: any
) {
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
  fastify.get<{ Querystring: { limit?: string; offset?: string; includeCount?: string; type?: string; withUserId?: string } }>('/conversations', {
    schema: {
      description: 'Get all conversations for the authenticated user with pagination support',
      tags: ['conversations'],
      summary: 'List user conversations',
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'string', description: 'Maximum number of conversations to return (max 50, default 15)' },
          offset: { type: 'string', description: 'Number of conversations to skip for pagination (default 0)' },
          includeCount: { type: 'string', enum: ['true', 'false'], description: 'Include total count of conversations' },
          type: { type: 'string', enum: ['direct', 'group', 'anonymous', 'broadcast'], description: 'Filter by conversation type' },
          withUserId: { type: 'string', description: 'Filter direct conversations that include this user ID as a participant' }
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
  }, async (request: FastifyRequest<{ Querystring: { limit?: string; offset?: string; includeCount?: string; type?: string; withUserId?: string } }>, reply) => {
    try {
      const authRequest = request as UnifiedAuthRequest;

      // Vérifier que l'utilisateur est authentifié
      if (!authRequest.authContext.isAuthenticated) {
        return reply.status(403).send({
          success: false,
          error: 'Authentication required to access conversations'
        });
      }

      const userId = authRequest.authContext.userId;

      // Paramètres de pagination (réduit à 15 par défaut pour améliorer la performance)
      const limit = Math.min(parseInt(request.query.limit || '15', 10), 50); // Max 50
      const offset = parseInt(request.query.offset || '0', 10);
      const includeCount = request.query.includeCount === 'true';

      // OPTIMIZED: Filtres optionnels pour éviter de charger toutes les conversations
      const typeFilter = request.query.type;
      const withUserId = request.query.withUserId;

      // === CACHE DISABLED ===
      // Le cache des conversations causait des problèmes de synchronisation
      // avec les lastMessage qui n'étaient pas à jour après nouveaux messages.
      // Désactivé jusqu'à implémentation d'une meilleure stratégie d'invalidation.
      const canUseCache = false; // DISABLED
      const cacheKey = userId;

      if (canUseCache) {
        const cached = await conversationListCache.get(cacheKey);
        if (cached) {
          console.log(`[CACHE-HIT] 🚀 Conversations servies depuis cache pour user ${userId} (${Date.now() - cached.cachedAt}ms old)`);
          return reply.send({
            success: true,
            data: cached.conversations,
            pagination: {
              limit,
              offset,
              total: cached.total,
              hasMore: cached.hasMore
            }
          });
        }
        console.log(`[CACHE-MISS] 💾 Cache miss pour user ${userId}, query DB...`);
      }

      // === PERFORMANCE INSTRUMENTATION ===
      const perfStart = performance.now();
      const perfTimings: Record<string, number> = {};

      let t0 = performance.now();

      // Build the where clause with optional filters
      const whereClause: any = {
        members: {
          some: {
            userId: userId,
            isActive: true
          }
        },
        isActive: true
      };

      // Add type filter if specified
      if (typeFilter) {
        whereClause.type = typeFilter;
      }

      // Add withUserId filter - find conversations where BOTH users are members
      if (withUserId) {
        whereClause.members = {
          every: {
            OR: [
              { userId: userId, isActive: true },
              { userId: withUserId, isActive: true }
            ]
          }
        };
        // Override to use AND with both conditions
        whereClause.AND = [
          { members: { some: { userId: userId, isActive: true } } },
          { members: { some: { userId: withUserId, isActive: true } } }
        ];
        delete whereClause.members;
      }

      t0 = performance.now();
      const conversations = await prisma.conversation.findMany({
        where: whereClause,
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
            take: 5, // Optimized: reduced from 10 to 5 for better performance
            where: {
              isActive: true
            },
            select: {
              id: true,
              userId: true,
              role: true,
              nickname: true,
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
                take: 1, // Optimized: only first attachment for preview
                select: {
                  id: true,
                  mimeType: true,
                  thumbnailUrl: true,
                  originalName: true,
                  fileSize: true
                }
              }
            }
          }
        },
        orderBy: { lastMessageAt: 'desc' }
      });
      perfTimings.conversationsQuery = performance.now() - t0;

      // Optimisation : Calculer tous les unreadCounts avec le système de curseur
      const conversationIds = conversations.map(c => c.id);

      // Collect all unique member userIds (optimized: only from returned conversations)
      const allMemberUserIds = new Set<string>();
      for (const conv of conversations) {
        for (const member of conv.members) {
          allMemberUserIds.add(member.userId);
        }
      }

      // === OPTIMIZED: Parallelize independent queries ===
      t0 = performance.now();

      const { MessageReadStatusService } = await import('../../services/MessageReadStatusService.js');
      const readStatusService = new MessageReadStatusService(prisma);

      const [memberUsers, unreadCountMap, totalCount] = await Promise.all([
        // Fetch user data only for members in these conversations
        allMemberUserIds.size > 0
          ? prisma.user.findMany({
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
          : Promise.resolve([]),

        // Unread counts
        readStatusService.getUnreadCountsForConversations(userId, conversationIds),

        // Count (if requested)
        (includeCount || offset === 0)
          ? prisma.conversation.count({ where: whereClause })
          : Promise.resolve(0)
      ]);

      perfTimings.parallelQueries = performance.now() - t0;
      const userMap = new Map(memberUsers.map(u => [u.id, u]));

      // Calculate hasMore
      const hasMore = (includeCount || offset === 0)
        ? offset + conversations.length < totalCount
        : conversations.length === limit;

      // Mapper les conversations avec unreadCount et merge user data
      const conversationsWithUnreadCount = conversations.map((conversation) => {
        const unreadCount = unreadCountMap.get(conversation.id) || 0;

        // Filter out orphaned members and merge user data (optimized: use userMap)
        const membersWithUser = conversation.members
          .filter((m: any) => userMap.has(m.userId))
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

      // === PERFORMANCE LOGGING (OPTIMIZED) ===
      const totalTime = performance.now() - perfStart;
      console.log('===============================================');
      console.log('[CONVERSATIONS_PERF] Query performance breakdown (OPTIMIZED v2)');
      console.log(`  - conversationsQuery: ${perfTimings.conversationsQuery?.toFixed(2)}ms`);
      console.log(`  - parallelQueries (users+unread+count): ${perfTimings.parallelQueries?.toFixed(2)}ms`);
      console.log(`  TOTAL: ${totalTime.toFixed(2)}ms`);
      console.log('===============================================');

      // === CACHE: Sauvegarder en cache si applicable (fire-and-forget) ===
      if (canUseCache) {
        conversationListCache.set(cacheKey, {
          conversations: conversationsWithUnreadCount,
          hasMore,
          total: totalCount,
          cachedAt: Date.now()
        }).catch(err => console.error('[CACHE-SAVE] Erreur sauvegarde cache:', err));
      }

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
      console.error('Error fetching conversations:', error);
      reply.status(500).send({
        success: false,
        error: 'Error retrieving conversations'
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
          error: 'Authentication required to access this conversation'
        });
      }

      const { id } = request.params;
      const userId = authRequest.authContext.userId;

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(prisma, id);
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
          error: 'Access denied: you are not a member of this conversation or it no longer exists',
          code: 'CONVERSATION_ACCESS_DENIED',
          suggestion: 'Please return to the home page to see your available conversations'
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
        // Marquer les notifications comme lues (filtrage client-side car conversationId est dans context JSON)
        const notifications = await prisma.notification.findMany({
          where: {
            userId,
            isRead: false
          }
        });

        const relevantNotifications = notifications.filter((n: any) =>
          n.context?.conversationId === conversationId
        );

        let notificationsMarkedCount = 0;
        for (const notif of relevantNotifications) {
          await prisma.notification.update({
            where: { id: notif.id },
            data: { isRead: true, readAt: new Date() }
          });
          notificationsMarkedCount++;
        }

        if (notificationsMarkedCount > 0) {
          fastify.log.info(`✅ Auto-marqué ${notificationsMarkedCount} notification(s) comme lues pour conversation ${conversationId}, userId ${userId}`);
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
      console.error('Error fetching conversation:', error);
      reply.status(500).send({
        success: false,
        error: 'Error retrieving conversation'
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
            error: 'Community not found'
          });
        }

        // Check if user is member of the community
        const isMember = community.createdBy === userId ||
                        community.members.some(member => member.userId === userId);

        if (!isMember) {
          return reply.status(403).send({
            success: false,
            error: 'You must be a member of this community to create a conversation'
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
                role: MemberRole.CREATOR
              },
              // Autres participants (sans doublons et sans le créateur)
              ...uniqueParticipantIds.map((participantId: string) => ({
                userId: participantId,
                role: MemberRole.MEMBER
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
              console.log(`📩 Notification d'invitation envoyée à ${participantId} pour la conversation ${conversation.id}`);
            }
          }
        } catch (notifError) {
          console.error('Erreur lors de l\'envoi des notifications d\'invitation:', notifError);
          // Ne pas bloquer la création de la conversation
        }
      }

      // Invalider le cache des conversations pour tous les membres (nouvelle conversation créée)
      await invalidateConversationCacheAsync(conversation.id, prisma);

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
          error: 'The global conversation cannot be modified'
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

      // Invalider le cache des conversations pour tous les membres (conversation modifiée)
      await invalidateConversationCacheAsync(id, prisma);

      reply.send({
        success: true,
        data: updatedConversation
      });

    } catch (error) {
      console.error('Error updating conversation:', error);
      reply.status(500).send({
        success: false,
        error: 'Error updating conversation'
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
          error: 'The global conversation cannot be deleted'
        });
      }

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return reply.status(403).send({
          success: false,
          error: 'Unauthorized access to this conversation'
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

      // Invalider le cache des conversations pour tous les membres (conversation supprimée)
      await invalidateConversationCacheAsync(conversationId, prisma);

      reply.send({
        success: true,
        data: { message: 'Conversation supprimée avec succès' }
      });

    } catch (error) {
      console.error('Error deleting conversation:', error);
      reply.status(500).send({
        success: false,
        error: 'Erreur lors de la suppression de la conversation'
      });
    }
  });
}
