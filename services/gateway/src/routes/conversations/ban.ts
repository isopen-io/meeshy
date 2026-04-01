import { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@meeshy/shared/prisma/client'
import { UnifiedAuthRequest } from '../../middleware/auth'
import { sendSuccess, sendBadRequest, sendForbidden, sendNotFound } from '../../utils/response'
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events'

const ROLE_LEVELS: Record<string, number> = {
  CREATOR: 40,
  ADMIN: 30,
  MODERATOR: 20,
  MEMBER: 10,
}

export function registerBanRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  _optionalAuth: any,
  requiredAuth: any
) {
  const socketIOHandler = (fastify as any).socketIOHandler

  fastify.patch<{ Params: { id: string; userId: string } }>(
    '/conversations/:id/participants/:userId/ban',
    {
      schema: {
        description: 'Ban a participant from a conversation',
        tags: ['conversations'],
        summary: 'Ban participant',
        params: {
          type: 'object',
          required: ['id', 'userId'],
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
          },
        },
      },
      preValidation: [requiredAuth],
    },
    async (request, reply) => {
      const { id, userId: targetUserId } = request.params
      const authRequest = request as UnifiedAuthRequest
      const currentUserId = authRequest.authContext.userId

      const currentParticipant = await prisma.participant.findFirst({
        where: { conversationId: id, userId: currentUserId, isActive: true },
        select: { id: true, role: true },
      })

      if (!currentParticipant) {
        return sendNotFound(reply, 'Vous ne participez pas à cette conversation')
      }

      const targetParticipant = await prisma.participant.findFirst({
        where: { conversationId: id, userId: targetUserId },
        select: { id: true, role: true, bannedAt: true, displayName: true },
      })

      if (!targetParticipant) {
        return sendNotFound(reply, 'Participant introuvable')
      }

      if (targetParticipant.bannedAt !== null) {
        return sendBadRequest(reply, 'Ce participant est déjà banni')
      }

      const currentLevel = ROLE_LEVELS[currentParticipant.role as string] ?? 0
      const targetLevel = ROLE_LEVELS[targetParticipant.role as string] ?? 0

      if (currentLevel <= targetLevel) {
        return sendForbidden(reply, 'Vous ne pouvez pas bannir un participant de rang égal ou supérieur')
      }

      const now = new Date()
      await prisma.participant.update({
        where: { id: targetParticipant.id },
        data: { bannedAt: now, isActive: false, leftAt: now },
      })

      const socketIOManager = socketIOHandler?.getManager?.()
      const io = socketIOManager?.io || (socketIOHandler as any)?.io
      const room = ROOMS.conversation(id)

      if (io) {
        io.to(room).emit(SERVER_EVENTS.CONVERSATION_PARTICIPANT_BANNED, {
          conversationId: id,
          userId: targetUserId,
          bannedAt: now.toISOString(),
        })

        const userSockets = await io.in(ROOMS.user(targetUserId)).fetchSockets()
        for (const s of userSockets) {
          s.leave(room)
        }
      }

      return sendSuccess(reply, { userId: targetUserId, bannedAt: now.toISOString() })
    }
  )

  fastify.patch<{ Params: { id: string; userId: string } }>(
    '/conversations/:id/participants/:userId/unban',
    {
      schema: {
        description: 'Unban a participant from a conversation',
        tags: ['conversations'],
        summary: 'Unban participant',
        params: {
          type: 'object',
          required: ['id', 'userId'],
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
          },
        },
      },
      preValidation: [requiredAuth],
    },
    async (request, reply) => {
      const { id, userId: targetUserId } = request.params
      const authRequest = request as UnifiedAuthRequest
      const currentUserId = authRequest.authContext.userId

      const currentParticipant = await prisma.participant.findFirst({
        where: { conversationId: id, userId: currentUserId, isActive: true },
        select: { id: true, role: true },
      })

      if (!currentParticipant) {
        return sendNotFound(reply, 'Vous ne participez pas à cette conversation')
      }

      const currentLevel = ROLE_LEVELS[currentParticipant.role as string] ?? 0
      if (currentLevel < ROLE_LEVELS['ADMIN']) {
        return sendForbidden(reply, 'Seul un admin ou le créateur peut débannir un participant')
      }

      const targetParticipant = await prisma.participant.findFirst({
        where: { conversationId: id, userId: targetUserId, bannedAt: { not: null } },
        select: { id: true },
      })

      if (!targetParticipant) {
        return sendNotFound(reply, 'Participant banni introuvable')
      }

      await prisma.participant.update({
        where: { id: targetParticipant.id },
        data: { bannedAt: null },
      })

      const socketIOManager = socketIOHandler?.getManager?.()
      const io = socketIOManager?.io || (socketIOHandler as any)?.io
      const room = ROOMS.conversation(id)

      if (io) {
        io.to(room).emit(SERVER_EVENTS.CONVERSATION_PARTICIPANT_UNBANNED, {
          conversationId: id,
          userId: targetUserId,
        })
      }

      return sendSuccess(reply, { userId: targetUserId })
    }
  )
}
