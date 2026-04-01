import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { MessageTranslationService } from '../../services/message-translation/MessageTranslationService';
import { conversationStatsService } from '../../services/ConversationStatsService';
import { UserRoleEnum, ErrorCode } from '@meeshy/shared/types';
import { createError, sendErrorResponse } from '@meeshy/shared/utils/errors';
import { ConversationSchemas, validateSchema } from '@meeshy/shared/utils/validation';
import {
  generateDefaultConversationTitle
} from '@meeshy/shared/utils/conversation-helpers';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { UnifiedAuthRequest } from '../../middleware/auth';
import {
  conversationListResponseSchema,
  conversationResponseSchema,
  errorResponseSchema,
  createConversationRequestSchema,
  updateConversationRequestSchema
} from '@meeshy/shared/types/api-schemas';
import { canAccessConversation } from './utils/access-control';
import { sendSuccess, sendBadRequest, sendForbidden, sendNotFound, sendInternalError, sendError } from '../../utils/response';
import {
  generateConversationIdentifier,
  ensureUniqueConversationIdentifier
} from './utils/identifier-generator';
import type {
  ConversationParams,
  CreateConversationBody
} from './types';
import { buildCursorPaginationMeta } from '../../utils/pagination';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';

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

      return sendSuccess(reply, {
        available: !existingConversation,
        identifier
      });
    } catch (error) {
      console.error('[CONVERSATIONS] Error checking identifier availability:', error);
      return sendInternalError(reply, 'Failed to check identifier availability');
    }
  });

  // Route pour obtenir toutes les conversations de l'utilisateur
  fastify.get<{ Querystring: { limit?: string; offset?: string; before?: string; includeCount?: string; type?: string; withUserId?: string; updatedSince?: string } }>('/conversations', {
    schema: {
      description: 'Get all conversations for the authenticated user with pagination support',
      tags: ['conversations'],
      summary: 'List user conversations',
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'string', description: 'Maximum number of conversations to return (max 50, default 15)' },
          offset: { type: 'string', description: 'Number of conversations to skip for pagination (default 0)' },
          before: { type: 'string', description: 'Cursor for pagination: get conversations before this conversation ID (by lastMessageAt)' },
          includeCount: { type: 'string', enum: ['true', 'false'], description: 'Include total count of conversations' },
          type: { type: 'string', enum: ['direct', 'group', 'public', 'global', 'broadcast'], description: 'Filter by conversation type' },
          withUserId: { type: 'string', description: 'Filter direct conversations that include this user ID as a participant' },
          updatedSince: { type: 'string', description: 'ISO8601 timestamp — return only conversations updated after this time' }
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
  }, async (request: FastifyRequest<{ Querystring: { limit?: string; offset?: string; before?: string; includeCount?: string; type?: string; withUserId?: string; updatedSince?: string } }>, reply) => {
    try {
      const authRequest = request as UnifiedAuthRequest;

      // Vérifier que l'utilisateur est authentifié
      if (!authRequest.authContext.isAuthenticated) {
        return sendForbidden(reply, 'Authentication required to access conversations');
      }

      const userId = authRequest.authContext.userId;

      // Paramètres de pagination (réduit à 15 par défaut pour améliorer la performance)
      const limit = Math.min(parseInt(request.query.limit || '15', 10), 50); // Max 50
      const offset = parseInt(request.query.offset || '0', 10);
      const includeCount = request.query.includeCount === 'true';

      // OPTIMIZED: Filtres optionnels pour éviter de charger toutes les conversations
      const typeFilter = request.query.type;
      const withUserId = request.query.withUserId;
      const beforeCursor = request.query.before;
      const updatedSince = request.query.updatedSince;

      // === PERFORMANCE INSTRUMENTATION ===
      const perfStart = performance.now();
      const perfTimings: Record<string, number> = {};

      let t0 = performance.now();

      // Build the where clause with optional filters
      const whereClause: any = {
        participants: {
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
        whereClause.participants = {
          every: {
            OR: [
              { userId: userId, isActive: true },
              { userId: withUserId, isActive: true }
            ]
          }
        };
        // Override to use AND with both conditions
        whereClause.AND = [
          { participants: { some: { userId: userId, isActive: true } } },
          { participants: { some: { userId: withUserId, isActive: true } } }
        ];
        delete whereClause.participants;
      }

      // Cursor-based pagination: filter by lastMessageAt of the cursor conversation
      let cursorLastMessageAt: Date | null = null;
      if (beforeCursor) {
        const cursorConversation = await prisma.conversation.findFirst({
          where: { id: beforeCursor },
          select: { lastMessageAt: true }
        });
        if (cursorConversation?.lastMessageAt) {
          cursorLastMessageAt = cursorConversation.lastMessageAt;
          whereClause.lastMessageAt = { lt: cursorLastMessageAt };
        }
      }

      if (updatedSince) {
        const sinceDate = new Date(updatedSince);
        if (!isNaN(sinceDate.getTime())) {
          whereClause.updatedAt = { gt: sinceDate };
        }
      }

      t0 = performance.now();
      const conversations = await prisma.conversation.findMany({
        where: whereClause,
        skip: beforeCursor ? 0 : offset,
        take: limit,
        select: {
          id: true,
          title: true,
          type: true,
          identifier: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          lastMessageAt: true,
          banner: true,
          avatar: true,
          communityId: true,
          memberCount: true,
          isAnnouncementChannel: true,
          participants: {
            take: 5,
            where: {
              isActive: true
            },
            select: {
              id: true,
              conversationId: true,
              type: true,
              userId: true,
              displayName: true,
              avatar: true,
              role: true,
              language: true,
              permissions: true,
              nickname: true,
              joinedAt: true,
              isActive: true,
              isOnline: true,
              lastActiveAt: true,
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
            }
          },
          // User preferences (isPinned, isMuted, isArchived, tags, categoryId)
          userPreferences: {
            where: { userId: userId },
            take: 1,
            select: {
              isPinned: true,
              isMuted: true,
              isArchived: true,
              deletedForUserAt: true,
              tags: true,
              categoryId: true,
              reaction: true
            }
          },
          messages: {
            where: {
              deletedAt: null
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              content: true,
              createdAt: true,
              senderId: true,
              messageType: true,
              isBlurred: true,
              isViewOnce: true,
              effectFlags: true,
              expiresAt: true,
              sender: {
                select: {
                  id: true,
                  userId: true,
                  displayName: true,
                  avatar: true,
                  type: true,
                  user: {
                    select: {
                      id: true,
                      username: true,
                      displayName: true,
                      avatar: true
                    }
                  }
                }
              },
              attachments: {
                take: 1, // Optimized: only first attachment for preview
                select: {
                  id: true,
                  mimeType: true,
                  thumbnailUrl: true,
                  originalName: true,
                  fileSize: true,
                  // Media metadata for proper display
                  duration: true,    // Audio/Video duration in ms
                  width: true,       // Image/Video width
                  height: true,      // Image/Video height
                  bitrate: true,     // Audio/Video bitrate
                  sampleRate: true,  // Audio sample rate
                  metadata: true     // Additional metadata (effects, etc.)
                }
              },
              _count: {
                select: { attachments: true }
              }
            }
          }
        },
        orderBy: { lastMessageAt: 'desc' }
      });
      perfTimings.conversationsQuery = performance.now() - t0;

      // Optimisation : Calculer tous les unreadCounts avec le système de curseur
      const conversationIds = conversations.map(c => c.id);

      const currentUserParticipants = userId ? await prisma.participant.findMany({
        where: {
          conversationId: { in: conversationIds },
          userId: userId,
          isActive: true
        },
        select: {
          conversationId: true,
          role: true,
          joinedAt: true
        }
      }) : [];
      const currentUserRoleMap = new Map(
        currentUserParticipants.map(p => [p.conversationId, p.role])
      );
      const currentUserJoinedAtMap = new Map(
        currentUserParticipants.map(p => [p.conversationId, p.joinedAt])
      );

      // Collect all unique member userIds (optimized: only from returned conversations)
      // Filter out null userIds (anonymous participants have userId: null)
      const allMemberUserIds = new Set<string>();
      for (const conv of conversations) {
        for (const member of (conv as any).participants) {
          if (member.userId) {
            allMemberUserIds.add(member.userId);
          }
        }
      }

      // === OPTIMIZED: Parallelize independent queries ===
      t0 = performance.now();

      const { MessageReadStatusService } = await import('../../services/MessageReadStatusService.js');
      const readStatusService = new MessageReadStatusService(prisma);

      // Resolve current user's participantIds for unread counts
      const userParticipants = conversationIds.length > 0
        ? prisma.participant.findMany({
            where: { userId, conversationId: { in: conversationIds }, isActive: true },
            select: { id: true }
          })
        : Promise.resolve([]);

      const [memberUsers, userParticipantRecords, totalCount] = await Promise.all([
        // Fetch user data with firstName/lastName for DM name resolution
        // (participant.user select only has displayName, not firstName/lastName)
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

        // Resolve participantIds for unread count query
        userParticipants,

        // Count (if requested) - skip when using cursor pagination
        (!beforeCursor && (includeCount || offset === 0))
          ? prisma.conversation.count({ where: whereClause })
          : Promise.resolve(0)
      ]);

      // Unread counts using resolved participantIds
      const participantIds = userParticipantRecords.map(p => p.id);
      const unreadCountMap = participantIds.length > 0
        ? await readStatusService.getUnreadCountsForConversations(participantIds, conversationIds)
        : new Map<string, number>();

      perfTimings.parallelQueries = performance.now() - t0;
      const userMap = new Map(memberUsers.map(u => [u.id, u]));

      // Calculate hasMore
      const hasMore = (includeCount || offset === 0)
        ? offset + conversations.length < totalCount
        : conversations.length === limit;

      // Mapper les conversations avec unreadCount et merge user data
      const conversationsWithUnreadCount = conversations.map((conversation) => {
        const unreadCount = unreadCountMap.get(conversation.id) || 0;

        // Merge user data for all participants (never filter out — SDK needs them for DM name resolution)
        const membersWithUser = conversation.participants
          .slice(0, 5)
          .map((m: any) => ({
            ...m,
            avatar: m.avatar,
            user: m.userId ? (userMap.get(m.userId) ? userMap.get(m.userId) : m.user ?? null) : null
          }));

        // Pour les DMs, pas de titre obligatoire — le frontend résout le nom de l'interlocuteur
        // Pour les groupes/publics, s'assurer qu'un titre existe
        const displayTitle = conversation.type === 'direct'
          ? (conversation.title || null)
          : (conversation.title && conversation.title.trim() !== ''
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
                ));

        return {
          ...conversation,
          participants: membersWithUser,
          title: displayTitle,
          lastMessage: (() => {
            const msg = conversation.messages[0];
            if (!msg) return null;
            const sender = msg.sender as any;
            return {
              ...msg,
              sender: sender ? {
                ...sender,
                username: sender.user?.username ?? sender.username ?? null,
                firstName: sender.user?.firstName ?? null,
                lastName: sender.user?.lastName ?? null,
                displayName: sender.displayName ?? sender.user?.displayName ?? null,
                avatar: sender.avatar ?? sender.user?.avatar ?? null,
                isOnline: sender.user?.isOnline ?? sender.isOnline ?? null,
                lastActiveAt: sender.user?.lastActiveAt ?? sender.lastActiveAt ?? null,
              } : null
            };
          })(),
          unreadCount,
          currentUserRole: currentUserRoleMap.get(conversation.id) || null,
          currentUserJoinedAt: currentUserJoinedAtMap.get(conversation.id) || null
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

      // Build cursor pagination meta
      const lastConversation = conversationsWithUnreadCount.length > 0
        ? conversationsWithUnreadCount[conversationsWithUnreadCount.length - 1]
        : null;
      const cursorPaginationMeta = buildCursorPaginationMeta(
        limit,
        conversationsWithUnreadCount.length,
        lastConversation?.id ?? null
      );

      reply.header('Cache-Control', 'private, no-cache');
      // NOTE: Cannot use sendSuccess() — response includes top-level `pagination` and
      // `cursorPagination` fields that iOS SDK (ConversationListResponse) and web
      // (conversations.service.ts) parse at root level. Migration to sendSuccess requires
      // a coordinated client update (breaking change).
      reply.send({
        success: true,
        data: conversationsWithUnreadCount,
        pagination: {
          limit,
          offset,
          total: totalCount,
          hasMore
        },
        cursorPagination: cursorPaginationMeta
      });

    } catch (error) {
      console.error('Error fetching conversations:', error);
      sendInternalError(reply, 'Error retrieving conversations');
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
        return sendForbidden(reply, 'Authentication required to access this conversation');
      }

      const { id } = request.params;
      const userId = authRequest.authContext.userId;

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      // Vérifier les permissions d'accès
      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);

      if (!canAccess) {
          return sendForbidden(reply, 'Access denied: you are not a member of this conversation or it no longer exists', { code: 'CONVERSATION_ACCESS_DENIED' });
      }

      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId },
        include: {
          participants: {
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
            take: 1,
            select: {
              isPinned: true,
              isMuted: true,
              isArchived: true,
              deletedForUserAt: true,
              tags: true,
              categoryId: true,
              reaction: true
            }
          }
        }
      });

      if (!conversation) {
        return sendNotFound(reply, 'Conversation not found');
      }

      // Pour les DMs, pas de titre — le frontend résout le nom de l'interlocuteur
      const displayTitle = (conversation as any).type === 'direct'
        ? (conversation.title || null)
        : (conversation.title && conversation.title.trim() !== ''
            ? conversation.title
            : generateDefaultConversationTitle(
                conversation.participants.map((m: any) => ({
                  id: m.userId,
                  displayName: m.user?.displayName,
                  username: m.user?.username,
                  firstName: m.user?.firstName,
                  lastName: m.user?.lastName
                })),
                userId
              ));

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

      return sendSuccess(reply, {
        ...conversation,
        title: displayTitle,
        meta: {
          conversationStats: stats
        }
      });

    } catch (error) {
      console.error('Error fetching conversation:', error);
      sendInternalError(reply, 'Error retrieving conversation');
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

      const { type, title, description, participantIds = [], communityId, identifier } = validatedData as { type: string; title?: string; description?: string; participantIds?: string[]; communityId?: string; identifier?: string };

      // Utiliser le nouveau système d'authentification unifié
      const authContext = (request as UnifiedAuthRequest).authContext;
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
          return sendNotFound(reply, 'Community not found');
        }

        // Check if user is member of the community
        const isMember = community.createdBy === userId ||
                        community.members.some(member => member.userId === userId);

        if (!isMember) {
          return sendForbidden(reply, 'You must be a member of this community to create a conversation');
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

      const allUserIds = [userId, ...uniqueParticipantIds];
      const allUsers = await prisma.user.findMany({
        where: { id: { in: allUserIds } },
        select: { id: true, displayName: true, username: true }
      });
      const userMap = new Map(allUsers.map(u => [u.id, u]));
      const defaultPermissions = {
        canSendMessages: true,
        canSendFiles: true,
        canSendImages: true,
        canSendVideos: false,
        canSendAudios: false,
        canSendLocations: false,
        canSendLinks: false
      };

      const creatorUser = userMap.get(userId);
      // Broadcast = announcement channel with admin-only write
      const isBroadcast = type === 'broadcast';

      const conversation = await prisma.conversation.create({
        data: {
          identifier: finalIdentifier,
          type,
          title,
          description,
          communityId: communityId || null,
          ...(isBroadcast ? { isAnnouncementChannel: true, defaultWriteRole: 'admin' } : {}),
          participants: {
            create: [
              {
                userId,
                type: 'user',
                displayName: creatorUser?.displayName || creatorUser?.username || 'User',
                role: 'creator',
                permissions: defaultPermissions
              },
              ...uniqueParticipantIds.map((participantId: string) => {
                const pUser = userMap.get(participantId);
                return {
                  userId: participantId,
                  type: 'user',
                  displayName: pUser?.displayName || pUser?.username || 'User',
                  role: 'member',
                  permissions: defaultPermissions
                };
              })
            ]
          }
        },
        include: {
          participants: {
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

      // Pour les DMs, pas de titre — le frontend résout le nom de l'interlocuteur
      const displayTitle = type === 'direct'
        ? (conversation.title || null)
        : (conversation.title && conversation.title.trim() !== ''
            ? conversation.title
            : generateDefaultConversationTitle(
                conversation.participants.map((m: any) => ({
                  id: m.userId,
                  displayName: m.user?.displayName,
                  username: m.user?.username,
                  firstName: m.user?.firstName,
                  lastName: m.user?.lastName
                })),
                userId
              ));

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

      return sendSuccess(reply, {
        ...conversation,
        title: displayTitle
      }, { statusCode: 201 });

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
      const { title, description, avatar, banner, defaultWriteRole, isAnnouncementChannel, slowModeSeconds, autoTranslateEnabled } = request.body as {
        title?: string
        description?: string
        avatar?: string | null
        banner?: string | null
        defaultWriteRole?: string
        isAnnouncementChannel?: boolean
        slowModeSeconds?: number
        autoTranslateEnabled?: boolean
      };
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Vérifier les permissions d'administration
      const membership = await prisma.participant.findFirst({
        where: {
          conversationId: id,
          userId: userId,
          role: { in: ['CREATOR', 'ADMIN', 'MODERATOR'] },
          isActive: true
        }
      });

      if (!membership && id !== "meeshy") {
        return sendForbidden(reply, 'Vous n\'êtes pas autorisé à modifier cette conversation');
      }

      // Interdire la modification de la conversation globale
      if (id === "meeshy") {
        return sendForbidden(reply, 'The global conversation cannot be modified');
      }

      if (membership?.role === 'MODERATOR') {
        if (defaultWriteRole !== undefined || isAnnouncementChannel !== undefined ||
            slowModeSeconds !== undefined || autoTranslateEnabled !== undefined) {
          return sendForbidden(reply, 'Les modérateurs ne peuvent pas modifier les permissions');
        }
      }

      const updatedConversation = await prisma.conversation.update({
        where: { id },
        data: {
          title,
          description,
          ...(avatar !== undefined && { avatar }),
          ...(banner !== undefined && { banner }),
          ...(defaultWriteRole !== undefined && { defaultWriteRole }),
          ...(isAnnouncementChannel !== undefined && { isAnnouncementChannel }),
          ...(slowModeSeconds !== undefined && { slowModeSeconds }),
          ...(autoTranslateEnabled !== undefined && { autoTranslateEnabled }),
        },
        include: {
          participants: {
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

      const changedFields: Record<string, unknown> = {}
      if (title !== undefined) changedFields.title = title
      if (description !== undefined) changedFields.description = description
      if (avatar !== undefined) changedFields.avatar = avatar
      if (banner !== undefined) changedFields.banner = banner
      if (defaultWriteRole !== undefined) changedFields.defaultWriteRole = defaultWriteRole
      if (isAnnouncementChannel !== undefined) changedFields.isAnnouncementChannel = isAnnouncementChannel
      if (slowModeSeconds !== undefined) changedFields.slowModeSeconds = slowModeSeconds
      if (autoTranslateEnabled !== undefined) changedFields.autoTranslateEnabled = autoTranslateEnabled

      const socketIOHandler = (fastify as any).socketIOHandler
      const socketIOManager = socketIOHandler?.getManager?.()
      const io = socketIOManager?.io || (socketIOHandler as any)?.io
      if (io) {
        const room = ROOMS.conversation(id)
        io.to(room).emit(SERVER_EVENTS.CONVERSATION_UPDATED, {
          conversationId: id,
          ...changedFields,
          updatedBy: { id: userId },
          updatedAt: new Date().toISOString(),
        })
      }

      return sendSuccess(reply, updatedConversation);

    } catch (error) {
      console.error('Error updating conversation:', error);
      sendInternalError(reply, 'Error updating conversation');
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
        return sendForbidden(reply, 'The global conversation cannot be deleted');
      }

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      // Vérifier les permissions d'administration
      const membership = await prisma.participant.findFirst({
        where: {
          conversationId: conversationId,
          userId: userId,
          role: { in: ['CREATOR', 'ADMIN'] },
          isActive: true
        }
      });

      if (!membership) {
        return sendForbidden(reply, 'Vous n\'êtes pas autorisé à supprimer cette conversation');
      }

      // Marquer la conversation comme inactive plutôt que de la supprimer
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { isActive: false }
      });

      return sendSuccess(reply, { message: 'Conversation supprimée avec succès' });

    } catch (error) {
      console.error('Error deleting conversation:', error);
      sendInternalError(reply, 'Erreur lors de la suppression de la conversation');
    }
  });

  // Route pour obtenir l'analyse agent d'une conversation
  fastify.get<{ Params: ConversationParams }>('/conversations/:id/analysis', {
    schema: {
      description: 'Get agent analysis for a conversation (summary, tone, participant profiles)',
      tags: ['conversations'],
      summary: 'Get conversation analysis',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      response: {
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const authRequest = request as UnifiedAuthRequest;
      const { id } = request.params;
      const userId = authRequest.authContext.userId;

      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!canAccess) {
        return sendForbidden(reply, 'Access denied');
      }

      const [summary, roles] = await Promise.all([
        prisma.agentConversationSummary.findUnique({
          where: { conversationId }
        }),
        prisma.agentUserRole.findMany({
          where: { conversationId },
          select: {
            userId: true,
            personaSummary: true,
            tone: true,
            vocabularyLevel: true,
            typicalLength: true,
            emojiUsage: true,
            topicsOfExpertise: true,
            catchphrases: true,
            commonEmojis: true,
            reactionPatterns: true,
            messagesAnalyzed: true,
            confidence: true,
          }
        })
      ]);

      // Enrichir les roles avec username/displayName
      const userIds = roles.map(r => r.userId);
      const users = userIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, username: true, firstName: true, lastName: true, avatar: true }
          })
        : [];

      const userMap = new Map(users.map(u => [u.id, u]));

      const participantProfiles = roles.map(role => {
        const user = userMap.get(role.userId);
        return {
          userId: role.userId,
          username: user?.username ?? null,
          displayName: user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.username : null,
          avatar: user?.avatar ?? null,
          personaSummary: role.personaSummary,
          tone: role.tone,
          vocabularyLevel: role.vocabularyLevel,
          typicalLength: role.typicalLength,
          emojiUsage: role.emojiUsage,
          topicsOfExpertise: role.topicsOfExpertise,
          catchphrases: role.catchphrases,
          commonEmojis: role.commonEmojis,
          reactionPatterns: role.reactionPatterns,
          messagesAnalyzed: role.messagesAnalyzed,
          confidence: role.confidence,
        };
      });

      return sendSuccess(reply, {
        conversationId,
        summary: summary ? {
          text: summary.summary,
          currentTopics: summary.currentTopics,
          overallTone: summary.overallTone,
          messageCount: summary.messageCount,
          updatedAt: summary.updatedAt,
        } : null,
        participantProfiles,
      });

    } catch (error) {
      console.error('Error fetching conversation analysis:', error);
      sendInternalError(reply, 'Error fetching conversation analysis');
    }
  });
}
