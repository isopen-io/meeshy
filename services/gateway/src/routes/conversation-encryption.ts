/**
 * Conversation Encryption Routes
 *
 * Handles encryption settings for conversations:
 * - Enable encryption (E2EE, Server, or Hybrid mode)
 * - Get encryption status
 * - Encryption is immutable (cannot be disabled once enabled)
 *
 * Encryption Modes:
 * - e2ee: Full end-to-end encryption (Signal Protocol) - NO translation
 * - server: Server-side encryption (AES-256-GCM) - translation supported
 * - hybrid: Double encryption (E2EE + server layer) - translation supported
 */

import { FastifyInstance } from 'fastify';
import { getEncryptionService } from '../services/EncryptionService';
import { createUnifiedAuthMiddleware, UnifiedAuthRequest } from '../middleware/auth';
import { validateParams, validateBody } from '../validation/helpers.js';
import { ConversationIdParamSchema, SetEncryptionModeBodySchema } from '../validation/conversation-encryption-schemas.js';
import { enhancedLogger } from '../utils/logger-enhanced.js';
import { sendSuccess, sendBadRequest, sendForbidden, sendNotFound, sendInternalError } from '../utils/response.js';
const logger = enhancedLogger.child({ module: 'ConversationEncryptionRoutes' });

// EncryptionMode type - defined locally to avoid build order issues
type EncryptionMode = 'e2ee' | 'server' | 'hybrid';

interface EnableEncryptionRequest {
  mode: EncryptionMode;
}

interface EncryptionStatusParams {
  conversationId: string;
}

/**
 * Get encryption status from conversation data
 */
function getEncryptionStatus(conversation: {
  encryptionEnabledAt: Date | null;
  encryptionMode: string | null;
  encryptionEnabledBy: string | null;
}): {
  isEncrypted: boolean;
  mode: string | null;
  enabledAt: Date | null;
  enabledBy: string | null;
  canTranslate: boolean;
} {
  const mode = conversation.encryptionMode;
  return {
    isEncrypted: !!conversation.encryptionEnabledAt,
    mode,
    enabledAt: conversation.encryptionEnabledAt,
    enabledBy: conversation.encryptionEnabledBy,
    // Translation is supported in server and hybrid modes, NOT in e2ee
    canTranslate: mode === 'server' || mode === 'hybrid',
  };
}

export default async function encryptionRoutes(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const encryptionService = await getEncryptionService(prisma);
  const authMiddleware = createUnifiedAuthMiddleware(prisma, {
    requireAuth: true,
    allowAnonymous: false
  });

  /**
   * GET /api/v1/conversations/:conversationId/encryption-status
   * Get encryption status for a conversation
   */
  fastify.get<{
    Params: EncryptionStatusParams;
  }>(
    '/conversations/:conversationId/encryption-status',
    {
      preValidation: [authMiddleware],
      preHandler: [validateParams(ConversationIdParamSchema)],
    },
    async (request, reply) => {
      try {
        const { conversationId } = request.params as EncryptionStatusParams;
        const authRequest = request as UnifiedAuthRequest;
        const authContext = authRequest.authContext;

        // Verify conversation access
        const conversation = await fastify.prisma.conversation.findUnique({
          where: { id: conversationId },
          select: {
            id: true,
            encryptionEnabledAt: true,
            encryptionMode: true,
            encryptionEnabledBy: true,
            participants: {
              where: { isActive: true },
              select: { userId: true }
            }
          }
        });

        if (!conversation) {
          return sendNotFound(reply, 'Conversation not found');
        }

        // Check if user is a member
        if (!authContext.isAnonymous) {
          const isMember = conversation.participants.some(m => m.userId === authContext.userId);
          if (!isMember) {
            return sendForbidden(reply, 'Not a member of this conversation');
          }
        }

        const status = getEncryptionStatus({
          encryptionEnabledAt: conversation.encryptionEnabledAt,
          encryptionMode: conversation.encryptionMode,
          encryptionEnabledBy: conversation.encryptionEnabledBy,
        });

        return sendSuccess(reply, status);

      } catch (error) {
        logger.error('Error getting encryption status', error as Error);
        return sendInternalError(reply, 'Internal server error');
      }
    }
  );

  /**
   * POST /api/v1/conversations/:conversationId/encryption
   * Enable encryption for a conversation (immutable - cannot be disabled)
   */
  fastify.post<{
    Params: EncryptionStatusParams;
    Body: EnableEncryptionRequest;
  }>(
    '/conversations/:conversationId/encryption',
    {
      preValidation: [authMiddleware],
      preHandler: [validateParams(ConversationIdParamSchema), validateBody(SetEncryptionModeBodySchema)],
    },
    async (request, reply) => {
      try {
        const { conversationId } = request.params as EncryptionStatusParams;
        const { mode } = request.body as EnableEncryptionRequest;
        const authRequest = request as UnifiedAuthRequest;
        const authContext = authRequest.authContext;

        // Anonymous users cannot enable encryption
        if (authContext.isAnonymous) {
          return sendForbidden(reply, 'Anonymous users cannot enable encryption');
        }

        // Validate mode
        if (!mode || !['e2ee', 'server', 'hybrid'].includes(mode)) {
          return sendBadRequest(reply, 'Invalid encryption mode. Must be "e2ee", "server", or "hybrid"');
        }

        // Get conversation with members and type
        const conversation = await fastify.prisma.conversation.findUnique({
          where: { id: conversationId },
          select: {
            id: true,
            type: true,
            encryptionEnabledAt: true,
            encryptionMode: true,
            participants: {
              where: { isActive: true },
              select: {
                userId: true,
                role: true
              }
            }
          }
        });

        if (!conversation) {
          return sendNotFound(reply, 'Conversation not found');
        }

        // Check if encryption is already enabled (immutable)
        if (conversation.encryptionEnabledAt) {
          return reply.status(400).send({
            success: false,
            error: 'Encryption already enabled for this conversation (cannot be changed)',
            data: {
              currentMode: conversation.encryptionMode,
              enabledAt: conversation.encryptionEnabledAt
            }
          });
        }

        // Check permission to enable encryption
        // - Direct (1:1) conversations: any participant can enable
        // - Group conversations: only moderator, admin, or owner can enable
        const member = conversation.participants.find(m => m.userId === authContext.userId);
        if (!member) {
          return sendForbidden(reply, 'Not a member of this conversation');
        }

        const isDirectConversation = conversation.type === 'direct';
        const hasModeratorRole = ['MODERATOR', 'ADMIN', 'OWNER', 'moderator', 'admin', 'owner'].includes(member.role);

        if (!isDirectConversation && !hasModeratorRole) {
          return sendForbidden(reply, 'Only moderators and above can enable encryption in group conversations');
        }

        // Determine encryption protocol based on mode
        // - e2ee: Signal Protocol only
        // - server: AES-256-GCM only
        // - hybrid: Both (Signal + AES-256-GCM)
        const protocol = mode === 'e2ee' ? 'signal_v3' : 'aes-256-gcm';

        // Get or create server encryption key (for server and hybrid modes)
        let serverEncryptionKeyId: string | null = null;
        if (mode === 'server' || mode === 'hybrid') {
          serverEncryptionKeyId = await encryptionService.getOrCreateConversationKey();
        }

        // Enable encryption (immutable operation)
        const updatedConversation = await fastify.prisma.conversation.update({
          where: { id: conversationId },
          data: {
            encryptionEnabledAt: new Date(),
            encryptionMode: mode,
            encryptionProtocol: protocol,
            encryptionEnabledBy: authContext.userId,
            serverEncryptionKeyId,
          },
          select: {
            id: true,
            encryptionEnabledAt: true,
            encryptionMode: true,
            encryptionProtocol: true,
            encryptionEnabledBy: true,
          }
        });

        // Create system message to notify members
        const encryptionMessages: Record<EncryptionMode, string> = {
          e2ee: '🔒 End-to-end encryption enabled. Messages are now fully encrypted.',
          server: '🔐 Server-side encryption enabled. Messages are encrypted with translation support.',
          hybrid: '🔐🔒 Hybrid encryption enabled. Messages are double-encrypted with E2EE + server layer. Translation is supported.',
        };

        const encryptionLabels: Record<EncryptionMode, string> = {
          e2ee: 'End-to-end',
          server: 'Server-side',
          hybrid: 'Hybrid',
        };

        // Resolve Participant.id for system message sender
        const senderParticipant = await fastify.prisma.participant.findFirst({
          where: { userId: authContext.userId, conversationId, isActive: true },
          select: { id: true }
        });

        if (senderParticipant) {
          await fastify.prisma.message.create({
            data: {
              conversationId,
              senderId: senderParticipant.id,
              content: encryptionMessages[mode],
              originalLanguage: 'en',
              messageType: 'system',
              deletedAt: null
            }
          });
        }

        logger.info('Encryption enabled for conversation', { conversationId, mode });

        return reply.send({
          success: true,
          data: getEncryptionStatus({
            encryptionEnabledAt: updatedConversation.encryptionEnabledAt,
            encryptionMode: updatedConversation.encryptionMode,
            encryptionEnabledBy: updatedConversation.encryptionEnabledBy,
          }),
          message: `${encryptionLabels[mode]} encryption enabled successfully`
        });

      } catch (error) {
        logger.error('Error enabling encryption', error as Error);
        return sendInternalError(reply, 'Internal server error');
      }
    }
  );
}
