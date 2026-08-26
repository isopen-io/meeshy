import { validatePagination } from '../utils/pagination';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { SecuritySanitizer } from '../utils/sanitize';
import { logError } from '../utils/logger';
import { sendSuccess, sendPaginatedSuccess, sendBadRequest, sendNotFound, sendConflict, sendInternalError, sendGone } from '../utils/response.js';
import type { NotificationService } from '../services/notifications/NotificationService';
import { withMutationLog, MutationResultGone } from '../utils/withMutationLog';
import {
  friendRequestSchema,
  sendFriendRequestSchema,
  respondFriendRequestSchema,
  userMinimalSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import { generateCompactConversationIdentifier } from '@meeshy/shared/utils/conversation-helpers';

// Schemas de validation
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
      const userId = request.user!.userId;

      // Verifier que l'utilisateur cible existe
      const targetUser = await fastify.prisma.user.findUnique({
        where: { id: body.receiverId }
      });

      if (!targetUser) {
        return sendNotFound(reply, 'Utilisateur non trouve');
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
        return sendConflict(reply, 'Une demande d\'ami existe deja entre vous');
      }

      // Creer la demande d'ami (idempotent via clientMutationId when present)
      const friendRequestInclude = {
        sender: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            displayName: true,
            avatar: true
          }
        },
        receiver: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            displayName: true,
            avatar: true
          }
        }
      } as const;

      const friendRequest = await withMutationLog({
        request,
        fastify,
        userId,
        kind: 'sendFriendRequest',
        // `diverges` — voir `ReplayCost` : chaque exécution INSÈRE une ligne.
        // Rejouer sur un résultat disparu fabriquerait un doublon (contenu
        // supprimé qui ressuscite), d'où le 410 rendu par le catch de la route.
        replayCost: 'diverges',
        op: () => fastify.prisma.friendRequest.create({
          data: {
            senderId: userId,
            receiverId: body.receiverId,
            message: body.message ? SecuritySanitizer.sanitizeText(body.message) : undefined
          },
          include: friendRequestInclude
        }),
        onDuplicate: (resultId) => fastify.prisma.friendRequest.findUnique({
          where: { id: resultId },
          include: friendRequestInclude
        }),
      });

      // Creer une notification pour le destinataire avec actions
      const notificationService = fastify.notificationService;
      if (notificationService) {
        const senderName = friendRequest.sender.displayName ||
                          friendRequest.sender.username ||
                          `${friendRequest.sender.firstName} ${friendRequest.sender.lastName}`.trim();

        // Utiliser la méthode publique V2
        await notificationService.createFriendRequestNotification({
          recipientUserId: body.receiverId,
          requesterId: userId,
          friendRequestId: friendRequest.id,
        });

        notificationService.emitFriendRequestNew({
          receiverId: body.receiverId,
          friendRequestId: friendRequest.id,
          senderId: userId,
        });
      }

      return sendSuccess(reply, friendRequest, { statusCode: 201 });

    } catch (error) {
      // Le cmid a bien été appliqué, mais son résultat n'est plus relisible
      // (contenu supprimé, expiré, ou hors de la tranche ACL du lecteur) et
      // l'op DIVERGE — la rejouer recréerait une ligne que l'auteur a fait
      // disparaître. 410 le dit exactement : le geste a eu lieu, il n'y a
      // rien à refaire.
      if (error instanceof MutationResultGone) {
        return sendGone(reply, 'Friend request already applied, its result is gone', { code: 'MUTATION_RESULT_GONE' });
      }
      if (error instanceof z.ZodError) {
        return sendBadRequest(reply, 'Donnees invalides');
      }

      logError(fastify.log, 'Create friend request error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
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
      const userId = request.user!.userId;
      /* istanbul ignore next -- Fastify AJV applies schema defaults before handler runs */
      const { offset = '0', limit = '20' } = request.query as { offset?: string; limit?: string };

      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit);

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
                avatar: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.friendRequest.count({ where: whereClause })
      ]);

      return sendPaginatedSuccess(reply, friendRequests, {
        total: totalCount,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + friendRequests.length < totalCount
      });

    } catch (error) {
      logError(fastify.log, 'Get received friend requests error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
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
      const userId = request.user!.userId;
      /* istanbul ignore next -- Fastify AJV applies schema defaults before handler runs */
      const { offset = '0', limit = '20' } = request.query as { offset?: string; limit?: string };

      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit);

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
                avatar: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.friendRequest.count({ where: whereClause })
      ]);

      return sendPaginatedSuccess(reply, friendRequests, {
        total: totalCount,
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + friendRequests.length < totalCount
      });

    } catch (error) {
      logError(fastify.log, 'Get sent friend requests error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
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
      const userId = request.user!.userId;

      // Verifier que la demande existe et appartient a l'utilisateur
      const friendRequest = await fastify.prisma.friendRequest.findFirst({
        where: {
          id,
          receiverId: userId,
          status: 'pending'
        }
      });

      if (!friendRequest) {
        return sendNotFound(reply, 'Demande d\'ami non trouvee ou deja traitee');
      }

      // Mettre a jour le statut (idempotent via clientMutationId when present)
      const respondInclude = {
        sender: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            displayName: true,
            avatar: true
          }
        },
        receiver: {
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            displayName: true,
            avatar: true
          }
        }
      } as const;

      const updatedRequest = await withMutationLog({
        request,
        fastify,
        userId,
        kind: 'respondFriendRequest',
        // `converges` — voir `ReplayCost` : rejouer cette op rend le même état.
        replayCost: 'converges',
        op: () => fastify.prisma.friendRequest.update({
          where: { id },
          data: { status: body.status },
          include: respondInclude
        }),
        onDuplicate: (resultId) => fastify.prisma.friendRequest.findUnique({
          where: { id: resultId },
          include: respondInclude
        }),
      });

      // Marquer les notifications liées à cette demande d'amitié comme lues.
      // SSOT : on passe par le service (un seul update Mongo indexé filtré
      // server-side sur context.friendRequestId + émission notification:counts
      // pour la sync multi-appareils de la cloche). Le service avale ses propres
      // erreurs (retourne 0) — l'échec du marquage ne bloque jamais la réponse.
      const notificationService = fastify.notificationService;
      if (notificationService) {
        try {
          await notificationService.markFriendRequestNotificationsAsRead(userId, id);
        } catch (error) {
          // Le service avale déjà ses erreurs, mais on garde le filet : le
          // marquage des notifications ne doit JAMAIS faire échouer la réponse.
          logError(fastify.log, 'Error marking friend request notification as read:', error);
        }
      }

      // Envoyer une notification a l'expediteur selon la reponse
      if (notificationService) {
        const receiverName = updatedRequest.receiver.displayName ||
                            updatedRequest.receiver.username ||
                            `${updatedRequest.receiver.firstName} ${updatedRequest.receiver.lastName}`.trim();

        if (body.status === 'accepted') {
          // Note: conversationId sera ajouté après création de la conversation
          await notificationService.createFriendAcceptedNotification({
            recipientUserId: updatedRequest.senderId,
            accepterUserId: userId,
            conversationId: undefined, // Sera ajouté après
          });
        /* istanbul ignore else -- AJV enum validates status; only 'accepted' or 'rejected' reach this block */
        } else if (body.status === 'rejected') {
          await notificationService.createSystemNotification({
            recipientUserId: updatedRequest.senderId,
            content: `${receiverName} a refuse votre demande d'amitie`,
            priority: 'low',
            systemType: 'announcement',
          });
          notificationService.emitFriendRequestRejected({
            senderId: updatedRequest.senderId,
            friendRequestId: id,
            rejecterId: userId,
          });
        }
      }

      // Invalider le cache des amis pour les deux utilisateurs afin que les prochains
      // broadcasts incluent le nouvel ami sans attendre l'expiration du TTL (30s).
      if (body.status === 'accepted') {
        const socialEvents = fastify.socialEvents;
        if (socialEvents) {
          socialEvents.invalidateFriendsCache(friendRequest.senderId);
          socialEvents.invalidateFriendsCache(friendRequest.receiverId);
        }
      }

      // Si acceptee, creer une conversation directe entre les utilisateurs
      if (body.status === 'accepted') {
        const existingConversation = await fastify.prisma.conversation.findFirst({
          where: {
            type: 'direct',
            participants: {
              every: {
                userId: {
                  in: [friendRequest.senderId, friendRequest.receiverId]
                }
              }
            }
          }
        });

        let acceptedConversationId = existingConversation?.id;

        if (!existingConversation) {
          // Identifiant COMPACT (17 car.) — il ne concatene plus les deux
          // ObjectId des participants : un identifiant public ne doit pas
          // publier qui parle a qui, et 69 caracteres depassaient la limite
          // de 50 que l'API impose aux identifiants soumis par les clients.
          const identifier = generateCompactConversationIdentifier();

          const [senderUser, receiverUser] = await Promise.all([
            fastify.prisma.user.findUnique({ where: { id: friendRequest.senderId }, select: { displayName: true, username: true } }),
            fastify.prisma.user.findUnique({ where: { id: friendRequest.receiverId }, select: { displayName: true, username: true } })
          ]);
          const defaultPerms = {
            canSendMessages: true, canSendFiles: true, canSendImages: true,
            canSendVideos: false, canSendAudios: false, canSendLocations: false, canSendLinks: false
          };
          const conversation = await fastify.prisma.conversation.create({
            data: {
              identifier,
              type: 'direct',
              participants: {
                create: [
                  { userId: friendRequest.senderId, type: 'user', displayName: senderUser?.displayName || senderUser?.username || 'User', role: 'member', permissions: defaultPerms },
                  { userId: friendRequest.receiverId, type: 'user', displayName: receiverUser?.displayName || receiverUser?.username || 'User', role: 'member', permissions: defaultPerms }
                ]
              }
            }
          });

          // Auto-join both users' currently-connected sockets to the new DM
          // room so they receive message:new immediately without a reconnect.
          const socketManager = fastify.socketIOHandler?.getManager();
          if (socketManager) {
            for (const memberUserId of [friendRequest.senderId, friendRequest.receiverId]) {
              socketManager.joinUserToConversationRoom(memberUserId, conversation.id).catch(
                (err: unknown) => logError(fastify.log, 'Failed to auto-join friend to new DM room:', err)
              );
            }
          }

          // Ajouter la conversation a la reponse
          (updatedRequest as any).conversation = conversation;
          acceptedConversationId = conversation.id;
        }

        if (notificationService) {
          notificationService.emitFriendRequestAccepted({
            senderId: updatedRequest.senderId,
            friendRequestId: id,
            accepterId: userId,
            conversationId: acceptedConversationId,
          });
        }
      }

      return sendSuccess(reply, updatedRequest);

    } catch (error) {
      /* istanbul ignore next -- AJV enforces enum['accepted','rejected'] before handler runs */
      if (error instanceof z.ZodError) {
        return sendBadRequest(reply, 'Donnees invalides');
      }

      logError(fastify.log, 'Update friend request error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
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
      const userId = request.user!.userId;

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
        return sendNotFound(reply, 'Demande d\'ami non trouvee');
      }

      // Supprimer la demande
      await fastify.prisma.friendRequest.delete({
        where: { id }
      });

      // Realtime signal a l'AUTRE partie (celle qui n'a pas appele ce endpoint)
      // pour qu'elle invalide sa liste de demandes en attente immediatement,
      // au lieu de rester perimee jusqu'a son prochain refetch complet.
      const notificationService = fastify.notificationService;
      if (notificationService) {
        const otherUserId = friendRequest.senderId === userId
          ? friendRequest.receiverId
          : friendRequest.senderId;
        notificationService.emitFriendRequestCancelled({
          recipientUserId: otherUserId,
          friendRequestId: id,
          cancelledBy: userId,
        });

        // La ligne `FriendRequest` vient de partir : la notification
        // « X vous a envoyé une demande d'amitié » n'a plus rien où mener. On
        // la RETIRE au lieu de la marquer lue — c'est ce qui distingue cette
        // route de son voisin `PATCH`, qui laisse la ligne en place et n'a donc
        // qu'à la marquer consommée (cf. `retractFriendRequestNotifications`).
        // Elle appartient toujours au receveur, quel que soit celui des deux
        // qui a appelé : c'est lui, et lui seul, que la création a notifié.
        try {
          await notificationService.retractFriendRequestNotifications(friendRequest.receiverId, id);
        } catch (error) {
          // Le service avale déjà ses erreurs ; ce filet garde la propriété qui
          // compte : le retrait des notifications ne fait JAMAIS échouer la
          // suppression, qui est déjà committée en base.
          logError(fastify.log, 'Error retracting friend request notifications:', error);
        }
      }

      return sendSuccess(reply, { message: 'Demande d\'ami supprimee' });

    } catch (error) {
      logError(fastify.log, 'Delete friend request error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
