import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { UserRoleEnum } from '@meeshy/shared/types';
import { resolveParticipantAvatar } from '@meeshy/shared/utils/participant-helpers';
import { UnifiedAuthRequest } from '../../middleware/auth';
import {
  conversationParticipantSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import { canAccessConversation } from './utils/access-control';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { sendSuccess, sendBadRequest, sendForbidden, sendNotFound, sendInternalError } from '../../utils/response';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { getPresenceVisibilityService } from '../../services/PresenceVisibilityService';
const logger = enhancedLogger.child({ module: 'ConversationParticipantsRoutes' });

/**
 * Enregistre les routes de gestion des participants
 */
export function registerParticipantsRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  optionalAuth: any,
  requiredAuth: any
) {
  fastify.get<{
    Params: { id: string };
    Querystring: {
      onlineOnly?: string;
      role?: string;
      search?: string;
      limit?: string;
      cursor?: string;
    };
  }>('/conversations/:id/participants', {
    schema: {
      description: 'Get participants in a conversation with optional filtering and cursor-based pagination',
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
          role: { type: 'string', enum: ['creator', 'admin', 'moderator', 'member'], description: 'Filter by participant role (lowercase, as stored in DB)' },
          search: { type: 'string', description: 'Search participants by name or username' },
          limit: { type: 'string', description: 'Maximum number of participants to return (default: 20, max: 100)' },
          cursor: { type: 'string', description: 'Cursor for pagination (Participant ID)' }
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
            },
            pagination: {
              type: 'object',
              nullable: true,
              properties: {
                nextCursor: { type: 'string', nullable: true, description: 'Cursor for next page' },
                hasMore: { type: 'boolean', description: 'Whether there are more results' },
                totalCount: { type: 'integer', nullable: true, description: 'Total number of participants' }
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
      const { onlineOnly, role, search, limit, cursor } = request.query;
      const authRequest = request as UnifiedAuthRequest;

      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!canAccess) {
        return sendForbidden(reply, 'Access denied: you are not a member of this conversation or it no longer exists', { code: 'CONVERSATION_ACCESS_DENIED' });
      }

      const whereConditions: any = {
        conversationId: conversationId,
        isActive: true
      };

      if (onlineOnly === 'true') {
        whereConditions.isOnline = true;
      }

      if (role) {
        whereConditions.role = role.toLowerCase();
      }

      if (search && search.trim().length > 0) {
        const searchTerm = search.trim();
        whereConditions.displayName = {
          contains: searchTerm,
          mode: 'insensitive'
        };
      }

      const pageLimit = limit ? Math.min(parseInt(limit, 10), 100) : 20;

      // Cursor-based pagination: skip the cursor record, ordered by id for stable pagination
      const cursorOption = cursor ? { id: cursor } : undefined;

      const participants = await prisma.participant.findMany({
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
              role: true,
              isOnline: true,
              lastActiveAt: true,
              systemLanguage: true,
              regionalLanguage: true,
              customDestinationLanguage: true,
              isActive: true,
              createdAt: true,
              updatedAt: true
            }
          }
        },
        orderBy: { id: 'asc' },
        take: pageLimit + 1,
        ...(cursorOption ? { cursor: cursorOption, skip: 1 } : {})
      });

      const hasMore = participants.length > pageLimit;
      const paginatedParticipants = hasMore ? participants.slice(0, pageLimit) : participants;
      const nextCursor = hasMore ? paginatedParticipants[paginatedParticipants.length - 1]?.id : null;

      // Total count for accurate header display
      const totalCount = await prisma.participant.count({
        where: {
          conversationId: conversationId,
          isActive: true
        }
      });

      // Présence des co-participants : montrable (co-participation = contexte
      // d'accès déjà garanti), mais soumise aux préférences showOnlineStatus/
      // showLastSeen de chacun. Anonymes inchangés.
      const presenceVis = await getPresenceVisibilityService(prisma).resolvePrefsOnly(
        paginatedParticipants.map(p => p.userId).filter((uid): uid is string => !!uid),
      );

      const formattedParticipants = paginatedParticipants.map(participant => ({
        id: participant.id,
        participantId: participant.id,
        userId: participant.userId,
        type: participant.type,
        username: participant.user?.username ?? participant.displayName,
        firstName: participant.user?.firstName ?? participant.displayName,
        lastName: participant.user?.lastName ?? '',
        displayName: participant.displayName,
        avatar: resolveParticipantAvatar(participant),
        role: participant.user?.role ?? 'USER',
        conversationRole: participant.role,
        joinedAt: participant.joinedAt,
        isOnline: presenceVis.get(participant.userId ?? '')?.showOnline === false ? false : participant.isOnline,
        lastActiveAt: presenceVis.get(participant.userId ?? '')?.showLastSeenTimestamp === false ? null : participant.lastActiveAt,
        systemLanguage: participant.user?.systemLanguage ?? participant.language,
        regionalLanguage: participant.user?.regionalLanguage ?? participant.language,
        customDestinationLanguage: participant.user?.customDestinationLanguage ?? participant.language,
        autoTranslateEnabled: true,
        isActive: participant.isActive,
        createdAt: participant.user?.createdAt ?? participant.joinedAt,
        updatedAt: participant.user?.updatedAt ?? participant.joinedAt,
        isAnonymous: participant.type === 'anonymous',
        canSendMessages: participant.permissions?.canSendMessages ?? true,
        canSendFiles: participant.permissions?.canSendFiles ?? true,
        canSendImages: participant.permissions?.canSendImages ?? true,
        permissions: {
          canAccessAdmin: participant.user?.role === 'ADMIN' || participant.user?.role === 'BIGBOSS',
          canManageUsers: participant.user?.role === 'ADMIN' || participant.user?.role === 'BIGBOSS',
          canManageGroups: participant.user?.role === 'ADMIN' || participant.user?.role === 'BIGBOSS',
          canManageConversations: participant.user?.role === 'ADMIN' || participant.user?.role === 'BIGBOSS',
          canViewAnalytics: participant.user?.role === 'ADMIN' || participant.user?.role === 'BIGBOSS',
          canModerateContent: participant.user?.role === 'ADMIN' || participant.user?.role === 'BIGBOSS',
          canViewAuditLogs: participant.user?.role === 'ADMIN' || participant.user?.role === 'BIGBOSS',
          canManageNotifications: participant.user?.role === 'ADMIN' || participant.user?.role === 'BIGBOSS',
          canManageTranslations: participant.user?.role === 'ADMIN' || participant.user?.role === 'BIGBOSS',
        }
      }));

      // NOTE: Cannot use sendSuccess() — response includes a top-level `pagination` field
      // (with cursor-based shape: nextCursor/hasMore/totalCount) that iOS SDK
      // (ParticipantsListResponse) and web parse at root level. Migration to sendSuccess
      // requires a coordinated client update (breaking change).
      reply.send({
        success: true,
        data: formattedParticipants,
        pagination: {
          nextCursor,
          hasMore,
          totalCount
        }
      });

    } catch (error) {
      logger.error('Error fetching conversation participants', error as Error);
      return sendInternalError(reply, 'Error retrieving participants');
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

      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      const currentUserParticipant = await prisma.participant.findFirst({
        where: {
          conversationId: conversationId,
          userId: currentUserId,
          isActive: true
        }
      });

      if (!currentUserParticipant) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      const addMemberRoles = ['creator', 'admin', 'moderator'];
      if (!addMemberRoles.includes(currentUserParticipant.role)) {
        return sendForbidden(reply, 'Only admins and moderators can add participants');
      }

      const userToAdd = await prisma.user.findFirst({
        where: { id: userId }
      });

      if (!userToAdd) {
        return sendNotFound(reply, 'User not found');
      }

      const existingParticipant = await prisma.participant.findFirst({
        where: {
          conversationId: conversationId,
          userId: userId,
          isActive: true
        }
      });

      if (existingParticipant) {
        return sendBadRequest(reply, 'L\'utilisateur est déjà membre de cette conversation');
      }

      await prisma.participant.create({
        data: {
          conversationId: conversationId,
          userId: userId,
          type: 'user',
          displayName: userToAdd.displayName ?? userToAdd.username ?? `${userToAdd.firstName ?? ''} ${userToAdd.lastName ?? ''}`.trim(),
          avatar: userToAdd.avatar,
          role: 'member',
          language: userToAdd.systemLanguage ?? 'en',
          permissions: {
            canSendMessages: true,
            canSendFiles: true,
            canSendImages: true,
            canSendAudios: true,
            canSendVideos: true,
            canSendLocations: false,
            canSendLinks: false
          },
          joinedAt: new Date()
        }
      });

      // R6-1 — broadcast so other members' devices refresh the participant list
      // in real time (the POST previously created the row silently → stale member
      // lists until manual reload). Mirrors the role-update emit below.
      // conversation:joined feeds ParticipantsView (invalidate+reload) and
      // ConversationSyncEngine (participants cache invalidate) on iOS.
      const socketManager = fastify.socketIOHandler?.getManager();
      const io = socketManager?.getIO();
      if (io) {
        io.to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.CONVERSATION_JOINED, {
          conversationId,
          userId,
        });
      }
      // Auto-join the added user's currently-connected sockets to the conversation
      // room so they receive message:new events immediately without a reconnect.
      if (socketManager) {
        socketManager.joinUserToConversationRoom(userId, conversationId).catch(
          (err: unknown) => logger.error('Failed to auto-join added user to conversation room', err as Error)
        );
      }
      // Emit CONVERSATION_NEW to the added user's room so connected clients
      // (iOS: ConversationListViewModel.conversationNew handler) discover the
      // conversation immediately without waiting for a push notification.
      if (io) {
        try {
          const conv = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { type: true, title: true, createdAt: true },
          });
          const allParticipantIds = await prisma.participant.findMany({
            where: { conversationId, isActive: true },
            select: { userId: true },
          }).then(rows => rows.map(r => r.userId).filter((id): id is string => !!id));
          if (conv) {
            io.to(ROOMS.user(userId)).emit(SERVER_EVENTS.CONVERSATION_NEW, {
              conversationId,
              conversationType: conv.type,
              title: conv.title ?? null,
              creatorId: currentUserId ?? userId,
              participantIds: allParticipantIds,
              createdAt: conv.createdAt instanceof Date ? conv.createdAt.toISOString() : String(conv.createdAt),
            });
          }
        } catch (err) {
          logger.warn('Failed to emit CONVERSATION_NEW to added user', { userId, conversationId, err });
        }
      }

      const notificationService = fastify.notificationService;
      if (notificationService) {
        notificationService.createAddedToConversationNotification({
          recipientUserId: userId,
          addedByUserId: currentUserId,
          conversationId,
        }).catch((err: unknown) => logger.error('Notification error added', err as Error));

        const existingMembers = await prisma.participant.findMany({
          where: { conversationId, isActive: true, type: 'user', userId: { notIn: [userId, currentUserId!] } },
          select: { userId: true },
        });
        for (const member of existingMembers) {
          if (member.userId) {
            notificationService.createMemberJoinedNotification({
              recipientUserId: member.userId,
              newMemberUserId: userId,
              conversationId,
              joinMethod: 'invited' as const,
            }).catch((err: unknown) => logger.error('Notification error joined', err as Error));
          }
        }
      }

      return sendSuccess(reply, { message: 'Participant ajouté avec succès' });

    } catch (error) {
      logger.error('Error adding participant', error as Error);
      return sendInternalError(reply, 'Erreur lors de l\'ajout du participant');
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

      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      const currentUserParticipant = await prisma.participant.findFirst({
        where: {
          conversationId: conversationId,
          userId: currentUserId,
          isActive: true
        },
        include: {
          user: true
        }
      });

      if (!currentUserParticipant) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      const isPlatformAdmin = currentUserParticipant.user?.role === 'ADMIN' || currentUserParticipant.user?.role === 'BIGBOSS';
      const isCreator = currentUserParticipant.role === 'creator';
      const isConversationAdmin = currentUserParticipant.role === 'admin';
      const isConversationModerator = currentUserParticipant.role === 'moderator';

      if (!isPlatformAdmin && !isCreator && !isConversationAdmin && !isConversationModerator) {
        return sendForbidden(reply, 'Vous n\'avez pas les droits pour supprimer des participants');
      }

      if (userId === currentUserId) {
        return sendBadRequest(reply, 'Vous ne pouvez pas vous supprimer de la conversation');
      }

      // Capture the removed participant's displayName before flipping inactive,
      // for the real-time broadcast payload (R6-2). leftAt is shared by the DB
      // write and the emit so they agree.
      const removedParticipant = await prisma.participant.findFirst({
        where: { conversationId, userId, isActive: true },
        select: { displayName: true }
      });
      const leftAt = new Date();

      await prisma.participant.updateMany({
        where: {
          conversationId: conversationId,
          userId: userId,
          isActive: true
        },
        data: {
          isActive: false,
          leftAt
        }
      });

      // R6-2 — broadcast so other members' devices drop the removed user from
      // the list + decrement the member count in real time (the DELETE
      // previously mutated the DB silently). Mirrors leave.ts. Use
      // conversation:participant-left (room broadcast feeding ParticipantsView,
      // ConversationListViewModel count, ConversationSyncEngine invalidate) —
      // NOT conversation:left, which is a self-only ack.
      try {
        const socketManager = fastify.socketIOHandler?.getManager();
        const io = socketManager?.getIO();
        if (io) {
          io.to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT, {
            conversationId,
            userId,
            displayName: removedParticipant?.displayName ?? '',
            leftAt: leftAt.toISOString()
          });

          const userSockets = await io.in(ROOMS.user(userId)).fetchSockets();
          await Promise.all(userSockets.map((s: { leave: (room: string) => void }) => s.leave(ROOMS.conversation(conversationId))));

          socketManager.invalidateParticipantCache?.(userId, conversationId);
        }
      } catch (socketError) {
        logger.error('Socket eviction error for removed participant', socketError as Error);
      }

      const notificationService = fastify.notificationService;
      if (notificationService) {
        notificationService.createRemovedFromConversationNotification({
          recipientUserId: userId,
          removedByUserId: currentUserId,
          conversationId,
        }).catch((err: unknown) => logger.error('Notification error removed', err as Error));

        const adminParticipants = await prisma.participant.findMany({
          where: {
            conversationId,
            isActive: true,
            role: { in: ['creator', 'admin', 'moderator'] },
            userId: { not: currentUserId },
          },
          select: { userId: true },
        });
        for (const admin of adminParticipants) {
          if (admin.userId) {
            notificationService.createMemberRemovedNotification({
              recipientUserId: admin.userId,
              removedByUserId: currentUserId,
              conversationId,
            }).catch((err: unknown) => logger.error('Notification error member_removed', err as Error));
          }
        }
      }

      return sendSuccess(reply, { message: 'Participant supprimé avec succès' });

    } catch (error) {
      logger.error('Error removing participant', error as Error);
      return sendInternalError(reply, 'Erreur lors de la suppression du participant');
    }
  });

  // Route pour mettre à jour le rôle d'un participant
  fastify.patch<{
    Params: { id: string; userId: string };
    Body: { role: string };
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
          role: { type: 'string', enum: ['admin', 'moderator', 'member'], description: 'New role for participant' }
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

      const normalizedRole = role.toLowerCase()
      if (!['admin', 'moderator', 'member'].includes(normalizedRole)) {
        return sendBadRequest(reply, 'Invalid role. Accepted roles are: admin, moderator, member');
      }

      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      const currentUserParticipant = await prisma.participant.findFirst({
        where: {
          conversationId: conversationId,
          userId: currentUserId,
          isActive: true
        },
        include: {
          user: true
        }
      });

      if (!currentUserParticipant) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      const isPlatformAdmin = currentUserParticipant.user?.role === 'ADMIN' || currentUserParticipant.user?.role === 'BIGBOSS';
      const isCreator = currentUserParticipant.role === 'creator';
      const isConversationAdmin = currentUserParticipant.role === 'admin';

      if (!isPlatformAdmin && !isCreator && !isConversationAdmin) {
        return sendForbidden(reply, 'Vous n\'avez pas les droits pour modifier les rôles des participants');
      }

      if (userId === currentUserId) {
        return sendBadRequest(reply, 'You cannot modify your own role');
      }

      const targetParticipant = await prisma.participant.findFirst({
        where: {
          conversationId: conversationId,
          userId: userId,
          isActive: true
        }
      });

      if (!targetParticipant) {
        return sendNotFound(reply, 'Participant not found or inactive');
      }

      if (targetParticipant.role === 'creator') {
        return sendForbidden(reply, 'Cannot modify the conversation creator\'s role');
      }

      const newRole = role.toLowerCase();
      await prisma.participant.update({
        where: {
          id: targetParticipant.id
        },
        data: {
          role: newRole
        }
      });

      const updatedParticipant = await prisma.participant.findUnique({
        where: { id: targetParticipant.id },
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

      const manager = fastify.socketIOHandler?.getManager();
      if (manager) {
        manager.getIO().to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.PARTICIPANT_ROLE_UPDATED, {
          conversationId,
          userId,
          newRole,
          updatedBy: currentUserId,
          participant: updatedParticipant
        });
        // Invalidate the in-process participant-ID cache so the next message:send
        // from this user re-validates membership/role against the DB instead of
        // serving a stale 5-minute cached entry.
        manager.invalidateParticipantCache?.(userId, conversationId);
      }

      const notificationService = fastify.notificationService;
      if (notificationService) {
        notificationService.createMemberRoleChangedNotification({
          recipientUserId: userId,
          changedByUserId: currentUserId,
          conversationId,
          newRole: newRole.toUpperCase() as 'ADMIN' | 'MODERATOR' | 'MEMBER',
          previousRole: targetParticipant.role,
        }).catch((err: unknown) => logger.error('Notification error role_changed', err as Error));
      }

      return sendSuccess(reply, {
        message: 'Rôle du participant mis à jour avec succès',
        userId,
        role: newRole,
        participant: updatedParticipant
      });

    } catch (error) {
      logger.error('Error updating participant role', error as Error);
      return sendInternalError(reply, 'Error updating participant role');
    }
  });

}
