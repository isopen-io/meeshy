/**
 * #14643 — `DELETE /conversations/:id/obsolete` : rendre une conversation
 * OBSOLÈTE. Même permission que `DELETE /conversations/:id` (administrateur de
 * la conversation, ou rôle de plateforme équivalent) ; l'effet vit dans
 * `services/conversations/obsoleteConversation.ts`.
 *
 * #14653 (décision porteur du 2026-11-02) — dans un TÊTE-À-TÊTE, l'un OU
 * l'autre des deux membres la rend obsolète : `mayObsoleteAsDirectMember`.
 * Seul un membre inscrit, à participation active, ni partie ni bannie, d'une
 * directe qui compte au plus deux participations actives (une directe à trois,
 * anormale, retombe sous la règle de l'administrateur) ; les groupes gardent
 * la règle de l'administrateur.
 *
 * #14676 (décision porteur du 2026-11-02, option c) — tant qu'une DEMANDE de
 * message n'est pas acceptée, seul son DESTINATAIRE rend la directe obsolète :
 * l'expéditeur — créateur de la directe, donc administrateur, et quel que soit
 * son rôle de plateforme — reçoit 403 sans écriture. « Non acceptée » se lit
 * sur `Participant.messageRequestFromId`, posé sur la ligne du destinataire et
 * effacé par « Accepter » seulement ; la ligne n'est pas filtrée sur
 * `isActive` : un destinataire parti ne rend pas la main à l'expéditeur.
 *
 * Rétrocompatible : la conversation est AUSSI fermée (`isActive: false`,
 * `closedAt`, `conversation:closed`), donc un ancien client qui ne connaît ni
 * cette route ni `conversation:obsoleted` la retire de sa liste comme avant.
 */
import type { FastifyInstance, preValidationHookHandler } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { MemberRole } from '@meeshy/shared/types/role-types';
import { actorHasMinimumRole } from '@meeshy/shared/utils/conversation-authority';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { sendSuccess, sendForbidden, sendInternalError } from '../../utils/response';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { obsoleteConversation } from '../../services/conversations/obsoleteConversation';
import { getSharedNotificationService } from '../../services/notifications/notification-service-registry';

const logger = enhancedLogger.child({ module: 'ConversationObsoleteRoute' });

type ObsoleteParams = { readonly id: string };

type ObsoleteMembership = {
  readonly role: string;
  readonly type: string;
  readonly leftAt: Date | null;
  readonly bannedAt: Date | null;
  readonly conversation: { readonly type: string } | null;
};

export const DIRECT_CONVERSATION_MAX_ACTIVE_PARTICIPANTS = 2;

export function mayObsoleteAsDirectMember(
  membership: ObsoleteMembership | null,
  caller: { readonly isAnonymous: boolean; readonly hasRegisteredUser: boolean },
): boolean {
  if (membership === null) return false;
  if (caller.isAnonymous || !caller.hasRegisteredUser) return false;
  if (membership.type !== 'user') return false;
  if (membership.leftAt !== null || membership.bannedAt !== null) return false;
  return membership.conversation?.type === 'direct';
}

async function directMemberMayObsolete(
  prisma: PrismaClient,
  conversationId: string,
  membership: ObsoleteMembership | null,
  caller: { readonly isAnonymous: boolean; readonly hasRegisteredUser: boolean },
): Promise<boolean> {
  if (!mayObsoleteAsDirectMember(membership, caller)) return false;
  const activeParticipants = await prisma.participant.count({ where: { conversationId, isActive: true } });
  return activeParticipants <= DIRECT_CONVERSATION_MAX_ACTIVE_PARTICIPANTS;
}

/** L'appelant est-il l'EXPÉDITEUR d'une demande non acceptée dans cette directe ? Une autre ligne porte la demande. */
async function sendsPendingDirectRequest(
  prisma: PrismaClient,
  conversationId: string,
  userId: string,
  membership: ObsoleteMembership | null,
): Promise<boolean> {
  if (membership?.conversation?.type !== 'direct') return false;
  const recipient = await prisma.participant.findFirst({
    where: { conversationId, userId: { not: userId }, messageRequestFromId: { not: null } },
    select: { id: true },
  });
  return recipient !== null;
}

export function registerObsoleteConversationRoute(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: preValidationHookHandler,
): void {
  fastify.delete<{ Params: ObsoleteParams }>('/conversations/:id/obsolete', {
    schema: {
      description: 'Make a conversation obsolete (#14643): its content becomes unreadable at once, it leaves every member\'s list (also closed, as DELETE /conversations/:id does), and its data is erased after purgeAfter (48 h). Requires the conversation admin role, or, in a direct conversation, being one of its two active registered members (#14653) — while a message request is not accepted, only its recipient (#14676). Idempotent: a second call returns the first dates.',
      tags: ['conversations'],
      summary: 'Make conversation obsolete',
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string', description: 'Conversation ID or identifier' } },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                conversationId: { type: 'string' },
                obsoletedAt: { type: 'string', format: 'date-time' },
                purgeAfter: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema,
      },
    },
    preValidation: [requiredAuth],
  }, async (request, reply) => {
    try {
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;
      const { id } = request.params;

      if (id === 'meeshy') {
        return sendForbidden(reply, 'The global conversation cannot be made obsolete');
      }

      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      const membership = await prisma.participant.findFirst({
        where: { conversationId, userId, isActive: true },
        select: { role: true, type: true, leftAt: true, bannedAt: true, conversation: { select: { type: true } } },
      });
      if (await sendsPendingDirectRequest(prisma, conversationId, userId, membership)) {
        return sendForbidden(reply, 'Seul le destinataire d\'une demande de message non acceptée peut rendre cette conversation obsolète');
      }
      const allowed = actorHasMinimumRole(
        { conversationRole: membership?.role, platformRole: authRequest.authContext.registeredUser?.role },
        MemberRole.ADMIN,
      ) || await directMemberMayObsolete(prisma, conversationId, membership, {
        isAnonymous: authRequest.authContext.isAnonymous,
        hasRegisteredUser: authRequest.authContext.registeredUser !== undefined,
      });
      if (!allowed) {
        return sendForbidden(reply, 'Vous n\'êtes pas autorisé à rendre cette conversation obsolète');
      }

      const manager = fastify.socketIOHandler?.getManager();
      const outcome = await obsoleteConversation(
        { prisma, io: manager?.getIO(), manager, announcer: getSharedNotificationService() },
        { conversationId, actorId: userId },
      );
      if (outcome.kind === 'not-found') {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }
      if (outcome.kind === 'protected') {
        return sendForbidden(reply, 'The global conversation cannot be made obsolete');
      }

      return sendSuccess(reply, {
        conversationId: outcome.conversationId,
        obsoletedAt: outcome.obsoletedAt.toISOString(),
        purgeAfter: outcome.purgeAfter.toISOString(),
      });
    } catch (error) {
      logger.error('error making conversation obsolete', { error });
      return sendInternalError(reply, 'Error making conversation obsolete');
    }
  });
}
