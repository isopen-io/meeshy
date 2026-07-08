import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { buildPaginationMeta } from '../../utils/pagination';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { sendSuccess, sendPaginatedSuccess, sendUnauthorized, sendBadRequest, sendNotFound, sendForbidden, sendInternalError } from '../../utils/response.js';

const logger = enhancedLogger.child({ module: 'UserDevicesRoutes' });
import {
  userMinimalSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import type { AuthenticatedRequest, IdParams, FriendRequestBody, FriendRequestActionBody, UserIdParams, AffiliateTokenData } from './types';
import type { NotificationService } from '../../services/notifications/NotificationService';
import type { EmailService } from '../../services/EmailService';
import { validatePagination } from '../../utils/pagination';


/**
 * Get all friend requests for authenticated user
 */
export async function getFriendRequests(fastify: FastifyInstance) {
  fastify.get('/users/friend-requests', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get all friend requests for the authenticated user. Returns both sent and received requests with full user details.',
      tags: ['users', 'friends'],
      summary: 'Get friend requests',
      querystring: {
        type: 'object',
        properties: {
          offset: { type: 'string', default: '0', description: 'Pagination offset' },
          limit: { type: 'string', default: '20', description: 'Results per page (max 100)' }
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
                  senderId: { type: 'string' },
                  receiverId: { type: 'string' },
                  status: { type: 'string', enum: ['pending', 'accepted', 'rejected'] },
                  createdAt: { type: 'string', format: 'date-time' },
                  sender: userMinimalSchema,
                  receiver: userMinimalSchema
                }
              }
            },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                offset: { type: 'number' },
                limit: { type: 'number' },
                returned: { type: 'number' }
              }
            }
          }
        },
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as AuthenticatedRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required');
      }

      const userId = authContext.userId;
      const { offset = '0', limit = '20' } = request.query as { offset?: string; limit?: string };

      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit);

      const whereClause = {
        OR: [
          { senderId: userId },
          { receiverId: userId }
        ]
      };

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
          },
          orderBy: {
            createdAt: 'desc'
          },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.friendRequest.count({ where: whereClause })
      ]);

      return sendPaginatedSuccess(reply, friendRequests, buildPaginationMeta(totalCount, offsetNum, limitNum, friendRequests.length));
    } catch (error) {
      logger.error('Error retrieving friend requests', error as Error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}

/**
 * Send a friend request
 */
export async function sendFriendRequest(fastify: FastifyInstance) {
  fastify.post('/users/friend-requests', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Send a friend request to another user. Validates that users exist, prevents duplicate requests, and ensures users cannot add themselves.',
      tags: ['users', 'friends'],
      summary: 'Send friend request',
      body: {
        type: 'object',
        required: ['receiverId'],
        properties: {
          receiverId: { type: 'string', description: 'User ID to send friend request to' }
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
                friendRequest: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    senderId: { type: 'string' },
                    receiverId: { type: 'string' },
                    status: { type: 'string', example: 'pending' },
                    createdAt: { type: 'string', format: 'date-time' },
                    sender: userMinimalSchema,
                    receiver: userMinimalSchema
                  }
                },
                message: { type: 'string', example: 'Friend request sent successfully' }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as AuthenticatedRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required');
      }

      const senderId = authContext.userId;
      const body = z.object({ receiverId: z.string() }).parse(request.body);
      const { receiverId } = body;

      if (senderId === receiverId) {
        return sendBadRequest(reply, 'You cannot add yourself as a friend');
      }

      const receiver = await fastify.prisma.user.findUnique({
        where: { id: receiverId },
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          displayName: true,
          avatar: true,
          email: true,
          systemLanguage: true
        }
      });

      if (!receiver) {
        return sendNotFound(reply, 'User not found');
      }

      const existingRequest = await fastify.prisma.friendRequest.findFirst({
        where: {
          OR: [
            { senderId, receiverId },
            { senderId: receiverId, receiverId: senderId }
          ]
        }
      });

      if (existingRequest) {
        return sendBadRequest(reply, 'A friend request already exists between these users');
      }

      const friendRequest = await fastify.prisma.friendRequest.create({
        data: {
          senderId,
          receiverId,
          status: 'pending'
        },
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
        }
      });

      // Notification in-app au destinataire
      const notificationService = fastify.notificationService;
      if (notificationService) {
        await notificationService.createFriendRequestNotification({
          recipientUserId: receiverId,
          requesterId: senderId,
          friendRequestId: friendRequest.id,
        }).catch((err: unknown) => logger.error('Notification friend request error', err as Error));
      }

      // Email au destinataire (respect des preferences)
      const emailService = fastify.emailService;
      if (emailService && receiver.email) {
        const userPrefs = await fastify.prisma.userPreferences.findUnique({
          where: { userId: receiverId },
          select: { notification: true }
        });
        const prefs = userPrefs?.notification as any;
        const shouldEmail = (prefs?.emailEnabled !== false) && (prefs?.contactRequestEnabled !== false);

        if (shouldEmail) {
          const sender = friendRequest.sender;
          const senderName = sender.displayName || sender.username || `${sender.firstName} ${sender.lastName}`.trim();
          await emailService.sendFriendRequestEmail({
            to: receiver.email,
            recipientName: receiver.displayName || receiver.username || '',
            senderName,
            senderAvatar: sender.avatar,
            viewRequestUrl: `${process.env.FRONTEND_URL || 'https://meeshy.me'}/contacts#pending`,
            language: receiver.systemLanguage || undefined,
          }).catch((err: unknown) => logger.error('Email friend request error', err as Error));
        }
      }

      return sendSuccess(reply, {
        friendRequest,
        message: 'Friend request sent successfully'
      });
    } catch (error) {
      logger.error('Error sending friend request', error as Error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}

/**
 * Respond to a friend request (accept/reject/cancel)
 */
export async function respondToFriendRequest(fastify: FastifyInstance) {
  fastify.patch('/users/friend-requests/:id', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Respond to a friend request. Sender can cancel, receiver can accept or reject. Only pending requests can be modified.',
      tags: ['users', 'friends'],
      summary: 'Respond to friend request',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Friend request ID' }
        }
      },
      body: {
        type: 'object',
        required: ['action'],
        properties: {
          action: {
            type: 'string',
            enum: ['accept', 'reject', 'cancel'],
            description: 'Action to perform (accept/reject by receiver, cancel by sender)'
          }
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
                request: {
                  type: 'object',
                  nullable: true,
                  properties: {
                    id: { type: 'string' },
                    senderId: { type: 'string' },
                    receiverId: { type: 'string' },
                    status: { type: 'string' },
                    sender: userMinimalSchema,
                    receiver: userMinimalSchema
                  }
                },
                message: { type: 'string' }
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
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as AuthenticatedRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required');
      }

      const userId = authContext.userId;
      const params = z.object({ id: z.string() }).parse(request.params);
      const body = z.object({ action: z.enum(['accept', 'reject', 'cancel']) }).parse(request.body);
      const { id } = params;
      const { action } = body;

      const friendRequest = await fastify.prisma.friendRequest.findFirst({
        where: {
          id: id,
          status: 'pending'
        }
      });

      if (!friendRequest) {
        return sendNotFound(reply, 'Friend request not found or already processed');
      }

      if (action === 'cancel') {
        if (friendRequest.senderId !== userId) {
          return sendForbidden(reply, 'Only the sender can cancel a friend request');
        }

        await fastify.prisma.friendRequest.delete({
          where: { id: id }
        });

        return sendSuccess(reply, { message: 'Friend request cancelled successfully' });
      } else {
        if (friendRequest.receiverId !== userId) {
          return sendForbidden(reply, 'Only the receiver can accept or reject a friend request');
        }

        const updatedRequest = await fastify.prisma.friendRequest.update({
          where: { id: id },
          data: {
            status: action === 'accept' ? 'accepted' : 'rejected'
          },
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
          }
        });

        if (action === 'accept') {
          // Create direct conversation if none exists
          const existingConversation = await fastify.prisma.conversation.findFirst({
            where: {
              type: 'direct',
              AND: [
                { participants: { some: { userId: friendRequest.senderId } } },
                { participants: { some: { userId: friendRequest.receiverId } } }
              ]
            }
          });

          let conversationId: string | undefined;
          if (!existingConversation) {
            const identifier = `direct_${friendRequest.senderId}_${friendRequest.receiverId}_${Date.now()}`;
            const defaultPermissions = { canSendMessages: true, canSendFiles: true, canSendImages: true, canSendAudio: true, canSendVideo: true, canSendLinks: true, canReact: true, canReply: true, canMention: true };
            const senderUser = await fastify.prisma.user.findUnique({ where: { id: friendRequest.senderId }, select: { displayName: true } });
            const receiverUser = await fastify.prisma.user.findUnique({ where: { id: friendRequest.receiverId }, select: { displayName: true } });
            const conversation = await fastify.prisma.conversation.create({
              data: {
                identifier,
                type: 'direct',
                participants: {
                  create: [
                    { userId: friendRequest.senderId, type: 'user', displayName: senderUser?.displayName || 'User', role: 'member', permissions: defaultPermissions },
                    { userId: friendRequest.receiverId, type: 'user', displayName: receiverUser?.displayName || 'User', role: 'member', permissions: defaultPermissions }
                  ]
                }
              }
            });
            conversationId = conversation.id;

            // Auto-join both users' currently-connected sockets to the new DM
            // room so they receive message:new immediately without a reconnect.
            const socketManager = fastify.socketIOHandler?.getManager();
            if (socketManager) {
              for (const memberUserId of [friendRequest.senderId, friendRequest.receiverId]) {
                socketManager.joinUserToConversationRoom(memberUserId, conversation.id).catch(
                  (err: unknown) => logger.error('Failed to auto-join friend to new DM room', err as Error)
                );
              }
            }
          } else {
            conversationId = existingConversation.id;
          }

          // Notification in-app a l'expediteur original
          const notificationService = fastify.notificationService;
          if (notificationService) {
            await notificationService.createFriendAcceptedNotification({
              recipientUserId: friendRequest.senderId,
              accepterUserId: userId,
              conversationId,
            }).catch((err: unknown) => logger.error('Notification friend accepted error', err as Error));
          }

          // Email a l'expediteur original (respect des preferences)
          const emailService = fastify.emailService;
          if (emailService) {
            const sender = await fastify.prisma.user.findUnique({
              where: { id: friendRequest.senderId },
              select: { email: true, displayName: true, username: true, systemLanguage: true }
            });

            if (sender?.email) {
              const userPrefs = await fastify.prisma.userPreferences.findUnique({
                where: { userId: friendRequest.senderId },
                select: { notification: true }
              });
              const prefs = userPrefs?.notification as any;
              const shouldEmail = (prefs?.emailEnabled !== false) && (prefs?.contactRequestEnabled !== false);

              if (shouldEmail) {
                const accepter = updatedRequest.receiver;
                const accepterName = accepter.displayName || accepter.username || `${accepter.firstName} ${accepter.lastName}`.trim();
                await emailService.sendFriendAcceptedEmail({
                  to: sender.email,
                  recipientName: sender.displayName || sender.username || '',
                  accepterName,
                  accepterAvatar: accepter.avatar,
                  conversationUrl: `${process.env.FRONTEND_URL || 'https://meeshy.me'}/conversations/${conversationId}`,
                  language: sender.systemLanguage || undefined,
                }).catch((err: unknown) => logger.error('Email friend accepted error', err as Error));
              }
            }
          }
        }

        if (action === 'reject') {
          // Notification system a l'expediteur
          const notificationService = fastify.notificationService;
          if (notificationService) {
            const receiver = updatedRequest.receiver;
            const receiverName = receiver.displayName || receiver.username;
            await notificationService.createSystemNotification({
              recipientUserId: friendRequest.senderId,
              content: `${receiverName} declined your friend request`,
              priority: 'low',
              systemType: 'announcement',
            }).catch((err: unknown) => logger.error('Notification friend rejected error', err as Error));
          }
        }

        return sendSuccess(reply, {
          request: updatedRequest,
          message: action === 'accept' ? 'Friend request accepted' : 'Friend request rejected'
        });
      }
    } catch (error) {
      logger.error('Error updating friend request', error as Error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}

/**
 * Get active affiliate token for user
 */
export async function getAffiliateToken(fastify: FastifyInstance) {
  fastify.get('/users/:userId/affiliate-token', {
    schema: {
      description: 'Get the active affiliate token for a user. Used for automatic affiliation via /join links. Returns the most recent active token that has not expired.',
      tags: ['users', 'affiliate'],
      summary: 'Get user affiliate token',
      params: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string', description: 'User ID' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              nullable: true,
              properties: {
                token: { type: 'string', description: 'Active affiliate token' }
              }
            }
          }
        },
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.params as UserIdParams;

      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true }
      });

      if (!user) {
        return sendNotFound(reply, 'User not found');
      }

      const affiliateToken = await fastify.prisma.affiliateToken.findFirst({
        where: {
          createdBy: userId,
          isActive: true,
          OR: [
            { expiresAt: { isSet: false } },
            { expiresAt: { equals: null } },
            { expiresAt: { gt: new Date() } }
          ]
        },
        orderBy: {
          createdAt: 'desc'
        },
        select: {
          token: true
        }
      });

      return sendSuccess(reply, affiliateToken ? { token: affiliateToken.token } : null);
    } catch (error) {
      logger.error('Error fetching affiliate token', error as Error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}

/**
 * Stub routes for future implementation
 */
export async function getAllUsers(fastify: FastifyInstance) {
  fastify.get('/users', {
    schema: {
      description: 'Get all users (to be implemented). This endpoint will return a paginated list of all users in the system.',
      tags: ['users'],
      summary: 'Get all users',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Get all users - to be implemented' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    return sendSuccess(reply, { message: 'Get all users - to be implemented' });
  });
}

export async function updateUserById(fastify: FastifyInstance) {
  fastify.put('/users/:id', {
    schema: {
      description: 'Update a specific user by ID (to be implemented). Admin-only endpoint for managing user accounts.',
      tags: ['users'],
      summary: 'Update user by ID',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'User MongoDB ID' }
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
                message: { type: 'string', example: 'Update user - to be implemented' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    return sendSuccess(reply, { message: 'Update user - to be implemented' });
  });
}

export async function deleteUserById(fastify: FastifyInstance) {
  fastify.delete('/users/:id', {
    schema: {
      description: 'Delete a specific user by ID (to be implemented). Admin-only endpoint for removing user accounts.',
      tags: ['users'],
      summary: 'Delete user by ID',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'User MongoDB ID' }
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
                message: { type: 'string', example: 'Delete user - to be implemented' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    return sendSuccess(reply, { message: 'Delete user - to be implemented' });
  });
}
