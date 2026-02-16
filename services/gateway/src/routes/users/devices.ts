import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { buildPaginationMeta } from '../../utils/pagination';
import {
  userMinimalSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import type { AuthenticatedRequest, PaginationParams, IdParams, FriendRequestBody, FriendRequestActionBody, UserIdParams, AffiliateTokenData } from './types';
import type { NotificationService } from '../../services/notifications/NotificationService';
import type { EmailService } from '../../services/EmailService';

/**
 * Validate and sanitize pagination parameters
 */
function validatePagination(
  offset: string = '0',
  limit: string = '20',
  defaultLimit: number = 20,
  maxLimit: number = 100
): PaginationParams {
  const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
  const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || defaultLimit), maxLimit);
  return { offsetNum, limitNum };
}

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
        return reply.status(401).send({
          success: false,
          error: 'Authentication required'
        });
      }

      const userId = authContext.userId;
      const { offset = '0', limit = '20' } = request.query as { offset?: string; limit?: string };

      const { offsetNum, limitNum } = validatePagination(offset, limit);

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

      return reply.send({
        success: true,
        data: friendRequests,
        pagination: buildPaginationMeta(totalCount, offsetNum, limitNum, friendRequests.length)
      });
    } catch (error) {
      console.error('Error retrieving friend requests:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
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
        return reply.status(401).send({
          success: false,
          error: 'Authentication required'
        });
      }

      const senderId = authContext.userId;
      const body = z.object({ receiverId: z.string() }).parse(request.body);
      const { receiverId } = body;

      if (senderId === receiverId) {
        return reply.status(400).send({
          success: false,
          error: 'You cannot add yourself as a friend'
        });
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
        return reply.status(404).send({
          success: false,
          error: 'User not found'
        });
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
        return reply.status(400).send({
          success: false,
          error: 'A friend request already exists between these users'
        });
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
      const notificationService = (fastify as any).notificationService as NotificationService;
      if (notificationService) {
        await notificationService.createFriendRequestNotification({
          recipientUserId: receiverId,
          requesterId: senderId,
          friendRequestId: friendRequest.id,
        }).catch((err: any) => console.error('Notification friend request error:', err));
      }

      // Email au destinataire (respect des preferences)
      const emailService = (fastify as any).emailService as EmailService;
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
          }).catch((err: any) => console.error('Email friend request error:', err));
        }
      }

      return reply.send({
        success: true,
        data: {
          friendRequest,
          message: 'Friend request sent successfully'
        }
      });
    } catch (error) {
      console.error('Error sending friend request:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
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
        return reply.status(401).send({
          success: false,
          error: 'Authentication required'
        });
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
        return reply.status(404).send({
          success: false,
          error: 'Friend request not found or already processed'
        });
      }

      if (action === 'cancel') {
        if (friendRequest.senderId !== userId) {
          return reply.status(403).send({
            success: false,
            error: 'Only the sender can cancel a friend request'
          });
        }

        await fastify.prisma.friendRequest.delete({
          where: { id: id }
        });

        return reply.send({
          success: true,
          data: { message: 'Friend request cancelled successfully' }
        });
      } else {
        if (friendRequest.receiverId !== userId) {
          return reply.status(403).send({
            success: false,
            error: 'Only the receiver can accept or reject a friend request'
          });
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
                { members: { some: { userId: friendRequest.senderId } } },
                { members: { some: { userId: friendRequest.receiverId } } }
              ]
            }
          });

          let conversationId: string | undefined;
          if (!existingConversation) {
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
            conversationId = conversation.id;
          } else {
            conversationId = existingConversation.id;
          }

          // Notification in-app a l'expediteur original
          const notificationService = (fastify as any).notificationService as NotificationService;
          if (notificationService) {
            await notificationService.createFriendAcceptedNotification({
              recipientUserId: friendRequest.senderId,
              accepterUserId: userId,
              conversationId,
            }).catch((err: any) => console.error('Notification friend accepted error:', err));
          }

          // Email a l'expediteur original (respect des preferences)
          const emailService = (fastify as any).emailService as EmailService;
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
                }).catch((err: any) => console.error('Email friend accepted error:', err));
              }
            }
          }
        }

        if (action === 'reject') {
          // Notification system a l'expediteur
          const notificationService = (fastify as any).notificationService as NotificationService;
          if (notificationService) {
            const receiver = updatedRequest.receiver;
            const receiverName = receiver.displayName || receiver.username;
            await notificationService.createSystemNotification({
              recipientUserId: friendRequest.senderId,
              content: `${receiverName} declined your friend request`,
              priority: 'low',
              systemType: 'announcement',
            }).catch((err: any) => console.error('Notification friend rejected error:', err));
          }
        }

        return reply.send({
          success: true,
          data: {
            request: updatedRequest,
            message: action === 'accept' ? 'Friend request accepted' : 'Friend request rejected'
          }
        });
      }
    } catch (error) {
      console.error('Error updating friend request:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
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
        return reply.status(404).send({
          success: false,
          error: 'User not found'
        });
      }

      const affiliateToken = await fastify.prisma.affiliateToken.findFirst({
        where: {
          createdBy: userId,
          isActive: true,
          OR: [
            { expiresAt: null },
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

      return reply.send({
        success: true,
        data: affiliateToken ? { token: affiliateToken.token } : null
      });
    } catch (error) {
      console.error('[USERS] Error fetching affiliate token:', error);
      return reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
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
    reply.send({
      success: true,
      data: { message: 'Get all users - to be implemented' }
    });
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
    reply.send({
      success: true,
      data: { message: 'Update user - to be implemented' }
    });
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
    reply.send({
      success: true,
      data: { message: 'Delete user - to be implemented' }
    });
  });
}
