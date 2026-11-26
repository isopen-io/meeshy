import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MemberRole } from '@meeshy/shared/types/role-types';
import { actorHasMinimumRole } from '@meeshy/shared/utils/conversation-authority';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { newMemberRefusal } from '../../services/conversations/newMemberAdmission';
import { PARTICIPATION_VIVANTE } from './utils/access-control';
import { UnifiedAuthRequest } from '../../middleware/auth';
import {
  conversationParticipantSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import { sendSuccess, sendBadRequest, sendUnauthorized, sendForbidden, sendNotFound, sendInternalError, sendError } from '../../utils/response';
import { refuserCommeIntrouvable } from './utils/access-control';
import { noticeActor } from '../../services/conversations/conversationNotice';
import {
  admitConversationMember,
  type ParticipantAdmissionVerdict,
  type ParticipantInviteEngagement,
} from '../../services/conversations/memberAdmission';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { serializeConversationParticipant } from '@meeshy/shared/utils/participant-helpers';
import { getPresenceVisibilityService } from '../../services/PresenceVisibilityService';
import { viewerFromRequest } from '../users/presence-gate';
import { loadSalonCommunity } from '../../services/conversations/communityMembershipSync';

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
 * Les refus de la forme historique — les codes que les appelants de cette porte
 * lisent (400 déjà membre, 403 banni, 404 inconnu), traduits du verdict de
 * l'admission partagée. Un verdict d'admission (`new`, `rejoin`) n'y figure pas.
 */
const INVITE_REFUSALS: Partial<Record<ParticipantAdmissionVerdict['outcome'], (reply: FastifyReply) => void>> = {
  'not-found': (reply) => sendNotFound(reply, 'User not found'),
  banned: (reply) => sendForbidden(reply, 'This user is banned from the conversation — lift the ban first'),
  'already-member': (reply) => sendBadRequest(reply, 'This user is already a member of the conversation'),
  'community-forbidden': (reply) =>
    sendForbidden(reply, 'Only admins and moderators can add people to a private community', { code: 'COMMUNITY_INVITE_FORBIDDEN' }),
};

/**
 * La ligne relue pour la réponse. Le rang ne part jamais brut :
 * `serializeConversationParticipant` est le seul chemin vers le fil, et il
 * exige la visibilité de présence ; `anonymousSession` est requis par la
 * fabrique (#20292) et vaut `null` pour un inscrit.
 */
const INVITED_MEMBER_INCLUDE = {
  anonymousSession: { select: { rights: true } },
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
      deactivatedAt: true,
      createdAt: true,
      updatedAt: true
    }
  }
} as const;

/**
 * `POST /conversations/:id/invite` — un inscrit ajouté par un membre. Extrait
 * de `sharing.ts` (budget de taille), qui garde les liens de partage.
 */
export function registerInviteRoute(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  engagement: ParticipantInviteEngagement
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
            // #20104 — la PARTICIPATION VIVANTE, et dans la CLAUSE : c'est le
            // seul endroit qu'un balayage de source sait lire (#20050). Cette
            // liste a UN consommateur dans cette route — la porte de l'inviteur
            // vingt lignes plus bas — et un membre actif-et-banni la franchissait,
            // faisant entrer qui il veut dans une conversation dont il est exclu ;
            // « inviter » écrit ici un `Participant` immédiatement ACTIF.
            //
            // L'inventaire du cliquet d'audiences classait ce site
            // « porte-sur-un-sur-ensemble » en interdisant de resserrer, au motif
            // que « la même lecture tient `newMemberRefusal`, un refus par
            // égalité exacte ». **Mesuré faux** : `newMemberRefusal` ne lit que
            // `type` et `encryptionMode` (`conversations/newMemberAdmission.ts`)
            // — le tête-à-tête chiffré de #16188 se tient par `isEndToEndDirect`,
            // qui ne compte personne. Et `resolveConversationEntry` relit ses
            // propres lignes avec leur `bannedAt` ; `isConversationClosed` ne lit
            // que des colonnes de la conversation. Aucun refus ne dépend du
            // sur-ensemble ici, donc rien n'oblige à juger la loi en code.
            where: { ...PARTICIPATION_VIVANTE, type: 'user' },
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
        return refuserCommeIntrouvable(reply);
      }

      // Vérifier que l'inviteur est membre de la conversation
      const inviterMember = conversation.participants.find(m => m.userId === inviterId);
      if (!inviterMember) {
        return sendForbidden(reply, 'Vous n\'êtes pas membre de cette conversation');
      }

      // #17117 — une conversation externe n'a qu'un membre Meeshy, son ouvreur ;
      // #16188 — un tête-à-tête chiffré de bout en bout reste à deux.
      const closedToNewMembers = newMemberRefusal(conversation);
      if (closedToNewMembers) {
        return sendError(reply, 409, closedToNewMembers.message, { code: closedToNewMembers.code });
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

      // #4557 (critère 2) — **un ADAPTATEUR de la porte d'ajout, jamais une
      // copie.** Tout ce qui suit le rang — lecture de la cible, résolution
      // d'entrée, écriture ou rejoin, admission communautaire, avis
      // d'arrivée, les trois diffusions d'adhésion, notifications, crédit
      // d'engagement — est `admitConversationMember`, la même fonction que
      // `POST …/participants` appelle pour chaque identifiant de son lot.
      // L'implémentation recopiée qui vivait ici divergeait encore : ni
      // `avatar` sur la ligne, aucune notification aux membres présents.
      // Seuls restent ici la réponse historique et ses codes d'erreur.
      if (conversation.isActive === false || conversation.closedAt) {
        return sendError(reply, 410, 'Cette conversation est terminée');
      }

      const socketManager = fastify.socketIOHandler?.getManager();
      const community = await loadSalonCommunity(fastify.prisma, { communityId: conversation.communityId, actorId: inviterId });
      const verdict = await admitConversationMember(
        {
          prisma: fastify.prisma,
          io: socketManager?.getIO?.(),
          joinRoom: socketManager ? (target, room) => socketManager.joinUserToConversationRoom(target, room) : null,
          broadcastMessage: (message, room) => socketManager?.broadcastMessage(message as never, room) ?? Promise.resolve(),
          notificationService: fastify.notificationService,
          engagement,
        },
        { conversationId, conversation, userId, currentUserId: inviterId, addedBy: noticeActor(inviterMember), community }
      );

      const refusal = INVITE_REFUSALS[verdict.outcome];
      if (refusal) return refusal(reply);

      const mentionService = fastify.mentionService;
      if (mentionService) {
        await mentionService.invalidateCacheForConversation(conversationId)
          .catch((cacheError: unknown) => logger.error('Erreur invalidation cache', cacheError as Error));
      }

      const newMember = verdict.participantId
        ? await fastify.prisma.participant.findUnique({ where: { id: verdict.participantId }, include: INVITED_MEMBER_INCLUDE })
        : null;
      if (!newMember || !newMember.user) {
        return sendNotFound(reply, 'User not found');
      }

      // Régime STRICT (2026-08-25) : partager une conversation n'ouvre plus
      // rien — la réponse à l'inviteur montre la présence de l'invité selon
      // SA propre autorisation (soi/ADMIN+/ami), jamais sur la seule
      // co-participation qu'il vient de créer.
      const invitePresenceVis = await getPresenceVisibilityService(prisma).resolveForTarget(
        viewerFromRequest(request),
        { id: userId, deactivatedAt: newMember.user.deactivatedAt ?? null }
      );

      const invitedName = newMember.user.displayName || newMember.user.username;
      return sendSuccess(reply, {
        participant: serializeConversationParticipant(newMember, {
          presence: invitePresenceVis
        }),
        message: `${invitedName} a été invité à la conversation`
      });

    } catch (error) {
      logger.error('Erreur invitation', error as Error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
