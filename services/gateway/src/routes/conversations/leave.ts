import { FastifyInstance } from 'fastify'
import { isMemberCreator } from '@meeshy/shared/types/role-types'
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas'
import type { PrismaClient } from '@meeshy/shared/prisma/client'
import { UnifiedAuthRequest } from '../../middleware/auth'
import { sendSuccess, sendNotFound } from '../../utils/response'
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events'
import { resolveConversationId } from '../../utils/conversation-id-cache'
import { invalidateParticipantLookup } from '../../utils/participant-lookup-cache'
import { emitConversationMemberCountEvent } from '../../socketio/emitConversationMemberCount'
import { announceConversationClosed } from '../../socketio/announceConversationClosed'
import { endConversationMembership } from '../../socketio/endConversationMembership'
import { resoudreSuccessionDuCreateur } from '../../services/conversations/creatorSuccession'

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
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  conversationId: { type: 'string' },
                  leftAt: { type: 'string', format: 'date-time' },
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

      const id = await resolveConversationId(prisma, rawId) ?? rawId

      const participant = await prisma.participant.findFirst({
        where: { conversationId: id, userId, isActive: true },
      })

      if (!participant) {
        return sendNotFound(reply, 'Vous ne participez pas à cette conversation')
      }

      // Un seul instant pour toute l'opération — même discipline que le jumeau
      // `delete-for-me.ts` : la clôture éventuelle et le départ sont deux faces
      // du même geste, et `closedAt` sert de borne au delta (`closedAt > since`)
      // exactement comme `leftAt`. Deux `new Date()` les feraient tomber de part
      // et d'autre d'un `since` de rattrapage.
      const now = new Date()

      // L'audience de la clôture, ramenée PAR l'écriture et jamais par une
      // requête de plus — même raison que les jumeaux `core.ts` et
      // `delete-for-me.ts`, mot pour mot : « une seconde requête pour les lire
      // pourrait tomber sur un état déjà modifié ». Elle porte l'appelant, encore
      // actif à cet instant (il ne le devient pas moins avant l'écriture
      // suivante).
      let closedAudience: Array<{ id: string; userId: string | null }> = []

      // Le transfert prononcé par cette porte, annoncé APRÈS toutes les
      // écritures — même discipline que le jumeau `delete-for-me.ts`, et pour
      // sa raison : une annonce ne précède jamais la durabilité du fait
      // qu'elle annonce.
      let promotedSuccessor: { userId: string | null } | null = null

      // Le départ de l'appelant, DÉCRIT une fois et committé par chaque
      // branche AVEC son écriture jumelle — la promotion du successeur ou la
      // clôture du fil. Les deux moitiés ne peuvent pas atterrir séparément :
      // ni deux créateurs, ni un fil fermé dont l'appelant reste actif.
      const leaveSelf = {
        where: { id: participant.id },
        data: { isActive: false, leftAt: now },
      }

      // La casse ne décide pas d'une CONSÉQUENCE (#4008). Sur une ligne écrite
      // `CREATOR` — la casse que l'ancien `InitService` posait pour le salon
      // global — l'égalité stricte ne tirait pas, et le créateur partait sans
      // que personne n'hérite du fil.
      if (isMemberCreator(participant.role ?? 'member')) {
        // Le créateur PART, et le fil trouve son héritier tout seul (décision
        // porteur du 2026-08-28, #4058). Cette porte REFUSAIT — « transférez
        // l'ownership ou supprimez la conversation » — pendant que sa jumelle
        // `delete-for-me.ts` transférait en silence : un même geste, deux
        // contrats. La loi est désormais écrite UNE fois, dans
        // `creatorSuccession.ts`, et les deux portes la posent.
        const succession = await resoudreSuccessionDuCreateur(prisma, {
          conversationId: id,
          sortantUserId: userId,
        })

        if (succession.kind === 'transfer') {
          const successor = succession.successor
          await prisma.$transaction([
            prisma.participant.update({
              where: { id: successor.id },
              data: { role: 'creator' },
            }),
            prisma.participant.update(leaveSelf),
          ])
          promotedSuccessor = { userId: successor.userId }
        } else {
          // `closedAt`/`closedBy` ne sont pas décoratifs, et leur absence ici était
          // le QUATRIÈME écrivain de clôture hors de la discipline des trois autres
          // — « constat latent nº 2 du cycle 30 », nommé dans
          // `services/messaging/conversationWriteAdmission.ts` et non corrigé
          // depuis. Une clôture qui n'écrit que `isActive: false` n'est portée par
          // AUCUN tombstone : `loadConversationTombstones` interroge `closedAt >
          // since` et rien d'autre, si bien que la ligne survivait dans le cache
          // persistant de tout client qui ne serait pas l'appelant.
          //
          // L'appelant, lui, est couvert par son propre `leftAt` (troisième stream
          // de tombstones) — ce qui rendait le trou INVISIBLE tant que la branche
          // ne s'ouvrait que sur une conversation VIDE. Elle ne l'est qu'à
          // l'instant où le résolveur de succession la lit : un ajout de
          // participant qui commit entre cette lecture et cette écriture laisse un
          // membre actif dans une conversation terminale, à qui ni le direct ni le
          // rattrapage n'apprenaient rien. Étroit, et c'est précisément la sorte de
          // fenêtre qu'un état écrit referme et qu'un état omis laisse ouverte.
          //
          // Les DEUX écritures committent ENSEMBLE ou pas du tout. Séparées, la
          // clôture — destructrice et DÉFINITIVE — committait avant celle qui la
          // rend cohérente : un échec du départ laissait la conversation fermée
          // pour tout le monde alors que la réponse HTTP est un 500 qui NIE
          // l'opération, et que l'appelant reste un participant ACTIF d'un fil
          // terminal. Aucune annonce ne part (le bloc socket est plus bas), donc
          // ni le direct ni la réponse ne disent ce qui vient d'être écrit.
          //
          // Ordonner les deux écritures autrement ne ferait que déplacer le
          // mauvais côté de l'échec — les fusionner SUPPRIME la question, et
          // c'est l'idiome que le dépôt applique déjà à deux modèles distincts
          // (`routes/me/delete-account.ts`).
          //
          // L'audience reste ramenée PAR l'écriture de clôture, qui s'exécute en
          // PREMIER dans la transaction : l'appelant y est encore actif, donc
          // encore dans l'audience — sémantique inchangée.
          const [closed] = await prisma.$transaction([
            prisma.conversation.update({
              where: { id },
              data: { isActive: false, closedAt: now, closedBy: userId },
              include: { participants: { select: { id: true, userId: true, isActive: true } } },
            }),
            prisma.participant.update(leaveSelf),
          ])
          closedAudience = (closed.participants ?? []).filter(p => p.isActive)
        }
      } else {
        await prisma.participant.update(leaveSelf)
      }
      invalidateParticipantLookup(participant.id, id)

      const io = socketIOHandler?.getManager()?.getIO()

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
          // `role` et `user.role` en plus : ce sont les deux titres qui ouvrent
          // l'effectif ENTIER (`canViewExactMemberCount`), et le fanout doit
          // les connaître PAR DESTINATAIRE — un broadcast ne portait qu'une
          // présentation, et c'était la plafonnée, pour tout le monde.
          select: { id: true, userId: true, role: true, user: { select: { role: true } } },
        })
        // Le partant ferme la chaîne, et c'est le MÊME argument qu'au-dessus
        // appliqué à celui qu'il excluait. La room de conversation « porte le
        // partant, encore dedans à cet instant » ne vaut que pour l'appareil
        // qui a le FIL ouvert ; ses autres appareils sont précisément sur
        // l'écran de liste, donc hors de cette room. Ce qu'ils y affichent
        // n'est pas un compteur faux mais une ligne que le serveur ne sert
        // plus — `GET /conversations` exige `participants.some({ userId,
        // isActive: true })` — et que les deux clients PERSISTENT (cache
        // disque iOS, `staleTime: Infinity` web). Elle survivait jusqu'au
        // prochain delta `updatedSince=` (tombstone `leftAt`,
        // `delta-tombstones.ts`) : à la reconnexion suivante au mieux, 24 h
        // plus tard au pire (`fullReconcileInterval`).
        //
        // Une seule chaîne, pas un second `emit` : un appareil du partant resté
        // dans la room de conversation recevrait sinon deux copies.
        const audience = [...remaining, { id: participant.id, userId }]
        // Compte ABSOLU, gratuit — `remaining` est déjà chargé pour nommer les
        // rooms. Un client qui soustrait 1 ne converge pas : l'événement manqué
        // (hors ligne, trou de reconnexion) laisse une dérive que rien ne
        // rattrape, et que les deux clients PERSISTENT (cache disque iOS,
        // `staleTime: Infinity` web). Un total se rattrape au suivant — encore
        // faut-il que ce total soit celui auquel le lecteur a droit, d'où les
        // deux chaînes disjointes de `emitConversationMemberCountEvent`.
        emitConversationMemberCountEvent({
          io,
          conversationId: id,
          participants: audience,
          event: SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT,
          payload: {
            conversationId: id,
            userId,
            displayName: participant.displayName,
            leftAt: now.toISOString(),
          },
          memberCount: remaining.length,
        })

        // La clôture GLOBALE, quand la branche créateur l'a prononcée. Elle est
        // un fait DIFFÉRENT du départ : `conversation:participant-left` dit « un
        // membre s'en va », jamais « ce fil est terminé », et c'est la seconde
        // phrase que le prédicat d'admission en écriture
        // (`conversationWriteAdmission`) fera respecter au prochain envoi. Sans
        // elle, un client qui garde la ligne se voit refuser ses messages sans
        // qu'aucun événement n'ait jamais expliqué pourquoi.
        //
        // Émise APRÈS toutes les écritures, comme dans `delete-for-me.ts` et pour
        // sa raison : une annonce ne précède jamais la durabilité du fait
        // qu'elle annonce.
        //
        // `emitToConversationParticipants` et non un emit vers la seule room de
        // conversation — correction que les deux jumeaux portent déjà : un client
        // posé sur la LISTE a quitté `conversation:<id>` et n'est joignable que
        // par sa room personnelle. Le chaînage `.to()` garantit au plus une copie
        // par socket, y compris pour un appareil de l'appelant resté dans les
        // deux rooms.
        //
        // `announceConversationClosed` porte désormais la garde d'audience
        // vide ET l'extinction des partages de position du fil fermé — voir
        // l'unité pour l'ordre des deux et pourquoi il compte.
        announceConversationClosed({
          io,
          manager,
          conversationId: id,
          participants: closedAudience,
          closedBy: userId,
          closedAt: now,
        })

        // La fin d'appartenance, en un seul geste : `endConversationMembership`
        // éteint ce que le partant tenait de vivant dans le fil — son partage de
        // position — AVANT de sortir ses sockets de la room, parce que c'est par
        // cette room que son propre appareil apprend qu'il doit couper le GPS.
        // Voir l'unité pour l'ordre des trois et pourquoi il compte.
        // Le transfert d'ownership, annoncé ICI — après la DERNIÈRE écriture,
        // comme les deux faits ci-dessus. La room de conversation seule est
        // conservée : contrairement à la clôture, un rang ne se rend sur aucun
        // écran de liste — le cycle 67 l'a VÉRIFIÉ plutôt que déduit, sur ce
        // même événement et depuis la porte jumelle.
        if (promotedSuccessor) {
          io.to(ROOMS.conversation(id)).emit(SERVER_EVENTS.PARTICIPANT_ROLE_UPDATED, {
            conversationId: id,
            userId: promotedSuccessor.userId,
            newRole: 'creator',
            updatedBy: userId,
          })
        }

        await endConversationMembership({ io, manager, conversationId: id, userId })
      }

      return sendSuccess(reply, { conversationId: id, leftAt: now.toISOString() })
    }
  )
}
