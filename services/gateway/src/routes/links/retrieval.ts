import type { FastifyInstance, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { sendSuccess, sendForbidden, sendNotFound, sendInternalError } from '../../utils/response.js';
import { validatePagination } from '../../utils/pagination';
import {
  createUnifiedAuthMiddleware,
  UnifiedAuthRequest
} from '../../middleware/auth';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { isGlobalAdmin } from '@meeshy/shared/types/role-types';
import { viewerFromRequest } from '../users/presence-gate';
import { createLegacyHybridRequest } from './utils/link-helpers';
import { findShareLinkByIdentifier, getConversationMessages, countConversationMessages } from './utils/prisma-queries';
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
                    hasMore: { type: 'boolean' }
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

      // Vérifier les permissions d'accès
      let hasAccess = false;

      if (hybridRequest.isAuthenticated && hybridRequest.user) {
        if (shareLink.conversation.identifier === "meeshy") {
          hasAccess = true;
        } else {
          const isMember = shareLink.conversation.participants.filter(p => p.type === "user").some(
            member => member.userId === hybridRequest.user.id && member.isActive
          );
          // Un compte connecté qui n'est pas encore membre voit le MÊME aperçu
          // qu'un visiteur déconnecté : être identifié ne doit jamais donner
          // moins d'accès que la navigation privée. Le client enchaîne sur la
          // modale « Rejoindre ».
          hasAccess = isMember || canPreview;
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

      const messages = await getConversationMessages(
        fastify.prisma,
        shareLink.conversationId,
        limit,
        offset
      );

      const totalMessages = await countConversationMessages(fastify.prisma, shareLink.conversationId);

      const formattedMessages = messages.map(formatMessageWithUnifiedSender);

      // Déterminer le type d'utilisateur et les données de l'utilisateur actuel
      let userType: 'anonymous' | 'member';
      let currentUser: any = null;

      if (hybridRequest.isAuthenticated && hybridRequest.user) {
        const isMember = shareLink.conversation.participants.filter(p => p.type === "user").some(
          member => member.userId === hybridRequest.user.id && member.isActive
        );
        userType = isMember ? 'member' : 'anonymous';
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
      const anonymousPresenceVisible = !!viewer && isGlobalAdmin(viewer.role);

      // Construite UNE fois : la liste servie ET le compteur agrégé lisent la
      // MÊME présence gatée, pour que `stats.onlineAnonymousParticipants` ne
      // soit jamais un `0` fabriqué à côté — c'est la loi appliquée à un
      // agrégat, pas une seconde règle à tenir synchronisée avec la première.
      //
      // `isOnline` ET `lastActiveAt` tombent sous le MÊME prédicat : la
      // directive retient les deux hors amitié / soi / ADMIN+, et le web
      // (`participant-mapper.ts` → `StreamSidebar`) dérive une pastille de
      // `lastActiveAt` via `getUserPresenceStatus` — masquer l'un en laissant
      // l'autre ne masque rien. La valeur servie à l'ADMIN est la dernière
      // activité RÉELLE (`Participant.lastActiveAt`, écrite par `StatusService`),
      // jamais `joinedAt` : une date d'arrivée n'est pas une dernière activité.
      const gatedAnonymousParticipants = shareLink.conversation.participants
        .filter(p => p.type === "anonymous")
        .map(participant => ({
          id: participant.id,
          username: participant.anonymousSession?.profile?.username ?? null,
          firstName: participant.anonymousSession?.profile?.firstName ?? null,
          lastName: participant.anonymousSession?.profile?.lastName ?? null,
          displayName: participant.displayName,
          avatar: participant.avatar,
          language: participant.language,
          isOnline: anonymousPresenceVisible ? participant.isOnline : false,
          lastActiveAt: anonymousPresenceVisible ? participant.lastActiveAt : null,
          joinedAt: participant.joinedAt,
          canSendMessages: participant.permissions?.canSendMessages ?? false,
          canSendFiles: participant.permissions?.canSendFiles ?? false,
          canSendImages: participant.permissions?.canSendImages ?? false
        }));

      const stats = {
        totalMessages,
        totalMembers: shareLink.conversation.participants.filter(p => p.type === "user").length,
        totalAnonymousParticipants: gatedAnonymousParticipants.length,
        onlineAnonymousParticipants: gatedAnonymousParticipants.filter(p => p.isOnline).length,
        hasMore: totalMessages > offset + messages.length
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
          members: shareLink.conversation.participants.filter(p => p.type === "user").map(member => ({
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
