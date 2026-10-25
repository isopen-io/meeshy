/**
 * Conversation Encryption Routes
 *
 * Handles encryption settings for conversations:
 * - Enable encryption (E2EE, Server, or Hybrid mode)
 * - Get encryption status
 * - Disable encryption (#12522) — at-rest modes only (server, hybrid). An e2ee
 *   conversation NEVER goes back to plaintext (#12949): DELETE answers
 *   409 E2EE_IRREVERSIBLE, and so does a POST that would set another mode.
 *
 * Encryption Modes:
 * - e2ee: Full end-to-end encryption (Signal Protocol) - NO translation
 * - server: Server-side encryption (AES-256-GCM) - translation supported
 * - hybrid: Double encryption (E2EE + server layer) - translation supported
 */

import { FastifyInstance, FastifyReply } from 'fastify';
import { getEncryptionService } from '../services/EncryptionService';
import { createUnifiedAuthMiddleware, UnifiedAuthRequest } from '../middleware/auth';
import { validateParams, validateBody } from '../validation/helpers.js';
import { ConversationIdParamSchema, SetEncryptionModeBodySchema } from '../validation/conversation-encryption-schemas.js';
import { enhancedLogger } from '../utils/logger-enhanced.js';
import { sendSuccess, sendBadRequest, sendError, sendForbidden, sendInternalError } from '../utils/response.js';
import {
  noticeBroadcast,
  postSystemNotice,
  type SocketNoticeGateway,
  type SystemNoticeDeps,
  type SystemNoticeInput,
} from '../services/conversations/conversationNotice';
import { refuserCommeIntrouvable } from './conversations/utils/access-control';
import { actorHasMinimumRole } from '@meeshy/shared/utils/conversation-authority';
import { MemberRole } from '@meeshy/shared/types/role-types';
import {
  ENCRYPTION_ACTIVATION_RESTRICTED_CODE,
  mayActivateConversationEncryption,
} from '../utils/encryption-activation-policy';
import { E2EE_ERROR_CODES, E2EE_IRREVERSIBLE_MESSAGE } from '@meeshy/shared/types/e2ee-directory';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { ConversationEncryptionChangedEventData } from '@meeshy/shared/types/socketio-events';
import {
  ENCRYPTION_ALREADY_ENABLED_CODE,
  ENCRYPTION_NOT_ENABLED_CODE,
  encryptionStatusView,
  regimeEpochOf,
  regimeIsActive,
  regimeIsEndToEnd,
  regimeMayBeLeft,
  switchEncryptionRegime,
  type SwitchedRegime,
} from '../services/conversations/encryptionRegime';
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

type RegimeMember = {
  readonly userId: string | null;
  readonly role?: string | null;
  readonly user?: { readonly role?: string | null } | null;
};

type RegimeConversation = {
  readonly id: string;
  readonly type: string;
  readonly encryptionEnabledAt: Date | null;
  readonly encryptionMode: string | null;
  readonly encryptionEnabledBy: string | null;
  readonly encryptionEpoch?: number | null;
  readonly participants: readonly RegimeMember[];
};

/** La lecture UNIQUE du régime et des membres actifs, pour les trois routes. */
const REGIME_SELECT = {
  id: true,
  type: true,
  encryptionEnabledAt: true,
  encryptionMode: true,
  encryptionEnabledBy: true,
  encryptionEpoch: true,
  participants: {
    where: { isActive: true },
    select: {
      userId: true,
      role: true,
      user: { select: { role: true } }
    }
  }
} as const;

/** Le refus d'une bascule : ni mode ni époque, rien que ce qu'il faut pour le dire. */
type ToggleRefusal = (reply: FastifyReply) => void;

/**
 * Qui bascule le régime, dans les deux sens (#12517, #12588, #11218) — la
 * politique UNIQUE de plateforme (`mayActivateConversationEncryption`), puis,
 * hors tête-à-tête, le rang de conversation. Rend le refus, ou `null`.
 */
function toggleRefusal(conversation: RegimeConversation, member: RegimeMember): ToggleRefusal | null {
  if (!mayActivateConversationEncryption({ platformRole: member.user?.role })) {
    return (reply) => sendForbidden(reply, 'Encryption can only be enabled or disabled by a platform staff role (ANALYST or above) for now', {
      code: ENCRYPTION_ACTIVATION_RESTRICTED_CODE,
    });
  }
  const hasModeratorRole = actorHasMinimumRole(
    { conversationRole: member.role, platformRole: member.user?.role },
    MemberRole.MODERATOR
  );
  if (conversation.type !== 'direct' && !hasModeratorRole) {
    return (reply) => sendForbidden(reply, 'Only moderators and above can enable or disable encryption in group conversations');
  }
  return null;
}

const memberOf = (conversation: RegimeConversation | null, userId: string): RegimeMember | undefined =>
  conversation?.participants.find((participant) => participant.userId === userId);

function encryptionChange(conversationId: string, switched: SwitchedRegime, actorUserId: string): ConversationEncryptionChangedEventData {
  return {
    conversationId,
    isEncrypted: switched.mode !== null,
    mode: switched.mode,
    epoch: switched.epoch,
    changedByUserId: actorUserId,
    changedAt: new Date().toISOString(),
  };
}

/**
 * Le repli FRANÇAIS de l'avis de désactivation, pour les surfaces sans rendu
 * dédié (anciens clients). Seul le chiffrement au repos se désactive (#12949).
 */
function disabledNoticeText(actorName: string): string {
  return `🔓 ${actorName} a désactivé le chiffrement de cette conversation.`;
}

export default async function encryptionRoutes(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const encryptionService = await getEncryptionService(prisma);
  const authMiddleware = createUnifiedAuthMiddleware(prisma, {
    requireAuth: true,
    allowAnonymous: false
  });

  /** #12949 — le bout en bout ne se quitte pas : lisible et stable pour un ancien client (#9223). */
  const irreversible = (reply: FastifyReply) =>
    sendError(reply, 409, E2EE_IRREVERSIBLE_MESSAGE, { code: E2EE_ERROR_CODES.IRREVERSIBLE });

  const regimeChanged = (reply: FastifyReply) =>
    sendError(reply, 409, 'The encryption of this conversation has just changed: reload it and try again', {
      code: E2EE_ERROR_CODES.REGIME_CHANGED,
    });

  /**
   * Après une bascule : l'avis système (auteur nommé, #12522) et l'événement
   * `conversation:encryption-changed` vers la room personnelle de chaque
   * membre actif. Ni l'un ni l'autre ne retient ni ne fait échouer le geste.
   */
  const announceSwitch = async (
    conversation: RegimeConversation,
    switched: SwitchedRegime,
    actorUserId: string,
    notice: (actor: { participantId: string; displayName: string }) => Pick<SystemNoticeInput, 'content' | 'originalLanguage' | 'metadata'>,
  ): Promise<void> => {
    const actor = await fastify.prisma.participant.findFirst({
      where: { userId: actorUserId, conversationId: conversation.id, isActive: true },
      select: { id: true, displayName: true }
    });
    if (actor) {
      await postSystemNotice(
        { prisma: fastify.prisma, broadcast: detachedNoticeBroadcast(fastify.socketIOHandler) },
        { conversationId: conversation.id, senderParticipantId: actor.id, ...notice({ participantId: actor.id, displayName: actor.displayName }) },
      );
    }
    try {
      const io = fastify.socketIOHandler?.getManager()?.getIO();
      const change = encryptionChange(conversation.id, switched, actorUserId);
      conversation.participants
        .flatMap((participant) => (participant.userId ? [participant.userId] : []))
        .forEach((userId) => io?.to(ROOMS.user(userId)).emit(SERVER_EVENTS.CONVERSATION_ENCRYPTION_CHANGED, change));
    } catch (error) {
      logger.warn('encryption switched but not announced on sockets', {
        conversationId: conversation.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

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

        const conversation = await fastify.prisma.conversation.findUnique({
          where: { id: conversationId },
          select: REGIME_SELECT,
        }) as RegimeConversation | null;

        if (!conversation) {
          return refuserCommeIntrouvable(reply);
        }

        // Un non-membre reçoit le 404 d'une conversation inexistante (#8116).
        const member = authContext.isAnonymous ? undefined : memberOf(conversation, authContext.userId);
        if (!authContext.isAnonymous && !member) {
          return refuserCommeIntrouvable(reply);
        }

        const status = encryptionStatusView(conversation, {
          mayToggle: member !== undefined && toggleRefusal(conversation, member) === null,
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
   * Enable encryption for a conversation (disable it with DELETE, #12522).
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

        // #12563 — l'appartenance, puis la politique, AVANT toute information
        // sur la conversation : un étranger reçoit le 404 d'un identifiant
        // inexistant, qu'elle soit chiffrée ou non ; un membre sans le rôle
        // reçoit le 403 de la politique, jamais « déjà activé ».
        const conversation = await fastify.prisma.conversation.findUnique({
          where: { id: conversationId },
          select: REGIME_SELECT,
        }) as RegimeConversation | null;

        const member = memberOf(conversation, authContext.userId);
        if (!conversation || !member) {
          return refuserCommeIntrouvable(reply);
        }

        const refusal = toggleRefusal(conversation, member);
        if (refusal) {
          return refusal(reply);
        }

        if (regimeIsEndToEnd(conversation) && mode !== 'e2ee') {
          return irreversible(reply);
        }

        if (regimeIsActive(conversation)) {
          return sendBadRequest(reply, 'Encryption is already enabled for this conversation', {
            code: ENCRYPTION_ALREADY_ENABLED_CODE,
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

        // #12521 — UNE écriture conditionnelle sur l'époque lue.
        const switched = await switchEncryptionRegime(fastify.prisma, {
          conversationId,
          observedEpoch: regimeEpochOf(conversation),
          target: { mode, protocol, enabledBy: authContext.userId, serverEncryptionKeyId },
          at: new Date(),
        });
        if (!switched) {
          return regimeChanged(reply);
        }

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

        // #11416 — l'avis suit le chemin ordinaire d'un message système :
        // il devient le dernier message du fil, puis part en `message:new`
        // (room de la conversation) et en `conversation:updated` porteur de
        // `lastMessageSystemEvent` (rooms personnelles des membres). La ligne
        // de liste en lit la clé localisable `system.encryption-enabled`
        // (#7545) ; le web y ferme le régime de chiffrement (#11373).
        await announceSwitch(conversation, switched, authContext.userId, (actor) => ({
          content: encryptionMessages[mode],
          originalLanguage: 'en',
          metadata: { kind: 'encryption-enabled', mode, epoch: switched.epoch, actor },
        }));

        logger.info('Encryption enabled for conversation', { conversationId, mode, epoch: switched.epoch });

        return sendSuccess(reply, encryptionStatusView(
          { encryptionMode: switched.mode, encryptionEnabledAt: switched.enabledAt, encryptionEnabledBy: switched.enabledBy, encryptionEpoch: switched.epoch },
          { mayToggle: true },
        ), { message: `${encryptionLabels[mode]} encryption enabled successfully` });

      } catch (error) {
        logger.error('Error enabling encryption', error as Error);
        return sendInternalError(reply, 'Internal server error');
      }
    }
  );
  /**
   * DELETE /api/v1/conversations/:conversationId/encryption
   * Disable AT-REST encryption (#12522) : `server` ou `hybrid` seulement, que
   * le serveur lit déjà. Une conversation `e2ee` ne repasse JAMAIS en clair
   * (#12949) : 409 E2EE_IRREVERSIBLE, rien n'est écrit ni annoncé — et
   * l'écriture conditionnelle le refuserait de toute façon. Même gardes que
   * l'activation, dans le même ordre (#12563) : un étranger reçoit le 404, un
   * membre sans le rôle le 403, avant tout mot sur le régime.
   */
  fastify.delete<{
    Params: EncryptionStatusParams;
  }>(
    '/conversations/:conversationId/encryption',
    {
      preValidation: [authMiddleware],
      preHandler: [validateParams(ConversationIdParamSchema)],
    },
    async (request, reply) => {
      try {
        const { conversationId } = request.params as EncryptionStatusParams;
        const authContext = (request as UnifiedAuthRequest).authContext;

        if (authContext.isAnonymous) {
          return sendForbidden(reply, 'Anonymous users cannot disable encryption');
        }

        const conversation = await fastify.prisma.conversation.findUnique({
          where: { id: conversationId },
          select: REGIME_SELECT,
        }) as RegimeConversation | null;

        const member = memberOf(conversation, authContext.userId);
        if (!conversation || !member) {
          return refuserCommeIntrouvable(reply);
        }

        const refusal = toggleRefusal(conversation, member);
        if (refusal) {
          return refusal(reply);
        }

        if (!regimeIsActive(conversation)) {
          return sendBadRequest(reply, 'Encryption is not enabled for this conversation', {
            code: ENCRYPTION_NOT_ENABLED_CODE,
          });
        }

        if (!regimeMayBeLeft(conversation)) {
          logger.warn('Refused to disable an irreversible encryption regime', { conversationId, mode: conversation.encryptionMode });
          return irreversible(reply);
        }

        const switched = await switchEncryptionRegime(fastify.prisma, {
          conversationId,
          observedEpoch: regimeEpochOf(conversation),
          target: null,
          at: new Date(),
        });
        if (!switched) {
          return regimeChanged(reply);
        }

        const previousMode = conversation.encryptionMode;
        await announceSwitch(conversation, switched, authContext.userId, (actor) => ({
          content: disabledNoticeText(actor.displayName),
          metadata: { kind: 'encryption-disabled', previousMode, epoch: switched.epoch, actor },
        }));

        logger.info('Encryption disabled for conversation', { conversationId, previousMode, epoch: switched.epoch });

        return sendSuccess(reply, encryptionStatusView(
          { encryptionMode: null, encryptionEnabledAt: null, encryptionEnabledBy: null, encryptionEpoch: switched.epoch },
          { mayToggle: true },
        ), { message: 'Encryption disabled' });

      } catch (error) {
        logger.error('Error disabling encryption', error as Error);
        return sendInternalError(reply, 'Internal server error');
      }
    }
  );
}
