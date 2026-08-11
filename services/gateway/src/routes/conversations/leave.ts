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
        // Les membres restants tiennent un COMPTEUR d'effectif sur leur écran de
        // liste (iOS `ThemedConversationRow`, alimenté par
        // `ConversationListViewModel.participantSelfLeft`). Un membre posé sur
        // cette liste a quitté la room de conversation : adressé à la seule
        // room, le départ ne l'atteignait pas et son compteur restait faux
        // jusqu'à un rechargement complet — pire, `schedulePersist` écrivait la
        // valeur périmée dans le cache disque.
        //
        // La room de conversation reste en tête de chaîne : elle porte le
        // partant lui-même, encore dedans à cet instant (il n'en sort que plus
        // bas), ce qui laisse son propre acquittement inchangé.
        const remaining = await prisma.participant.findMany({
          where: { conversationId: id, isActive: true },
          select: { id: true, userId: true },
        })
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
