import { FastifyInstance } from 'fastify'
import { memberRoleLevel, MemberRole } from '@meeshy/shared/types/role-types'
import { actorHasMinimumRole, actorRoleLevel } from '../../utils/conversation-authority'
import type { PrismaClient } from '@meeshy/shared/prisma/client'
import { UnifiedAuthRequest } from '../../middleware/auth'
import { sendSuccess, sendBadRequest, sendForbidden, sendNotFound } from '../../utils/response'
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events'
import { resolveConversationId } from '../../utils/conversation-id-cache'
import { invalidateParticipantLookup } from '../../utils/participant-lookup-cache'
import { resolveBanWrite, resolveUnbanWrite } from '../../services/conversations/conversationBanState'
import { resolveTargetParticipant, identifyTarget } from './utils/target-participant'
import { enhancedLogger } from '../../utils/logger-enhanced.js'
import { emitConversationMemberCountEvent } from '../../socketio/emitConversationMemberCount'
import { endConversationMembership } from '../../socketio/endConversationMembership'

const logger = enhancedLogger.child({ module: 'ConversationBanRoutes' })



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

      // La cible se résout sous les DEUX colonnes. `:userId` porte un `User.id`
      // pour un membre inscrit, un `Participant.id` pour un visiteur venu par un
      // lien partagé — qui n'a aucune ligne `User`, donc qu'un filtre sur la
      // seule colonne `userId` ne trouvait jamais.
      //
      // `isActive` et `leftAt` sont lus, pas filtrés : la cible peut être un
      // ancien membre — bannir quelqu'un déjà parti est ce qui l'empêche de
      // revenir — et l'écriture ne doit alors pas réécrire la date de son départ.
      const targetParticipant = await resolveTargetParticipant(prisma, id, targetUserId)

      if (!targetParticipant) {
        return sendNotFound(reply, 'Participant introuvable')
      }

      if (targetParticipant.bannedAt !== null) {
        return sendBadRequest(reply, 'Ce participant est déjà banni')
      }

      // L'acteur porte son rôle de PLATEFORME (#3941) ; la cible non — la
      // décision porteur dit ce qu'un administrateur peut FAIRE, pas ce qui
      // le protège. Au NIVEAU du créateur et jamais au-dessus, donc aucun
      // des deux ne bannit l'autre.
      const currentLevel = actorRoleLevel({
        conversationRole: currentParticipant.role,
        platformRole: authRequest.authContext.registeredUser?.role,
      })
      const targetLevel = memberRoleLevel(targetParticipant.role ?? 'member')

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

      // Bannir sort la personne ET ferme la porte par laquelle elle est entrée.
      // Sortir quelqu'un en laissant son lien ouvert ne protège de rien : il
      // suffit de le rouvrir pour revenir sous un autre pseudonyme, et un
      // visiteur sans compte n'a QUE ce chemin.
      //
      // Ce qui est fermé, c'est la PORTE, pas la salle : les personnes déjà
      // entrées par ce lien restent membres. Et il n'y a rien à fermer pour un
      // créateur ou un membre ajouté à la main, qui n'ont pas de `shareLinkId`.
      let closedShareLinkId: string | null = null
      if (targetParticipant.shareLinkId) {
        try {
          await prisma.conversationShareLink.update({
            where: { id: targetParticipant.shareLinkId },
            data: { isActive: false },
          })
          closedShareLinkId = targetParticipant.shareLinkId
        } catch (linkError) {
          // Le bannissement, lui, est ÉCRIT. Un lien déjà supprimé ne doit pas
          // faire échouer le geste qui compte — mais il se dit, sans quoi
          // l'appelant croirait la porte fermée.
          logger.error('ban: share link close failed', linkError as Error)
        }
      }

      const io = socketIOHandler?.getManager()?.getIO()

      const manager = socketIOHandler?.getManager()
      if (io) {
        // Effectif APRÈS le bannissement, et rooms personnelles des membres
        // restants : la room de conversation seule n'atteignait pas l'écran de
        // LISTE, qui rend pourtant cet effectif.
        const remaining = await prisma.participant.findMany({
          where: { conversationId: id, isActive: true },
          // `role` et `user.role` en plus : les deux titres qui ouvrent
          // l'effectif ENTIER (`canViewExactMemberCount`), que le fanout doit
          // connaître PAR DESTINATAIRE.
          select: { id: true, userId: true, role: true, user: { select: { role: true } } },
        })

        // Le banni ferme la chaîne. La room de conversation ne l'atteint que
        // s'il a le FIL ouvert ; sur l'écran de liste — hors de cette room —
        // ses appareils gardaient une ligne que `GET /conversations` ne sert
        // plus, et qu'ils PERSISTENT, jusqu'au prochain delta (tombstone
        // `bannedAt`). Même écart, même correctif que `leave.ts` et que le
        // retrait par un admin (`participants.ts`).
        //
        // Vrai même quand `membershipEnded` est faux : bannir un ex-membre ne
        // retire aucune ligne de sa liste, il n'y en avait plus. Le retrait
        // côté client est idempotent, c'est ce qui permet de ne pas gater ici.
        const audience = [...remaining, { id: targetParticipant.id, userId: targetParticipant.userId }]
        emitConversationMemberCountEvent({
          io,
          conversationId: id,
          participants: audience,
          event: SERVER_EVENTS.CONVERSATION_PARTICIPANT_BANNED,
          payload: {
            conversationId: id,
            // `participantId` TOUJOURS, `userId` NUL sans compte — cf.
            // `identifyTarget`. Les clients retirent sur `participantId`.
            ...identifyTarget(targetParticipant),
            bannedBy: { id: currentUserId },
            bannedAt: now.toISOString(),
            ...(closedShareLinkId ? { closedShareLinkId } : {}),
            // Faux quand la cible avait déjà quitté : sans cette distinction, tout
            // client qui décrémente son compteur de membres sur cet événement le
            // décrémente pour quelqu'un qui n'y était plus. `memberCount`
            // ci-dessous rend ce raisonnement inutile pour qui le lit — le
            // drapeau reste pour les clients qui décomptent encore.
            membershipEnded: ban.membershipEnded,
          },
          memberCount: remaining.length,
        })

        // La fin d'appartenance, en un seul geste : `endConversationMembership`
        // éteint le partage de position que le banni tenait dans le fil AVANT de
        // sortir ses sockets de la room, parce que c'est par cette room que son
        // propre appareil apprend qu'il doit couper le GPS. Voir l'unité pour
        // l'ordre des trois et pourquoi il compte.
        //
        // Appelée même quand `membershipEnded` est faux : bannir un ex-membre
        // n'éteint rien qui vive (le départ l'a déjà fait), et l'extinction est
        // idempotente — c'est ce qui permet de ne pas gater ici, exactement comme
        // pour l'annonce ci-dessus.
        // Room personnelle : `userId ?? id` — un participant sans ligne `User` en
        // a une, nommée d'après son `Participant.id`.
        await endConversationMembership({
          io,
          manager,
          conversationId: id,
          userId: targetParticipant.userId ?? targetParticipant.id,
        })
      }

      return sendSuccess(reply, {
        ...identifyTarget(targetParticipant),
        bannedAt: now.toISOString(),
        // Nommé plutôt que deviné : l'écran des liens doit pouvoir marquer CE
        // lien fermé sans relire toute la liste.
        closedShareLinkId,
      })
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

      if (!actorHasMinimumRole(
        {
          conversationRole: currentParticipant.role,
          platformRole: authRequest.authContext.registeredUser?.role,
        },
        MemberRole.ADMIN,
      )) {
        return sendForbidden(reply, 'Seul un admin ou le créateur peut débannir un participant')
      }

      // Mêmes deux colonnes qu'au bannissement — sans quoi on saurait bannir un
      // visiteur sans compte et jamais le débannir.
      //
      // `leftAt` et `bannedAt` disent si le bannissement avait mis fin à une
      // appartenance ou frappé quelqu'un qui était déjà parti — cf.
      // `conversationBanState.ts`. Sans eux, débannir REND une appartenance que
      // le bannissement n'avait jamais prise.
      //
      // Le lien fermé par le bannissement n'est PAS rouvert : c'est une décision
      // séparée, qui se prend sur l'écran des liens. Rouvrir d'office
      // rétablirait une porte que l'hôte a peut-être fermée pour d'autres
      // raisons — et le débannissement ne rend que ce que le bannissement a pris
      // à CETTE personne.
      const resolved = await resolveTargetParticipant(prisma, id, targetUserId)
      const targetParticipant = resolved?.bannedAt ? resolved : null

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
      // Awaited BEFORE the broadcast. Ce n'est PLUS ce qui garantit que la
      // cible apprenne sa réintégration — la diffusion chaîne désormais les
      // rooms personnelles des membres actifs, dont la sienne dès que
      // l'appartenance est restaurée. L'ordre reste : rebrancher d'abord, c'est
      // s'assurer qu'aucun événement de room émis entre les deux ne lui manque.
      // A join failure is logged, never fatal — the broadcast still goes out
      // for the remaining members.
      //
      // Conditionné à `membershipRestored` : quand le bannissement avait frappé
      // quelqu'un déjà parti, il n'y a aucune éviction à défaire, et rebrancher
      // ses sockets le ferait entrer dans une conversation qu'il avait quittée
      // de lui-même.
      if (manager && unban.membershipRestored) {
        // Room personnelle : `userId ?? id`, comme partout ailleurs — un
        // participant sans ligne `User` a une room nommée d'après son
        // `Participant.id`.
        const targetRoomKey = targetParticipant.userId ?? targetParticipant.id
        try {
          await manager.joinUserToConversationRoom(targetRoomKey, id)
        } catch (err) {
          logger.error('Failed to re-join unbanned user to conversation room', {
            userId: targetRoomKey,
            conversationId: id,
            err,
          })
        }
      }

      if (io) {
        // Effectif APRÈS la levée : quand elle restaure l'appartenance, la
        // cible est de nouveau active et figure donc dans ce compte ET dans
        // l'audience — elle apprend ainsi son retour sur sa propre ligne de
        // liste, ce que la room de conversation ne pouvait pas lui dire.
        const remaining = await prisma.participant.findMany({
          where: { conversationId: id, isActive: true },
          // `role` et `user.role` en plus : les deux titres qui ouvrent
          // l'effectif ENTIER (`canViewExactMemberCount`), que le fanout doit
          // connaître PAR DESTINATAIRE.
          select: { id: true, userId: true, role: true, user: { select: { role: true } } },
        })

        emitConversationMemberCountEvent({
          io,
          conversationId: id,
          participants: remaining,
          event: SERVER_EVENTS.CONVERSATION_PARTICIPANT_UNBANNED,
          payload: {
            conversationId: id,
            // `participantId` TOUJOURS, `userId` NUL sans compte — cf.
            // `identifyTarget`.
            ...identifyTarget(targetParticipant),
            // Le bannissement est levé dans tous les cas ; l'appartenance, non.
            // Les compteurs de membres des clients suivent ce champ, pas
            // l'événement.
            membershipRestored: unban.membershipRestored,
          },
          memberCount: remaining.length,
        })
      }

      return sendSuccess(reply, identifyTarget(targetParticipant))
    }
  )
}
