import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MemberRole } from '@meeshy/shared/types/role-types';
import { actorHasMinimumRole } from '../../utils/conversation-authority';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { UnifiedAuthRequest } from '../../middleware/auth';
import {
  conversationParticipantSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import { sendSuccess, sendBadRequest, sendUnauthorized, sendForbidden, sendNotFound, sendInternalError, sendError } from '../../utils/response';
import { invalidateParticipantLookup } from '../../utils/participant-lookup-cache';
import { postJoinSystemMessage } from '../../services/conversations/joinSystemMessage';
import { noticeActor } from '../../services/conversations/conversationNotice';
import { NEW_MEMBER_PERMISSIONS } from '../../services/participantRights';
import {
  resolveConversationEntry,
  REJOIN_PARTICIPANT_STATE
} from '../../services/conversations/conversationEntryAdmission';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../../utils/recipient-language';
import { announceConversationLanguageChange } from '../../services/message-translation/conversationLanguageChanges';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { EngagementService } from '../../services/engagement/EngagementService';
import { serializeConversationParticipant } from '@meeshy/shared/utils/participant-helpers';
import { getPresenceVisibilityService } from '../../services/PresenceVisibilityService';
import { viewerFromRequest } from '../users/presence-gate';

const logger = enhancedLogger.child({ module: 'ConversationInviteRoute' });

/**
 * L'enveloppe rendue par `POST /conversations/:id/new-link`.
 *
 * Exportée pour être exerçable : un test de route mocke `sendSuccess` et
 * n'exerce donc JAMAIS le schéma de réponse — or c'est là que vivait le défaut.
 *
 * Ce schéma déclarait `data: { properties: { link: { type: 'object' } } }`,
 * ce qui se trompait deux fois sur la seule clé nommée : `link` est la chaîne
 * de l'URL d'invitation (sérialisée contre un schéma d'objet, elle sortait
 * `{}`), et `code` / `shareLink` n'étaient pas déclarés du tout, donc retirés.
 * La création rendait `{"success":true,"data":{"link":{}}}` — ni lien, ni code,
 * ni réglages.
 *
 * Les trois clients créent aujourd'hui leurs liens par `POST /links`, ce qui a
 * laissé le défaut vivre sans victime. La porte reste servie : elle doit rendre
 * ce qu'elle produit.
 */

/**
 * `POST /conversations/:id/invite` — un inscrit ajouté par un membre. Extrait
 * de `sharing.ts` (budget de taille), qui garde les liens de partage.
 */
export function registerInviteRoute(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  engagement: Pick<EngagementService, 'recordActivity'>
) {
  // Route pour inviter un utilisateur à une conversation
  fastify.post('/conversations/:id/invite', {
    schema: {
      description: 'Invite a user to join a conversation - creates membership and sends notification',
      tags: ['conversations', 'participants'],
      summary: 'Invite user to conversation',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID' }
        }
      },
      body: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string', description: 'ID of user to invite' }
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
                message: { type: 'string', example: 'User invited successfully' },
                // `membership` déclaré / `member` envoyé : le nouvel adhérent
                // n'a JAMAIS atteint le fil. Aligné sur le nom que portent ses
                // deux voisines (`PATCH …/role`, la liste) — on ne casse pas un
                // contrat qui n'a jamais été honoré.
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
    onRequest: [fastify.authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'User not authenticated');
      }

      const { id: conversationId } = request.params as { id: string };
      const { userId } = request.body as { userId: string };
      const inviterId = authContext.userId;

      // Vérifier que la conversation existe
      const conversation = await fastify.prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          participants: {
            where: { isActive: true, type: 'user' },
            select: {
              id: true,
              userId: true,
              role: true,
              // #7593 — l'inviteur est l'ACTEUR de l'avis : « Demo a ajouté X ».
              displayName: true,
              user: {
                select: {
                  id: true,
                  username: true,
                  role: true
                }
              }
            }
          }
        }
      });

      if (!conversation) {
        return sendNotFound(reply, 'Conversation not found');
      }

      // Vérifier que l'inviteur est membre de la conversation
      const inviterMember = conversation.participants.find(m => m.userId === inviterId);
      if (!inviterMember) {
        return sendForbidden(reply, 'Vous n\'êtes pas membre de cette conversation');
      }

      // #4557 — **MODERATOR, le même plancher que `POST …/participants`.**
      //
      // Cette porte exigeait ADMIN pour un geste dont l'autre se contente d'un
      // modérateur, alors que les deux produisent la MÊME ligne : ni l'une ni
      // l'autre ne crée d'invitation EN ATTENTE — elles écrivent un
      // `Participant` immédiatement ACTIF, `role: 'member'`, avec la table
      // `NEW_MEMBER_PERMISSIONS` du site unique (#4174), par le même
      // `resolveConversationEntry`. « Inviter » nomme ici un ajout direct.
      //
      // Le rang plus haut ne retenait donc rien : un modérateur à qui cette
      // porte refusait quelqu'un l'ajoutait par l'autre, dans la seconde, avec
      // les mêmes droits et un éventail de diffusion PLUS complet. C'était une
      // incohérence (dimension 6), pas une protection.
      //
      // L'alignement se fait vers le BAS, seul sens non régressif : monter
      // `participants` à ADMIN retirerait aux modérateurs une capacité VIVANTE
      // — les trois clients passent par cette porte-là — pour fermer une porte
      // que plus aucun client n'appelle. Le plancher LUI-MÊME (un modérateur
      // peut-il ajouter ?) est inchangé ; le déplacer serait une décision
      // produit. Gardé par `conversation-new-member-rights-parity.test.ts`,
      // qui COMPARE les deux portes — un témoin posé sur une seule ne pourrait
      // pas rougir d'une redivergence.
      const canInvite = actorHasMinimumRole(
        {
          conversationRole: inviterMember.role,
          platformRole: authContext.registeredUser.role,
        },
        MemberRole.MODERATOR,
      );

      if (!canInvite) {
        return sendForbidden(reply, 'Vous n\'avez pas les permissions pour inviter des utilisateurs');
      }

      // Vérifier que l'utilisateur à inviter existe
      const userToInvite = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          displayName: true,
          firstName: true,
          lastName: true,
          ...RECIPIENT_LANG_SELECT,
          deactivatedAt: true
        }
      });

      if (!userToInvite) {
        return sendNotFound(reply, 'User not found');
      }

      // `conversation.participants` est chargé avec `where: { isActive: true }` :
      // il ne pouvait donc PAS voir la ligne d'un banni ni celle d'un ancien
      // membre, et le `create` qui suit leur fabriquait une ligne neuve et
      // active — un bannissement défait sans passer par `POST …/unban`, plus une
      // seconde ligne `Participant` pour la même paire.
      const entry = await resolveConversationEntry({
        prisma: fastify.prisma,
        conversationId,
        userId,
        // Déjà chargée pour vérifier l'appartenance de l'inviteur — inviter dans
        // un fil terminé donnait une ligne active dans une conversation que
        // `GET /conversations` ne rend plus et où le premier message est refusé.
        conversation,
      });

      if (entry.outcome === 'closed') {
        return sendError(reply, 410, 'Cette conversation est terminée');
      }

      if (entry.outcome === 'banned') {
        return sendForbidden(reply, 'This user is banned from the conversation — lift the ban first');
      }

      if (entry.outcome === 'already-member') {
        return sendBadRequest(reply, 'This user is already a member of the conversation');
      }

      // #4174 — la table de droits vient du site UNIQUE
      // (`services/participantRights.ts`). Elle était écrite ICI, et elle
      // DIFFÉRAIT de celle que `POST …/participants` posait pour le même
      // geste : `canSendVideos` et `canSendAudios` y valaient `false`. Le
      // même utilisateur, ajouté au même groupe, recevait donc des droits
      // différents selon le bouton employé — alors que les deux portes
      // partagent le résolveur d'admission, produisent la même ligne de rôle
      // `member`, et sont déclenchées par le même écran.
      const invitedMemberFields = {
        type: 'user',
        displayName: userToInvite.displayName || userToInvite.username,
        role: 'member',
        // #9711 — la langue de l'INVITÉ, descendue de son prisme, jamais le
        // défaut `"en"` du schéma.
        language: recipientLanguage(userToInvite, 'fr'),
        permissions: { ...NEW_MEMBER_PERMISSIONS }
      };

      // La mise en garde qui vivait ici — « ne rien charger qu'aucune surface ne
      // sert, sinon le jour où la dérive `member`/`membership` est corrigée, la
      // présence brute d'un invité part sur le fil » — est LEVÉE, parce que le
      // jour est arrivé et que le gate arrive avec. Le rang ne part plus jamais
      // brut : `serializeConversationParticipant` est le seul chemin vers le fil,
      // et il exige qu'on lui passe la visibilité.
      const invitedMemberInclude = {
        user: {
          select: {
            id: true,
            username: true,
            displayName: true,
            firstName: true,
            lastName: true,
            avatar: true,
            role: true,
            systemLanguage: true,
            regionalLanguage: true,
            customDestinationLanguage: true,
            createdAt: true,
            updatedAt: true
          }
        }
      };

      const newMember = entry.outcome === 'rejoin' && entry.participantId
        ? await fastify.prisma.participant.update({
            where: { id: entry.participantId },
            data: { ...invitedMemberFields, ...REJOIN_PARTICIPANT_STATE },
            include: invitedMemberInclude
          })
        : await fastify.prisma.participant.create({
            data: {
              conversationId: conversationId,
              userId: userId,
              ...invitedMemberFields,
              joinedAt: new Date(),
              isActive: true
            },
            include: invitedMemberInclude
          });

      if (entry.outcome === 'rejoin' && entry.participantId) {
        invalidateParticipantLookup(entry.participantId, conversationId);
      }
      announceConversationLanguageChange({ kind: 'arrival', conversationId, language: invitedMemberFields.language, readerUserId: userId });

      // `social.conversation_invite` (#8959) — même crédit que
      // `POST …/participants` : une fois par personne et par conversation.
      if (inviterId && inviterId !== userId) {
        engagement
          .recordActivity(inviterId, 'social.conversation_invite', { targetId: `${conversationId}:${userId}` })
          .catch((err: unknown) => logger.warn('engagement social.conversation_invite failed', { err }));
      }

      // Annoncer l'arrivée — troisième des quatre portes, même loi.
      await postJoinSystemMessage(
        {
          prisma: fastify.prisma,
          broadcast: (message, targetConversationId) =>
            fastify.socketIOHandler?.getManager()?.broadcastMessage(message as never, targetConversationId)
              ?? Promise.resolve()
        },
        {
          conversationId,
          participantId: newMember.id,
          displayName: invitedMemberFields.displayName,
          isAnonymous: false,
          viaShareLink: false,
          addedBy: noticeActor(inviterMember)
        }
      );

      // Auto-join the invited user's currently-connected sockets to the
      // conversation room so they receive message:new events immediately
      // without a reconnect (mirrors POST /conversations/:id/participants).
      const inviteSocketManager = fastify.socketIOHandler?.getManager();
      if (inviteSocketManager) {
        inviteSocketManager.joinUserToConversationRoom(userId, conversationId).catch(
          (err: unknown) => logger.error('Failed to auto-join invited user to conversation room', err as Error)
        );
      }

      // Envoyer une notification à l'utilisateur invité
      const notificationService = fastify.notificationService;
      if (notificationService) {
        try {
          // Récupérer les informations de l'inviteur
          const inviter = await fastify.prisma.user.findUnique({
            where: { id: inviterId },
            select: {
              username: true,
              displayName: true,
              avatar: true
            }
          });

          if (inviter) {
            await notificationService.createConversationInviteNotification({
              invitedUserId: userId,
              inviterId: inviterId,
              inviterUsername: inviter.displayName || inviter.username,
              inviterAvatar: inviter.avatar || undefined,
              conversationId: conversationId,
              conversationTitle: conversation.title,
              conversationType: conversation.type
            });
            logger.debug('Notification invitation envoyée');
          }
        } catch (notifError) {
          logger.error('Erreur envoi notification invitation', notifError as Error);
          // Ne pas bloquer l'invitation
        }
      }

      // PERFORMANCE: Invalider le cache d'autocomplete car la liste des membres a changé
      const mentionService = fastify.mentionService;
      if (mentionService) {
        try {
          await mentionService.invalidateCacheForConversation(conversationId);
          logger.debug('Cache autocomplete invalidé');
        } catch (cacheError) {
          logger.error('Erreur invalidation cache', cacheError as Error);
          // Ne pas bloquer l'invitation
        }
      }

      // Régime STRICT (2026-08-25) : partager une conversation n'ouvre plus
      // rien — la réponse à l'inviteur montre la présence de l'invité selon
      // SA propre autorisation (soi/ADMIN+/ami), jamais sur la seule
      // co-participation qu'il vient de créer.
      const inviteViewer = viewerFromRequest(request);
      const invitePresenceVis = await getPresenceVisibilityService(prisma).resolveForTarget(
        inviteViewer,
        { id: userId, deactivatedAt: userToInvite.deactivatedAt ?? null }
      );

      return sendSuccess(reply, {
        participant: serializeConversationParticipant(newMember, {
          presence: invitePresenceVis
        }),
        message: `${userToInvite.displayName || userToInvite.username} a été invité à la conversation`
      });

    } catch (error) {
      logger.error('Erreur invitation', error as Error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
