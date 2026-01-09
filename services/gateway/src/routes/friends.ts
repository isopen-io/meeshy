import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logError } from '../utils/logger';
import type { NotificationService } from '../services/NotificationService';

// Schémas de validation
const createFriendRequestSchema = z.object({
  receiverId: z.string(),
  message: z.string().optional()
});

const updateFriendRequestSchema = z.object({
  status: z.enum(['accepted', 'rejected'])
});

export async function friendRequestRoutes(fastify: FastifyInstance) {
  // Envoyer une demande d'ami
  fastify.post('/friend-requests', {
    onRequest: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = createFriendRequestSchema.parse(request.body);
      const { userId } = request.user as any;

      // Vérifier que l'utilisateur cible existe
      const targetUser = await fastify.prisma.user.findUnique({
        where: { id: body.receiverId }
      });

      if (!targetUser) {
        return reply.status(404).send({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      // Vérifier qu'il n'y a pas déjà une demande
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
          message: 'Une demande d\'ami existe déjà entre vous'
        });
      }

      // Créer la demande d'ami
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
              lastActiveAt: true,
              lastSeen: true
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
              lastActiveAt: true,
              lastSeen: true
            }
          }
        }
      });

      // Créer une notification pour le destinataire avec actions
      const notificationService = (fastify as any).notificationService as NotificationService;
      if (notificationService) {
        const senderName = friendRequest.sender.displayName ||
                          friendRequest.sender.username ||
                          `${friendRequest.sender.firstName} ${friendRequest.sender.lastName}`.trim();

        const title = 'Nouvelle demande d\'amitié';
        const content = body.message
          ? `${senderName} vous a envoyé une demande d'amitié : "${body.message}"`
          : `${senderName} vous a envoyé une demande d'amitié`;

        await notificationService.createNotification({
          userId: body.receiverId,
          type: 'friend_request' as any, // TypeScript: on étendra le type plus tard
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
          message: 'Données invalides',
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

  // Récupérer les demandes d'ami reçues
  fastify.get('/friend-requests/received', {
    onRequest: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.user as any;
      const { offset = '0', limit = '20' } = request.query as { offset?: string; limit?: string };

      const offsetNum = parseInt(offset, 10);
      const limitNum = Math.min(parseInt(limit, 10), 100);

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
                lastActiveAt: true,
                lastSeen: true
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

  // Récupérer les demandes d'ami envoyées
  fastify.get('/friend-requests/sent', {
    onRequest: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.user as any;
      const { offset = '0', limit = '20' } = request.query as { offset?: string; limit?: string };

      const offsetNum = parseInt(offset, 10);
      const limitNum = Math.min(parseInt(limit, 10), 100);

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
                lastActiveAt: true,
                lastSeen: true
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

  // Répondre à une demande d'ami
  fastify.patch('/friend-requests/:id', {
    onRequest: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const body = updateFriendRequestSchema.parse(request.body);
      const { userId } = request.user as any;

      // Vérifier que la demande existe et appartient à l'utilisateur
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
          message: 'Demande d\'ami non trouvée ou déjà traitée'
        });
      }

      // Mettre à jour le statut
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
              lastActiveAt: true,
              lastSeen: true
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
              lastActiveAt: true,
              lastSeen: true
            }
          }
        }
      });

      // Marquer la notification de requête d'amitié comme lue
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

      // Envoyer une notification à l'expéditeur selon la réponse
      if (notificationService) {
        const receiverName = updatedRequest.receiver.displayName ||
                            updatedRequest.receiver.username ||
                            `${updatedRequest.receiver.firstName} ${updatedRequest.receiver.lastName}`.trim();

        if (body.status === 'accepted') {
          await notificationService.createNotification({
            userId: updatedRequest.senderId,
            type: 'friend_request' as any,
            title: 'Demande d\'amitié acceptée',
            content: `${receiverName} a accepté votre demande d'amitié`,
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
            title: 'Demande d\'amitié refusée',
            content: `${receiverName} a refusé votre demande d'amitié`,
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

      // Si acceptée, créer une conversation directe entre les utilisateurs
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
          // Générer un identifier unique pour la conversation directe
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

          // Ajouter la conversation à la réponse
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
          message: 'Données invalides',
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
    onRequest: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const { userId } = request.user as any;

      // Vérifier que la demande existe et appartient à l'utilisateur (envoyée ou reçue)
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
          message: 'Demande d\'ami non trouvée'
        });
      }

      // Supprimer la demande
      await fastify.prisma.friendRequest.delete({
        where: { id }
      });

      return reply.send({
        success: true,
        message: 'Demande d\'ami supprimée'
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
