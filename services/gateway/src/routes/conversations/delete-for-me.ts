import { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@meeshy/shared/prisma/client'
import { UnifiedAuthRequest } from '../../middleware/auth'
import { sendSuccess, sendNotFound } from '../../utils/response'
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events'
import { resolveConversationId } from '../../utils/conversation-id-cache'

export function registerDeleteForMeRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  _optionalAuth: any,
  requiredAuth: any
) {
  const socketIOHandler = (fastify as any).socketIOHandler

  fastify.delete<{ Params: { id: string } }>(
    '/conversations/:id/delete-for-me',
    {
      schema: {
        description: 'Permanently hide a conversation for the calling user. Does not notify other participants.',
        tags: ['conversations'],
        summary: 'Delete conversation for me',
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

      const conversationId = await resolveConversationId(prisma, rawId) ?? rawId

      const participant = await prisma.participant.findFirst({
        where: { conversationId, userId, isActive: true },
      })

      if (!participant) {
        return sendNotFound(reply, 'Vous ne participez pas a cette conversation')
      }

      // If caller is CREATOR, transfer ownership
      if (participant.role === 'creator') {
        // Try moderator first, then oldest active member
        let successor = await prisma.participant.findFirst({
          where: {
            conversationId,
            isActive: true,
            userId: { not: userId },
            role: 'moderator',
          },
          orderBy: { joinedAt: 'asc' },
        })

        if (!successor) {
          successor = await prisma.participant.findFirst({
            where: {
              conversationId,
              isActive: true,
              userId: { not: userId },
            },
            orderBy: { joinedAt: 'asc' },
          })
        }

        if (successor) {
          await prisma.participant.update({
            where: { id: successor.id },
            data: { role: 'creator' },
          })

          const socketIOManager = socketIOHandler?.getManager?.()
          const io = socketIOManager?.io || (socketIOHandler as any)?.io
          if (io) {
            io.to(ROOMS.conversation(conversationId)).emit(
              SERVER_EVENTS.PARTICIPANT_ROLE_UPDATED,
              {
                conversationId,
                userId: successor.userId,
                newRole: 'creator',
                promotedBy: userId,
              }
            )
          }
        } else {
          // No other active members — close conversation
          await prisma.conversation.update({
            where: { id: conversationId },
            data: { isActive: false },
          })
        }
      }

      // Mark as deleted for this user
      const now = new Date()
      await prisma.participant.update({
        where: { id: participant.id },
        data: { deletedForMe: now, isActive: false },
      })

      // Remove user from socket room silently
      const socketIOManager = socketIOHandler?.getManager?.()
      const io = socketIOManager?.io || (socketIOHandler as any)?.io
      if (io) {
        const userSockets = await io.in(ROOMS.user(userId)).fetchSockets()
        for (const s of userSockets) {
          s.leave(ROOMS.conversation(conversationId))
        }
      }

      return sendSuccess(reply, { conversationId, deletedAt: now.toISOString() })
    }
  )
}
