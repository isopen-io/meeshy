/**
 * User Deletions Routes
 *
 * Handles per-user "delete for me" functionality:
 * - Delete conversation from user's view (other participants still see it)
 * - Delete message from user's view (other participants still see it)
 * - Clear conversation history before a certain date
 * - Restore deleted conversations/messages
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createUnifiedAuthMiddleware, UnifiedAuthRequest } from '../middleware/auth';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';

interface ConversationIdParams {
  conversationId: string;
}

interface MessageIdParams {
  messageId: string;
}

interface ClearHistoryBody {
  beforeDate: string; // ISO date string
}

export default async function userDeletionsRoutes(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const authMiddleware = createUnifiedAuthMiddleware(prisma, {
    requireAuth: true,
    allowAnonymous: false,
  });

  /**
   * DELETE /api/conversations/:conversationId/delete-for-me
   * Soft-delete a conversation from the user's view only
   */
  fastify.delete<{ Params: ConversationIdParams }>(
    '/api/conversations/:conversationId/delete-for-me',
    {
      preValidation: [authMiddleware],
      schema: {
        description: 'Soft-delete a conversation from the authenticated user\'s view. Other participants will still see the conversation. The conversation can be restored later.',
        tags: ['users', 'conversations'],
        summary: 'Delete conversation for current user',
        params: {
          type: 'object',
          required: ['conversationId'],
          properties: {
            conversationId: { type: 'string', description: 'Conversation ID to delete from user view' }
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
                  message: { type: 'string', example: 'Conversation deleted from your view' }
                }
              }
            }
          },
          403: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        const { conversationId } = request.params;
        const authRequest = request as UnifiedAuthRequest;
        const userId = authRequest.authContext.userId;

        // Verify user is a member of this conversation
        const membership = await prisma.conversationMember.findFirst({
          where: {
            conversationId,
            userId,
            isActive: true,
          },
        });

        if (!membership) {
          return reply.status(403).send({
            success: false,
            error: 'Not a member of this conversation',
          });
        }

        // Upsert user conversation preferences with deletion flag
        await prisma.userConversationPreferences.upsert({
          where: {
            userId_conversationId: { userId, conversationId },
          },
          create: {
            userId,
            conversationId,
            isDeletedForUser: true,
            deletedForUserAt: new Date(),
          },
          update: {
            isDeletedForUser: true,
            deletedForUserAt: new Date(),
          },
        });

        console.log(`[UserDeletions] Conversation ${conversationId} deleted for user ${userId}`);

        return reply.send({
          success: true,
          data: { message: 'Conversation deleted from your view' },
        });
      } catch (error) {
        console.error('[UserDeletions] Error deleting conversation for user:', error);
        return reply.status(500).send({
          success: false,
          error: 'Internal server error',
        });
      }
    }
  );

  /**
   * POST /api/conversations/:conversationId/restore-for-me
   * Restore a previously deleted conversation for the user
   */
  fastify.post<{ Params: ConversationIdParams }>(
    '/api/conversations/:conversationId/restore-for-me',
    {
      preValidation: [authMiddleware],
      schema: {
        description: 'Restore a previously deleted conversation to the authenticated user\'s view. Only works if the conversation was previously deleted by the user.',
        tags: ['users', 'conversations'],
        summary: 'Restore deleted conversation',
        params: {
          type: 'object',
          required: ['conversationId'],
          properties: {
            conversationId: { type: 'string', description: 'Conversation ID to restore' }
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
                  message: { type: 'string', example: 'Conversation restored' }
                }
              }
            }
          },
          400: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        const { conversationId } = request.params;
        const authRequest = request as UnifiedAuthRequest;
        const userId = authRequest.authContext.userId;

        // Update preferences to restore conversation
        const prefs = await prisma.userConversationPreferences.findUnique({
          where: {
            userId_conversationId: { userId, conversationId },
          },
        });

        if (!prefs || !prefs.isDeletedForUser) {
          return reply.status(400).send({
            success: false,
            error: 'Conversation is not deleted',
          });
        }

        await prisma.userConversationPreferences.update({
          where: {
            userId_conversationId: { userId, conversationId },
          },
          data: {
            isDeletedForUser: false,
            deletedForUserAt: null,
          },
        });

        console.log(`[UserDeletions] Conversation ${conversationId} restored for user ${userId}`);

        return reply.send({
          success: true,
          data: { message: 'Conversation restored' },
        });
      } catch (error) {
        console.error('[UserDeletions] Error restoring conversation for user:', error);
        return reply.status(500).send({
          success: false,
          error: 'Internal server error',
        });
      }
    }
  );

  /**
   * POST /api/conversations/:conversationId/clear-history
   * Clear all messages before a certain date (delete for user only)
   */
  fastify.post<{ Params: ConversationIdParams; Body: ClearHistoryBody }>(
    '/api/conversations/:conversationId/clear-history',
    {
      preValidation: [authMiddleware],
      schema: {
        description: 'Clear conversation history before a specific date for the authenticated user only. Messages before the specified date will be hidden from the user\'s view. Other participants are not affected.',
        tags: ['users', 'conversations'],
        summary: 'Clear conversation history',
        params: {
          type: 'object',
          required: ['conversationId'],
          properties: {
            conversationId: { type: 'string', description: 'Conversation ID to clear history for' }
          }
        },
        body: {
          type: 'object',
          required: ['beforeDate'],
          properties: {
            beforeDate: { type: 'string', format: 'date-time', description: 'ISO 8601 date string - messages before this date will be hidden' }
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
                  message: { type: 'string', example: 'Chat history cleared before 2024-01-15T10:30:00.000Z' },
                  clearHistoryBefore: { type: 'string', format: 'date-time', description: 'The date before which messages are hidden' }
                }
              }
            }
          },
          400: errorResponseSchema,
          403: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        const { conversationId } = request.params;
        const { beforeDate } = request.body;
        const authRequest = request as UnifiedAuthRequest;
        const userId = authRequest.authContext.userId;

        if (!beforeDate) {
          return reply.status(400).send({
            success: false,
            error: 'beforeDate is required',
          });
        }

        const clearDate = new Date(beforeDate);
        if (isNaN(clearDate.getTime())) {
          return reply.status(400).send({
            success: false,
            error: 'Invalid date format',
          });
        }

        // Verify user is a member
        const membership = await prisma.conversationMember.findFirst({
          where: {
            conversationId,
            userId,
            isActive: true,
          },
        });

        if (!membership) {
          return reply.status(403).send({
            success: false,
            error: 'Not a member of this conversation',
          });
        }

        // Upsert user conversation preferences with clear history date
        await prisma.userConversationPreferences.upsert({
          where: {
            userId_conversationId: { userId, conversationId },
          },
          create: {
            userId,
            conversationId,
            clearHistoryBefore: clearDate,
          },
          update: {
            clearHistoryBefore: clearDate,
          },
        });

        console.log(`[UserDeletions] History cleared before ${clearDate.toISOString()} for user ${userId} in conversation ${conversationId}`);

        return reply.send({
          success: true,
          data: {
            message: `Chat history cleared before ${clearDate.toISOString()}`,
            clearHistoryBefore: clearDate,
          },
        });
      } catch (error) {
        console.error('[UserDeletions] Error clearing history:', error);
        return reply.status(500).send({
          success: false,
          error: 'Internal server error',
        });
      }
    }
  );

  /**
   * DELETE /api/messages/:messageId/delete-for-me
   * Soft-delete a message from the user's view only
   */
  fastify.delete<{ Params: MessageIdParams }>(
    '/api/messages/:messageId/delete-for-me',
    {
      preValidation: [authMiddleware],
      schema: {
        description: 'Soft-delete a specific message from the authenticated user\'s view. Other participants will still see the message. The message can be restored later.',
        tags: ['users', 'messages'],
        summary: 'Delete message for current user',
        params: {
          type: 'object',
          required: ['messageId'],
          properties: {
            messageId: { type: 'string', description: 'Message ID to delete from user view' }
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
                  message: { type: 'string', example: 'Message deleted from your view' }
                }
              }
            }
          },
          403: errorResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        const { messageId } = request.params;
        const authRequest = request as UnifiedAuthRequest;
        const userId = authRequest.authContext.userId;

        // Get message and verify user can access it
        const message = await prisma.message.findUnique({
          where: { id: messageId },
          include: {
            conversation: {
              include: {
                members: {
                  where: { userId, isActive: true },
                },
              },
            },
          },
        });

        if (!message) {
          return reply.status(404).send({
            success: false,
            error: 'Message not found',
          });
        }

        if (message.conversation.members.length === 0) {
          return reply.status(403).send({
            success: false,
            error: 'Not a member of this conversation',
          });
        }

        // Create user message deletion record
        await prisma.userMessageDeletion.upsert({
          where: {
            userId_messageId: { userId, messageId },
          },
          create: {
            userId,
            messageId,
          },
          update: {
            deletedAt: new Date(),
          },
        });

        console.log(`[UserDeletions] Message ${messageId} deleted for user ${userId}`);

        return reply.send({
          success: true,
          data: { message: 'Message deleted from your view' },
        });
      } catch (error) {
        console.error('[UserDeletions] Error deleting message for user:', error);
        return reply.status(500).send({
          success: false,
          error: 'Internal server error',
        });
      }
    }
  );

  /**
   * POST /api/messages/:messageId/restore-for-me
   * Restore a previously deleted message for the user
   */
  fastify.post<{ Params: MessageIdParams }>(
    '/api/messages/:messageId/restore-for-me',
    {
      preValidation: [authMiddleware],
      schema: {
        description: 'Restore a previously deleted message to the authenticated user\'s view. Only works if the message was previously deleted by the user.',
        tags: ['users', 'messages'],
        summary: 'Restore deleted message',
        params: {
          type: 'object',
          required: ['messageId'],
          properties: {
            messageId: { type: 'string', description: 'Message ID to restore' }
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
                  message: { type: 'string', example: 'Message restored' }
                }
              }
            }
          },
          400: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        const { messageId } = request.params;
        const authRequest = request as UnifiedAuthRequest;
        const userId = authRequest.authContext.userId;

        // Check if deletion record exists
        const deletion = await prisma.userMessageDeletion.findUnique({
          where: {
            userId_messageId: { userId, messageId },
          },
        });

        if (!deletion) {
          return reply.status(400).send({
            success: false,
            error: 'Message is not deleted',
          });
        }

        // Remove the deletion record
        await prisma.userMessageDeletion.delete({
          where: {
            userId_messageId: { userId, messageId },
          },
        });

        console.log(`[UserDeletions] Message ${messageId} restored for user ${userId}`);

        return reply.send({
          success: true,
          data: { message: 'Message restored' },
        });
      } catch (error) {
        console.error('[UserDeletions] Error restoring message for user:', error);
        return reply.status(500).send({
          success: false,
          error: 'Internal server error',
        });
      }
    }
  );

  /**
   * DELETE /api/messages/bulk/delete-for-me
   * Bulk delete multiple messages from the user's view
   */
  fastify.delete<{ Body: { messageIds: string[] } }>(
    '/api/messages/bulk/delete-for-me',
    {
      preValidation: [authMiddleware],
      schema: {
        description: 'Bulk delete multiple messages from the authenticated user\'s view in a single request. Maximum 100 messages per request. Other participants are not affected. Only messages from conversations where the user is a member can be deleted.',
        tags: ['users', 'messages'],
        summary: 'Bulk delete messages for current user',
        body: {
          type: 'object',
          required: ['messageIds'],
          properties: {
            messageIds: {
              type: 'array',
              items: { type: 'string' },
              minItems: 1,
              maxItems: 100,
              description: 'Array of message IDs to delete (max 100)'
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
                  message: { type: 'string', example: '15 messages deleted from your view' },
                  deletedCount: { type: 'number', description: 'Number of messages actually deleted' },
                  requestedCount: { type: 'number', description: 'Number of message IDs requested' }
                }
              }
            }
          },
          400: errorResponseSchema,
          403: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        const { messageIds } = request.body;
        const authRequest = request as UnifiedAuthRequest;
        const userId = authRequest.authContext.userId;

        if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
          return reply.status(400).send({
            success: false,
            error: 'messageIds array is required',
          });
        }

        if (messageIds.length > 100) {
          return reply.status(400).send({
            success: false,
            error: 'Maximum 100 messages can be deleted at once',
          });
        }

        // Verify user can access these messages (they belong to conversations user is member of)
        const messages = await prisma.message.findMany({
          where: {
            id: { in: messageIds },
            conversation: {
              members: {
                some: { userId, isActive: true },
              },
            },
          },
          select: { id: true },
        });

        const validMessageIds = messages.map((m) => m.id);

        if (validMessageIds.length === 0) {
          return reply.status(403).send({
            success: false,
            error: 'No accessible messages found',
          });
        }

        // Create deletion records for all valid messages (MongoDB doesn't support skipDuplicates)
        // Use Promise.allSettled to handle existing records gracefully
        await Promise.allSettled(
          validMessageIds.map((messageId) =>
            prisma.userMessageDeletion.upsert({
              where: { userId_messageId: { userId, messageId } },
              create: { userId, messageId },
              update: { deletedAt: new Date() },
            })
          )
        );

        console.log(`[UserDeletions] ${validMessageIds.length} messages deleted for user ${userId}`);

        return reply.send({
          success: true,
          data: {
            message: `${validMessageIds.length} messages deleted from your view`,
            deletedCount: validMessageIds.length,
            requestedCount: messageIds.length,
          },
        });
      } catch (error) {
        console.error('[UserDeletions] Error bulk deleting messages:', error);
        return reply.status(500).send({
          success: false,
          error: 'Internal server error',
        });
      }
    }
  );

  /**
   * GET /api/user/deleted-conversations
   * Get list of conversations the user has deleted (for potential restoration)
   */
  fastify.get(
    '/api/user/deleted-conversations',
    {
      preValidation: [authMiddleware],
      schema: {
        description: 'Get a list of all conversations the authenticated user has deleted from their view. Returns conversation details and deletion timestamps. These conversations can be restored.',
        tags: ['users', 'conversations'],
        summary: 'Get user deleted conversations',
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
                    conversationId: { type: 'string', description: 'Conversation ID' },
                    conversation: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        identifier: { type: 'string' },
                        title: { type: 'string', nullable: true },
                        type: { type: 'string', enum: ['direct', 'group'] },
                        avatar: { type: 'string', nullable: true },
                        lastMessageAt: { type: 'string', format: 'date-time', nullable: true }
                      }
                    },
                    deletedAt: { type: 'string', format: 'date-time', nullable: true, description: 'When the user deleted this conversation' }
                  }
                }
              }
            }
          },
          500: errorResponseSchema
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const authContext = (request as any).authContext;
        const userId = authContext.userId;

        const deletedPrefs = await prisma.userConversationPreferences.findMany({
          where: {
            userId,
            isDeletedForUser: true,
          },
          include: {
            conversation: {
              select: {
                id: true,
                identifier: true,
                title: true,
                type: true,
                avatar: true,
                lastMessageAt: true,
              },
            },
          },
          orderBy: { deletedForUserAt: 'desc' },
        });

        return reply.send({
          success: true,
          data: deletedPrefs.map((p) => ({
            conversationId: p.conversationId,
            conversation: p.conversation,
            deletedAt: p.deletedForUserAt,
          })),
        });
      } catch (error) {
        console.error('[UserDeletions] Error fetching deleted conversations:', error);
        return reply.status(500).send({
          success: false,
          error: 'Internal server error',
        });
      }
    }
  );
}
