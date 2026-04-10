import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { canAccessConversation } from './utils/access-control';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { sendSuccess, sendNotFound, sendForbidden, sendInternalError } from '../../utils/response';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'ThreadsRoute' });

const MAX_THREAD_MESSAGES = 200;
const MAX_DEPTH = 10;

const threadMessageSelect = {
  id: true,
  content: true,
  originalLanguage: true,
  conversationId: true,
  senderId: true,
  messageType: true,
  messageSource: true,
  editedAt: true,
  deletedAt: true,
  replyToId: true,
  reactionSummary: true,
  reactionCount: true,
  translations: true,
  validatedMentions: true,
  createdAt: true,
  updatedAt: true,
  sender: {
    select: {
      id: true,
      userId: true,
      displayName: true,
      avatar: true,
      type: true,
      role: true,
      language: true,
      user: {
        select: {
          id: true,
          username: true,
          displayName: true,
          firstName: true,
          lastName: true,
          avatar: true,
          systemLanguage: true,
          role: true
        }
      }
    }
  },
  attachments: {
    select: {
      id: true,
      messageId: true,
      fileName: true,
      originalName: true,
      mimeType: true,
      fileSize: true,
      fileUrl: true,
      thumbnailUrl: true,
      width: true,
      height: true,
      duration: true,
      transcription: true,
      translations: true
    }
  },
  replyTo: {
    select: {
      id: true,
      content: true,
      originalLanguage: true,
      createdAt: true,
      senderId: true,
      validatedMentions: true,
      sender: {
        select: {
          id: true,
          userId: true,
          displayName: true,
          avatar: true,
          type: true,
          language: true,
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
      },
      attachments: {
        select: {
          id: true,
          fileName: true,
          originalName: true,
          mimeType: true,
          fileSize: true,
          fileUrl: true,
          thumbnailUrl: true
        }
      }
    }
  },
  _count: {
    select: {
      reactions: true,
      statusEntries: true
    }
  }
};

export function registerThreadsRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
) {
  fastify.get<{ Params: { id: string; messageId: string } }>('/conversations/:id/threads/:messageId', {
    schema: {
      description: 'Get a flat thread: parent message + all nested replies recursively',
      tags: ['conversations', 'threads'],
      summary: 'Get thread for a message',
      params: {
        type: 'object',
        required: ['id', 'messageId'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' },
          messageId: { type: 'string', description: 'Parent message ID' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'object' }
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
      const { id, messageId } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const authContext = authRequest.authContext;

      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      const hasAccess = await canAccessConversation(prisma, authContext, conversationId, id);
      if (!hasAccess) {
        return sendForbidden(reply, 'You do not have access to this conversation');
      }

      const parent = await prisma.message.findFirst({
        where: { id: messageId, conversationId, deletedAt: null },
        select: threadMessageSelect
      });

      if (!parent) {
        return sendNotFound(reply, 'Message not found');
      }

      const replies = await collectThreadReplies(prisma, conversationId, messageId);

      return sendSuccess(reply, {
        parent,
        replies,
        totalCount: replies.length
      });
    } catch (error) {
      const { id, messageId } = request.params;
      logger.error('Error fetching thread', { error, conversationId: id, messageId });
      return sendInternalError(reply, 'Error fetching thread');
    }
  });
}

function findReplies(prisma: PrismaClient, conversationId: string, parentIds: string[]) {
  return prisma.message.findMany({
    where: { conversationId, replyToId: { in: parentIds }, deletedAt: null },
    select: threadMessageSelect,
    orderBy: { createdAt: 'asc' as const }
  });
}

type ThreadMessage = Awaited<ReturnType<typeof findReplies>>[number];

async function collectThreadReplies(
  prisma: PrismaClient,
  conversationId: string,
  rootMessageId: string
): Promise<ThreadMessage[]> {
  const allReplies: ThreadMessage[] = [];
  let frontier = [rootMessageId];

  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    if (frontier.length === 0) break;

    const batch = await findReplies(prisma, conversationId, frontier);

    if (batch.length === 0) break;

    allReplies.push(...batch);

    if (allReplies.length >= MAX_THREAD_MESSAGES) break;

    frontier = batch.map((m) => m.id);
  }

  return allReplies
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(0, MAX_THREAD_MESSAGES);
}
