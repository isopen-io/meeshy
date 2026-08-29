import { FastifyInstance } from 'fastify'
import { isMemberCreator, memberRoleCasings } from '@meeshy/shared/types/role-types'
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas'
import type { PrismaClient } from '@meeshy/shared/prisma/client'
import { UnifiedAuthRequest } from '../../middleware/auth'
import { sendSuccess, sendNotFound } from '../../utils/response'
import { SERVER_EVENTS, ROOMS, type ConversationDeletedEventData } from '@meeshy/shared/types/socketio-events'
import { resolveConversationId } from '../../utils/conversation-id-cache'
import { invalidateParticipantLookup } from '../../utils/participant-lookup-cache'
import { announceConversationClosed } from '../../socketio/announceConversationClosed'
import { endConversationMembership } from '../../socketio/endConversationMembership'

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
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  conversationId: { type: 'string' },
                  deletedAt: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
          401: errorResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema,
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

      // Le transfert d'ownership est ANNONCÉ plus bas, avec les autres, et pour
      // la raison que le bloc ci-dessus énonce déjà : « un événement émis ici,
      // suivi d'un échec du masquage de l'appelant, laisserait les autres tenir
      // un fait que la réponse HTTP vient de nier ». La règle valait pour la
      // clôture et pas pour la promotion, qui partait au milieu du geste — un
      // successeur proclamé créateur auprès de tout le fil, pendant que le 500
      // affirmait que rien n'avait eu lieu.
      let promotedSuccessor: { userId: string | null } | null = null

      // Le masquage de l'appelant, DÉCRIT une fois et committé par chaque
      // branche AVEC son écriture jumelle. Les deux moitiés du geste ne peuvent
      // plus atterrir séparément : ni une conversation fermée dont l'appelant
      // reste membre actif, ni deux créateurs — la promotion committée et le
      // départ perdu laissaient l'ancien créateur en place à côté du nouveau,
      // état qu'un réessai aggrave en promouvant un troisième participant.
      const hideSelf = {
        where: { id: participant.id },
        data: { deletedForMe: now, isActive: false },
      }

      // If caller is CREATOR, transfer ownership.
      // La casse ne décide pas d'une CONSÉQUENCE (#4008) : sur une ligne
      // écrite `CREATOR`, l'égalité stricte sautait cette branche et la
      // conversation restait sans créateur — sans erreur ni log.
      if (isMemberCreator(participant.role ?? 'member')) {
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
          const [closed] = await prisma.$transaction([
            prisma.conversation.update({
              where: { id: conversationId },
              data: { isActive: false, closedAt: now, closedBy: userId },
              include: { participants: { select: { id: true, userId: true, isActive: true } } },
            }),
            prisma.participant.update(hideSelf),
          ])
          closedAudience = (closed.participants ?? []).filter(p => p.isActive)
        } else {
          // Try moderator first, then oldest active member
          let successor = await prisma.participant.findFirst({
            where: {
              conversationId,
              isActive: true,
              userId: { not: userId },
              role: { in: memberRoleCasings(['moderator']) },
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
            await prisma.$transaction([
              prisma.participant.update({
                where: { id: successor.id },
                data: { role: 'creator' },
              }),
              prisma.participant.update(hideSelf),
            ])
            promotedSuccessor = { userId: successor.userId }
          } else {
            // No other active members — close conversation. Personne à
            // prévenir ici (c'est la condition même de cette branche), mais la
            // clôture doit rester ENREGISTRÉE : même écriture que la branche
            // jumelle ci-dessus, pour la même raison de rattrapage.
            const [closed] = await prisma.$transaction([
              prisma.conversation.update({
                where: { id: conversationId },
                data: { isActive: false, closedAt: now, closedBy: userId },
                include: { participants: { select: { id: true, userId: true, isActive: true } } },
              }),
              prisma.participant.update(hideSelf),
            ])
            closedAudience = (closed.participants ?? []).filter(p => p.isActive)
          }
        }
      } else {
        // Aucune écriture jumelle à accorder : le masquage est tout le geste.
        await prisma.participant.update(hideSelf)
      }
      invalidateParticipantLookup(participant.id, conversationId)

      // Remove user from socket room silently
      const manager = socketIOHandler?.getManager()
      const io = manager?.getIO()
      if (io) {
        // La fin d'appartenance, en un seul geste : `endConversationMembership`
        // éteint le partage de position que l'appelant tenait dans le fil AVANT
        // de sortir ses sockets de la room, parce que c'est par cette room que
        // son propre appareil apprend qu'il doit couper le GPS — et il en sort
        // ICI, en tête de bloc, donc l'ordre n'y était pas rattrapable plus bas.
        // Voir l'unité pour l'ordre des trois et pourquoi il compte.
        //
        // Elle porte aussi l'invalidation du cache d'appartenance, qui fermait
        // auparavant ce bloc. Sur les branches de clôture, l'extinction de
        // l'appelant précède donc celle du fil entier
        // (`announceConversationClosed`) : la seconde saute une session dont le
        // terme est déjà avancé, et n'annonce pas deux fois la même fin.
        await endConversationMembership({ io, manager, conversationId, userId })
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
        //
        // `announceConversationClosed` porte désormais la garde d'audience
        // vide ET l'extinction des partages de position du fil fermé — voir
        // l'unité pour l'ordre des deux et pourquoi il compte.
        announceConversationClosed({
          io,
          manager,
          conversationId,
          participants: closedAudience,
          closedBy: userId,
          closedAt: now,
        })

        // Le transfert d'ownership, annoncé ICI et non à l'écriture — même
        // discipline que les deux faits ci-dessus, et il lui manquait. La
        // promotion partait entre les deux écritures : si le masquage de
        // l'appelant échouait ensuite, tout le fil avait déjà appris un
        // successeur que le 500 démentait, et que la transaction annule
        // désormais.
        //
        // La room de conversation seule est CONSERVÉE ici : contrairement à la
        // clôture, un rang ne se rend sur aucun écran de liste — le cycle 67 l'a
        // vérifié plutôt que déduit sur ce même événement.
        if (promotedSuccessor) {
          io.to(ROOMS.conversation(conversationId)).emit(
            SERVER_EVENTS.PARTICIPANT_ROLE_UPDATED,
            {
              conversationId,
              userId: promotedSuccessor.userId,
              newRole: 'creator',
              updatedBy: userId,
            }
          )
        }

      }

      return sendSuccess(reply, { conversationId, deletedAt: now.toISOString() })
    }
  )
}
