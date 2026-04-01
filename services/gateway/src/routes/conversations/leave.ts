import { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@meeshy/shared/prisma/client'
import { UnifiedAuthRequest } from '../../middleware/auth'
import { sendSuccess, sendBadRequest, sendNotFound } from '../../utils/response'
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events'

export function registerLeaveRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  _optionalAuth: any,
  requiredAuth: any
) {
  const socketIOHandler = (fastify as any).socketIOHandler

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
      const { id } = request.params
      const authRequest = request as UnifiedAuthRequest
      const userId = authRequest.authContext.userId

      const participant = await prisma.participant.findFirst({
        where: { conversationId: id, userId, isActive: true },
      })

      if (!participant) {
        return sendNotFound(reply, 'Vous ne participez pas à cette conversation')
      }

      if (participant.role === 'CREATOR') {
        const otherActiveCount = await prisma.participant.count({
          where: { conversationId: id, isActive: true, userId: { not: userId } },
        })
        if (otherActiveCount > 0) {
          return sendBadRequest(
            reply,
            "Le créateur doit transférer l'ownership ou supprimer la conversation avant de quitter"
          )
        }
      }

      const now = new Date()
      await prisma.participant.update({
        where: { id: participant.id },
        data: { isActive: false, leftAt: now },
      })

      const socketIOManager = socketIOHandler?.getManager?.()
      const io = socketIOManager?.io || (socketIOHandler as any)?.io
      const room = ROOMS.conversation(id)

      if (io) {
        io.to(room).emit(SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT, {
          conversationId: id,
          userId,
          username: participant.displayName,
          leftAt: now.toISOString(),
        })

        const userSockets = await io.in(ROOMS.user(userId)).fetchSockets()
        for (const s of userSockets) {
          s.leave(room)
        }
      }

      return sendSuccess(reply, { conversationId: id, leftAt: now.toISOString() })
    }
  )
}
