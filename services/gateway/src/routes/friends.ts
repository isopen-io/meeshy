import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logError } from '../utils/logger';
import type { NotificationService } from '../services/notifications/NotificationService';
import {
  friendRequestSchema,
  sendFriendRequestSchema,
  respondFriendRequestSchema,
  userMinimalSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';

// Schemas de validation
const createFriendRequestSchema = z.object({
  receiverId: z.string(),
  message: z.string().optional()
});

const updateFriendRequestSchema = z.object({
  status: z.enum(['accepted', 'rejected'])
});

/**
 * Validate and sanitize pagination parameters
 * - Ensures offset is never negative
 * - Ensures limit is between 1 and maxLimit (default 100)
 */
function validatePagination(
  offset: string = '0',
  limit: string = '20',
  defaultLimit: number = 20,
  maxLimit: number = 100
): { offsetNum: number; limitNum: number } {
  const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
  const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || defaultLimit), maxLimit);
  return { offsetNum, limitNum };
}

export async function friendRequestRoutes(fastify: FastifyInstance) {
  // Envoyer une demande d'ami
  fastify.post('/friend-requests', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Send a friend request to another user. Creates a pending friend request and notifies the recipient with action buttons to accept or reject the request.',
      tags: ['friends'],
      summary: 'Send friend request',
      body: sendFriendRequestSchema,
      response: {
        201: {
          description: 'Friend request sent successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: friendRequestSchema
          }
        },
        400: {
          description: 'Invalid request data',
          ...errorResponseSchema
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        404: {
          description: 'Target user not found',
          ...errorResponseSchema
        },
        409: {
          description: 'Friend request already exists between users',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = createFriendRequestSchema.parse(request.body);
      const { userId } = request.user as any;

      // Verifier que l'utilisateur cible existe
      const targetUser = await fastify.prisma.user.findUnique({
        where: { id: body.receiverId }
      });

      if (!targetUser) {
        return reply.status(404).send({
          success: false,
          message: 'Utilisateur non trouve'
        });
      }

      // Verifier qu'il n'y a pas deja une demande
      const existingRequest = await fastify.prisma.friendRequest.findFirst({
        where: {
          OR: [
            { senderId: userId, receiverId: body.receiverId },
            { senderId: body.receiverId, receiverId: userId }
          ]
        }
      });

      if (existingRequest) {
        return reply.status(409).send({
          success: false,
          message: 'Une demande d\'ami existe deja entre vous'
        });
      }

      // Creer la demande d'ami
      const friendRequest = await fastify.prisma.friendRequest.create({
        data: {
          senderId: userId,
          receiverId: body.receiverId,
          message: body.message
        },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              displayName: true,
              avatar: true,
              isOnline: true,
              lastActiveAt: true
            }
          },
          receiver: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              displayName: true,
              avatar: true,
              isOnline: true,
              lastActiveAt: true
            }
          }
        }
      });

      // Creer une notification pour le destinataire avec actions
      const notificationService = (fastify as any).notificationService as NotificationService;
      if (notificationService) {
        const senderName = friendRequest.sender.displayName ||
                          friendRequest.sender.username ||
                          `${friendRequest.sender.firstName} ${friendRequest.sender.lastName}`.trim();

        const title = 'Nouvelle demande d\'amitie';
        const content = body.message
          ? `${senderName} vous a envoye une demande d'amitie : "${body.message}"`
          : `${senderName} vous a envoye une demande d'amitie`;

        await notificationService.createNotification({
          userId: body.receiverId,
          type: 'friend_request' as any, // TypeScript: on etendra le type plus tard
          title,
          content,
          priority: 'normal',
          senderId: userId,
          senderUsername: friendRequest.sender.username,
          senderAvatar: friendRequest.sender.avatar || undefined,
          data: {
            friendRequestId: friendRequest.id,
            message: body.message,
            actions: [
              {
                type: 'accept',
                label: 'Accepter',
                endpoint: `/api/friend-requests/${friendRequest.id}`,
                method: 'PATCH',
                payload: { status: 'accepted' }
              },
              {
                type: 'reject',
                label: 'Refuser',
                endpoint: `/api/friend-requests/${friendRequest.id}`,
                method: 'PATCH',
                payload: { status: 'rejected' }
              }
            ]
          }
        });
      }

      return reply.status(201).send({
        success: true,
        data: friendRequest
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          message: 'Donnees invalides',
          errors: error.errors
        });
      }

      logError(fastify.log, 'Create friend request error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  });

  // Recuperer les demandes d'ami recues
  fastify.get('/friend-requests/received', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get all pending friend requests received by the authenticated user. Returns paginated list of requests with sender information.',
      tags: ['friends'],
      summary: 'Get received friend requests',
      querystring: {
        type: 'object',
        properties: {
          offset: {
            type: 'string',
            description: 'Pagination offset',
            default: '0'
          },
          limit: {
            type: 'string',
            description: 'Number of items per page (max 100)',
            default: '20'
          }
        }
      },
      response: {
        200: {
          description: 'List of received friend requests',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: friendRequestSchema
            },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'number', description: 'Total number of requests' },
                limit: { type: 'number', description: 'Items per page' },
                offset: { type: 'number', description: 'Current offset' },
                hasMore: { type: 'boolean', description: 'Whether more items exist' }
              }
            }
          }
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.user as any;
      const { offset = '0', limit = '20' } = request.query as { offset?: string; limit?: string };

      const { offsetNum, limitNum } = validatePagination(offset, limit);

      const whereClause = { receiverId: userId, status: 'pending' as const };

      const [friendRequests, totalCount] = await Promise.all([
        fastify.prisma.friendRequest.findMany({
          where: whereClause,
          include: {
            sender: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                displayName: true,
                avatar: true,
                isOnline: true,
                lastActiveAt: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.friendRequest.count({ where: whereClause })
      ]);

      return reply.send({
        success: true,
        data: friendRequests,
        pagination: {
          total: totalCount,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + friendRequests.length < totalCount
        }
      });

    } catch (error) {
      logError(fastify.log, 'Get received friend requests error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  });

  // Recuperer les demandes d'ami envoyees
  fastify.get('/friend-requests/sent', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get all friend requests sent by the authenticated user. Returns paginated list of requests with receiver information, including pending, accepted, and rejected requests.',
      tags: ['friends'],
      summary: 'Get sent friend requests',
      querystring: {
        type: 'object',
        properties: {
          offset: {
            type: 'string',
            description: 'Pagination offset',
            default: '0'
          },
          limit: {
            type: 'string',
            description: 'Number of items per page (max 100)',
            default: '20'
          }
        }
      },
      response: {
        200: {
          description: 'List of sent friend requests',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: friendRequestSchema
            },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'number', description: 'Total number of requests' },
                limit: { type: 'number', description: 'Items per page' },
                offset: { type: 'number', description: 'Current offset' },
                hasMore: { type: 'boolean', description: 'Whether more items exist' }
              }
            }
          }
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.user as any;
      const { offset = '0', limit = '20' } = request.query as { offset?: string; limit?: string };

      const { offsetNum, limitNum } = validatePagination(offset, limit);

      const whereClause = { senderId: userId };

      const [friendRequests, totalCount] = await Promise.all([
        fastify.prisma.friendRequest.findMany({
          where: whereClause,
          include: {
            receiver: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true,
                displayName: true,
                avatar: true,
                isOnline: true,
                lastActiveAt: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.friendRequest.count({ where: whereClause })
      ]);

      return reply.send({
        success: true,
        data: friendRequests,
        pagination: {
          total: totalCount,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + friendRequests.length < totalCount
        }
      });

    } catch (error) {
      logError(fastify.log, 'Get sent friend requests error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  });

  // Repondre a une demande d'ami
  fastify.patch('/friend-requests/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Respond to a friend request by accepting or rejecting it. When accepted, creates a direct conversation between users. Automatically marks the friend request notification as read and sends a notification to the requester.',
      tags: ['friends'],
      summary: 'Respond to friend request',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'Friend request ID'
          }
        }
      },
      body: {
        type: 'object',
        required: ['status'],
        properties: {
          status: {
            type: 'string',
            enum: ['accepted', 'rejected'],
            description: 'Response action'
          }
        }
      },
      response: {
        200: {
          description: 'Friend request response processed successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: friendRequestSchema
          }
        },
        400: {
          description: 'Invalid request data',
          ...errorResponseSchema
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        404: {
          description: 'Friend request not found or already processed',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const body = updateFriendRequestSchema.parse(request.body);
      const { userId } = request.user as any;

      // Verifier que la demande existe et appartient a l'utilisateur
      const friendRequest = await fastify.prisma.friendRequest.findFirst({
        where: {
          id,
          receiverId: userId,
          status: 'pending'
        }
      });

      if (!friendRequest) {
        return reply.status(404).send({
          success: false,
          message: 'Demande d\'ami non trouvee ou deja traitee'
        });
      }

      // Mettre a jour le statut
      const updatedRequest = await fastify.prisma.friendRequest.update({
        where: { id },
        data: { status: body.status },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              displayName: true,
              avatar: true,
              isOnline: true,
              lastActiveAt: true
            }
          },
          receiver: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
              displayName: true,
              avatar: true,
              isOnline: true,
              lastActiveAt: true
            }
          }
        }
      });

      // Marquer la notification de requete d'amitie comme lue
      const notificationService = (fastify as any).notificationService as NotificationService;
      try {
        await fastify.prisma.notification.updateMany({
          where: {
            userId: userId,
            type: 'friend_request',
            data: {
              contains: `"friendRequestId":"${id}"`
            }
          },
          data: {
            isRead: true
          }
        });
      } catch (error) {
        // Log mais ne pas bloquer
        logError(fastify.log, 'Error marking friend request notification as read:', error);
      }

      // Envoyer une notification a l'expediteur selon la reponse
      if (notificationService) {
        const receiverName = updatedRequest.receiver.displayName ||
                            updatedRequest.receiver.username ||
                            `${updatedRequest.receiver.firstName} ${updatedRequest.receiver.lastName}`.trim();

        if (body.status === 'accepted') {
          await notificationService.createNotification({
            userId: updatedRequest.senderId,
            type: 'friend_request' as any,
            title: 'Demande d\'amitie acceptee',
            content: `${receiverName} a accepte votre demande d'amitie`,
            priority: 'normal',
            senderId: userId,
            senderUsername: updatedRequest.receiver.username,
            senderAvatar: updatedRequest.receiver.avatar || undefined,
            data: {
              friendRequestId: id,
              action: 'accepted'
            }
          });
        } else if (body.status === 'rejected') {
          await notificationService.createNotification({
            userId: updatedRequest.senderId,
            type: 'friend_request' as any,
            title: 'Demande d\'amitie refusee',
            content: `${receiverName} a refuse votre demande d'amitie`,
            priority: 'low',
            senderId: userId,
            senderUsername: updatedRequest.receiver.username,
            senderAvatar: updatedRequest.receiver.avatar || undefined,
            data: {
              friendRequestId: id,
              action: 'rejected'
            }
          });
        }
      }

      // Si acceptee, creer une conversation directe entre les utilisateurs
      if (body.status === 'accepted') {
        const existingConversation = await fastify.prisma.conversation.findFirst({
          where: {
            type: 'direct',
            members: {
              every: {
                userId: {
                  in: [friendRequest.senderId, friendRequest.receiverId]
                }
              }
            }
          }
        });

        if (!existingConversation) {
          // Generer un identifier unique pour la conversation directe
          const identifier = `direct_${friendRequest.senderId}_${friendRequest.receiverId}_${Date.now()}`;

          const conversation = await fastify.prisma.conversation.create({
            data: {
              identifier,
              type: 'direct',
              members: {
                create: [
                  { userId: friendRequest.senderId, role: 'member' },
                  { userId: friendRequest.receiverId, role: 'member' }
                ]
              }
            }
          });

          // Ajouter la conversation a la reponse
          (updatedRequest as any).conversation = conversation;
        }
      }

      return reply.send({
        success: true,
        data: updatedRequest
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          message: 'Donnees invalides',
          errors: error.errors
        });
      }

      logError(fastify.log, 'Update friend request error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  });

  // Supprimer une demande d'ami
  fastify.delete('/friend-requests/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Delete a friend request. Can be used by either the sender to cancel a sent request or the receiver to remove a received request without responding.',
      tags: ['friends'],
      summary: 'Delete friend request',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: {
            type: 'string',
            description: 'Friend request ID'
          }
        }
      },
      response: {
        200: {
          description: 'Friend request deleted successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Demande d\'ami supprimee' }
              }
            }
          }
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        404: {
          description: 'Friend request not found',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const { userId } = request.user as any;

      // Verifier que la demande existe et appartient a l'utilisateur (envoyee ou recue)
      const friendRequest = await fastify.prisma.friendRequest.findFirst({
        where: {
          id,
          OR: [
            { senderId: userId },
            { receiverId: userId }
          ]
        }
      });

      if (!friendRequest) {
        return reply.status(404).send({
          success: false,
          message: 'Demande d\'ami non trouvee'
        });
      }

      // Supprimer la demande
      await fastify.prisma.friendRequest.delete({
        where: { id }
      });

      return reply.send({
        success: true,
        data: { message: 'Demande d\'ami supprimee' }
      });

    } catch (error) {
      logError(fastify.log, 'Delete friend request error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  });
}
