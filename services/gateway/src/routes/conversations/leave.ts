import { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@meeshy/shared/prisma/client'
import { UnifiedAuthRequest } from '../../middleware/auth'
import { sendSuccess, sendBadRequest, sendNotFound } from '../../utils/response'
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events'
import { resolveConversationId } from '../../utils/conversation-id-cache'
import { invalidateParticipantLookup } from '../../utils/participant-lookup-cache'
import { emitToConversationParticipants } from '../../socketio/emitToConversationParticipants'

export function registerLeaveRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  _optionalAuth: any,
  requiredAuth: any
) {
  const socketIOHandler = fastify.socketIOHandler

  fastify.post<{ Params: { id: string } }>(
    '/conversations/:id/leave',
    {
      schema: {
        description: 'Leave a conversation — sets participant as inactive, keeps history readable',
        tags: ['conversations'],
        summary: 'Leave conversation',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
      preValidation: [requiredAuth],
    },
    async (request, reply) => {
      const { id: rawId } = request.params
      const authRequest = request as UnifiedAuthRequest
      const userId = authRequest.authContext.userId

      const id = await resolveConversationId(prisma, rawId) ?? rawId

      const participant = await prisma.participant.findFirst({
        where: { conversationId: id, userId, isActive: true },
      })

      if (!participant) {
        return sendNotFound(reply, 'Vous ne participez pas à cette conversation')
      }

      if (participant.role === 'creator') {
        const otherActiveCount = await prisma.participant.count({
          where: { conversationId: id, isActive: true, userId: { not: userId } },
        })
        if (otherActiveCount > 0) {
          return sendBadRequest(
            reply,
            "Le créateur doit transférer l'ownership ou supprimer la conversation avant de quitter"
          )
        }
        await prisma.conversation.update({
          where: { id },
          data: { isActive: false },
        })
      }

      const now = new Date()
      await prisma.participant.update({
        where: { id: participant.id },
        data: { isActive: false, leftAt: now },
      })
      invalidateParticipantLookup(participant.id, id)

      const io = socketIOHandler?.getManager()?.getIO()
      const room = ROOMS.conversation(id)

      const manager = socketIOHandler?.getManager()
      if (io) {
        // Effectif APRÈS le départ : la ligne qui vient d'être désactivée est
        // hors de ce `where`. Il sert deux fois — à nommer les rooms
        // personnelles, et à porter le compte autoritatif dans le payload.
        const remaining = await prisma.participant.findMany({
          where: { conversationId: id, isActive: true },
          select: { id: true, userId: true },
        })

        // La room de conversation ne suffit pas : un membre posé sur l'écran de
        // LISTE l'a quittée et n'est joignable que par sa room personnelle. Or
        // la ligne de liste rend l'effectif — c'est le commentaire de cette
        // route qui le dit depuis sa création (« ConversationListViewModel
        // count ») — donc l'événement n'atteignait pas l'écran qu'il sert.
        emitToConversationParticipants({
          io,
          conversationId: id,
          participants: remaining,
          events: [SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT],
          payload: {
            conversationId: id,
            userId,
            displayName: participant.displayName,
            leftAt: now.toISOString(),
            // Compte ABSOLU, pas un delta. Un client qui décrémente de 1 ne
            // converge jamais : l'événement manqué (hors room, hors ligne,
            // trou de reconnexion) laisse une dérive définitive — et iOS
            // persiste la valeur fausse dans son cache disque.
            memberCount: remaining.length,
          },
        })

        const userSockets = await io.in(ROOMS.user(userId)).fetchSockets()
        await Promise.all(userSockets.map(s => s.leave(room)))

        manager?.invalidateParticipantCache?.(userId, id)
      }

      return sendSuccess(reply, { conversationId: id, leftAt: now.toISOString() })
    }
  )
}
