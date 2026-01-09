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
        if (!mode || !['e2ee', 'server', 'hybrid'].includes(mode)) {
          return reply.status(400).send({
            success: false,
            error: 'Invalid encryption mode. Must be "e2ee", "server", or "hybrid"'
          });
        }

        // Get conversation with members and type
        const conversation = await fastify.prisma.conversation.findUnique({
          where: { id: conversationId },
          select: {
            id: true,
            type: true,
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

        // Check permission to enable encryption
        // - Direct (1:1) conversations: any participant can enable
        // - Group conversations: only moderator, admin, or owner can enable
        const member = conversation.members.find(m => m.userId === authContext.userId);
        if (!member) {
          return reply.status(403).send({
            success: false,
            error: 'Not a member of this conversation'
          });
        }

        const isDirectConversation = conversation.type === 'direct';
        const hasModeratorRole = ['MODERATOR', 'ADMIN', 'OWNER', 'moderator', 'admin', 'owner'].includes(member.role);

        if (!isDirectConversation && !hasModeratorRole) {
          return reply.status(403).send({
            success: false,
            error: 'Only moderators and above can enable encryption in group conversations'
          });
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

        await fastify.prisma.message.create({
          data: {
            conversationId,
            senderId: authContext.userId,
            content: encryptionMessages[mode],
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
          message: `${encryptionLabels[mode]} encryption enabled successfully`
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
