import { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { invalidateParticipantLookup } from '../../utils/participant-lookup-cache';
import { emitConversationMemberCountEvent } from '../../socketio/emitConversationMemberCount';
import { endConversationMembership } from '../../socketio/endConversationMembership';
import { sendSuccess, sendBadRequest, sendForbidden, sendNotFound, sendInternalError } from '../../utils/response';
import { memberRoleCasings, MemberRole } from '@meeshy/shared/types/role-types';
import { actorHasMinimumRole } from '../../utils/conversation-authority';
import { resolveTargetParticipant, identifyTarget } from './utils/target-participant';
import { participantActionRefusal } from './utils/participant-authority';
import { enhancedLogger } from '../../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'ConversationParticipantRemovalRoute' });

/**
 * **Retirer quelqu'un d'une conversation** — extrait de `participants.ts` le
 * 2026-08-29, pour la même raison que `participant-role.ts` : le monolithe
 * pesait 1830 lignes et la garde qui manquait ici devait s'écrire QUELQUE PART.
 *
 * Ce que l'absence de comparaison de rang coûtait : la route exigeait
 * `MODERATOR` et rien d'autre. **Un modérateur retirait donc un administrateur,
 * et jusqu'au créateur de la conversation** — le geste le plus destructeur du
 * fil était gardé plus bas que le changement de rang, qui lui exige `ADMIN`.
 * Rétrograder quelqu'un demandait plus d'autorité que de l'expulser.
 */
export function registerParticipantRemovalRoute(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any
) {
  fastify.delete<{
    Params: { id: string; userId: string };
  }>('/conversations/:id/participants/:userId', {
    schema: {
      description: 'Remove a participant from a conversation - requires conversation moderator AND a rank strictly above the target',
      tags: ['conversations', 'participants'],
      summary: 'Remove participant',
      params: {
        type: 'object',
        required: ['id', 'userId'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' },
          userId: { type: 'string', description: 'User ID — or Participant ID — of the participant to remove' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string', example: 'Participant supprimé avec succès' }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { id, userId } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const currentUserId = authRequest.authContext.userId;

      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      const currentUserParticipant = await prisma.participant.findFirst({
        where: {
          conversationId: conversationId,
          userId: currentUserId,
          isActive: true
        },
        include: {
          user: true
        }
      });

      if (!currentUserParticipant) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      const actor = {
        conversationRole: currentUserParticipant.role,
        platformRole: currentUserParticipant.user?.role,
      };

      // Le PLANCHER, opposé avant de chercher la cible : un simple membre n'a
      // rien à apprendre de l'existence — ou non — de la ligne qu'il visait.
      if (!actorHasMinimumRole(actor, MemberRole.MODERATOR)) {
        return sendForbidden(reply, 'Vous n\'avez pas les droits pour supprimer des participants');
      }

      if (userId === currentUserId) {
        return sendBadRequest(reply, 'Vous ne pouvez pas vous supprimer de la conversation');
      }

      // La cible se résout sous les DEUX colonnes : `:userId` porte un `User.id`
      // pour un membre inscrit, un `Participant.id` pour un visiteur venu par un
      // lien partagé — qui n'a aucune ligne `User`. Le `findFirst` sur la seule
      // colonne `userId` ne le trouvait jamais.
      const removedParticipant = await resolveTargetParticipant(prisma, conversationId, userId);

      if (!removedParticipant) {
        return sendNotFound(reply, 'Participant introuvable dans cette conversation');
      }

      // Se retirer soi-même passe par `POST …/leave`. La garde plus haut compare
      // le segment d'URL ; celle-ci compare l'identité RÉSOLUE, ce qui couvre
      // aussi l'admin qui se désignerait par son `Participant.id`.
      if (removedParticipant.userId === currentUserId || removedParticipant.id === currentUserId) {
        return sendBadRequest(reply, 'Vous ne pouvez pas vous supprimer de la conversation');
      }

      if (!removedParticipant.isActive) {
        return sendBadRequest(reply, 'Ce participant ne fait plus partie de la conversation');
      }

      // La LOI que seul `/ban` portait. Sans elle, le rang de la cible ne la
      // protégeait de rien : un modérateur sortait un administrateur, et le
      // créateur lui-même — dont la conversation devenait ainsi expropriable par
      // n'importe lequel de ses modérateurs.
      const refusal = participantActionRefusal({
        actor,
        targetRole: removedParticipant.role,
        floor: MemberRole.MODERATOR,
      });
      if (refusal) {
        return sendForbidden(
          reply,
          refusal === 'below-floor'
            ? 'Vous n\'avez pas les droits pour supprimer des participants'
            : 'Vous ne pouvez pas retirer un participant de rang égal ou supérieur au vôtre',
        );
      }

      const leftAt = new Date();

      // `update` sur la ligne RÉSOLUE, plus `updateMany`. La différence n'est
      // pas cosmétique : `updateMany` ne trouvant rien n'échoue pas, et c'est
      // exactement ce qui faisait répondre **200 sans avoir rien fait** dès que
      // la cible n'était pas adressable par `userId`. Une écriture qui ne trouve
      // pas sa ligne doit échouer.
      await prisma.participant.update({
        where: { id: removedParticipant.id },
        data: {
          isActive: false,
          leftAt
        }
      });
      invalidateParticipantLookup(removedParticipant.id, conversationId);

      // R6-2 — broadcast so other members' devices drop the removed user from
      // the list + decrement the member count in real time (the DELETE
      // previously mutated the DB silently). Mirrors leave.ts. Use
      // conversation:participant-left (room broadcast feeding ParticipantsView,
      // ConversationListViewModel count, ConversationSyncEngine invalidate) —
      // NOT conversation:left, which is a self-only ack.
      try {
        const socketManager = fastify.socketIOHandler?.getManager();
        const io = socketManager?.getIO();
        if (io) {
          // Même raison qu'au départ volontaire (`leave.ts`) : l'effectif se lit
          // sur l'écran de LISTE, dont les lecteurs ont quitté la room de
          // conversation. La room reste en tête de chaîne, donc le retiré —
          // encore dedans jusqu'à l'éviction ci-dessous — garde son signal.
          const remaining = await prisma.participant.findMany({
            where: { conversationId, isActive: true },
            // `role` et `user.role` en plus : les deux titres qui ouvrent
            // l'effectif ENTIER (`canViewExactMemberCount`), que le fanout doit
            // connaître PAR DESTINATAIRE.
            select: { id: true, userId: true, role: true, user: { select: { role: true } } }
          });
          // Le retiré ferme la chaîne. Le commentaire ci-dessus disait « la
          // room reste en tête, donc le retiré garde son signal » : vrai du
          // seul appareil qui a le FIL ouvert. Les autres sont sur l'écran de
          // liste, hors de cette room — l'argument même qui a fait ajouter les
          // rooms personnelles des RESTANTS, jamais appliqué à celui dont
          // l'appartenance s'arrête. Ils gardaient une ligne que
          // `GET /conversations` ne sert plus, persistée, jusqu'au prochain
          // delta (tombstone `leftAt`).
          const audience = [
            ...remaining,
            { id: removedParticipant.id, userId: removedParticipant.userId },
          ];
          // Compte ABSOLU — `remaining` est déjà chargé pour nommer les rooms,
          // et un delta ne rattrape jamais un événement manqué. Deux chaînes
          // disjointes, comme le fanout d'arrivée : « 199+ » pour la room,
          // l'effectif ENTIER pour les lecteurs autorisés.
          emitConversationMemberCountEvent({
            io,
            conversationId,
            participants: audience,
            event: SERVER_EVENTS.CONVERSATION_PARTICIPANT_LEFT,
            payload: {
              conversationId,
              // `participantId` TOUJOURS, `userId` NUL pour un visiteur sans
              // compte : ce champ déclare un `User.id`, et y recopier un
              // `Participant.id` est précisément ce que le CLAUDE.md du gateway
              // interdit. Les clients retirent la ligne sur `participantId`.
              ...identifyTarget(removedParticipant),
              displayName: removedParticipant.displayName ?? '',
              leftAt: leftAt.toISOString()
            },
            memberCount: remaining.length
          });

          // La fin d'appartenance, en un seul geste : `endConversationMembership`
          // éteint le partage de position que le retiré tenait dans le fil AVANT
          // de sortir ses sockets de la room, parce que c'est par cette room que
          // son propre appareil apprend qu'il doit couper le GPS. Voir l'unité
          // pour l'ordre des trois et pourquoi il compte.
          // Room personnelle : `userId ?? id` — un participant sans ligne `User`
          // a bien une room, nommée d'après son `Participant.id` (cf. § Room
          // Organization). L'adresser par son seul `userId` sauterait une room
          // qui existe, et son propre appareil n'apprendrait jamais qu'il doit
          // couper le partage de position.
          await endConversationMembership({
            io,
            manager: socketManager,
            conversationId,
            userId: removedParticipant.userId ?? removedParticipant.id,
          });
        }
      } catch (socketError) {
        logger.error('Socket eviction error for removed participant', socketError as Error);
      }

      const notificationService = fastify.notificationService;
      if (notificationService) {
        // Une notification se dépose sur un COMPTE. Un visiteur sans compte n'en
        // a pas : lui en poster une contre son `Participant.id` fabriquerait une
        // ligne adressée à un `User` qui n'existe pas. Son appareil apprend le
        // retrait par l'événement temps réel ci-dessus, qui le nomme.
        if (removedParticipant.userId) {
          notificationService.createRemovedFromConversationNotification({
            recipientUserId: removedParticipant.userId,
            removedByUserId: currentUserId,
            conversationId,
          }).catch((err: unknown) => logger.error('Notification error removed', err as Error));
        }

        const adminParticipants = await prisma.participant.findMany({
          where: {
            conversationId,
            isActive: true,
            role: { in: memberRoleCasings(['creator', 'admin', 'moderator']) },
            userId: { not: currentUserId },
          },
          select: { userId: true },
        });
        for (const admin of adminParticipants) {
          if (admin.userId) {
            notificationService.createMemberRemovedNotification({
              recipientUserId: admin.userId,
              removedByUserId: currentUserId,
              conversationId,
            }).catch((err: unknown) => logger.error('Notification error member_removed', err as Error));
          }
        }
      }

      return sendSuccess(reply, { message: 'Participant supprimé avec succès' });

    } catch (error) {
      logger.error('Error removing participant', error as Error);
      return sendInternalError(reply, 'Erreur lors de la suppression du participant');
    }
  });
}
