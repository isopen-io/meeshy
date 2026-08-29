import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { buildPaginationMeta } from '../../utils/pagination';
import { sendSuccess, sendPaginatedSuccess, sendUnauthorized, sendNotFound, sendInternalError } from '../../utils/response.js';
import {
  userMinimalSchema,
  userStatsSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import type { AuthenticatedRequest, UserIdParams, SearchQuery } from './types';
import { validatePagination } from '../../utils/pagination';
import { mayOrderByRawPresence, servedOnlineFirst, viewerFromRequest } from './presence-gate';
import { applyPresenceVisibilityAsOffline } from '@meeshy/shared/utils/presence-visibility';
import { isValidObjectId } from '@meeshy/shared/utils/object-id';
import { resolveParticipantAvatar } from '@meeshy/shared/utils/participant-helpers';
import { getPresenceVisibilityService } from '../../services/PresenceVisibilityService';
import { createDirectoryRouteRateLimitConfig } from '../../middleware/rate-limiter';
import { jetonRecherche } from '../../utils/search-tokens';
import { permissionsService } from '../../services/admin/permissions.service';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import type { UserRoleEnum } from '@meeshy/shared/types';
import { computeUserStats, servedUserStats } from '../user-stats';


/**
 * Get dashboard statistics for authenticated user
 */
export async function getDashboardStats(fastify: FastifyInstance) {
  fastify.get('/users/me/dashboard-stats', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get comprehensive dashboard statistics for the authenticated user. Returns conversation counts, message stats, communities, and recent activity.',
      tags: ['users'],
      summary: 'Get user dashboard statistics',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                stats: {
                  type: 'object',
                  properties: {
                    totalConversations: { type: 'number', description: 'Total conversations user is member of' },
                    totalCommunities: { type: 'number', description: 'Total communities joined' },
                    totalMessages: { type: 'number', description: 'Messages sent this week' },
                    activeConversations: { type: 'number', description: 'Conversations with activity in last 24h' },
                    translationsToday: { type: 'number', description: 'Estimated translations today' },
                    totalLinks: { type: 'number', description: 'Share links created' },
                    lastUpdated: { type: 'string', format: 'date-time' }
                  }
                },
                recentConversations: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      title: { type: 'string' },
                      type: { type: 'string', enum: ['direct', 'group'] },
                      avatar: { type: 'string', nullable: true },
                      isActive: { type: 'boolean' },
                      lastMessage: {
                        type: 'object',
                        nullable: true,
                        properties: {
                          content: { type: 'string' },
                          createdAt: { type: 'string', format: 'date-time' },
                          sender: {
                            type: 'object',
                            properties: {
                              username: { type: 'string' },
                              displayName: { type: 'string' }
                            }
                          }
                        }
                      },
                      participants: { type: 'array', items: userMinimalSchema }
                    }
                  }
                },
                recentCommunities: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      description: { type: 'string', nullable: true },
                      isPrivate: { type: 'boolean' },
                      participants: { type: 'array', items: userMinimalSchema },
                      memberCount: { type: 'number' }
                    }
                  }
                }
              }
            }
          }
        },
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as AuthenticatedRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required');
      }

      const userId = authContext.userId;
      fastify.log.info(`[DASHBOARD] Getting stats for user ${userId}`);

      const [
        totalConversations,
        activeConversations,
        recentConversations,
        totalCommunities,
        recentCommunities,
        totalMessages,
        messagesThisWeek,
        totalLinks,
        translationsToday
      ] = await Promise.all([
        fastify.prisma.participant.count({
          where: {
            userId,
            isActive: true
          }
        }),
        fastify.prisma.participant.count({
          where: {
            userId,
            isActive: true,
            conversation: {
              messages: {
                some: {
                  createdAt: {
                    gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
                  },
                  deletedAt: null
                }
              }
            }
          }
        }),
        fastify.prisma.conversation.findMany({
          where: {
            participants: {
              some: {
                userId,
                isActive: true
              }
            }
          },
          select: {
            id: true,
            identifier: true,
            title: true,
            type: true,
            avatar: true,
            updatedAt: true,
            messages: {
              where: {
                deletedAt: null
              },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                id: true,
                content: true,
                createdAt: true,
                sender: {
                  select: {
                    userId: true,
                    displayName: true,
                    user: { select: { username: true } }
                  }
                }
              }
            },
            participants: {
              where: { isActive: true },
              take: 5,
              select: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    avatar: true
                  }
                }
              }
            }
          },
          orderBy: { updatedAt: 'desc' },
          take: 5
        }),
        fastify.prisma.communityMember.count({
          where: {
            userId
          }
        }),
        fastify.prisma.community.findMany({
          where: {
            members: {
              some: {
                userId
              }
            }
          },
          select: {
            id: true,
            name: true,
            description: true,
            avatar: true,
            isPrivate: true,
            updatedAt: true,
            _count: {
              select: { members: true, Conversation: true }
            },
            members: {
              take: 5,
              select: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    avatar: true
                  }
                }
              }
            }
          },
          orderBy: { updatedAt: 'desc' },
          take: 5
        }),
        fastify.prisma.message.count({
          where: {
            sender: { userId },
            deletedAt: null
          }
        }),
        fastify.prisma.message.count({
          where: {
            sender: { userId },
            deletedAt: null,
            createdAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            }
          }
        }),
        fastify.prisma.conversationShareLink.count({
          where: {
            createdBy: userId
          }
        }),
        fastify.prisma.message.count({
          where: {
            sender: { userId },
            deletedAt: null,
            createdAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
            }
          }
        })
      ]);

      const stats = {
        totalConversations,
        totalCommunities,
        totalMessages: messagesThisWeek,
        activeConversations,
        translationsToday,
        totalLinks,
        lastUpdated: new Date()
      };

      const transformedConversations = recentConversations.map(conv => {
        let displayTitle = conv.title;
        if (!displayTitle || displayTitle.trim() === '') {
          if (conv.type === 'direct' && conv.participants && conv.participants.length > 0) {
            const otherMember = conv.participants.find((m: any) => m.user?.id !== userId);
            if (otherMember?.user) {
              displayTitle = otherMember.user.displayName ||
                            `${otherMember.user.username || ''}`.trim() ||
                            'Conversation';
            } else {
              displayTitle = 'Direct Conversation';
            }
          } else {
            displayTitle = conv.identifier || `Conversation ${conv.id.slice(-4)}`;
          }
        }

        const otherUser = conv.type === 'direct'
          ? conv.participants.find((m: any) => m.user?.id !== userId)?.user
          : null;

        return {
          id: conv.id,
          title: displayTitle,
          type: conv.type,
          avatar: resolveParticipantAvatar({ avatar: conv.avatar, user: otherUser }),
          isActive: activeConversations > 0,
          lastMessage: conv.messages && conv.messages.length > 0 ? {
            content: conv.messages[0].content,
            createdAt: conv.messages[0].createdAt,
            sender: conv.messages[0].sender
          } : null,
          members: conv.participants.map((member: any) => member.user)
        };
      });

      const transformedCommunities = recentCommunities.map((community: any) => ({
        id: community.id,
        name: community.name,
        description: community.description,
        avatar: community.avatar,
        isPrivate: community.isPrivate,
        updatedAt: community.updatedAt,
        members: community.members.map((member: any) => member.user),
        memberCount: community._count?.members || community.members.length,
        conversationCount: community._count?.Conversation ?? 0,
      }));

      return sendSuccess(reply, {
        stats,
        recentConversations: transformedConversations,
        recentCommunities: transformedCommunities
      });

    } catch (error) {
      fastify.log.error(`[DASHBOARD] Error getting stats: ${error instanceof Error ? error.message : String(error)}`);
      logError(fastify.log, 'Get user dashboard stats error:', error);
      return sendInternalError(reply, error instanceof Error ? error.message : 'Unknown error');
    }
  });
}

/**
 * Get user statistics by ID or username
 */
export async function getUserStats(fastify: FastifyInstance) {
  fastify.get('/users/:userId/stats', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Get activity statistics for a specific user by ID or username. Returns message counts, conversation stats, and last activity information.',
      tags: ['users'],
      summary: 'Get user statistics',
      params: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string', description: 'User ID (MongoDB ObjectId) or username' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            // `additionalProperties: true` is REQUIRED here. The handler returns
            // totalMessages / totalConversations / totalTranslations /
            // friendRequestsReceived / languagesUsed / memberDays / languages /
            // achievements, but a restrictive `properties` whitelist made Fastify
            // silently STRIP every field whose name wasn't declared — only
            // `totalConversations` survived, so the iOS profile sheet showed 0
            // everywhere. See lesson: Fastify response schema strips undeclared fields.
            data: { type: 'object', additionalProperties: true }
          }
        },
        401: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest<{ Params: UserIdParams }>, reply: FastifyReply) => {
    try {
      const authContext = (request as AuthenticatedRequest).authContext;
      if (!authContext || !authContext.isAuthenticated) {
        return sendUnauthorized(reply, 'Authentication required');
      }

      const { userId: userIdOrUsername } = request.params;

      const isMongoId = isValidObjectId(userIdOrUsername);

      const user = await fastify.prisma.user.findFirst({
        where: isMongoId
          ? { id: userIdOrUsername }
          : {
              username: {
                equals: userIdOrUsername,
                mode: 'insensitive'
              }
            },
        select: {
          id: true,
          createdAt: true,
        }
      });

      if (!user) {
        return sendNotFound(reply, 'User not found');
      }

      // LE calcul, pas une copie (#4161).
      //
      // Ce handler portait cent lignes qui refaisaient `computeUserStats`
      // agrégation par agrégation, sous un commentaire annonçant la contrainte
      // — « parité stricte avec computeUserStats […] toute métrique doit vivre
      // dans les DEUX implémentations ». Le doc-comment de `computeUserStats`
      // affirmait de son côté servir « à la fois /users/me/stats et le
      // /users/:id/stats public », ce qui était faux depuis toujours.
      //
      // Les deux exemplaires avaient DÉJÀ divergé, et la mesure est nette —
      // même compte, même instant, en intégration :
      //
      //     GET /users/me/stats        → totalTranslations = 37
      //     GET /users/<soi>/stats     → totalTranslations = 0
      //
      // La copie comptait par `$runCommandRaw` sur `{'sender.userId': …}` :
      // `sender` est une RELATION Prisma, pas un document imbriqué, si bien que
      // le filtre ne matchait RIEN. `totalTranslations` valait 0 pour tout le
      // monde sur cette route depuis sa création, et le succès « Traducteur »
      // (100 traductions) ne pouvait donc jamais s'y débloquer.
      const stats = await computeUserStats(fastify.prisma, user.id);

      reply.header('Cache-Control', 'private, max-age=300, stale-while-revalidate=3600');

      // L'AUTORISATION, distincte du calcul, et elle aussi à site unique
      // (`servedUserStats`) : `?expand=stats` sur `/directory/people/:handle`
      // sert le même objet et doit appliquer la même loi.
      //
      // Les quatre compteurs intimes partaient à TOUT compte authentifié, sans
      // filtre d'amitié ni préférence de confidentialité — mesuré en
      // intégration sur un viewer tiers.
      const acteur = (request as unknown as UnifiedAuthRequest).authContext;
      return sendSuccess(reply, servedUserStats(stats, {
        estSoi: acteur?.userId === user.id,
        estAdministration: permissionsService.hasPermission(
          (acteur?.registeredUser?.role ?? 'USER') as UserRoleEnum,
          'canViewUsers'
        ),
      }));

    } catch (error) {
      fastify.log.error(`[USER_STATS] Error getting user stats: ${error instanceof Error ? error.message : String(error)}`);
      return sendInternalError(reply, error instanceof Error ? error.message : 'Unknown error');
    }
  });
}

/**
 * Search users by query
 */
/**
 * `GET /users/search` — ALIAS de `GET /directory/people` (#4159).
 *
 * Elle reste montée le temps que les douze sites iOS et les trois sites web
 * migrent, et jusqu'à extinction des versions installées. Ce qu'elle garde de
 * l'ancienne route : sa forme de réponse (tableau + `pagination` en offset), que
 * les clients décodent aujourd'hui.
 *
 * Ce qu'elle NE garde pas : le `contains` non ancré sur cinq colonnes. La
 * recherche passe par les jetons indexés, comme la route cible — un alias qui
 * conserverait le balayage complet ne corrigerait rien, il déplacerait
 * seulement l'adresse.
 *
 * **Compter les appels Android avant de la retirer** : `apps/android` n'a pas
 * été inventorié par l'audit, et le cycle 118 a déjà montré qu'il lui manquait
 * des champs que les deux autres clients avaient.
 */
export async function searchUsers(fastify: FastifyInstance) {
  fastify.get('/users/search', {
    onRequest: [fastify.authenticate],
    // Porte d'ENUMERATION : elle rend une liste de comptes sur un fragment.
    // Cle par appelant, jamais par adresse (#4145).
    config: { rateLimit: createDirectoryRouteRateLimitConfig('search') },
    schema: {
      description: 'Search for users by name, username or display name (substring), or by exact email / phone number. Returns paginated results with active users only. Minimum query length is 2 characters.',
      tags: ['users'],
      summary: 'Search users',
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string', minLength: 2, description: 'Search query — substring on names, EXACT match on email or phone number' },
          offset: { type: 'string', default: '0', description: 'Pagination offset' },
          limit: { type: 'string', default: '20', description: 'Results per page (max 100)' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  username: { type: 'string' },
                  firstName: { type: 'string' },
                  lastName: { type: 'string' },
                  displayName: { type: 'string' },
                  isOnline: { type: 'boolean' },
                  lastActiveAt: { type: 'string', format: 'date-time', nullable: true },
                  systemLanguage: { type: 'string' }
                }
              }
            },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                offset: { type: 'number' },
                limit: { type: 'number' },
                returned: { type: 'number' }
              }
            }
          }
        },
        401: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as AuthenticatedRequest).authContext;
      if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required');
      }

      /* istanbul ignore next — Fastify AJV schema default: fills offset/limit before handler; JS destructuring defaults unreachable */
      const { q, offset = '0', limit = '20' } = request.query as SearchQuery;

      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit);

      if (!q || q.trim().length < 2) {
        return sendPaginatedSuccess(reply, [], buildPaginationMeta(0, offsetNum, limitNum, 0));
      }

      const searchTerm = q.trim();

      // Deux régimes de correspondance, et la distinction est la garde (#4145).
      //
      // Les NOMS acceptent la sous-chaîne : c'est l'usage nominal, on cherche
      // « mar » pour trouver « Martin ». L'ADRESSE et le NUMÉRO n'acceptent que
      // l'égalité : ils servent à RETROUVER quelqu'un dont on possède déjà
      // l'identifiant, jamais à en découvrir. `contains` sur `email`
      // transformait la route en moissonneuse — `?q=gmail.com` rendait cent
      // adresses par page, à tout compte authentifié.
      const ressembleAUnEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(searchTerm);
      const ressembleAUnNumero = /^\+?[0-9][0-9\s.\-()]{5,}$/.test(searchTerm);

      const correspondancesExactes = [
        ...(ressembleAUnEmail
          ? [{ email: { equals: searchTerm, mode: 'insensitive' as const } }]
          : []),
        ...(ressembleAUnNumero
          ? [{ phoneNumber: { equals: searchTerm.replace(/[\s.\-()]/g, '') } }]
          : [])
      ];

      // Le jeton se replie exactement comme ceux stockés à l'écriture — même
      // règle, même site (`utils/search-tokens.ts`).
      const jetonDeRecherche = jetonRecherche(searchTerm);

      const whereClause = {
        AND: [
          {
            isActive: true,
            OR: [
              { deletedAt: null },
              { deletedAt: { isSet: false } }
            ]
          },
          {
            OR: [
              // Les quatre `contains` NON ancrés sur des colonnes non indexées
              // sont remplacés par UN test d'appartenance au tableau de jetons
              // (#4159). Chaque frappe balayait auparavant la collection
              // entière : c'était le défaut le plus coûteux du module, et le
              // moins visible — rien ne le signalait à part la latence.
              //
              // Un alias qui conserverait le balayage complet ne corrigerait
              // rien : il déplacerait seulement l'adresse.
              ...(jetonDeRecherche ? [{ searchTokens: { has: jetonDeRecherche } }] : []),
              ...correspondancesExactes
            ]
          }
        ]
      };

      // L'ORDRE obéit à la loi du CHAMP : trier « en ligne d'abord » en base,
      // puis masquer `isOnline` à la sortie, laissait lire la présence dans la
      // POSITION. Seul un viewer que la loi sert FULL peut classer par la
      // présence brute (`mayOrderByRawPresence`) ; les autres lisent une page
      // classée par le nom — l'offset reste cohérent d'une page à l'autre —
      // puis stabilisée, APRÈS la porte, sur la présence SERVIE.
      const presenceViewer = viewerFromRequest(request);

      const [users, totalCount] = await Promise.all([
        fastify.prisma.user.findMany({
          where: whereClause,
          // `email` n'est PAS chargé (#4145). Ce qui ne sort pas de la base ne
          // peut pas fuir par une omission de schéma — compter sur
          // fast-json-stringify pour retenir une donnée personnelle est un
          // piège armé, pas une garde : la première personne qui ajoute le
          // champ au schéma publie la fuite sans qu'un témoin tombe.
          // `phoneNumber` non plus, pour la même raison : la route accepte de
          // chercher PAR le numéro, jamais de le rendre.
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            displayName: true,
            isOnline: true,
            lastActiveAt: true,
            systemLanguage: true
          },
          orderBy: [
            ...(mayOrderByRawPresence(presenceViewer) ? [{ isOnline: 'desc' as const }] : []),
            { firstName: 'asc' as const },
            { lastName: 'asc' as const }
          ],
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.user.count({ where: whereClause })
      ]);

      // Gate de présence (régime strict) : un résultat de recherche n'expose
      // lastActiveAt/isOnline que pour soi, un ami accepté ou ADMIN/BIGBOSS.
      // Puis la page se classe sur ce qu'elle SERT : un ami en ligne remonte
      // pour qui a le droit de le voir, un inconnu masqué garde sa place de nom.
      const visibilityMap = await getPresenceVisibilityService(fastify.prisma).resolveForTargets(
        presenceViewer,
        users.map(u => u.id),
      );
      const gatedUsers = users
        .map(u => applyPresenceVisibilityAsOffline(u, visibilityMap.get(u.id)))
        .sort(servedOnlineFirst);

      return sendPaginatedSuccess(reply, gatedUsers, buildPaginationMeta(totalCount, offsetNum, limitNum, gatedUsers.length));
    } catch (error) {
      logError(fastify.log, 'Error searching users', error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}
