import { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@meeshy/shared/prisma/client'
import { UnifiedAuthRequest } from '../../middleware/auth'
import { sendSuccess, sendBadRequest, sendForbidden, sendNotFound } from '../../utils/response'
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events'
import { resolveConversationId } from '../../utils/conversation-id-cache'
import { invalidateParticipantLookup } from '../../utils/participant-lookup-cache'
import { resolveBanWrite, resolveUnbanWrite } from '../../services/conversations/conversationBanState'
import { enhancedLogger } from '../../utils/logger-enhanced.js'

const logger = enhancedLogger.child({ module: 'ConversationBanRoutes' })

const ROLE_LEVELS: Record<string, number> = {
  creator: 40,
  admin: 30,
  moderator: 20,
  member: 10,
}

export function registerBanRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  _optionalAuth: any,
  requiredAuth: any
) {
  const socketIOHandler = fastify.socketIOHandler

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
      const { id: rawId, userId: targetUserId } = request.params
      const authRequest = request as UnifiedAuthRequest
      const currentUserId = authRequest.authContext.userId

      const id = await resolveConversationId(prisma, rawId) ?? rawId

      const currentParticipant = await prisma.participant.findFirst({
        where: { conversationId: id, userId: currentUserId, isActive: true },
        select: { id: true, role: true },
      })

      if (!currentParticipant) {
        return sendNotFound(reply, 'Vous ne participez pas à cette conversation')
      }

      // `isActive` et `leftAt` sont lus, pas seulement filtrés : la cible peut
      // être un ancien membre — bannir quelqu'un qui est déjà parti est ce qui
      // l'empêche de revenir par un lien de partage — et l'écriture ne doit
      // alors pas réécrire la date de son départ.
      const targetParticipant = await prisma.participant.findFirst({
        where: { conversationId: id, userId: targetUserId },
        select: { id: true, role: true, bannedAt: true, displayName: true, isActive: true, leftAt: true },
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
      const ban = resolveBanWrite(targetParticipant, now)
      await prisma.participant.update({
        where: { id: targetParticipant.id },
        data: ban.data,
      })
      invalidateParticipantLookup(targetParticipant.id, id)

      const io = socketIOHandler?.getManager()?.getIO()
      const room = ROOMS.conversation(id)

      const manager = socketIOHandler?.getManager()
      if (io) {
        io.to(room).emit(SERVER_EVENTS.CONVERSATION_PARTICIPANT_BANNED, {
          conversationId: id,
          userId: targetUserId,
          bannedBy: { id: currentUserId },
          bannedAt: now.toISOString(),
          // Faux quand la cible avait déjà quitté : sans cette distinction, tout
          // client qui décrémente son compteur de membres sur cet événement le
          // décrémente pour quelqu'un qui n'y était plus.
          membershipEnded: ban.membershipEnded,
        })

        const userSockets = await io.in(ROOMS.user(targetUserId)).fetchSockets()
        await Promise.all(userSockets.map(s => s.leave(room)))

        manager?.invalidateParticipantCache?.(targetUserId, id)
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
      const { id: rawUnbanId, userId: targetUserId } = request.params
      const authRequest = request as UnifiedAuthRequest
      const currentUserId = authRequest.authContext.userId

      const id = await resolveConversationId(prisma, rawUnbanId) ?? rawUnbanId

      const currentParticipant = await prisma.participant.findFirst({
        where: { conversationId: id, userId: currentUserId, isActive: true },
        select: { id: true, role: true },
      })

      if (!currentParticipant) {
        return sendNotFound(reply, 'Vous ne participez pas à cette conversation')
      }

      const currentLevel = ROLE_LEVELS[currentParticipant.role as string] ?? 0
      if (currentLevel < ROLE_LEVELS['admin']) {
        return sendForbidden(reply, 'Seul un admin ou le créateur peut débannir un participant')
      }

      // `leftAt` et `bannedAt` disent si le bannissement avait mis fin à une
      // appartenance ou frappé quelqu'un qui était déjà parti — cf.
      // `conversationBanState.ts`. Sans eux, débannir REND une appartenance que
      // le bannissement n'avait jamais prise.
      const targetParticipant = await prisma.participant.findFirst({
        where: { conversationId: id, userId: targetUserId, bannedAt: { not: null } },
        select: { id: true, isActive: true, leftAt: true, bannedAt: true },
      })

      if (!targetParticipant) {
        return sendNotFound(reply, 'Participant banni introuvable')
      }

      const unban = resolveUnbanWrite(targetParticipant)
      await prisma.participant.update({
        where: { id: targetParticipant.id },
        data: unban.data,
      })
      invalidateParticipantLookup(targetParticipant.id, id)

      const manager = socketIOHandler?.getManager()
      const io = manager?.getIO()
      const room = ROOMS.conversation(id)

      // Exact inverse of the ban eviction above: the ban pulled every socket of
      // this user out of `conversation:<id>`, and nothing puts them back until
      // they reconnect (AuthHandler._joinUserConversations) or their client
      // happens to emit `conversation:join`. Left un-rejoined, the unbanned user
      // is in the worst possible state — `connectedUsers` reports them ONLINE,
      // so every sender skips the offline delivery queue for them, while no live
      // room event reaches them: messages, reactions, edits and receipts sent
      // meanwhile are lost outright rather than replayed on reconnect (the
      // hazard AuthHandler documents when a room join fails).
      //
      // Awaited BEFORE the broadcast, because the broadcast goes to the
      // conversation room only: emitting first would leave the person being
      // unbanned as the single participant who never learns about it. Mirrors
      // ban's emit-then-evict ordering, which likewise ensures the target
      // receives their own transition. A join failure is logged, never fatal —
      // the broadcast still goes out for the remaining members.
      //
      // Conditionné à `membershipRestored` : quand le bannissement avait frappé
      // quelqu'un déjà parti, il n'y a aucune éviction à défaire, et rebrancher
      // ses sockets le ferait entrer dans une conversation qu'il avait quittée
      // de lui-même.
      if (manager && unban.membershipRestored) {
        try {
          await manager.joinUserToConversationRoom(targetUserId, id)
        } catch (err) {
          logger.error('Failed to re-join unbanned user to conversation room', {
            userId: targetUserId,
            conversationId: id,
            err,
          })
        }
      }

      if (io) {
        io.to(room).emit(SERVER_EVENTS.CONVERSATION_PARTICIPANT_UNBANNED, {
          conversationId: id,
          userId: targetUserId,
          // Le bannissement est levé dans tous les cas ; l'appartenance, non.
          // Les compteurs de membres des clients suivent ce champ, pas
          // l'événement.
          membershipRestored: unban.membershipRestored,
        })
      }

      return sendSuccess(reply, { userId: targetUserId })
    }
  )
}
