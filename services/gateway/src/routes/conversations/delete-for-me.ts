import { FastifyInstance } from 'fastify'
import type { PrismaClient } from '@meeshy/shared/prisma/client'
import { UnifiedAuthRequest } from '../../middleware/auth'
import { sendSuccess, sendNotFound } from '../../utils/response'
import { SERVER_EVENTS, ROOMS, type ConversationDeletedEventData } from '@meeshy/shared/types/socketio-events'
import { resolveConversationId } from '../../utils/conversation-id-cache'
import { invalidateParticipantLookup } from '../../utils/participant-lookup-cache'
import { emitToConversationParticipants } from '../../socketio/emitToConversationParticipants'

export function registerDeleteForMeRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  _optionalAuth: any,
  requiredAuth: any
) {
  const socketIOHandler = fastify.socketIOHandler

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

      // Un seul instant pour toute l'opération : la clôture éventuelle et le
      // masquage personnel sont deux faces du même geste, et `closedAt` sert de
      // borne au delta (`closedAt > since`) exactement comme `deletedForMe`.
      const now = new Date()
      // Les deux branches ci-dessous ferment la conversation POUR TOUT LE
      // MONDE. Elles ne s'annoncent pas elles-mêmes : la diffusion attend que
      // TOUTES les écritures soient committées (voir le bloc socket en fin de
      // route) — un `conversation:closed` émis ici, suivi d'un échec du
      // masquage de l'appelant, laisserait les autres tenir une clôture que la
      // réponse HTTP vient de nier.
      //
      // L'audience est ramenée PAR l'écriture, jamais par une requête de plus :
      // même raison que le jumeau `core.ts`, mot pour mot — « une seconde
      // requête pour les lire pourrait tomber sur un état déjà modifié » — et
      // une requête de plus après des écritures committées est un mode d'échec
      // gratuit, qui rendrait 500 une opération intégralement réussie.
      let closedAudience: Array<{ id: string; userId: string | null }> = []

      // If caller is CREATOR, transfer ownership
      if (participant.role === 'creator') {
        // Le client Prisma renvoie `null` pour `firstMessageSentAt` aussi bien
        // quand le champ est present-et-null que quand il est ABSENT (legacy,
        // jamais backfillé) — impossible de distinguer les deux cas côté JS
        // via un simple `select` + négation. On requête donc directement le
        // state present-et-null (seul état correspondant à un DM "genuinely
        // empty") via `count`, qui ne matche jamais un document où le champ
        // est absent — `type: 'direct'` est filtré dans la même requête.
        const isEmptyDirect = (await prisma.conversation.count({
          where: { id: conversationId, type: 'direct', firstMessageSentAt: null },
        })) > 0

        if (isEmptyDirect) {
          // DM vide jamais utilisé : rien à préserver pour un successeur qui
          // ne l'a pas demandé (Prisme design doc 2026-08-04) — fermer
          // plutôt que transférer, même s'il reste un autre participant actif.
          //
          // `closedAt`/`closedBy` ne sont pas décoratifs : le stream de
          // rattrapage `loadConversationTombstones` interroge `closedAt >
          // since`. Une clôture qui n'écrit que `isActive: false` n'est portée
          // par AUCUN delta — le participant restant garderait la ligne dans
          // son cache persistant jusqu'à une réconciliation complète.
          const closed = await prisma.conversation.update({
            where: { id: conversationId },
            data: { isActive: false, closedAt: now, closedBy: userId },
            include: { participants: { select: { id: true, userId: true, isActive: true } } },
          })
          closedAudience = (closed.participants ?? []).filter(p => p.isActive)
        } else {
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

            const io = socketIOHandler?.getManager()?.getIO()
            if (io) {
              io.to(ROOMS.conversation(conversationId)).emit(
                SERVER_EVENTS.PARTICIPANT_ROLE_UPDATED,
                {
                  conversationId,
                  userId: successor.userId,
                  newRole: 'creator',
                  updatedBy: userId,
                }
              )
            }
          } else {
            // No other active members — close conversation. Personne à
            // prévenir ici (c'est la condition même de cette branche), mais la
            // clôture doit rester ENREGISTRÉE : même écriture que la branche
            // jumelle ci-dessus, pour la même raison de rattrapage.
            const closed = await prisma.conversation.update({
              where: { id: conversationId },
              data: { isActive: false, closedAt: now, closedBy: userId },
              include: { participants: { select: { id: true, userId: true, isActive: true } } },
            })
            closedAudience = (closed.participants ?? []).filter(p => p.isActive)
          }
        }
      }

      // Mark as deleted for this user
      await prisma.participant.update({
        where: { id: participant.id },
        data: { deletedForMe: now, isActive: false },
      })
      invalidateParticipantLookup(participant.id, conversationId)

      // Remove user from socket room silently
      const manager = socketIOHandler?.getManager()
      const io = manager?.getIO()
      if (io) {
        const userSockets = await io.in(ROOMS.user(userId)).fetchSockets()
        await Promise.all(userSockets.map(s => s.leave(ROOMS.conversation(conversationId))))
        // Notify the user's other devices so they drop the conversation from
        // their local store/list (per-user soft delete). Consumed iOS-side by
        // ConversationStore.applyConversationDeleted.
        const deletedPayload: ConversationDeletedEventData = { userId, conversationId }
        io.to(ROOMS.user(userId)).emit(SERVER_EVENTS.CONVERSATION_DELETED, deletedPayload)

        // Clôture GLOBALE — l'autre moitié du geste, et un événement DIFFÉRENT.
        // `conversation:deleted` ci-dessus promet dans son propre contrat que
        // « the conversation stays active for every other participant » ; les
        // branches de clôture rendent cette phrase fausse. Le membre qui reste
        // n'apprenait donc rien : ni en direct (aucune émission ne le visait),
        // ni plus tard (sans `closedAt`, aucun tombstone).
        //
        // Émis ICI, après la DERNIÈRE écriture : une annonce ne précède jamais
        // la durabilité du fait qu'elle annonce.
        //
        // L'appelant figure dans l'audience — elle est capturée à l'écriture,
        // où il est encore actif — et reçoit donc les DEUX événements. C'est
        // exact et voulu : les deux faits sont vrais pour lui (la conversation
        // est fermée ET retirée de sa liste), ce sont deux événements distincts,
        // une copie chacun, et c'est la sémantique du jumeau `core.ts`, où
        // l'auteur de la clôture reçoit lui aussi son annonce.
        //
        // `emitToConversationParticipants` et non un emit vers la seule room de
        // conversation : c'est la correction exacte que le jumeau
        // `DELETE /conversations/:id` (`core.ts`) porte déjà — un client posé
        // sur la LISTE a quitté `conversation:<id>` et n'est joignable que par
        // sa room personnelle.
        if (closedAudience.length > 0) {
          emitToConversationParticipants({
            io,
            conversationId,
            participants: closedAudience,
            events: [SERVER_EVENTS.CONVERSATION_CLOSED],
            payload: { conversationId, closedBy: userId, closedAt: now.toISOString() },
          })
        }

        // Invalidate the 5-minute participantId cache so the now-inactive user
        // cannot send messages to this conversation during the cache window.
        manager?.invalidateParticipantCache?.(userId, conversationId)
      }

      return sendSuccess(reply, { conversationId, deletedAt: now.toISOString() })
    }
  )
}
