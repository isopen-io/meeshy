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
import { sendSuccess, sendBadRequest, sendError, sendForbidden, sendNotFound, sendInternalError } from '../utils/response.js';
import { isServerAtRestUnavailable } from '../services/messaging/serverAtRest';
import {
  noticeBroadcast,
  postSystemNotice,
  type SocketNoticeGateway,
  type SystemNoticeDeps,
} from '../services/conversations/conversationNotice';
import { refuserCommeIntrouvable } from './conversations/utils/access-control';
import { actorHasMinimumRole } from '../utils/conversation-authority';
import { MemberRole } from '@meeshy/shared/types/role-types';
import {
  ENCRYPTION_ACTIVATION_RESTRICTED_CODE,
  mayActivateConversationEncryption,
} from '../utils/encryption-activation-policy';
const logger = enhancedLogger.child({ module: 'ConversationEncryptionRoutes' });

// EncryptionMode type - defined locally to avoid build order issues
type EncryptionMode = 'e2ee' | 'server' | 'hybrid';

/**
 * La diffusion de l'avis, DÉTACHÉE de la réponse (#11416) : `message:new` et
 * `conversation:updated` partent par le chemin ordinaire des messages, mais
 * l'activation ne les attend pas — l'avis est déjà écrit, et une émission
 * lente ou en panne ne doit ni retenir ni faire échouer le geste.
 */
function detachedNoticeBroadcast(gateway: SocketNoticeGateway): SystemNoticeDeps['broadcast'] {
  const broadcast = noticeBroadcast(gateway);
  return async (message, conversationId) => {
    void Promise.resolve(broadcast?.(message, conversationId)).catch((error: unknown) => {
      logger.warn('encryption notice written but not broadcast', {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  };
}

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
          return refuserCommeIntrouvable(reply);
        }

        // Un non-membre reçoit le 404 d'une conversation inexistante (#8116).
        if (!authContext.isAnonymous) {
          const isMember = conversation.participants.some(m => m.userId === authContext.userId);
          if (!isMember) {
            return refuserCommeIntrouvable(reply);
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
   * Enable encryption for a conversation (immutable - cannot be disabled).
   * Restricted to platform ANALYST and above (#12517, #12588, utils/encryption-activation-policy.ts).
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
                role: true,
                user: { select: { role: true } }
              }
            }
          }
        });

        if (!conversation) {
          return sendNotFound(reply, 'Conversation not found');
        }

        // Check if encryption is already enabled (immutable)
        if (conversation.encryptionEnabledAt) {
          return sendBadRequest(reply, 'Encryption already enabled for this conversation (cannot be changed)');
        }

        // Qui active le chiffrement (#11218) :
        // - un tête-à-tête : chacun des deux participants ;
        // - ailleurs : au moins modérateur DANS la conversation — créateur
        //   compris — ou un rôle de plateforme privilégié membre (MODERATOR,
        //   ADMIN, BIGBOSS — #11217), qui y agit avec les droits du créateur. La liste écrite à la main ignorait
        //   `creator` et le rôle de plateforme. `actorHasMinimumRole` est la
        //   loi d'autorité unique ; un rang illisible y vaut moins qu'un membre.
        const member = conversation.participants.find(m => m.userId === authContext.userId);
        if (!member) {
          return sendForbidden(reply, 'Not a member of this conversation');
        }

        if (!mayActivateConversationEncryption({ platformRole: member.user?.role })) {
          return sendForbidden(reply, 'Encryption can only be enabled by a platform staff role (ANALYST or above) for now', {
            code: ENCRYPTION_ACTIVATION_RESTRICTED_CODE,
          });
        }

        const isDirectConversation = conversation.type === 'direct';
        const hasModeratorRole = actorHasMinimumRole(
          { conversationRole: member.role, platformRole: member.user?.role },
          MemberRole.MODERATOR
        );

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
          // #11374 — `hybrid` est chiffré AU REPOS, comme `server` : jamais « de bout en bout ».
          hybrid: '🔐 Server-side encryption enabled. Messages are encrypted at rest with translation support.',
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

        // #11416 — l'avis suit le chemin ordinaire d'un message système :
        // il devient le dernier message du fil, puis part en `message:new`
        // (room de la conversation) et en `conversation:updated` porteur de
        // `lastMessageSystemEvent` (rooms personnelles des membres). La ligne
        // de liste en lit la clé localisable `system.encryption-enabled`
        // (#7545) ; le web y ferme le régime de chiffrement (#11373).
        if (senderParticipant) {
          await postSystemNotice(
            { prisma: fastify.prisma, broadcast: detachedNoticeBroadcast(fastify.socketIOHandler) },
            {
              conversationId,
              senderParticipantId: senderParticipant.id,
              content: encryptionMessages[mode],
              originalLanguage: 'en',
              metadata: { kind: 'encryption-enabled', mode },
            },
          );
        }

        logger.info('Encryption enabled for conversation', { conversationId, mode });

        return sendSuccess(reply, getEncryptionStatus({
          encryptionEnabledAt: updatedConversation.encryptionEnabledAt,
          encryptionMode: updatedConversation.encryptionMode,
          encryptionEnabledBy: updatedConversation.encryptionEnabledBy,
        }), { message: `${encryptionLabels[mode]} encryption enabled successfully` });

      } catch (error) {
        // #11381 — sans clé maîtresse, aucun mode `server`/`hybrid` ne s'active.
        if (isServerAtRestUnavailable(error)) {
          logger.error('Server encryption unavailable: ENCRYPTION_MASTER_KEY missing or invalid', { reason: error.reason });
          return sendError(reply, 503, error.message, { code: error.code });
        }
        logger.error('Error enabling encryption', error as Error);
        return sendInternalError(reply, 'Internal server error');
      }
    }
  );
}
