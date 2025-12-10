/**
 * Conversation Encryption Routes
 *
 * Handles encryption settings for conversations:
 * - Enable encryption (E2EE or Server mode)
 * - Get encryption status
 * - Encryption is immutable (cannot be disabled once enabled)
 */

import { FastifyInstance } from 'fastify';
import { getEncryptionService } from '../services/EncryptionService';
import { createUnifiedAuthMiddleware, UnifiedAuthRequest } from '../middleware/auth';

type EncryptionMode = 'e2ee' | 'server';

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
  return {
    isEncrypted: !!conversation.encryptionEnabledAt,
    mode: conversation.encryptionMode,
    enabledAt: conversation.encryptionEnabledAt,
    enabledBy: conversation.encryptionEnabledBy,
    canTranslate: conversation.encryptionMode !== 'e2ee',
  };
}

export default async function encryptionRoutes(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const encryptionService = getEncryptionService(prisma);
  const authMiddleware = createUnifiedAuthMiddleware(prisma, {
    requireAuth: true,
    allowAnonymous: false
  });

  /**
   * GET /api/conversations/:conversationId/encryption-status
   * Get encryption status for a conversation
   */
  fastify.get<{
    Params: EncryptionStatusParams;
  }>(
    '/api/conversations/:conversationId/encryption-status',
    {
      preValidation: [authMiddleware],
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
            members: {
              where: { isActive: true },
              select: { userId: true }
            }
          }
        });

        if (!conversation) {
          return reply.status(404).send({
            success: false,
            error: 'Conversation not found'
          });
        }

        // Check if user is a member
        if (!authContext.isAnonymous) {
          const isMember = conversation.members.some(m => m.userId === authContext.userId);
          if (!isMember) {
            return reply.status(403).send({
              success: false,
              error: 'Not a member of this conversation'
            });
          }
        }

        const status = getEncryptionStatus({
          encryptionEnabledAt: conversation.encryptionEnabledAt,
          encryptionMode: conversation.encryptionMode,
          encryptionEnabledBy: conversation.encryptionEnabledBy,
        });

        return reply.send({
          success: true,
          data: status
        });

      } catch (error) {
        console.error('[EncryptionRoutes] Error getting encryption status:', error);
        return reply.status(500).send({
          success: false,
          error: 'Internal server error'
        });
      }
    }
  );

  /**
   * POST /api/conversations/:conversationId/encryption
   * Enable encryption for a conversation (immutable - cannot be disabled)
   */
  fastify.post<{
    Params: EncryptionStatusParams;
    Body: EnableEncryptionRequest;
  }>(
    '/api/conversations/:conversationId/encryption',
    {
      preValidation: [authMiddleware],
    },
    async (request, reply) => {
      try {
        const { conversationId } = request.params as EncryptionStatusParams;
        const { mode } = request.body as EnableEncryptionRequest;
        const authRequest = request as UnifiedAuthRequest;
        const authContext = authRequest.authContext;

        // Anonymous users cannot enable encryption
        if (authContext.isAnonymous) {
          return reply.status(403).send({
            success: false,
            error: 'Anonymous users cannot enable encryption'
          });
        }

        // Validate mode
        if (!mode || !['e2ee', 'server'].includes(mode)) {
          return reply.status(400).send({
            success: false,
            error: 'Invalid encryption mode. Must be "e2ee" or "server"'
          });
        }

        // Get conversation with members
        const conversation = await fastify.prisma.conversation.findUnique({
          where: { id: conversationId },
          select: {
            id: true,
            encryptionEnabledAt: true,
            encryptionMode: true,
            members: {
              where: { isActive: true },
              select: {
                userId: true,
                role: true
              }
            }
          }
        });

        if (!conversation) {
          return reply.status(404).send({
            success: false,
            error: 'Conversation not found'
          });
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

        // Check if user is an admin or owner
        const member = conversation.members.find(m => m.userId === authContext.userId);
        if (!member || (member.role !== 'ADMIN' && member.role !== 'OWNER')) {
          return reply.status(403).send({
            success: false,
            error: 'Only conversation admins can enable encryption'
          });
        }

        // Determine encryption protocol based on mode
        const protocol = mode === 'e2ee' ? 'signal_v3' : 'aes-256-gcm';

        // Get or create server encryption key (for server mode)
        let serverEncryptionKeyId: string | null = null;
        if (mode === 'server') {
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
        await fastify.prisma.message.create({
          data: {
            conversationId,
            senderId: authContext.userId,
            content: mode === 'e2ee'
              ? '🔒 End-to-end encryption enabled. Messages are now fully encrypted.'
              : '🔐 Server-side encryption enabled. Messages are encrypted with translation support.',
            originalLanguage: 'en',
            messageType: 'system',
          }
        });

        console.log(`[EncryptionRoutes] Encryption enabled for conversation ${conversationId} - Mode: ${mode}`);

        return reply.send({
          success: true,
          data: getEncryptionStatus({
            encryptionEnabledAt: updatedConversation.encryptionEnabledAt,
            encryptionMode: updatedConversation.encryptionMode,
            encryptionEnabledBy: updatedConversation.encryptionEnabledBy,
          }),
          message: `${mode === 'e2ee' ? 'End-to-end' : 'Server-side'} encryption enabled successfully`
        });

      } catch (error) {
        console.error('[EncryptionRoutes] Error enabling encryption:', error);
        return reply.status(500).send({
          success: false,
          error: 'Internal server error'
        });
      }
    }
  );
}
