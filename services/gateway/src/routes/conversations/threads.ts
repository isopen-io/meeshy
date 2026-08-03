import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { canAccessConversation } from './utils/access-control';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { attachmentMediaSelect } from '../../services/attachments/attachmentIncludes';
import { sendSuccess, sendNotFound, sendForbidden, sendInternalError } from '../../utils/response';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { hoistLocationOnto } from '../../services/location/sharedPlace';

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
  // Lot 1 : le fil affiche une bulle complète pour la racine ET pour le
  // message cité (replyTo) — sans `metadata`, un message géolocalisé perd
  // sa position dans ce thread alors qu'il la restitue ailleurs.
  metadata: true,
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
  attachments: { select: attachmentMediaSelect },
  replyTo: {
    select: {
      id: true,
      content: true,
      originalLanguage: true,
      createdAt: true,
      senderId: true,
      validatedMentions: true,
      // Même rappel que ci-dessus, sur le message CITÉ cette fois.
      metadata: true,
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

/**
 * Hisse `metadata.location` sur un message de fil ET sur son `replyTo`
 * imbriqué (le message cité). Les deux affichent une vraie bulle complète —
 * un hoist qui ne porterait que sur la racine laisserait la citation sans
 * position, comme si le message cité n'en avait jamais eu.
 */
function hoistThreadMessageLocation<T extends Record<string, unknown>>(message: T): T {
  const hoisted = hoistLocationOnto(message);
  const replyTo = (hoisted as { replyTo?: unknown }).replyTo;
  if (replyTo && typeof replyTo === 'object' && !Array.isArray(replyTo)) {
    return { ...hoisted, replyTo: hoistLocationOnto(replyTo as Record<string, unknown>) } as T;
  }
  return hoisted;
}

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
            // Pas de sous-schéma pour `data` (forme récursive libre :
            // message + replyTo + replies[]) — `additionalProperties: true`
            // évite que fast-json-stringify le sérialise comme `{}` faute de
            // `properties` déclarées, ce qui aurait aussi bien tronqué le
            // hoist `location` en silence.
            data: { type: 'object', additionalProperties: true }
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
        parent: hoistThreadMessageLocation(parent as unknown as Record<string, unknown>),
        replies: replies.map((m) => hoistThreadMessageLocation(m as unknown as Record<string, unknown>)),
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
    /* istanbul ignore next -- frontier is always non-empty here: initially [rootMessageId]; updated only when batch.length>0 (else we break first) */
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
