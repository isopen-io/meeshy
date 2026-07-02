import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { MessageTranslationService } from '../../services/message-translation/MessageTranslationService';
import { UserRoleEnum, ErrorCode } from '@meeshy/shared/types';
import { createError, sendErrorResponse } from '@meeshy/shared/utils/errors';
import { resolveParticipantAvatar } from '@meeshy/shared/utils/participant-helpers';
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
import { isBlockedBetween } from '../../utils/blocking';
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
import { sendWithETag } from '../../utils/etag';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { SecuritySanitizer } from '../../utils/sanitize.js';

const logger = enhancedLogger.child({ module: 'conversations/core' });

/**
 * Participant fields fetched + serialized per participant in the GET
 * /conversations LIST response (up to 5 participants × N conversations per
 * page, so per-field over-fetch multiplies).
 *
 * T17 — `permissions` (a ~20-boolean ParticipantPermissions object) is
 * intentionally NOT selected here: no client (iOS SDK/app or web) reads
 * participant permissions in the list view, and the conversation DETAIL
 * endpoint (`GET /conversations/:id`) still fetches it via an unfiltered
 * include. `language` IS kept — the web frontend reads `participant.language`
 * for conversation-title language resolution (`apps/web/utils/user.ts`).
 */
export const conversationListParticipantSelect = {
  id: true,
  conversationId: true,
  type: true,
  userId: true,
  displayName: true,
  avatar: true,
  role: true,
  language: true,
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
      firstName: true,
      lastName: true,
      avatar: true,
      banner: true,
      isOnline: true,
      lastActiveAt: true
    }
  }
} as const;

/**
 * Iter 33 (F1) — GET /conversations/:id DETAIL include. Participants are
 * capped: a 500-member group used to ship ~500 KB of hydrated participants on
 * every conversation open. Clients tolerate a partial list (web renders the
 * first 3, iOS resolves DM titles from the first 2) and load the full roster
 * through the dedicated paginated GET /conversations/:id/participants
 * endpoint. The filtered `_count` carries the exact active-member total,
 * surfaced as `memberCount` in the response (declared in
 * `conversationSchema`, so it survives fast-json-stringify).
 *
 * Iter 35 (F8) — strict `select` instead of `include`: the wire schema
 * (`conversationParticipantSchema`) declares no nested `user` and only the
 * scalars below, so fast-json-stringify already stripped the rest — the DB was
 * hydrating dead fields (including the sensitive `sessionTokenHash` and the
 * embedded `anonymousSession` document) for up to 100 participants per open.
 * The nested user is server-side only: `generateDefaultConversationTitle`
 * reads displayName/username/firstName/lastName.
 */
export const CONVERSATION_DETAIL_PARTICIPANTS_CAP = 100;

export const conversationDetailInclude = {
  participants: {
    where: { isActive: true },
    orderBy: { joinedAt: 'asc' },
    take: CONVERSATION_DETAIL_PARTICIPANTS_CAP,
    select: {
      id: true,
      userId: true,
      type: true,
      displayName: true,
      avatar: true,
      role: true,
      permissions: true,
      isActive: true,
      isOnline: true,
      lastActiveAt: true,
      joinedAt: true,
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          firstName: true,
          lastName: true
        }
      }
    }
  },
  _count: {
    select: { participants: { where: { isActive: true } } }
  }
} as const;

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
      logger.error('error checking identifier availability', { error });
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

      // Paramètres de pagination. Default 30 (compromise between perf and
      // round-trips); max 100 to let large-account clients fetch their full
      // list in fewer pages — previously capped at 50, which forced 88+
      // conversation accounts through 2 pages and exposed pagination bugs
      // (offset stagnation, hasMore mis-reads) for any partial sync.
      const limit = Math.min(parseInt(request.query.limit || '30', 10), 100); // Max 100
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

      // Build the where clause with optional filters.
      //
      // `deletedForMe` matches en deux temps : valeur null explicite OU champ
      // absent. Sans le `isSet: false` (filtre MongoDB-only de Prisma), les
      // documents Participant herites ne possedant pas le champ `deletedForMe`
      // du tout (cree avant l'introduction du concept, 10 docs sur 716 dans
      // l'instance prod du 2026-05-11) etaient exclus de la liste — les
      // conversations DM correspondantes (Bertine, Suz, etc.) disparaissaient
      // meme apres pull-to-refresh. Le `NOT: { not: null }` precedent et le
      // `deletedForMe: null` simple ont la meme limite : ils ne matchent que
      // les champs presents avec valeur null.
      const whereClause: any = {
        participants: {
          some: {
            userId: userId,
            isActive: true,
            OR: [
              { deletedForMe: null },
              { deletedForMe: { isSet: false } }
            ]
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
            select: conversationListParticipantSelect
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

      // Extract current user's participant data from already-fetched participants (take:5 per conv).
      // For DMs and small groups the current user is always in the first 5 — zero extra DB queries.
      // Only fall back to a batch query for large groups where the current user wasn't in top 5.
      const currentUserRoleMap = new Map<string, string>();
      const currentUserJoinedAtMap = new Map<string, Date | null>();
      const convsMissingCurrentUser: string[] = [];

      if (userId) {
        for (const conv of conversations) {
          const found = (conv as any).participants.find((p: any) => p.userId === userId);
          if (found) {
            currentUserRoleMap.set(conv.id, found.role);
            currentUserJoinedAtMap.set(conv.id, found.joinedAt);
          } else {
            convsMissingCurrentUser.push(conv.id);
          }
        }
        if (convsMissingCurrentUser.length > 0) {
          const remaining = await prisma.participant.findMany({
            where: { conversationId: { in: convsMissingCurrentUser }, userId, isActive: true },
            select: { conversationId: true, role: true, joinedAt: true }
          });
          for (const p of remaining) {
            currentUserRoleMap.set(p.conversationId, p.role);
            currentUserJoinedAtMap.set(p.conversationId, p.joinedAt);
          }
        }
      }

      // === OPTIMIZED: Parallelize independent queries ===
      // firstName/lastName now fetched via conversationListParticipantSelect.user.select —
      // memberUsers query eliminated (iter-8).
      t0 = performance.now();

      const { MessageReadStatusService } = await import('../../services/MessageReadStatusService.js');
      const readStatusService = new MessageReadStatusService(prisma);

      const [totalCount, unreadCountMap] = await Promise.all([
        // Count (if requested) - skip when using cursor pagination
        (!beforeCursor && (includeCount || offset === 0))
          ? prisma.conversation.count({ where: whereClause })
          : Promise.resolve(0),

        // Unread counts — iter-4: appel direct par userId (2+N queries vs 4×N)
        conversationIds.length > 0
          ? readStatusService.getUnreadCountsForUser(userId, conversationIds)
          : Promise.resolve(new Map<string, number>()),
      ]);

      perfTimings.parallelQueries = performance.now() - t0;

      // Override runtime de isOnline : la DB peut être obsolète (heartbeat manqué,
      // crash gateway, déconnexion non détectée). La source de vérité est `connectedUsers`
      // Map du SocketIOManager, exposée via le décorateur `presenceChecker`.
      const presenceChecker = fastify.presenceChecker;

      // Calculate hasMore. Two strategies:
      //   1. When we have a real `totalCount` (includeCount=true OR
      //      offset===0 — see L401-405), `hasMore = offset + N < total`.
      //   2. When totalCount is a sentinel `0` (skipped to save a query),
      //      fall back to "the page is full" → `length === limit`. This
      //      is conservative: if the page is exactly full we assume there
      //      MIGHT be another, and let the next request settle it.
      // Previously, branch (1) fired even when `totalCount===0` (because
      // includeCount=false and offset>0 still skipped the count query),
      // making `hasMore` falsely false and freezing infinite scroll.
      let hasMore: boolean;
      if (totalCount > 0 && (includeCount || offset === 0)) {
        hasMore = offset + conversations.length < totalCount;
      } else {
        hasMore = conversations.length === limit;
      }

      // Mapper les conversations avec unreadCount et merge user data
      const conversationsWithUnreadCount = conversations.map((conversation) => {
        const unreadCount = unreadCountMap.get(conversation.id) || 0;

        // Merge presence override. firstName/lastName now come directly from m.user
        // (participant select was extended in iter-8 — no separate memberUsers query needed).
        const membersWithUser = conversation.participants
          .slice(0, 5)
          .map((m: any) => {
            const liveOnline = presenceChecker?.isOnline(m.userId ?? m.id);
            return {
              ...m,
              // Bannière de profil top-level : le schéma participant est plat
              // (strippe `user`), donc on expose la bannière du destinataire
              // au niveau participant pour la remontée en DM.
              banner: m.user?.banner ?? m.banner ?? null,
              isOnline: liveOnline === undefined ? m.isOnline : liveOnline,
              user: m.userId
                ? { ...m.user, isOnline: liveOnline === undefined ? m.user?.isOnline : liveOnline }
                : null
            };
          });

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
                avatar: resolveParticipantAvatar(sender),
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

      const totalTime = performance.now() - perfStart;
      logger.debug('CONVERSATIONS_PERF', {
        conversationsQuery: perfTimings.conversationsQuery?.toFixed(2),
        parallelQueries: perfTimings.parallelQueries?.toFixed(2),
        total: totalTime.toFixed(2)
      });

      // Build cursor pagination meta
      const lastConversation = conversationsWithUnreadCount.length > 0
        ? conversationsWithUnreadCount[conversationsWithUnreadCount.length - 1]
        : null;
      const cursorPaginationMeta = buildCursorPaginationMeta(
        limit,
        conversationsWithUnreadCount.length,
        lastConversation?.id ?? null
      );

      // NOTE: Cannot use sendSuccess() — response includes top-level `pagination` and
      // `cursorPagination` fields that iOS SDK (ConversationListResponse) and web
      // (conversations.service.ts) parse at root level. Migration to sendSuccess requires
      // a coordinated client update (breaking change).
      const responseBody = {
        success: true,
        data: conversationsWithUnreadCount,
        pagination: {
          limit,
          offset,
          total: totalCount,
          hasMore
        },
        cursorPagination: cursorPaginationMeta
      };
      // T15 — ETag + If-None-Match→304: don't re-send an unchanged conversation
      // list body. `sendWithETag` sets ETag + Cache-Control: private, no-cache
      // (always revalidate) and short-circuits with a body-less 304 on a match.
      if (sendWithETag(request, reply, responseBody)) return;
      reply.send(responseBody);

    } catch (error) {
      logger.error('error fetching conversations', { error });
      return sendInternalError(reply, 'Error retrieving conversations');
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
          ...conversationDetailInclude,
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

      // Calculer le unreadCount pour l'utilisateur courant
      let unreadCount = 0;
      try {
        const participant = await prisma.participant.findFirst({
          where: { conversationId, userId, isActive: true },
          select: { id: true },
        });
        if (participant) {
          const { MessageReadStatusService } = await import('../../services/MessageReadStatusService.js');
          const readStatusService = new MessageReadStatusService(prisma);
          unreadCount = await readStatusService.getUnreadCount(participant.id, conversationId);
        }
      } catch (unreadError) {
        logger.warn('failed to compute unreadCount for conversation', { conversationId, error: unreadError });
      }

      // Marquer automatiquement les notifications de cette conversation comme lues —
      // délégué au service (1 seul update Mongo filtré sur context.conversationId,
      // émet notification:counts pour resynchroniser cloche/badge) et fire-and-forget :
      // effet de bord non essentiel, hors du chemin critique de la réponse
      // (même pattern que posts/interactions.ts pour markPostNotificationsAsRead).
      fastify.notificationService
        ?.markConversationNotificationsAsRead(userId, conversationId)
        .catch((notifError: unknown) => {
          logger.error('error marking auto notifications for conversation', { conversationId, error: notifError });
        });

      // NOTE : l'ancien bloc `meta.conversationStats` (getOrCompute + payload)
      // a été retiré — `conversationSchema` ne déclare pas `meta`, donc
      // fast-json-stringify le strippait du wire : calcul DB coûteux
      // (message.groupBy plein scan à froid, TTL 1h) pour un résultat jeté.
      // Les clients consomment les stats via l'event Socket.IO
      // `conversation:stats`, qui se recompute seul (updateOnNewMessage).
      const { _count, ...conversationData } = conversation;
      return sendSuccess(reply, {
        ...conversationData,
        title: displayTitle,
        memberCount: _count.participants,
        unreadCount
      });

    } catch (error) {
      logger.error('error fetching conversation', { error });
      return sendInternalError(reply, 'Error retrieving conversation');
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

      const { type, title: rawTitle, description: rawDescription, participantIds = [], communityId, identifier } = validatedData as { type: string; title?: string; description?: string; participantIds?: string[]; communityId?: string; identifier?: string };
      const title = rawTitle !== undefined ? SecuritySanitizer.sanitizeText(rawTitle) : undefined;
      const description = rawDescription !== undefined ? SecuritySanitizer.sanitizeText(rawDescription) : undefined;

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

      // Block enforcement applies to DIRECT conversations only (group / community /
      // public / global / broadcast are never block-enforced). Bidirectional: reject
      // if the creator blocked the other party OR the other party blocked the creator.
      if (type === 'direct' && uniqueParticipantIds.length === 1) {
        const blocked = await isBlockedBetween(prisma, userId, uniqueParticipantIds[0]);
        if (blocked) {
          throw createError(ErrorCode.USER_BLOCKED);
        }
      }

      const allUserIds = [userId, ...uniqueParticipantIds];
      const allUsers = await prisma.user.findMany({
        where: { id: { in: allUserIds } },
        select: { id: true, displayName: true, username: true, avatar: true }
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
                  avatar: true,
                  banner: true
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

      // Diffuser le nouvel event typé CONVERSATION_NEW à TOUS les participants
      // — y compris le créateur — dans leurs user-rooms respectives. Avant ce
      // change, le créateur n'avait AUCUN signal socket (la boucle de
      // notifications ci-dessous itère uniquement sur `uniqueParticipantIds`
      // qui exclut `userId`), ce qui forçait les clients iOS et web à
      // implémenter un workaround local (ConversationCreatedBroadcaster sur
      // iOS) pour faire apparaître la nouvelle conversation immédiatement.
      // Avec CONVERSATION_NEW, la source de vérité reste sur le gateway et
      // tous les clients (web, iOS, future plateformes) reçoivent le même
      // payload typé. La notification:new legacy reste émise en parallèle
      // pour compat avec les anciens clients pendant ~3 mois.
      try {
        const socketIOHandler = fastify.socketIOHandler;
        const io = socketIOHandler?.getManager()?.getIO();
        if (io) {
          const allParticipantIds = [userId, ...uniqueParticipantIds];
          const conversationNewPayload = {
            conversationId: conversation.id,
            conversationType: type,
            title: displayTitle,
            creatorId: userId,
            participantIds: allParticipantIds,
            createdAt: conversation.createdAt instanceof Date
              ? conversation.createdAt.toISOString()
              : String(conversation.createdAt)
          };
          for (const participantId of allParticipantIds) {
            io.to(ROOMS.user(participantId)).emit(
              SERVER_EVENTS.CONVERSATION_NEW,
              conversationNewPayload
            );
          }
        }
      } catch (broadcastError) {
        logger.error('error broadcasting CONVERSATION_NEW', { error: broadcastError });
        // Non bloquant : la conversation est créée, les clients la verront
        // au prochain delta sync ou via la notification legacy ci-dessous.
      }

      // Envoyer des notifications aux participants invités
      const notificationService = fastify.notificationService;
      if (notificationService && uniqueParticipantIds.length > 0) {
        try {
          // Le créateur est déjà chargé dans userMap (userId ∈ allUserIds) :
          // pas de second aller-retour DB.
          const creator = userMap.get(userId);

          if (creator) {
            // Notifications d'invitation indépendantes : fan-out parallèle (O(1) latence).
            await Promise.all(
              uniqueParticipantIds.map(async (participantId) => {
                await notificationService.createConversationInviteNotification({
                  invitedUserId: participantId,
                  inviterId: userId,
                  inviterUsername: creator.displayName || creator.username,
                  inviterAvatar: creator.avatar || undefined,
                  conversationId: conversation.id,
                  conversationTitle: displayTitle,
                  conversationType: type
                });
                logger.debug('invitation notification sent', { participantId, conversationId: conversation.id });
              })
            );
          }
        } catch (notifError) {
          logger.error('error sending invitation notifications', { error: notifError });
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
      const { title: rawTitle, description: rawDescription, avatar, banner, defaultWriteRole, isAnnouncementChannel, slowModeSeconds, autoTranslateEnabled } = request.body as {
        title?: string
        description?: string
        avatar?: string | null
        banner?: string | null
        defaultWriteRole?: string
        isAnnouncementChannel?: boolean
        slowModeSeconds?: number
        autoTranslateEnabled?: boolean
      };
      const title = rawTitle !== undefined ? SecuritySanitizer.sanitizeText(rawTitle) : undefined;
      const description = rawDescription !== undefined ? SecuritySanitizer.sanitizeText(rawDescription) : undefined;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Vérifier les permissions d'administration
      const membership = await prisma.participant.findFirst({
        where: {
          conversationId: id,
          userId: userId,
          role: { in: ['creator', 'admin', 'moderator'] },
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

      if (membership?.role === 'moderator') {
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
                  avatar: true,
                  banner: true
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

      const socketIOHandler = fastify.socketIOHandler
      const io = socketIOHandler?.getManager()?.getIO()
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
      logger.error('error updating conversation', { error });
      return sendInternalError(reply, 'Error updating conversation');
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
          role: { in: ['creator', 'admin'] },
          isActive: true
        }
      });

      if (!membership) {
        return sendForbidden(reply, 'Vous n\'êtes pas autorisé à supprimer cette conversation');
      }

      // Marquer la conversation comme inactive plutôt que de la supprimer
      const now = new Date()
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { isActive: false, closedAt: now, closedBy: userId }
      });

      // Broadcast closure to all members
      const io = fastify.socketIOHandler?.getManager()?.getIO()
      if (io) {
        io.to(ROOMS.conversation(conversationId)).emit(
          SERVER_EVENTS.CONVERSATION_CLOSED,
          { conversationId, closedBy: userId, closedAt: now.toISOString() }
        )
      }

      return sendSuccess(reply, { message: 'Conversation supprimée avec succès' });

    } catch (error) {
      logger.error('error deleting conversation', { error });
      return sendInternalError(reply, 'Erreur lors de la suppression de la conversation');
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

      const TRAIT_FIELDS_MAP: Record<string, string[]> = {
        communication: ['Verbosity', 'Formality', 'ResponseSpeed', 'InitiativeRate', 'Clarity', 'Argumentation'],
        personality: ['SocialStyle', 'Assertiveness', 'Agreeableness', 'Humor', 'Emotionality', 'Openness', 'Confidence', 'Creativity', 'Patience', 'Adaptability'],
        interpersonal: ['Empathy', 'Politeness', 'Leadership', 'ConflictStyle', 'Supportiveness', 'Diplomacy', 'TrustLevel'],
        emotional: ['EmotionalStability', 'Positivity', 'Sensitivity', 'StressResponse'],
      };

      function buildTraits(role: Record<string, any>) {
        const traits: Record<string, Record<string, { label: string; score: number }>> = {};
        let hasAny = false;
        for (const [cat, fields] of Object.entries(TRAIT_FIELDS_MAP)) {
          const catTraits: Record<string, { label: string; score: number }> = {};
          for (const field of fields) {
            const label = role[`trait${field}`];
            const score = role[`trait${field}Score`];
            if (label != null && score != null) {
              const key = field.charAt(0).toLowerCase() + field.slice(1);
              catTraits[key] = { label, score };
              hasAny = true;
            }
          }
          if (Object.keys(catTraits).length > 0) traits[cat] = catTraits;
        }
        return hasAny ? traits : null;
      }

      const [summary, roles, snapshots] = await Promise.all([
        prisma.agentConversationSummary.findUnique({
          where: { conversationId }
        }),
        prisma.agentUserRole.findMany({
          where: { conversationId },
        }),
        prisma.agentAnalysisSnapshot.findMany({
          where: {
            conversationId,
            snapshotDate: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
          },
          orderBy: { snapshotDate: 'asc' },
        }),
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

      const participantProfiles = roles.map((role: Record<string, any>) => {
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
          traits: buildTraits(role),
          dominantEmotions: role.dominantEmotions ?? [],
          relationshipMap: role.relationshipMap ?? {},
          sentimentScore: role.sentimentScore ?? null,
          engagementLevel: role.engagementLevel ?? null,
          locked: role.locked,
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
          healthScore: summary.healthScore ?? null,
          engagementLevel: summary.engagementLevel ?? null,
          conflictLevel: summary.conflictLevel ?? null,
          dynamique: summary.dynamique ?? null,
          dominantEmotions: summary.dominantEmotions ?? [],
        } : null,
        participantProfiles,
        history: snapshots.map(s => ({
          snapshotDate: s.snapshotDate.toISOString(),
          overallTone: s.overallTone,
          healthScore: s.healthScore,
          engagementLevel: s.engagementLevel,
          conflictLevel: s.conflictLevel,
          topTopics: s.topTopics,
          dominantEmotions: s.dominantEmotions,
          messageCountAtSnapshot: s.messageCountAtSnapshot,
          participantSnapshots: s.participantSnapshots,
        })),
      });

    } catch (error) {
      logger.error('error fetching conversation analysis', { error });
      return sendInternalError(reply, 'Error fetching conversation analysis');
    }
  });
}
