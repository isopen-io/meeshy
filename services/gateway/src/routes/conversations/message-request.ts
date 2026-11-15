/**
 * `POST /conversations/:id/message-request/accept` — le DESTINATAIRE d'une demande
 * de message l'accepte (#14107, MSG-02). Le geste vit dans
 * `services/messaging/messageRequests.ts` ; la route traduit, invalide le cache de
 * droits de l'expéditeur et annonce la montée du lien (`relation:level-raised`,
 * aux deux, comme une demande de lien acceptée).
 *
 * Rejouable : une demande déjà traitée, ou l'expéditeur qui « accepte », répond
 * `accepted: false` sans rien écrire — une file hors ligne qui rejoue le geste ne
 * reçoit jamais d'erreur. Un non-membre reçoit 404, comme une conversation qui
 * n'existe pas. « Ignorer » n'a pas de route : c'est `DELETE …/delete-for-me`.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { sendNotFound, sendSuccess } from '../../utils/response';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { invalidateParticipantLookup } from '../../utils/participant-lookup-cache';
import { acceptMessageRequest } from '../../services/messaging/messageRequests';
import { emitRelationLevelRaised, relationIoOf } from '../../socketio/relationEvents';

type AuthHook = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

const acceptResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        conversationId: { type: 'string' },
        accepted: { type: 'boolean', description: 'false : aucune demande en attente pour l\'appelant (déjà traitée)' },
      },
    },
  },
} as const;

export function registerMessageRequestRoutes(fastify: FastifyInstance, prisma: PrismaClient, requiredAuth: AuthHook): void {
  fastify.post<{ Params: { id: string } }>(
    '/conversations/:id/message-request/accept',
    {
      schema: {
        description: 'Accept a pending message request: the sender becomes at least an Acquaintance, both ways.',
        tags: ['conversations'],
        summary: 'Accept a message request',
        params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
        response: { 200: acceptResponseSchema, 401: errorResponseSchema, 404: errorResponseSchema, 500: errorResponseSchema },
      },
      preValidation: [requiredAuth],
    },
    async (request, reply) => {
      const userId = (request as unknown as UnifiedAuthRequest).authContext.userId;
      const conversationId = await resolveConversationId(prisma, request.params.id);
      const membership = conversationId
        ? await prisma.participant.findFirst({ where: { conversationId, userId, isActive: true }, select: { id: true } })
        : null;
      if (!conversationId || !membership) return sendNotFound(reply, 'Conversation introuvable');

      const now = new Date();
      const acceptance = await acceptMessageRequest(prisma, { conversationId, userId, now });
      if (acceptance.kind !== 'accepted') return sendSuccess(reply, { conversationId, accepted: false });

      if (acceptance.requesterParticipantId) invalidateParticipantLookup(acceptance.requesterParticipantId, conversationId);
      if (acceptance.levelRaised && acceptance.requesterId) {
        emitRelationLevelRaised(relationIoOf(fastify), { userA: userId, userB: acceptance.requesterId, level: 'ACQUAINTANCE', at: now });
      }
      return sendSuccess(reply, { conversationId, accepted: true });
    },
  );
}
