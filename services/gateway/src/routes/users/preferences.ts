import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { buildPaginationMeta } from '../../utils/pagination';
import {
  userMinimalSchema,
  userStatsSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import type { AuthenticatedRequest, PaginationParams, UserIdParams, SearchQuery } from './types';

/**
 * Validate and sanitize pagination parameters
 */
function validatePagination(
  offset: string = '0',
  limit: string = '20',
  defaultLimit: number = 20,
  maxLimit: number = 100
): PaginationParams {
  const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
  const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || defaultLimit), maxLimit);
  return { offsetNum, limitNum };
}

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
                      members: { type: 'array', items: userMinimalSchema }
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
                      members: { type: 'array', items: userMinimalSchema },
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
        return reply.status(401).send({
          success: false,
          error: 'Authentication required'
        });
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
        fastify.prisma.conversationMember.count({
          where: {
            userId,
            isActive: true
          }
        }),
        fastify.prisma.conversationMember.count({
          where: {
            userId,
            isActive: true,
            conversation: {
              messages: {
                some: {
                  createdAt: {
                    gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
                  },
                  isDeleted: false
                }
              }
            }
          }
        }),
        fastify.prisma.conversation.findMany({
          where: {
            members: {
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
            updatedAt: true,
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: {
                id: true,
                content: true,
                createdAt: true,
                sender: {
                  select: {
                    username: true,
                    displayName: true
                  }
                }
              }
            },
            members: {
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
            isPrivate: true,
            updatedAt: true,
            _count: {
              select: { members: true }
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
            senderId: userId,
            isDeleted: false
          }
        }),
        fastify.prisma.message.count({
          where: {
            senderId: userId,
            isDeleted: false,
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
            senderId: userId,
            isDeleted: false,
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
          if (conv.type === 'direct' && conv.members && conv.members.length > 0) {
            const otherMember = conv.members.find((m: any) => m.user?.id !== userId);
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

        return {
          id: conv.id,
          title: displayTitle,
          type: conv.type,
          isActive: activeConversations > 0,
          lastMessage: conv.messages && conv.messages.length > 0 ? {
            content: conv.messages[0].content,
            createdAt: conv.messages[0].createdAt,
            sender: conv.messages[0].sender
          } : null,
          members: conv.members.map((member: any) => member.user)
        };
      });

      const transformedCommunities = recentCommunities.map((community: any) => ({
        id: community.id,
        name: community.name,
        description: community.description,
        isPrivate: community.isPrivate,
        members: community.members.map((member: any) => member.user),
        memberCount: community._count?.members || community.members.length
      }));

      return reply.send({
        success: true,
        data: {
          stats,
          recentConversations: transformedConversations,
          recentCommunities: transformedCommunities
        }
      });

    } catch (error) {
      fastify.log.error(`[DASHBOARD] Error getting stats: ${error instanceof Error ? error.message : String(error)}`);
      logError(fastify.log, 'Get user dashboard stats error:', error);
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
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
            data: {
              type: 'object',
              properties: {
                messagesSent: { type: 'number', description: 'Total messages sent by user' },
                messagesReceived: { type: 'number', description: 'Total messages received' },
                conversationsCount: { type: 'number', description: 'Total conversations (all types)' },
                groupsCount: { type: 'number', description: 'Group conversations only' },
                totalConversations: { type: 'number', description: 'Total conversations (duplicate of conversationsCount)' },
                averageResponseTime: { type: 'number', nullable: true, description: 'Average response time in seconds' },
                lastActivity: { type: 'string', format: 'date-time', description: 'Last activity timestamp' }
              }
            }
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
        return reply.status(401).send({
          success: false,
          error: 'Authentication required'
        });
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
        return reply.status(404).send({
          success: false,
          error: 'User not found'
        });
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
          where: { senderId: userId, isDeleted: false },
        }),
        fastify.prisma.conversationMember.count({
          where: { userId },
        }),
        fastify.prisma.message.count({
          where: {
            senderId: userId,
            isDeleted: false,
            translations: { isSet: true },
          },
        }),
        fastify.prisma.friendRequest.count({
          where: { receiverId: userId },
        }),
        fastify.prisma.message.groupBy({
          by: ['originalLanguage'],
          where: {
            senderId: userId,
            isDeleted: false,
            originalLanguage: { not: null },
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
        const current = numericStats[config.field] ?? 0;
        const progress = Math.min(current / config.threshold, 1);
        return {
          id: key, name: config.name, description: config.description,
          icon: config.icon, color: config.color,
          isUnlocked: current >= config.threshold, progress, threshold: config.threshold, current,
        };
      });

      return reply.send({
        success: true,
        data: {
          totalMessages, totalConversations, totalTranslations,
          friendRequestsReceived, languagesUsed, memberDays,
          languages, achievements,
        },
      });

    } catch (error) {
      fastify.log.error(`[USER_STATS] Error getting user stats: ${error instanceof Error ? error.message : String(error)}`);
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
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
        return reply.status(401).send({
          success: false,
          error: 'Authentication required'
        });
      }

      const { q, offset = '0', limit = '20' } = request.query as SearchQuery;

      const { offsetNum, limitNum } = validatePagination(offset, limit);

      if (!q || q.trim().length < 2) {
        return reply.send({
          success: true,
          data: [],
          pagination: buildPaginationMeta(0, offsetNum, limitNum, 0)
        });
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

      reply.send({
        success: true,
        data: users,
        pagination: buildPaginationMeta(totalCount, offsetNum, limitNum, users.length)
      });
    } catch (error) {
      logError(fastify.log, 'Error searching users', error);
      reply.status(500).send({
        success: false,
        error: 'Internal server error'
      });
    }
  });
}
