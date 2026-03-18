import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { UserRoleEnum } from '@meeshy/shared/types';
import { UnifiedAuthRequest } from '../../middleware/auth';
import {
  conversationParticipantSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import { canAccessConversation } from './utils/access-control';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { sendSuccess, sendBadRequest, sendForbidden, sendNotFound, sendInternalError } from '../../utils/response';

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
          role: { type: 'string', enum: ['CREATOR', 'ADMIN', 'MODERATOR', 'MEMBER'], description: 'Filter by participant role' },
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
              email: true,
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

      const formattedParticipants = paginatedParticipants.map(participant => ({
        id: participant.id,
        participantId: participant.id,
        userId: participant.userId,
        type: participant.type,
        username: participant.user?.username ?? participant.displayName,
        firstName: participant.user?.firstName ?? participant.displayName,
        lastName: participant.user?.lastName ?? '',
        displayName: participant.displayName,
        avatar: participant.avatar ?? participant.user?.avatar ?? null,
        email: participant.user?.email ?? '',
        role: participant.user?.role ?? 'USER',
        conversationRole: participant.role,
        joinedAt: participant.joinedAt,
        isOnline: participant.isOnline,
        lastActiveAt: participant.lastActiveAt,
        systemLanguage: participant.user?.systemLanguage ?? participant.language,
        regionalLanguage: participant.user?.regionalLanguage ?? participant.language,
        customDestinationLanguage: participant.user?.customDestinationLanguage ?? participant.language,
        autoTranslateEnabled: false,
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

      // TODO: Phase 3 — migrate to sendPaginatedSuccess after client update
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
      console.error('Error fetching conversation participants:', error);
      sendInternalError(reply, 'Error retrieving participants');
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

      const notificationService = (request.server as any).notificationService;
      if (notificationService) {
        notificationService.createAddedToConversationNotification({
          recipientUserId: userId,
          addedByUserId: currentUserId,
          conversationId,
        }).catch((err: unknown) => console.error('[Participants] Notification error (added):', err));

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
            }).catch((err: unknown) => console.error('[Participants] Notification error (joined):', err));
          }
        }
      }

      return sendSuccess(reply, { message: 'Participant ajouté avec succès' });

    } catch (error) {
      console.error('Error adding participant:', error);
      sendInternalError(reply, 'Erreur lors de l\'ajout du participant');
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

      const isAdmin = currentUserParticipant.user?.role === 'ADMIN' || currentUserParticipant.user?.role === 'BIGBOSS';
      const isCreator = currentUserParticipant.role === 'creator';

      if (!isAdmin && !isCreator) {
        return sendForbidden(reply, 'Vous n\'avez pas les droits pour supprimer des participants');
      }

      if (userId === currentUserId) {
        return sendBadRequest(reply, 'Vous ne pouvez pas vous supprimer de la conversation');
      }

      await prisma.participant.updateMany({
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

      const notificationService = (request.server as any).notificationService;
      if (notificationService) {
        notificationService.createRemovedFromConversationNotification({
          recipientUserId: userId,
          removedByUserId: currentUserId,
          conversationId,
        }).catch((err: unknown) => console.error('[Participants] Notification error (removed):', err));

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
            }).catch((err: unknown) => console.error('[Participants] Notification error (member_removed):', err));
          }
        }
      }

      return sendSuccess(reply, { message: 'Participant supprimé avec succès' });

    } catch (error) {
      console.error('Error removing participant:', error);
      sendInternalError(reply, 'Erreur lors de la suppression du participant');
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

      if (!['ADMIN', 'MODERATOR', 'MEMBER'].includes(role)) {
        return sendBadRequest(reply, 'Invalid role. Accepted roles are: ADMIN, MODERATOR, MEMBER');
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

      const isAdmin = currentUserParticipant.user?.role === 'ADMIN' || currentUserParticipant.user?.role === 'BIGBOSS';
      const isCreator = currentUserParticipant.role === 'creator';

      if (!isAdmin && !isCreator) {
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

      const io = (request.server as any).io;
      if (io) {
        io.to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.PARTICIPANT_ROLE_UPDATED, {
          conversationId,
          userId,
          newRole,
          updatedBy: currentUserId,
          participant: updatedParticipant
        });
      }

      const notificationService = (request.server as any).notificationService;
      if (notificationService) {
        notificationService.createMemberRoleChangedNotification({
          recipientUserId: userId,
          changedByUserId: currentUserId,
          conversationId,
          newRole,
          previousRole: targetParticipant.role,
        }).catch((err: unknown) => console.error('[Participants] Notification error (role_changed):', err));
      }

      return sendSuccess(reply, {
        message: 'Rôle du participant mis à jour avec succès',
        userId,
        role: newRole,
        participant: updatedParticipant
      });

    } catch (error) {
      console.error('Error updating participant role:', error);
      sendInternalError(reply, 'Error updating participant role');
    }
  });

}
