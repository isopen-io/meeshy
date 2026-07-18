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
import { resolveParticipantAvatar } from '@meeshy/shared/utils/participant-helpers';
import { viewerFromAuthContext } from './presence-gate';
import { getPresenceVisibilityService } from '../../services/PresenceVisibilityService';


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

      const isMongoId = /^[a-f\d]{24}$/i.test(userIdOrUsername);

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

      const userId = user.id;

      const [
        totalMessages,
        totalConversations,
        totalTranslations,
        friendRequestsReceived,
        languagesRaw,
      ] = await Promise.all([
        fastify.prisma.message.count({
          where: { sender: { userId }, deletedAt: null },
        }),
        // Active memberships only: Participant rows are soft-deactivated on
        // leave/ban/delete-for-me (isActive: false), never deleted. A bare
        // `{ userId }` count over-reports `totalConversations` and can falsely
        // unlock `connecteur`. Matches the `isActive: true` filter used for the
        // profile-completion counts above and the `/users/me/stats` endpoint.
        fastify.prisma.participant.count({
          where: { userId, isActive: true },
        }),
        fastify.prisma.$runCommandRaw({
          count: 'Message',
          query: {
            'sender.userId': userId,
            deletedAt: null,
            translations: { $ne: null, $exists: true },
          },
        }).then((r: any) => r.n ?? 0),
        fastify.prisma.friendRequest.count({
          where: { receiverId: userId },
        }),
        fastify.prisma.message.groupBy({
          by: ['originalLanguage'],
          where: {
            sender: { userId },
            deletedAt: null,
            // NOTE: `originalLanguage: { not: null }` was INVALID here — Prisma+Mongo
            // rejects `not: null` ("Argument `not` must not be null", spammed prod
            // logs on every profile-stats request). The field is a required
            // non-nullable String (@default("fr")) so it can never be null; the
            // clause was redundant. Downstream `.filter(Boolean)` already drops empties.
          },
        }),
      ]);

      const languagesUsed = languagesRaw.length;
      const memberDays = Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24));
      const languages = languagesRaw.map((l) => l.originalLanguage).filter(Boolean);

      const ACHIEVEMENT_THRESHOLDS = {
        polyglotte: { field: 'languagesUsed', threshold: 5, icon: 'globe', color: '#3498DB', name: 'Polyglotte', description: 'Utiliser 5+ langues' },
        bavard: { field: 'totalMessages', threshold: 1000, icon: 'bubble.left.and.bubble.right.fill', color: '#FF6B6B', name: 'Bavard', description: 'Envoyer 1000+ messages' },
        connecteur: { field: 'totalConversations', threshold: 10, icon: 'person.2.fill', color: '#4ECDC4', name: 'Connecteur', description: 'Rejoindre 10+ conversations' },
        traducteur: { field: 'totalTranslations', threshold: 100, icon: 'character.book.closed.fill', color: '#9B59B6', name: 'Traducteur', description: 'Traduire 100+ messages' },
        fidele: { field: 'memberDays', threshold: 30, icon: 'calendar.badge.checkmark', color: '#F8B500', name: 'Fidele', description: 'Membre pendant 30+ jours' },
        populaire: { field: 'friendRequestsReceived', threshold: 50, icon: 'star.fill', color: '#E91E63', name: 'Populaire', description: "Recevoir 50+ demandes d'amis" },
      } as const;

      const numericStats: Record<string, number> = {
        totalMessages, totalConversations, totalTranslations, friendRequestsReceived, languagesUsed, memberDays,
      };

      const achievements = Object.entries(ACHIEVEMENT_THRESHOLDS).map(([key, config]) => {
        /* istanbul ignore next — all ACHIEVEMENT_THRESHOLDS fields are keys of numericStats */
        const current = numericStats[config.field] ?? 0;
        const progress = Math.min(current / config.threshold, 1);
        return {
          id: key, name: config.name, description: config.description,
          icon: config.icon, color: config.color,
          isUnlocked: current >= config.threshold, progress, threshold: config.threshold, current,
        };
      });

      reply.header('Cache-Control', 'private, max-age=300, stale-while-revalidate=3600');
      return sendSuccess(reply, {
        totalMessages, totalConversations, totalTranslations,
        friendRequestsReceived, languagesUsed, memberDays,
        languages, achievements,
      });

    } catch (error) {
      fastify.log.error(`[USER_STATS] Error getting user stats: ${error instanceof Error ? error.message : String(error)}`);
      return sendInternalError(reply, error instanceof Error ? error.message : 'Unknown error');
    }
  });
}

/**
 * Search users by query
 */
export async function searchUsers(fastify: FastifyInstance) {
  fastify.get('/users/search', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Search for users by name, username, email, or display name. Returns paginated results with active users only. Minimum query length is 2 characters.',
      tags: ['users'],
      summary: 'Search users',
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string', minLength: 2, description: 'Search query (name, username, email, displayName)' },
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
                  email: { type: 'string' },
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
              {
                firstName: {
                  contains: searchTerm,
                  mode: 'insensitive' as const
                }
              },
              {
                lastName: {
                  contains: searchTerm,
                  mode: 'insensitive' as const
                }
              },
              {
                username: {
                  contains: searchTerm,
                  mode: 'insensitive' as const
                }
              },
              {
                email: {
                  contains: searchTerm,
                  mode: 'insensitive' as const
                }
              },
              {
                displayName: {
                  contains: searchTerm,
                  mode: 'insensitive' as const
                }
              }
            ]
          }
        ]
      };

      const [users, totalCount] = await Promise.all([
        fastify.prisma.user.findMany({
          where: whereClause,
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            displayName: true,
            email: true,
            isOnline: true,
            lastActiveAt: true,
            systemLanguage: true
          },
          orderBy: [
            { isOnline: 'desc' },
            { firstName: 'asc' },
            { lastName: 'asc' }
          ],
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.user.count({ where: whereClause })
      ]);

      // Gate de présence : un résultat de recherche n'expose lastActiveAt/isOnline
      // que pour les contacts (ami/affilié) ou modérateur+ (critère strict).
      const viewer = viewerFromAuthContext(
        (request as FastifyRequest & {
          authContext?: { type?: string; userId?: string; registeredUser?: { role?: string } | null };
        }).authContext,
      );
      const visibilityMap = await getPresenceVisibilityService(fastify.prisma).resolveForTargets(
        viewer,
        users.map(u => u.id),
      );
      const gatedUsers = users.map(u => {
        const vis = visibilityMap.get(u.id);
        return {
          ...u,
          isOnline: vis?.showOnline ? u.isOnline : false,
          lastActiveAt: vis?.showLastSeenTimestamp ? u.lastActiveAt : null,
        };
      });

      return sendPaginatedSuccess(reply, gatedUsers, buildPaginationMeta(totalCount, offsetNum, limitNum, gatedUsers.length));
    } catch (error) {
      logError(fastify.log, 'Error searching users', error);
      return sendInternalError(reply, 'Internal server error');
    }
  });
}
