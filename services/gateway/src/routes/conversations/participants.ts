import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { UserRoleEnum } from '@meeshy/shared/types';
import { UnifiedAuthRequest } from '../../middleware/auth';
import {
  conversationParticipantSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import { canAccessConversation } from './utils/access-control';
import { isValidMongoId } from '@meeshy/shared/utils/conversation-helpers';

/**
 * Résout l'ID de conversation réel à partir d'un identifiant
 */
async function resolveConversationId(prisma: PrismaClient, identifier: string): Promise<string | null> {
  if (isValidMongoId(identifier)) {
    return identifier;
  }
  const conversation = await prisma.conversation.findFirst({
    where: { identifier: identifier }
  });
  return conversation ? conversation.id : null;
}

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
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return reply.status(403).send({
          success: false,
          error: 'Unauthorized access to this conversation'
        });
      }

      // Vérifier que l'utilisateur a accès à cette conversation
      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!canAccess) {
        return reply.status(403).send({
          success: false,
          error: 'Access denied: you are not a member of this conversation or it no longer exists',
          code: 'CONVERSATION_ACCESS_DENIED'
        });
      }

      // Construire les filtres dynamiquement
      // NOTE: Ne pas filtrer par user.isActive pour éviter d'exclure des membres
      // dont le compte utilisateur pourrait être temporairement désactivé
      const whereConditions: any = {
        conversationId: conversationId,
        isActive: true
      };

      // Filtre par statut en ligne
      if (onlineOnly === 'true') {
        whereConditions.user = { ...whereConditions.user, isOnline: true };
      }

      // Filtre par rôle
      if (role) {
        whereConditions.user = { ...whereConditions.user, role: role.toUpperCase() };
      }

      // Filtre par recherche (nom, prénom, username, email)
      if (search && search.trim().length > 0) {
        const searchTerm = search.trim();
        whereConditions.user = {
          ...whereConditions.user,
          OR: [
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
          ]
        };
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
              updatedAt: true
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
        // TODO: Re-implement with UserPreferences.application
        autoTranslateEnabled: false,
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
      console.error('Error fetching conversation participants:', error);
      reply.status(500).send({
        success: false,
        error: 'Error retrieving participants'
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
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return reply.status(403).send({
          success: false,
          error: 'Unauthorized access to this conversation'
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
          error: 'Unauthorized access to this conversation'
        });
      }

      // Vérifier que l'utilisateur à ajouter existe
      const userToAdd = await prisma.user.findFirst({
        where: { id: userId }
      });

      if (!userToAdd) {
        return reply.status(404).send({
          success: false,
          error: 'User not found'
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
      console.error('Error adding participant:', error);
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
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return reply.status(403).send({
          success: false,
          error: 'Unauthorized access to this conversation'
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
          error: 'Unauthorized access to this conversation'
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
      console.error('Error removing participant:', error);
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
          error: 'Invalid role. Accepted roles are: ADMIN, MODERATOR, MEMBER'
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
          error: 'Unauthorized access to this conversation'
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
          error: 'You cannot modify your own role'
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
          error: 'Participant not found or inactive'
        });
      }

      // Empêcher de modifier le rôle du créateur de la conversation
      if (targetMembership.role === 'CREATOR') {
        return reply.status(403).send({
          success: false,
          error: 'Cannot modify the conversation creator\'s role'
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
      console.error('Error updating participant role:', error);
      reply.status(500).send({
        success: false,
        error: 'Error updating participant role'
      });
    }
  });

}
