import { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { serializeConversationParticipant } from '@meeshy/shared/utils/participant-helpers';
import { conversationParticipantSchema, errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { sendSuccess, sendBadRequest, sendForbidden, sendNotFound, sendInternalError } from '../../utils/response';
import { isMemberCreator, MemberRole } from '@meeshy/shared/types/role-types';
import { actorHasMinimumRole } from '../../utils/conversation-authority';
import { getPresenceVisibilityService } from '../../services/PresenceVisibilityService';
import { presenceFor, viewerFromRequest } from '../users/presence-gate';
import { resolveTargetParticipant } from './utils/target-participant';
import { participantActionRefusal } from './utils/participant-authority';
import { participantListUserSelect } from './utils/participant-projection';
import { enhancedLogger } from '../../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'ConversationParticipantRoleRoute' });

/**
 * **Changer le rang de quelqu'un** — extrait de `participants.ts` le 2026-08-29.
 *
 * L'extraction n'est pas cosmétique : `participants.ts` pesait 1830 lignes, très
 * au-dessus du budget de 800-1100, et la directive est explicite — on EXTRAIT
 * avant d'ajouter. Ce geste-ci recevait deux gardes de plus (la comparaison de
 * rang, la résolution de clé partagée) ; les poser dans le monolithe l'aurait
 * encore alourdi de ce qu'il fallait précisément lui retirer.
 *
 * Ce que l'absence de comparaison de rang coûtait : **un administrateur
 * rétrogradait un autre administrateur**, et rien ne l'en empêchait. La seule
 * protection posée était celle du créateur (#4008) — une exception nommée là où
 * il fallait une LOI. Un admin pouvait donc, en deux requêtes, se débarrasser de
 * ses pairs : `role: 'member'` sur chacun, puis n'importe quoi. La hiérarchie
 * n'existait qu'à l'affichage.
 */
export function registerParticipantRoleRoute(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any
) {
  fastify.patch<{
    Params: { id: string; userId: string };
    Body: { role: string };
  }>('/conversations/:id/participants/:userId/role', {
    schema: {
      description: 'Update participant role in a conversation - requires conversation admin AND a rank strictly above the target. The creator cannot be demoted.',
      tags: ['conversations', 'participants'],
      summary: 'Update participant role',
      params: {
        type: 'object',
        required: ['id', 'userId'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' },
          userId: { type: 'string', description: 'User ID — or Participant ID — of the participant whose role changes' }
        }
      },
      body: {
        type: 'object',
        required: ['role'],
        properties: {
          role: { type: 'string', enum: ['admin', 'moderator', 'member'], description: 'New role for participant' }
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
                message: { type: 'string', example: 'Rôle du participant modifié avec succès' },
                // Le handler sert aussi le couple qui NOMME la mutation ;
                // non déclarés, `userId` et `role` étaient retirés, et
                // l'appelant devait rouvrir `participant` pour savoir ce qui
                // venait de changer. L'événement Socket.IO jumeau
                // (`PARTICIPANT_ROLE_UPDATED`) porte les deux depuis toujours.
                userId: { type: 'string', description: 'The participant whose role changed' },
                // La SECONDE face de l'identité. Le segment d'URL accepte
                // désormais les deux clés ; sans ce champ, un appelant qui a
                // désigné sa cible par son `Participant.id` ne pouvait pas
                // rapprocher la réponse de la ligne qu'il affiche.
                participantId: { type: 'string', description: 'Participant row whose role changed' },
                role: { type: 'string', description: 'The role now in force' },
                participant: conversationParticipantSchema
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
      const { role } = request.body;
      const authRequest = request as UnifiedAuthRequest;
      const currentUserId = authRequest.authContext.userId;

      const normalizedRole = role.toLowerCase()
      if (!['admin', 'moderator', 'member'].includes(normalizedRole)) {
        return sendBadRequest(reply, 'Invalid role. Accepted roles are: admin, moderator, member');
      }

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

      // Le PLANCHER, opposé avant même de chercher la cible : un simple membre
      // n'a rien à apprendre de l'existence — ou non — de la ligne qu'il visait.
      if (!actorHasMinimumRole(actor, MemberRole.ADMIN)) {
        return sendForbidden(reply, 'Vous n\'avez pas les droits pour modifier les rôles des participants');
      }

      if (userId === currentUserId) {
        return sendBadRequest(reply, 'You cannot modify your own role');
      }

      // La cible se résout sous les DEUX colonnes, comme `/ban` et `DELETE` :
      // `:userId` porte un `User.id` pour un membre inscrit, un `Participant.id`
      // pour qui est venu par un lien partagé. Le `findFirst` sur la seule
      // colonne `userId` ne trouvait jamais les seconds — et répondait
      // « participant introuvable », ce qui est faux : il existe, c'est la
      // question qui était mal posée.
      const targetParticipant = await resolveTargetParticipant(prisma, conversationId, userId);

      // `isActive` est vérifié ICI plutôt que dans le `where` : le résolveur
      // partagé ne filtre pas — bannir un ex-membre est un geste légitime, et
      // c'est l'appelant qui dit ce qu'il exige de l'état. Changer le rang de
      // quelqu'un qui est parti n'a, lui, aucun sens.
      if (!targetParticipant || !targetParticipant.isActive) {
        return sendNotFound(reply, 'Participant not found or inactive');
      }

      // La garde plus haut compare le segment d'URL ; celle-ci compare
      // l'identité RÉSOLUE, ce qui couvre l'admin qui se désignerait par son
      // propre `Participant.id`.
      if (targetParticipant.userId === currentUserId || targetParticipant.id === currentUserId) {
        return sendBadRequest(reply, 'You cannot modify your own role');
      }

      // Protection, pas permission : sur une ligne `CREATOR` l'égalité
      // stricte ne tirait pas et le créateur devenait rétrogradable (#4008).
      // Reste AVANT la comparaison de rang, et pas seulement par habitude : les
      // deux refusent, mais celui-ci NOMME la raison — « on ne touche pas au
      // créateur » — là où l'autre dirait seulement « vous n'êtes pas assez
      // haut », ce qui laisserait croire qu'un rang de plus suffirait.
      if (isMemberCreator(targetParticipant.role ?? 'member')) {
        return sendForbidden(reply, 'Cannot modify the conversation creator\'s role');
      }

      // La LOI, enfin — celle que `/ban` portait seul. Sans elle, un
      // administrateur rétrogradait ses pairs.
      const refusal = participantActionRefusal({
        actor,
        targetRole: targetParticipant.role,
        floor: MemberRole.ADMIN,
      });
      if (refusal) {
        return sendForbidden(
          reply,
          refusal === 'below-floor'
            ? 'Vous n\'avez pas les droits pour modifier les rôles des participants'
            : 'Vous ne pouvez pas modifier le rang d\'un participant de rang égal ou supérieur au vôtre',
        );
      }

      // Le résolveur atteint désormais un visiteur SANS COMPTE ; l'événement qui
      // annonce le changement, non. `ParticipantRoleUpdatedEvent.userId` est
      // déclaré NON optionnel chez les trois clients (Android l'a déjà payé une
      // fois : un champ manquant y faisait lever `MissingFieldException`, avalée
      // par le `runCatching` du listener — plus AUCUN changement de rang
      // n'atteignait le trombinoscope, en silence). Émettre `null` ferait perdre
      // l'événement ENTIER, pas seulement ce champ (#4009).
      //
      // On refuse donc explicitement, plutôt que de mentir dans les deux sens :
      // 404 « introuvable » était faux — la ligne existe —, et servir la
      // mutation en perdant sa diffusion l'aurait été plus encore. Le jour où
      // les trois décodeurs acceptent `userId: null` + `participantId`, cette
      // garde tombe et rien d'autre ne bouge.
      if (!targetParticipant.userId) {
        return sendBadRequest(
          reply,
          'A participant without an account cannot hold a conversation rank yet',
          { code: 'PARTICIPANT_HAS_NO_ACCOUNT' },
        );
      }

      const targetUserId = targetParticipant.userId;
      const newRole = normalizedRole;
      await prisma.participant.update({
        where: {
          id: targetParticipant.id
        },
        data: {
          role: newRole
        }
      });

      const updatedRow = await prisma.participant.findUnique({
        where: { id: targetParticipant.id },
        include: participantListUserSelect
      });

      // Cette route servait `updatedRow` TEL QUEL sous la clé `participant`, que
      // `conversationParticipantSchema` déclare. La réponse REST est gatée par
      // le viewer DEMANDEUR (régime STRICT — self/ADMIN+/ami) : elle seule a
      // un destinataire nommé capable de porter une visibilité. La diffusion
      // Socket.IO plus bas n'en a pas — toute la salle la reçoit — donc son
      // `participant` ne transporte plus `isOnline`/`lastActiveAt` du tout,
      // gaté ou non ; le type partagé (`ParticipantRoleUpdatedEventData`) ne
      // les déclare déjà pas.
      const rolePresenceViewer = viewerFromRequest(request);
      const rolePresenceVis = updatedRow?.userId
        ? await getPresenceVisibilityService(prisma).resolveForTarget(rolePresenceViewer, {
            id: updatedRow.userId,
            deactivatedAt: updatedRow.user?.deactivatedAt ?? null
          })
        : presenceFor(rolePresenceViewer, new Map(), null);
      const updatedParticipant = updatedRow
        ? serializeConversationParticipant(updatedRow, { presence: rolePresenceVis })
        : null;
      const participantForBroadcast = updatedParticipant
        ? (() => {
            const { isOnline: _broadcastIsOnline, lastActiveAt: _broadcastLastActiveAt, ...rest } = updatedParticipant;
            return rest;
          })()
        : null;

      const manager = fastify.socketIOHandler?.getManager();
      if (manager) {
        // Thread-only À JUSTE TITRE, vérifié plutôt que déduit — noté ici pour
        // qu'un prochain balayage de `to(ROOMS.conversation(` ne le rouvre pas.
        // Aucune ligne de liste ne rend un rôle : les seuls consommateurs sont
        // les écrans de participants (web `use-participants`, iOS
        // `ParticipantsView` / `ConversationSocketHandler`), tous ouverts DANS
        // la conversation. Élargir l'audience coûterait une requête et
        // diffuserait la hiérarchie d'un groupe à des écrans qui ne l'affichent
        // pas. À revoir seulement si la ligne de liste se met à montrer un rang.
        manager.getIO().to(ROOMS.conversation(conversationId)).emit(SERVER_EVENTS.PARTICIPANT_ROLE_UPDATED, {
          conversationId,
          // La cible RÉSOLUE, jamais le segment d'URL : celui-ci peut porter un
          // `Participant.id`, et recopier un `Participant.id` dans un champ qui
          // déclare un `User.id` est exactement ce que le CLAUDE.md du gateway
          // interdit.
          userId: targetUserId,
          newRole,
          updatedBy: currentUserId,
          participant: participantForBroadcast
        });
        // Invalidate the in-process participant-ID cache so the next message:send
        // from this user re-validates membership/role against the DB instead of
        // serving a stale 5-minute cached entry.
        manager.invalidateParticipantCache?.(targetUserId, conversationId);
      }

      const notificationService = fastify.notificationService;
      if (notificationService) {
        notificationService.createMemberRoleChangedNotification({
          recipientUserId: targetUserId,
          changedByUserId: currentUserId,
          conversationId,
          newRole: newRole.toUpperCase() as 'ADMIN' | 'MODERATOR' | 'MEMBER',
          previousRole: targetParticipant.role,
        }).catch((err: unknown) => logger.error('Notification error role_changed', err as Error));
      }

      return sendSuccess(reply, {
        message: 'Rôle du participant mis à jour avec succès',
        userId: targetUserId,
        participantId: targetParticipant.id,
        role: newRole,
        participant: updatedParticipant
      });

    } catch (error) {
      logger.error('Error updating participant role', error as Error);
      return sendInternalError(reply, 'Error updating participant role');
    }
  });
}
