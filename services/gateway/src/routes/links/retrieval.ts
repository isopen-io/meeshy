import type { FastifyInstance, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { sendSuccess, sendForbidden, sendNotFound, sendInternalError } from '../../utils/response.js';
import { validatePagination } from '../../utils/pagination';
import {
  createUnifiedAuthMiddleware,
  UnifiedAuthRequest
} from '../../middleware/auth';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { applyPresenceVisibilityAsOffline } from '@meeshy/shared/utils/presence-visibility';
import { presenceMissingEntryPolicy, viewerFromRequest } from '../users/presence-gate';
import { createLegacyHybridRequest } from './utils/link-helpers';
import { historyReaderFromAuthContext, loadReaderHistoryFloor } from '../../services/historyFloor';
import {
  findShareLinkByIdentifier,
  getConversationMessages,
  countConversationMessages,
  findActiveUserParticipant,
  findLinkMembers,
  findLinkAnonymousParticipants,
  countLinkParticipantsByType,
  countOnlineAnonymousParticipants
} from './utils/prisma-queries';
import { formatMessageWithUnifiedSender } from './utils/message-formatters';
import {
  conversationSummarySchema,
  messageSchema,
  linkCurrentUserSchema,
  linkMemberSchema,
  linkAnonymousParticipantSchema
} from './types';

export async function registerRetrievalRoutes(fastify: FastifyInstance) {
  const authOptional = createUnifiedAuthMiddleware(fastify.prisma, {
    requireAuth: false,
    allowAnonymous: true
  });

  // Récupérer les informations d'un lien par linkId ou conversationShareLinkId
  fastify.get('/links/:identifier', {
    onRequest: [authOptional],
    schema: {
      description: 'Get detailed information about a share link including conversation details, participants, messages, and permissions. Supports both linkId (mshy_*), database ID (ObjectId), and custom identifier formats. Returns different data based on user type (member vs anonymous). Members of the conversation receive a redirectTo field pointing to the full conversation view.',
      tags: ['links'],
      summary: 'Get share link details',
      params: {
        type: 'object',
        required: ['identifier'],
        properties: {
          identifier: {
            type: 'string',
            description: 'Link identifier (linkId starting with mshy_, database ObjectId, or custom identifier)',
            example: 'mshy_67890abcdef12345_a1b2c3d4'
          }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          limit: {
            type: 'string',
            default: '50',
            description: 'Maximum number of messages to return',
            example: '50'
          },
          offset: {
            type: 'string',
            default: '0',
            description: 'Number of messages to skip for pagination',
            example: '0'
          }
        }
      },
      response: {
        200: {
          description: 'Share link details retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                conversation: conversationSummarySchema,
                link: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    linkId: { type: 'string' },
                    name: { type: 'string', nullable: true },
                    description: { type: 'string', nullable: true },
                    allowViewHistory: { type: 'boolean' },
                    allowAnonymousMessages: { type: 'boolean' },
                    allowAnonymousFiles: { type: 'boolean' },
                    allowAnonymousImages: { type: 'boolean' },
                    requireAccount: { type: 'boolean' },
                    requireEmail: { type: 'boolean' },
                    requireNickname: { type: 'boolean' },
                    requireBirthday: { type: 'boolean' },
                    expiresAt: { type: 'string', format: 'date-time', nullable: true },
                    isActive: { type: 'boolean' }
                  }
                },
                userType: { type: 'string', enum: ['member', 'anonymous'], description: 'Current user relationship to conversation' },
                redirectTo: { type: 'string', description: 'Redirect URL for members (e.g., /conversations/:id)' },
                messages: { type: 'array', items: messageSchema },
                stats: {
                  type: 'object',
                  properties: {
                    totalMessages: { type: 'number' },
                    totalMembers: { type: 'number' },
                    totalAnonymousParticipants: { type: 'number' },
                    onlineAnonymousParticipants: { type: 'number' },
                    hasMore: { type: 'boolean' },
                    // #4165 — `members`/`anonymousParticipants` sont désormais
                    // plafonnés (`LINK_PARTICIPANT_DISPLAY_CAP`) : ces deux
                    // champs disent au client qu'il y a plus à charger, comme
                    // `hasMore` le dit déjà pour `messages`. Additif : un client
                    // qui les ignore voit exactement la même réponse qu'avant.
                    membersHasMore: { type: 'boolean' },
                    anonymousParticipantsHasMore: { type: 'boolean' }
                  }
                },
                members: { type: 'array', items: linkMemberSchema },
                anonymousParticipants: { type: 'array', items: linkAnonymousParticipantSchema },
                currentUser: { ...linkCurrentUserSchema, nullable: true, description: 'Current user information with permissions' }
              }
            }
          }
        },
        403: {
          description: 'Access denied to this link',
          ...errorResponseSchema
        },
        404: {
          description: 'Share link not found',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: UnifiedAuthRequest, reply: FastifyReply) => {
    try {
      const { identifier } = request.params as { identifier: string };
      const hybridRequest = createLegacyHybridRequest(request);

      const shareLink = await findShareLinkByIdentifier(fastify.prisma, identifier);

      if (!shareLink) {
        return sendNotFound(reply, 'Lien de partage non trouvé');
      }

      // Aperçu public : la règle de repli, valable pour tout appelant qui n'est
      // ni membre ni participant anonyme de CE lien.
      const canPreview = shareLink.isActive && shareLink.allowViewHistory;

      // Vérifier les permissions d'accès. `memberRow` est une lecture CIBLÉE
      // (#4165), indexée sur (conversationId, userId) — indépendante de
      // l'effectif de la conversation — qui remplace l'ancien scan de la
      // relation `participants` chargée en bloc SANS `take`. Le cas nommé par
      // l'audit est justement "meeshy" : le salon public, potentiellement la
      // conversation la plus peuplée du produit, rechargée ENTIÈRE (avec
      // chaque ligne `User`) à CHAQUE appel de cette route non authentifiée.
      // `memberRow` sert la garde d'accès ET `userType` plus bas : un lecteur
      // admis par le cas spécial "meeshy" sans être réellement participant
      // reste `userType: 'anonymous'`, comme avant — `memberRow` ne porte PAS
      // ce cas spécial, volontairement (même comportement que l'ancien double
      // scan, qui ne l'appliquait qu'à `hasAccess`).
      const memberRow = hybridRequest.isAuthenticated && hybridRequest.user
        ? await findActiveUserParticipant(fastify.prisma, shareLink.conversationId, hybridRequest.user.id)
        : null;

      let hasAccess = false;

      if (hybridRequest.isAuthenticated && hybridRequest.user) {
        if (shareLink.conversation.identifier === "meeshy") {
          hasAccess = true;
        } else {
          // Un compte connecté qui n'est pas encore membre voit le MÊME aperçu
          // qu'un visiteur déconnecté : être identifié ne doit jamais donner
          // moins d'accès que la navigation privée. Le client enchaîne sur la
          // modale « Rejoindre ».
          hasAccess = memberRow !== null || canPreview;
        }
      } else if (hybridRequest.isAnonymous && hybridRequest.anonymousParticipant) {
        hasAccess = hybridRequest.anonymousParticipant.shareLinkId === shareLink.id;
      } else {
        hasAccess = canPreview;
      }

      if (!hasAccess) {
        return sendForbidden(reply, 'Accès non autorisé à ce lien');
      }

      const { limit: limitStr, offset: offsetStr } = request.query as { limit?: string; offset?: string };
      // SSOT guard: string-schema pagination (no AJV coercion). Raw parseInt
      // yielded `NaN`/negative skip/take on malformed input, with no upper cap.
      const { limit, offset } = validatePagination(offsetStr, limitStr, { defaultLimit: 50, maxLimit: 100 });

      // Le plancher du LECTEUR — requête ciblée par la SSOT partagée
      // (`loadReaderHistoryFloor`, déjà celle de `/conversations/:id/reactions`
      // et `/conversations/:id/status`) plutôt qu'un scan de la relation
      // chargée en bloc (#4165). Un visiteur en simple aperçu n'a pas de
      // ligne : rien ne le borne, et c'est juste, `canPreview` exige déjà
      // `allowViewHistory`.
      const reader = historyReaderFromAuthContext(request.authContext);
      const historyFloor = await loadReaderHistoryFloor(fastify.prisma, {
        conversationId: shareLink.conversationId,
        reader,
        link: shareLink
      });

      const messages = await getConversationMessages(
        fastify.prisma,
        shareLink.conversationId,
        limit,
        offset,
        { historyFloor }
      );

      const totalMessages = await countConversationMessages(fastify.prisma, shareLink.conversationId, { historyFloor });

      const formattedMessages = messages.map(formatMessageWithUnifiedSender);

      // Déterminer le type d'utilisateur et les données de l'utilisateur actuel
      let userType: 'anonymous' | 'member';
      let currentUser: any = null;

      if (hybridRequest.isAuthenticated && hybridRequest.user) {
        userType = memberRow !== null ? 'member' : 'anonymous';
        currentUser = {
          id: hybridRequest.user.id,
          username: hybridRequest.user.username,
          firstName: hybridRequest.user.firstName,
          lastName: hybridRequest.user.lastName,
          displayName: hybridRequest.user.displayName,
          language: hybridRequest.user.systemLanguage,
          isMeeshyer: true,
          permissions: {
            canSendMessages: true,
            canSendFiles: true,
            canSendImages: true
          }
        };
      } else if (hybridRequest.isAnonymous && hybridRequest.anonymousParticipant) {
        userType = 'anonymous';
        const participant = hybridRequest.anonymousParticipant;
        currentUser = {
          id: participant.id,
          username: participant.username,
          firstName: participant.firstName,
          lastName: participant.lastName,
          displayName: undefined,
          language: participant.language,
          isMeeshyer: false,
          permissions: {
            canSendMessages: participant.canSendMessages,
            canSendFiles: participant.canSendFiles,
            canSendImages: participant.canSendImages
          }
        };
      }

      // Cette route est CONSULTABLE SANS AUTHENTIFICATION (`onRequest:
      // [authOptional]`) : `viewer` est `null` pour l'immense majorité des
      // appels. Un participant anonyme n'a pas de `userId` — pas de ligne
      // `User`, donc pas d'amitié ni de préférences à résoudre — seul le
      // bypass ADMIN/BIGBOSS de la directive produit du 2026-08-25
      // s'applique : « personne ne doit savoir ma dernière connexion si on
      // n'est pas ami », et un visiteur d'un lien public n'est jamais un ami.
      const viewer = viewerFromRequest(request);
      // Le verdict d'une cible que le résolveur ne sait pas résoudre est CELUI
      // DE LA LOI (`presenceMissingEntryPolicy` : `'reveal'` pour ADMIN/BIGBOSS,
      // `'hide'` sinon), jamais un prédicat de rôle réécrit ici — « aucun site
      // de service ne réécrit la boucle amitié/rôle ». Le site en tire les deux
      // formes dont il a besoin : la POLITIQUE, qui gouverne la projection de
      // chaque ligne, et le BOOLÉEN, qui décide si l'agrégat vaut une requête.
      const anonymousPresence = presenceMissingEntryPolicy(viewer);
      const anonymousPresenceVisible = anonymousPresence === 'reveal';

      // BORNÉ (#4165). `shareLinkIncludeStructure` chargeait `participants`
      // SANS `take` : sur "meeshy" (voir plus haut), cette route servait
      // TOUTE la conversation à chaque appel — membres, participants anonymes,
      // leur ligne `User`/session. `members`/`anonymousParticipantRows` sont
      // désormais deux pages (`LINK_PARTICIPANT_DISPLAY_CAP`) ; les effectifs
      // de `stats` sont des `.count()`, vrais quel que soit le plafond
      // d'affichage — une longueur de tableau tronqué aurait menti. La requête
      // de présence en ligne n'est posée QUE si `anonymousPresenceVisible` :
      // c'est le même repli `0` qu'avant pour tout lecteur non-ADMIN.
      const [members, anonymousParticipantRows, participantCounts, onlineAnonymousParticipants] = await Promise.all([
        findLinkMembers(fastify.prisma, shareLink.conversationId),
        findLinkAnonymousParticipants(fastify.prisma, shareLink.conversationId),
        countLinkParticipantsByType(fastify.prisma, shareLink.conversationId),
        anonymousPresenceVisible
          ? countOnlineAnonymousParticipants(fastify.prisma, shareLink.conversationId)
          : Promise.resolve(0)
      ]);

      // `isOnline` ET `lastActiveAt` tombent sous le MÊME prédicat : la
      // directive retient les deux hors amitié / soi / ADMIN+, et le web
      // (`participant-mapper.ts` → `StreamSidebar`) dérive une pastille de
      // `lastActiveAt` via `getUserPresenceStatus` — masquer l'un en laissant
      // l'autre ne masque rien. La valeur servie à l'ADMIN est la dernière
      // activité RÉELLE (`Participant.lastActiveAt`, écrite par `StatusService`),
      // jamais `joinedAt` : une date d'arrivée n'est pas une dernière activité.
      const gatedAnonymousParticipants = anonymousParticipantRows.map(participant =>
        applyPresenceVisibilityAsOffline(
          {
            id: participant.id,
            username: participant.anonymousSession?.profile?.username ?? null,
            firstName: participant.anonymousSession?.profile?.firstName ?? null,
            lastName: participant.anonymousSession?.profile?.lastName ?? null,
            displayName: participant.displayName,
            avatar: participant.avatar,
            language: participant.language,
            isOnline: participant.isOnline,
            lastActiveAt: participant.lastActiveAt,
            joinedAt: participant.joinedAt,
            canSendMessages: participant.permissions?.canSendMessages ?? false,
            canSendFiles: participant.permissions?.canSendFiles ?? false,
            canSendImages: participant.permissions?.canSendImages ?? false
          },
          undefined,
          { onMissingEntry: anonymousPresence }
        ));

      const stats = {
        totalMessages,
        totalMembers: participantCounts.totalMembers,
        totalAnonymousParticipants: participantCounts.totalAnonymousParticipants,
        onlineAnonymousParticipants,
        hasMore: totalMessages > offset + messages.length,
        // #4165 — critère 2 : de quoi demander la suite sur les deux listes
        // qui viennent d'être plafonnées. Additif ; un client qui les ignore
        // voit exactement la même réponse qu'avant.
        membersHasMore: participantCounts.totalMembers > members.length,
        anonymousParticipantsHasMore: participantCounts.totalAnonymousParticipants > gatedAnonymousParticipants.length
      };

      return sendSuccess(reply, {
          conversation: {
            id: shareLink.conversation.id,
            title: shareLink.conversation.title,
            description: shareLink.conversation.description,
            type: shareLink.conversation.type,
            createdAt: shareLink.conversation.createdAt,
            updatedAt: shareLink.conversation.createdAt
          },
          link: {
            id: shareLink.id,
            linkId: shareLink.linkId,
            name: shareLink.name,
            description: shareLink.description,
            allowViewHistory: shareLink.allowViewHistory,
            allowAnonymousMessages: shareLink.allowAnonymousMessages,
            allowAnonymousFiles: shareLink.allowAnonymousFiles,
            allowAnonymousImages: shareLink.allowAnonymousImages,
            requireAccount: shareLink.requireAccount,
            requireEmail: shareLink.requireEmail,
            requireNickname: shareLink.requireNickname,
            requireBirthday: shareLink.requireBirthday,
            expiresAt: shareLink.expiresAt?.toISOString() || null,
            isActive: shareLink.isActive
          },
          userType,
          ...(userType === 'member' && {
            redirectTo: `/conversations/${shareLink.conversationId}`
          }),
          messages: formattedMessages.reverse(),
          stats,
          members: members.map(member => ({
            id: member.id,
            role: member.role,
            joinedAt: member.joinedAt,
            user: {
              id: member.user.id,
              username: member.user.username,
              firstName: member.user.firstName,
              lastName: member.user.lastName,
              displayName: member.user.displayName,
              avatar: member.user.avatar,
              // Lien de partage consultable sans authentification : ne jamais
              // divulguer la présence réelle des membres — ni `isOnline`, ni
              // `lastActiveAt`, dont le web dérive une pastille. Le `joinedAt`
              // (non sensible) reste servi sous son propre nom, un niveau plus
              // haut ; il ne se déguise plus en dernière activité.
              isOnline: false,
              lastActiveAt: null
            }
          })),
          // L'identité d'un participant anonyme vit dans
          // `anonymousSession.profile` et ses droits dans `permissions` : le
          // modèle Prisma `Participant` ne porte ni `username` ni `firstName`,
          // et surtout pas de `canSend*` à plat. Le reste de l'enveloppe
          // `anonymousSession` (hash de jeton, IP, empreinte appareil) ne sort
          // JAMAIS de la gateway — d'où le `select` restreint à `profile`.
          // `isOnline` ET `lastActiveAt` sont gatés ci-dessus
          // (`gatedAnonymousParticipants`) — `false` / `null` sauf pour un
          // viewer ADMIN/BIGBOSS.
          anonymousParticipants: gatedAnonymousParticipants,
          currentUser
        });

    } catch (error) {
      logError(fastify.log, 'Get link info error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
