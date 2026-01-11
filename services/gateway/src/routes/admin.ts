import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logError } from '../utils/logger';
import { UserRoleEnum } from '@meeshy/shared/types';
import {
  adminAuditLogSchema,
  securityEventSchema,
  userSchema,
  userMinimalSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';

// Types pour les roles et permissions
type UserRole = UserRoleEnum;

interface UserPermissions {
  canAccessAdmin: boolean;
  canManageUsers: boolean;
  canManageCommunities: boolean;
  canManageConversations: boolean;
  canViewAnalytics: boolean;
  canModerateContent: boolean;
  canViewAuditLogs: boolean;
  canManageNotifications: boolean;
  canManageTranslations: boolean;
}

// Schemas de validation
const updateUserRoleSchema = z.object({
  role: z.nativeEnum(UserRoleEnum)
});

const updateUserStatusSchema = z.object({
  isActive: z.boolean()
});

// Service de permissions
class PermissionsService {
  private readonly ROLE_HIERARCHY: Record<string, number> = {
    'BIGBOSS': 7,
    'ADMIN': 5,
    'MODO': 4,
    'AUDIT': 3,
    'ANALYST': 2,
    'USER': 1,
  };

  private readonly DEFAULT_PERMISSIONS: Record<string, UserPermissions> = {
    'BIGBOSS': {
      canAccessAdmin: true,
      canManageUsers: true,
      canManageCommunities: true,
      canManageConversations: true,
      canViewAnalytics: true,
      canModerateContent: true,
      canViewAuditLogs: true,
      canManageNotifications: true,
      canManageTranslations: true,
    },
    'ADMIN': {
      canAccessAdmin: true,
      canManageUsers: true,
      canManageCommunities: true,
      canManageConversations: true,
      canViewAnalytics: true,
      canModerateContent: true,
      canViewAuditLogs: false,
      canManageNotifications: true,
      canManageTranslations: false,
    },
    'MODO': {
      canAccessAdmin: true,
      canManageUsers: false,
      canManageCommunities: true,
      canManageConversations: true,
      canViewAnalytics: false,
      canModerateContent: true,
      canViewAuditLogs: false,
      canManageNotifications: false,
      canManageTranslations: false,
    },
    'AUDIT': {
      canAccessAdmin: true,
      canManageUsers: false,
      canManageCommunities: false,
      canManageConversations: false,
      canViewAnalytics: true,
      canModerateContent: false,
      canViewAuditLogs: true,
      canManageNotifications: false,
      canManageTranslations: false,
    },
    'ANALYST': {
      canAccessAdmin: false,
      canManageUsers: false,
      canManageCommunities: false,
      canManageConversations: false,
      canViewAnalytics: true,
      canModerateContent: false,
      canViewAuditLogs: false,
      canManageNotifications: false,
      canManageTranslations: false,
    },
    'USER': {
      canAccessAdmin: false,
      canManageUsers: false,
      canManageCommunities: false,
      canManageConversations: false,
      canViewAnalytics: false,
      canModerateContent: false,
      canViewAuditLogs: false,
      canManageNotifications: false,
      canManageTranslations: false,
    },
  };

  getUserPermissions(role: UserRole): UserPermissions {
    return this.DEFAULT_PERMISSIONS[role] || this.DEFAULT_PERMISSIONS.USER;
  }

  hasPermission(userRole: UserRole, permission: keyof UserPermissions): boolean {
    const permissions = this.getUserPermissions(userRole);
    return permissions[permission];
  }

  canManageUser(adminRole: UserRole, targetRole: UserRole): boolean {
    return this.ROLE_HIERARCHY[adminRole] > this.ROLE_HIERARCHY[targetRole];
  }
}

const permissionsService = new PermissionsService();

// Middleware d'autorisation admin
const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  // Utiliser le nouveau systeme d'authentification unifie
  const authContext = (request as any).authContext;
  if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
    return reply.status(401).send({
      success: false,
      message: 'Authentification requise'
    });
  }

  const permissions = permissionsService.getUserPermissions(authContext.registeredUser.role);
  if (!permissions.canAccessAdmin) {
    return reply.status(403).send({
      success: false,
      message: 'Acces administrateur requis'
    });
  }
};

/**
 * Validate and sanitize pagination parameters
 * @param offset - Raw offset string from query
 * @param limit - Raw limit string from query
 * @param defaultLimit - Default limit if not provided (default: 20)
 * @param maxLimit - Maximum allowed limit (default: 100)
 * @returns Validated offset and limit numbers
 */
function validatePagination(
  offset: string = '0',
  limit: string = '20',
  defaultLimit: number = 20,
  maxLimit: number = 100
): { offsetNum: number; limitNum: number } {
  const offsetNum = Math.max(0, parseInt(offset, 10) || 0);
  const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || defaultLimit), maxLimit);
  return { offsetNum, limitNum };
}

export async function adminRoutes(fastify: FastifyInstance) {
  // Tableau de bord administrateur
  fastify.get('/dashboard', {
    onRequest: [fastify.authenticate, requireAdmin],
    schema: {
      description: 'Get comprehensive admin dashboard statistics including user counts, activity metrics, translations, share links, and recent activity summaries. Requires admin access.',
      tags: ['admin'],
      summary: 'Get admin dashboard statistics',
      security: [{ bearerAuth: [] }],
      response: {
        200: {
          description: 'Dashboard statistics successfully retrieved',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                statistics: {
                  type: 'object',
                  properties: {
                    totalUsers: { type: 'number', description: 'Total registered users' },
                    activeUsers: { type: 'number', description: 'Currently active users' },
                    inactiveUsers: { type: 'number', description: 'Inactive users' },
                    adminUsers: { type: 'number', description: 'Admin/Moderator users' },
                    totalAnonymousUsers: { type: 'number', description: 'Total anonymous participants' },
                    activeAnonymousUsers: { type: 'number', description: 'Active anonymous participants' },
                    inactiveAnonymousUsers: { type: 'number', description: 'Inactive anonymous participants' },
                    totalMessages: { type: 'number', description: 'Total messages sent' },
                    totalCommunities: { type: 'number', description: 'Total communities created' },
                    totalTranslations: { type: 'number', description: 'Total message translations' },
                    totalShareLinks: { type: 'number', description: 'Total share links created' },
                    activeShareLinks: { type: 'number', description: 'Active share links' },
                    totalReports: { type: 'number', description: 'Total reports filed' },
                    totalInvitations: { type: 'number', description: 'Total pending invitations' },
                    topLanguages: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          language: { type: 'string', description: 'Language code' },
                          count: { type: 'number', description: 'Message count' }
                        }
                      }
                    },
                    usersByRole: { type: 'object', additionalProperties: { type: 'number' } },
                    messagesByType: { type: 'object', additionalProperties: { type: 'number' } }
                  }
                },
                recentActivity: {
                  type: 'object',
                  properties: {
                    newUsers: { type: 'number', description: 'New users in last 7 days' },
                    newConversations: { type: 'number', description: 'New conversations in last 7 days' },
                    newMessages: { type: 'number', description: 'New messages in last 7 days' },
                    newAnonymousUsers: { type: 'number', description: 'New anonymous users in last 7 days' }
                  }
                },
                userPermissions: {
                  type: 'object',
                  properties: {
                    canAccessAdmin: { type: 'boolean' },
                    canManageUsers: { type: 'boolean' },
                    canManageCommunities: { type: 'boolean' },
                    canManageConversations: { type: 'boolean' },
                    canViewAnalytics: { type: 'boolean' },
                    canModerateContent: { type: 'boolean' },
                    canViewAuditLogs: { type: 'boolean' },
                    canManageNotifications: { type: 'boolean' },
                    canManageTranslations: { type: 'boolean' }
                  }
                },
                timestamp: { type: 'string', format: 'date-time' }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      const user = authContext.registeredUser;

      // Statistiques generales - Toutes les metriques demandees
      const [
        totalUsers,
        activeUsers,
        totalConversations,
        totalCommunities,
        totalMessages,
        adminUsers,
        totalAnonymousUsers,
        activeAnonymousUsers,
        totalShareLinks,
        activeShareLinks,
        totalTranslations,
        totalReports,
        totalInvitations,
        languagesStats
      ] = await Promise.all([
        fastify.prisma.user.count(),
        fastify.prisma.user.count({ where: { isActive: true } }),
        fastify.prisma.conversation.count(),
        fastify.prisma.community.count(),
        fastify.prisma.message.count({ where: { isDeleted: false } }),
        fastify.prisma.user.count({
          where: {
            role: { in: ['ADMIN', 'BIGBOSS', 'MODO'] }
          }
        }),
        fastify.prisma.anonymousParticipant.count(),
        fastify.prisma.anonymousParticipant.count({ where: { isActive: true } }),
        fastify.prisma.conversationShareLink.count(),
        fastify.prisma.conversationShareLink.count({ where: { isActive: true } }),
        fastify.prisma.messageTranslation.count(),
        // Signalements reels depuis la table Report
        fastify.prisma.report.count(),
        // Pour les invitations, on utilise les demandes d'amitie comme proxy
        fastify.prisma.friendRequest.count({ where: { status: 'pending' } }),
        // Statistiques des langues les plus utilisees
        fastify.prisma.message.groupBy({
          by: ['originalLanguage'],
          where: { isDeleted: false },
          _count: { originalLanguage: true },
          orderBy: { _count: { originalLanguage: 'desc' } },
          take: 10
        })
      ]);

      // Permissions de l'utilisateur admin
      const userPermissions = permissionsService.getUserPermissions(user.role);

      // Statistiques d'activite recente (7 derniers jours)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const recentActivity = await Promise.all([
        fastify.prisma.user.count({
          where: { createdAt: { gte: sevenDaysAgo } }
        }),
        fastify.prisma.conversation.count({
          where: { createdAt: { gte: sevenDaysAgo } }
        }),
        fastify.prisma.message.count({
          where: { createdAt: { gte: sevenDaysAgo }, isDeleted: false }
        }),
        fastify.prisma.anonymousParticipant.count({
          where: { joinedAt: { gte: sevenDaysAgo } }
        })
      ]);

      // Statistiques par role
      const usersByRole = await fastify.prisma.user.groupBy({
        by: ['role'],
        _count: {
          role: true
        }
      });

      // Statistiques des messages par type
      const messagesByType = await fastify.prisma.message.groupBy({
        by: ['messageType'],
        where: { isDeleted: false },
        _count: {
          messageType: true
        }
      });

      return reply.send({
        success: true,
        data: {
          statistics: {
            // 1. Utilisateurs
            totalUsers,
            activeUsers,
            inactiveUsers: totalUsers - activeUsers,
            adminUsers,
            // 2. Utilisateurs anonymes
            totalAnonymousUsers,
            activeAnonymousUsers,
            inactiveAnonymousUsers: totalAnonymousUsers - activeAnonymousUsers,
            // 3. Messages
            totalMessages,
            // 4. Communautes
            totalCommunities,
            // 5. Traductions
            totalTranslations,
            // 6. Liens crees pour conversations
            totalShareLinks,
            activeShareLinks,
            // 7. Signalements (proxy avec messages supprimes)
            totalReports,
            // 8. Invitations a rejoindre communaute (proxy avec demandes d'amitie)
            totalInvitations,
            // 9. Langues les plus utilisees
            topLanguages: languagesStats.map(lang => ({
              language: lang.originalLanguage,
              count: lang._count.originalLanguage
            })),
            // Metadonnees supplementaires
            usersByRole: usersByRole.reduce((acc, item) => {
              acc[item.role] = item._count.role;
              return acc;
            }, {} as Record<string, number>),
            messagesByType: messagesByType.reduce((acc, item) => {
              acc[item.messageType] = item._count.messageType;
              return acc;
            }, {} as Record<string, number>)
          },
          recentActivity: {
            newUsers: recentActivity[0],
            newConversations: recentActivity[1],
            newMessages: recentActivity[2],
            newAnonymousUsers: recentActivity[3]
          },
          userPermissions,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      logError(fastify.log, 'Get admin dashboard error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  });

  // Gestion des utilisateurs - Liste avec pagination
  fastify.get('/users', {
    onRequest: [fastify.authenticate, requireAdmin],
    schema: {
      description: 'Get paginated list of registered users with filtering options. Supports search by username, email, name and filtering by role and status. Requires canManageUsers permission.',
      tags: ['admin'],
      summary: 'List all users with pagination',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          offset: { type: 'string', description: 'Pagination offset', default: '0' },
          limit: { type: 'string', description: 'Pagination limit (max 100)', default: '20' },
          search: { type: 'string', description: 'Search by username, email, firstName, lastName' },
          role: { type: 'string', enum: ['USER', 'MODERATOR', 'ADMIN', 'CREATOR', 'ANALYST', 'AUDIT', 'BIGBOSS'], description: 'Filter by user role' },
          status: { type: 'string', enum: ['active', 'inactive'], description: 'Filter by account status' }
        }
      },
      response: {
        200: {
          description: 'User list successfully retrieved',
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
                  avatar: { type: 'string', nullable: true },
                  role: { type: 'string' },
                  isActive: { type: 'boolean' },
                  isOnline: { type: 'boolean' },
                  lastActiveAt: { type: 'string', format: 'date-time', nullable: true },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' },
                  emailVerifiedAt: { type: 'string', format: 'date-time', nullable: true },
                  phoneVerifiedAt: { type: 'string', format: 'date-time', nullable: true },
                  twoFactorEnabledAt: { type: 'string', format: 'date-time', nullable: true },
                  failedLoginAttempts: { type: 'number' },
                  lockedUntil: { type: 'string', format: 'date-time', nullable: true },
                  lastPasswordChange: { type: 'string', format: 'date-time', nullable: true },
                  deactivatedAt: { type: 'string', format: 'date-time', nullable: true },
                  deletedAt: { type: 'string', format: 'date-time', nullable: true },
                  deletedBy: { type: 'string', nullable: true },
                  profileCompletionRate: { type: 'number', nullable: true },
                  _count: {
                    type: 'object',
                    properties: {
                      sentMessages: { type: 'number' },
                      conversations: { type: 'number' },
                      communityMemberships: { type: 'number' },
                      createdCommunities: { type: 'number' },
                      createdShareLinks: { type: 'number' }
                    }
                  }
                }
              }
            },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'number', description: 'Total number of users' },
                limit: { type: 'number', description: 'Items per page' },
                offset: { type: 'number', description: 'Current offset' },
                hasMore: { type: 'boolean', description: 'More pages available' }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      const user = authContext.registeredUser;
      const permissions = permissionsService.getUserPermissions(user.role);

      if (!permissions.canManageUsers) {
        return reply.status(403).send({
          success: false,
          message: 'Permission insuffisante pour gerer les utilisateurs'
        });
      }

      const { offset = '0', limit = '20', search, role, status } = request.query as any;
      const { offsetNum, limitNum } = validatePagination(offset, limit);


      // Construire les filtres
      const where: any = {};

      if (search) {
        where.OR = [
          { username: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } }
        ];
      }

      if (role) {
        where.role = role;
      }

      if (status === 'active') {
        where.isActive = true;
      } else if (status === 'inactive') {
        where.isActive = false;
      }

      const [users, totalCount] = await Promise.all([
        fastify.prisma.user.findMany({
          where,
          select: {
            id: true,
            username: true,
            firstName: true,
            lastName: true,
            displayName: true,
            email: true,
            avatar: true,
            role: true,
            isActive: true,
            isOnline: true,
            lastActiveAt: true,
            createdAt: true,
            updatedAt: true,
            // Champs de securite et verification
            emailVerifiedAt: true,
            phoneVerifiedAt: true,
            twoFactorEnabledAt: true,
            failedLoginAttempts: true,
            lockedUntil: true,
            lastPasswordChange: true,
            deactivatedAt: true,
            deletedAt: true,
            deletedBy: true,
            profileCompletionRate: true,
            _count: {
              select: {
                sentMessages: true,
                conversations: true,
                communityMemberships: true,
                createdCommunities: true,
                createdShareLinks: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.user.count({ where })
      ]);


      return reply.send({
        success: true,
        data: users,
        pagination: {
          total: totalCount,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + users.length < totalCount
        }
      });

    } catch (error) {
      logError(fastify.log, 'Get admin users error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  });

  // Gestion des utilisateurs anonymes - Liste avec pagination
  fastify.get('/anonymous-users', {
    onRequest: [fastify.authenticate, requireAdmin],
    schema: {
      description: 'Get paginated list of anonymous users/participants with filtering options. Requires canManageUsers permission.',
      tags: ['admin'],
      summary: 'List anonymous users with pagination',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          offset: { type: 'string', description: 'Pagination offset', default: '0' },
          limit: { type: 'string', description: 'Pagination limit (max 100)', default: '20' },
          search: { type: 'string', description: 'Search by username, firstName, lastName, email' },
          status: { type: 'string', enum: ['active', 'inactive'], description: 'Filter by status' }
        }
      },
      response: {
        200: {
          description: 'Anonymous users list successfully retrieved',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'array', items: { type: 'object' } },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                limit: { type: 'number' },
                offset: { type: 'number' },
                hasMore: { type: 'boolean' }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      const user = authContext.registeredUser;
      const permissions = permissionsService.getUserPermissions(user.role);

      if (!permissions.canManageUsers) {
        return reply.status(403).send({
          success: false,
          message: 'Permission insuffisante pour gerer les utilisateurs'
        });
      }

      const { offset = '0', limit = '20', search, status } = request.query as any;
      const { offsetNum, limitNum } = validatePagination(offset, limit);

      // Construire les filtres
      const where: any = {};

      if (search) {
        where.OR = [
          { username: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } }
        ];
      }

      if (status === 'active') {
        where.isActive = true;
      } else if (status === 'inactive') {
        where.isActive = false;
      }

      const [anonymousUsers, totalCount] = await Promise.all([
        fastify.prisma.anonymousParticipant.findMany({
          where,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true,
            email: true,
            sessionToken: true,
            ipAddress: true,
            country: true,
            language: true,
            isActive: true,
            isOnline: true,
            lastActiveAt: true,
            joinedAt: true,
            leftAt: true,
            canSendMessages: true,
            canSendFiles: true,
            canSendImages: true,
            shareLink: {
              select: {
                id: true,
                linkId: true,
                identifier: true,
                name: true,
                conversation: {
                  select: {
                    id: true,
                    identifier: true,
                    title: true
                  }
                }
              }
            },
            _count: {
              select: {
                sentMessages: true
              }
            }
          },
          orderBy: { joinedAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.anonymousParticipant.count({ where })
      ]);

      return reply.send({
        success: true,
        data: anonymousUsers,
        pagination: {
          total: totalCount,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + anonymousUsers.length < totalCount
        }
      });

    } catch (error) {
      logError(fastify.log, 'Get admin anonymous users error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  });

  // Details d'un utilisateur
  fastify.get('/users/:id', {
    onRequest: [fastify.authenticate, requireAdmin],
    schema: {
      description: 'Get detailed information about a specific user including statistics, activity counts, and security information. Requires canManageUsers permission.',
      tags: ['admin'],
      summary: 'Get user details by ID',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'User unique identifier' }
        }
      },
      response: {
        200: {
          description: 'User details successfully retrieved',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: userSchema
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: {
          description: 'User not found',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Utilisateur non trouve' }
          }
        },
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      const user = authContext.registeredUser;
      const { id } = request.params as { id: string };
      const permissions = permissionsService.getUserPermissions(user.role);

      if (!permissions.canManageUsers) {
        return reply.status(403).send({
          success: false,
          message: 'Permission insuffisante'
        });
      }

      const targetUser = await fastify.prisma.user.findUnique({
        where: { id },
        include: {
          stats: true,
          _count: {
            select: {
              sentMessages: true,
              conversations: true,
              communityMemberships: true,
              createdCommunities: true,
              notifications: true
            }
          }
        }
      });

      if (!targetUser) {
        return reply.status(404).send({
          success: false,
          message: 'Utilisateur non trouve'
        });
      }

      // Masquer le mot de passe
      const { password, ...userWithoutPassword } = targetUser;

      return reply.send({
        success: true,
        data: userWithoutPassword
      });

    } catch (error) {
      logError(fastify.log, 'Get user details error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  });

  // Modifier le role d'un utilisateur
  fastify.patch('/users/:id/role', {
    onRequest: [fastify.authenticate, requireAdmin],
    schema: {
      description: 'Update user role. Admins can only modify roles of users with lower hierarchy level. Requires canManageUsers permission.',
      tags: ['admin'],
      summary: 'Update user role',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'User unique identifier' }
        }
      },
      body: {
        type: 'object',
        required: ['role'],
        properties: {
          role: {
            type: 'string',
            enum: ['USER', 'MODERATOR', 'ADMIN', 'CREATOR', 'ANALYST', 'AUDIT', 'BIGBOSS'],
            description: 'New role to assign'
          }
        }
      },
      response: {
        200: {
          description: 'User role successfully updated',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                username: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                role: { type: 'string' },
                updatedAt: { type: 'string', format: 'date-time' }
              }
            },
            message: { type: 'string', example: 'Role mis a jour vers ADMIN' }
          }
        },
        400: {
          description: 'Invalid input data',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Donnees invalides' },
            errors: { type: 'array', items: { type: 'object' } }
          }
        },
        401: errorResponseSchema,
        403: {
          description: 'Insufficient permissions or cannot modify this user',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Vous ne pouvez pas modifier le role de cet utilisateur' }
          }
        },
        404: {
          description: 'User not found',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Utilisateur non trouve' }
          }
        },
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      const user = authContext.registeredUser;
      const { id } = request.params as { id: string };
      const body = updateUserRoleSchema.parse(request.body);
      const permissions = permissionsService.getUserPermissions(user.role);

      if (!permissions.canManageUsers) {
        return reply.status(403).send({
          success: false,
          message: 'Permission insuffisante'
        });
      }

      // Recuperer l'utilisateur cible
      const targetUser = await fastify.prisma.user.findUnique({
        where: { id }
      });

      if (!targetUser) {
        return reply.status(404).send({
          success: false,
          message: 'Utilisateur non trouve'
        });
      }

      // Verifier si l'admin peut modifier ce role
      if (!permissionsService.canManageUser(user.role, targetUser.role as UserRole)) {
        return reply.status(403).send({
          success: false,
          message: 'Vous ne pouvez pas modifier le role de cet utilisateur'
        });
      }

      if (!permissionsService.canManageUser(user.role, body.role)) {
        return reply.status(403).send({
          success: false,
          message: 'Vous ne pouvez pas attribuer ce role'
        });
      }

      // Mettre a jour le role
      const updatedUser = await fastify.prisma.user.update({
        where: { id },
        data: { role: body.role },
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          role: true,
          updatedAt: true
        }
      });

      return reply.send({
        success: true,
        data: updatedUser,
        message: `Role mis a jour vers ${body.role}`
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          message: 'Donnees invalides',
          errors: error.errors
        });
      }

      logError(fastify.log, 'Update user role error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  });

  // Activer/desactiver un utilisateur
  fastify.patch('/users/:id/status', {
    onRequest: [fastify.authenticate, requireAdmin],
    schema: {
      description: 'Activate or deactivate user account. Admins can only modify status of users with lower hierarchy level. Requires canManageUsers permission.',
      tags: ['admin'],
      summary: 'Update user status',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'User unique identifier' }
        }
      },
      body: {
        type: 'object',
        required: ['isActive'],
        properties: {
          isActive: { type: 'boolean', description: 'Set to true to activate, false to deactivate' }
        }
      },
      response: {
        200: {
          description: 'User status successfully updated',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                username: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                isActive: { type: 'boolean' },
                deactivatedAt: { type: 'string', format: 'date-time', nullable: true },
                updatedAt: { type: 'string', format: 'date-time' }
              }
            },
            message: { type: 'string', example: 'Utilisateur active' }
          }
        },
        400: {
          description: 'Invalid input data',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Donnees invalides' },
            errors: { type: 'array', items: { type: 'object' } }
          }
        },
        401: errorResponseSchema,
        403: {
          description: 'Insufficient permissions or cannot modify this user',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Vous ne pouvez pas modifier le statut de cet utilisateur' }
          }
        },
        404: {
          description: 'User not found',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Utilisateur non trouve' }
          }
        },
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      const user = authContext.registeredUser;
      const { id } = request.params as { id: string };
      const body = updateUserStatusSchema.parse(request.body);
      const permissions = permissionsService.getUserPermissions(user.role);

      if (!permissions.canManageUsers) {
        return reply.status(403).send({
          success: false,
          message: 'Permission insuffisante'
        });
      }

      // Recuperer l'utilisateur cible
      const targetUser = await fastify.prisma.user.findUnique({
        where: { id }
      });

      if (!targetUser) {
        return reply.status(404).send({
          success: false,
          message: 'Utilisateur non trouve'
        });
      }

      // Verifier les permissions
      if (!permissionsService.canManageUser(user.role, targetUser.role as UserRole)) {
        return reply.status(403).send({
          success: false,
          message: 'Vous ne pouvez pas modifier le statut de cet utilisateur'
        });
      }

      // Mettre a jour le statut
      const updatedUser = await fastify.prisma.user.update({
        where: { id },
        data: {
          isActive: body.isActive,
          deactivatedAt: body.isActive ? null : new Date()
        },
        select: {
          id: true,
          username: true,
          firstName: true,
          lastName: true,
          isActive: true,
          deactivatedAt: true,
          updatedAt: true
        }
      });

      return reply.send({
        success: true,
        data: updatedUser,
        message: body.isActive ? 'Utilisateur active' : 'Utilisateur desactive'
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          message: 'Donnees invalides',
          errors: error.errors
        });
      }

      logError(fastify.log, 'Update user status error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  });

  // Gestion des messages - Liste avec pagination
  fastify.get('/messages', {
    onRequest: [fastify.authenticate, requireAdmin],
    schema: {
      description: 'Get paginated list of messages with filtering by content, type, and time period. Requires canModerateContent permission.',
      tags: ['admin'],
      summary: 'List messages with pagination',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          offset: { type: 'string', description: 'Pagination offset', default: '0' },
          limit: { type: 'string', description: 'Pagination limit (max 100)', default: '20' },
          search: { type: 'string', description: 'Search in message content' },
          type: { type: 'string', description: 'Filter by message type' },
          period: { type: 'string', enum: ['today', 'week', 'month'], description: 'Filter by time period' }
        }
      },
      response: {
        200: {
          description: 'Messages list successfully retrieved',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'array', items: { type: 'object' } },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                limit: { type: 'number' },
                offset: { type: 'number' },
                hasMore: { type: 'boolean' }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      const user = authContext.registeredUser;
      const permissions = permissionsService.getUserPermissions(user.role);

      if (!permissions.canModerateContent) {
        return reply.status(403).send({
          success: false,
          message: 'Permission insuffisante pour gerer les messages'
        });
      }

      const { offset = '0', limit = '20', search, type, period } = request.query as any;
      const { offsetNum, limitNum } = validatePagination(offset, limit);

      // Construire les filtres
      const where: any = { isDeleted: false };

      if (search) {
        where.content = { contains: search, mode: 'insensitive' };
      }

      if (type) {
        where.messageType = type;
      }

      // Filtre par periode
      if (period) {
        const now = new Date();
        let startDate = new Date();

        switch (period) {
          case 'today':
            startDate.setHours(0, 0, 0, 0);
            break;
          case 'week':
            startDate.setDate(startDate.getDate() - 7);
            break;
          case 'month':
            startDate.setDate(startDate.getDate() - 30);
            break;
        }

        where.createdAt = { gte: startDate };
      }

      const [messages, totalCount] = await Promise.all([
        fastify.prisma.message.findMany({
          where,
          select: {
            id: true,
            content: true,
            messageType: true,
            originalLanguage: true,
            isEdited: true,
            createdAt: true,
            sender: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true
              }
            },
            anonymousSender: {
              select: {
                id: true,
                username: true,
                firstName: true,
                lastName: true
              }
            },
            conversation: {
              select: {
                id: true,
                identifier: true,
                title: true,
                type: true
              }
            },
            attachments: {
              select: {
                id: true,
                fileName: true,
                originalName: true,
                mimeType: true,
                fileSize: true,
                fileUrl: true,
                thumbnailUrl: true,
                width: true,
                height: true,
                duration: true,
                bitrate: true,
                sampleRate: true,
                codec: true,
                channels: true,
                fps: true,
                videoCodec: true,
                pageCount: true,
                lineCount: true,
                uploadedBy: true,
                isAnonymous: true,
                createdAt: true
              }
            },
            _count: {
              select: {
                translations: true,
                replies: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.message.count({ where })
      ]);

      return reply.send({
        success: true,
        data: messages,
        pagination: {
          total: totalCount,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + messages.length < totalCount
        }
      });

    } catch (error) {
      logError(fastify.log, 'Get admin messages error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  });

  // Gestion des communautes - Liste avec pagination
  fastify.get('/communities', {
    onRequest: [fastify.authenticate, requireAdmin],
    schema: {
      description: 'Get paginated list of communities with filtering options. Requires canManageCommunities permission.',
      tags: ['admin'],
      summary: 'List communities with pagination',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          offset: { type: 'string', description: 'Pagination offset', default: '0' },
          limit: { type: 'string', description: 'Pagination limit (max 100)', default: '20' },
          search: { type: 'string', description: 'Search by name, identifier, description' },
          isPrivate: { type: 'string', enum: ['true', 'false'], description: 'Filter by privacy status' }
        }
      },
      response: {
        200: {
          description: 'Communities list successfully retrieved',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'array', items: { type: 'object' } },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                limit: { type: 'number' },
                offset: { type: 'number' },
                hasMore: { type: 'boolean' }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      const user = authContext.registeredUser;
      const permissions = permissionsService.getUserPermissions(user.role);

      if (!permissions.canManageCommunities) {
        return reply.status(403).send({
          success: false,
          message: 'Permission insuffisante pour gerer les communautes'
        });
      }

      const { offset = '0', limit = '20', search, isPrivate } = request.query as any;
      const { offsetNum, limitNum } = validatePagination(offset, limit);

      // Construire les filtres
      const where: any = {};

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { identifier: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } }
        ];
      }

      if (isPrivate !== undefined) {
        where.isPrivate = isPrivate === 'true';
      }

      const [communities, totalCount] = await Promise.all([
        fastify.prisma.community.findMany({
          where,
          select: {
            id: true,
            identifier: true,
            name: true,
            description: true,
            avatar: true,
            isPrivate: true,
            createdAt: true,
            creator: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true
              }
            },
            _count: {
              select: {
                members: true,
                Conversation: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.community.count({ where })
      ]);

      return reply.send({
        success: true,
        data: communities,
        pagination: {
          total: totalCount,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + communities.length < totalCount
        }
      });

    } catch (error) {
      logError(fastify.log, 'Get admin communities error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  });


  // Gestion des traductions - Liste avec pagination
  fastify.get('/translations', {
    onRequest: [fastify.authenticate, requireAdmin],
    schema: {
      description: 'Get paginated list of message translations with filtering by source/target language and time period. Requires canManageTranslations permission.',
      tags: ['admin'],
      summary: 'List translations with pagination',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          offset: { type: 'string', description: 'Pagination offset', default: '0' },
          limit: { type: 'string', description: 'Pagination limit (max 100)', default: '20' },
          sourceLanguage: { type: 'string', description: 'Filter by source language code' },
          targetLanguage: { type: 'string', description: 'Filter by target language code' },
          period: { type: 'string', enum: ['today', 'week', 'month'], description: 'Filter by time period' }
        }
      },
      response: {
        200: {
          description: 'Translations list successfully retrieved',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'array', items: { type: 'object' } },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                limit: { type: 'number' },
                offset: { type: 'number' },
                hasMore: { type: 'boolean' }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      const user = authContext.registeredUser;
      const permissions = permissionsService.getUserPermissions(user.role);

      if (!permissions.canManageTranslations) {
        return reply.status(403).send({
          success: false,
          message: 'Permission insuffisante pour gerer les traductions'
        });
      }

      const { offset = '0', limit = '20', sourceLanguage, targetLanguage, period } = request.query as any;
      const { offsetNum, limitNum } = validatePagination(offset, limit);

      // Construire les filtres
      // Note: sourceLanguage is derived from message.originalLanguage, so we filter via message relation
      const where: any = {};

      if (sourceLanguage) {
        where.message = {
          originalLanguage: sourceLanguage
        };
      }

      if (targetLanguage) {
        where.targetLanguage = targetLanguage;
      }

      // Filtre par periode
      if (period) {
        const now = new Date();
        let startDate = new Date();

        switch (period) {
          case 'today':
            startDate.setHours(0, 0, 0, 0);
            break;
          case 'week':
            startDate.setDate(startDate.getDate() - 7);
            break;
          case 'month':
            startDate.setDate(startDate.getDate() - 30);
            break;
        }

        where.createdAt = { gte: startDate };
      }

      const [translations, totalCount] = await Promise.all([
        fastify.prisma.messageTranslation.findMany({
          where,
          include: {
            message: {
              select: {
                id: true,
                content: true,
                originalLanguage: true,
                sender: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true
                  }
                },
                conversation: {
                  select: {
                    id: true,
                    identifier: true,
                    title: true
                  }
                }
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.messageTranslation.count({ where })
      ]);

      return reply.send({
        success: true,
        data: translations.map(translation => ({
          id: translation.id,
          sourceLanguage: translation.message?.originalLanguage || null,
          targetLanguage: translation.targetLanguage,
          translatedContent: translation.translatedContent,
          translationModel: translation.translationModel,
          confidenceScore: translation.confidenceScore,
          createdAt: translation.createdAt,
          message: translation.message ? {
            id: translation.message.id,
            content: translation.message.content,
            originalLanguage: translation.message.originalLanguage,
            originalContent: translation.message.content,
            sender: translation.message.sender,
            conversation: translation.message.conversation
          } : null
        })),
        pagination: {
          total: totalCount,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + translations.length < totalCount
        }
      });

    } catch (error) {
      logError(fastify.log, 'Get admin translations error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  });


  // Gestion des liens de partage - Liste avec pagination
  fastify.get('/share-links', {
    onRequest: [fastify.authenticate, requireAdmin],
    schema: {
      description: 'Get paginated list of conversation share links with filtering options. Requires canManageConversations permission.',
      tags: ['admin'],
      summary: 'List share links with pagination',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          offset: { type: 'string', description: 'Pagination offset', default: '0' },
          limit: { type: 'string', description: 'Pagination limit (max 100)', default: '20' },
          search: { type: 'string', description: 'Search by linkId, identifier, name' },
          isActive: { type: 'string', enum: ['true', 'false'], description: 'Filter by active status' }
        }
      },
      response: {
        200: {
          description: 'Share links list successfully retrieved',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'array', items: { type: 'object' } },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                limit: { type: 'number' },
                offset: { type: 'number' },
                hasMore: { type: 'boolean' }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      const user = authContext.registeredUser;
      const permissions = permissionsService.getUserPermissions(user.role);

      if (!permissions.canManageConversations) {
        return reply.status(403).send({
          success: false,
          message: 'Permission insuffisante pour gerer les liens de partage'
        });
      }

      const { offset = '0', limit = '20', search, isActive } = request.query as any;
      const { offsetNum, limitNum } = validatePagination(offset, limit);

      // Construire les filtres
      const where: any = {};

      if (search) {
        where.OR = [
          { linkId: { contains: search, mode: 'insensitive' } },
          { identifier: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } }
        ];
      }

      if (isActive !== undefined) {
        where.isActive = isActive === 'true';
      }

      const [shareLinks, totalCount] = await Promise.all([
        fastify.prisma.conversationShareLink.findMany({
          where,
          select: {
            id: true,
            linkId: true,
            identifier: true,
            name: true,
            description: true,
            maxUses: true,
            currentUses: true,
            maxConcurrentUsers: true,
            currentConcurrentUsers: true,
            expiresAt: true,
            isActive: true,
            allowAnonymousMessages: true,
            allowAnonymousFiles: true,
            allowAnonymousImages: true,
            createdAt: true,
            creator: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true
              }
            },
            conversation: {
              select: {
                id: true,
                identifier: true,
                title: true,
                type: true
              }
            },
            _count: {
              select: {
                anonymousParticipants: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.conversationShareLink.count({ where })
      ]);

      return reply.send({
        success: true,
        data: shareLinks,
        pagination: {
          total: totalCount,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + shareLinks.length < totalCount
        }
      });

    } catch (error) {
      logError(fastify.log, 'Get admin share links error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  });

  // Statistiques avancees
  fastify.get('/analytics', {
    onRequest: [fastify.authenticate, requireAdmin],
    schema: {
      description: 'Get advanced analytics including user activity, message trends, conversation metrics over specified time periods. Requires canViewAnalytics permission.',
      tags: ['admin'],
      summary: 'Get advanced analytics',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['24h', '7d', '30d', '90d'],
            default: '7d',
            description: 'Analytics time period'
          }
        }
      },
      response: {
        200: {
          description: 'Analytics successfully retrieved',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                period: { type: 'string' },
                startDate: { type: 'string', format: 'date-time' },
                endDate: { type: 'string', format: 'date-time' },
                userActivity: { type: 'array', items: { type: 'object' } },
                messageActivity: { type: 'array', items: { type: 'object' } },
                conversationActivity: { type: 'array', items: { type: 'object' } },
                usersByRole: { type: 'array', items: { type: 'object' } },
                topActiveUsers: { type: 'array', items: { type: 'object' } }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      const user = authContext.registeredUser;
      const permissions = permissionsService.getUserPermissions(user.role);

      if (!permissions.canViewAnalytics) {
        return reply.status(403).send({
          success: false,
          message: 'Permission insuffisante pour voir les analyses'
        });
      }

      const { period = '7d' } = request.query as any;

      // Calculer la periode
      const now = new Date();
      let startDate = new Date();

      switch (period) {
        case '24h':
          startDate.setHours(startDate.getHours() - 24);
          break;
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(startDate.getDate() - 90);
          break;
        default:
          startDate.setDate(startDate.getDate() - 7);
      }

      // Statistiques d'activite
      const [
        userActivity,
        messageActivity,
        conversationActivity,
        usersByRole,
        topActiveUsers
      ] = await Promise.all([
        // Nouveaux utilisateurs par periode
        fastify.prisma.user.groupBy({
          by: ['createdAt'],
          where: {
            createdAt: { gte: startDate }
          },
          _count: { id: true }
        }),

        // Messages par periode
        fastify.prisma.message.groupBy({
          by: ['createdAt'],
          where: {
            createdAt: { gte: startDate },
            isDeleted: false
          },
          _count: { id: true }
        }),

        // Nouvelles conversations par periode
        fastify.prisma.conversation.groupBy({
          by: ['createdAt'],
          where: {
            createdAt: { gte: startDate }
          },
          _count: { id: true }
        }),

        // Repartition par role
        fastify.prisma.user.groupBy({
          by: ['role'],
          _count: { id: true }
        }),

        // Utilisateurs les plus actifs
        fastify.prisma.user.findMany({
          select: {
            id: true,
            username: true,
            displayName: true,
            _count: {
              select: {
                sentMessages: true
              }
            }
          },
          orderBy: {
            sentMessages: {
              _count: 'desc'
            }
          },
          take: 10
        })
      ]);

      return reply.send({
        success: true,
        data: {
          period,
          startDate: startDate.toISOString(),
          endDate: now.toISOString(),
          userActivity,
          messageActivity,
          conversationActivity,
          usersByRole,
          topActiveUsers
        }
      });

    } catch (error) {
      logError(fastify.log, 'Get analytics error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  });

  // Classement/Ranking des utilisateurs et conversations
  fastify.get('/ranking', {
    onRequest: [fastify.authenticate, requireAdmin],
    schema: {
      description: 'Get rankings of users, conversations, messages, or links based on various criteria (message count, reactions, calls, etc.). Supports multiple entity types and ranking criteria with configurable time periods. Requires canViewAnalytics permission.',
      tags: ['admin'],
      summary: 'Get entity rankings',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          entityType: {
            type: 'string',
            enum: ['users', 'conversations', 'messages', 'links'],
            default: 'users',
            description: 'Type of entity to rank'
          },
          criterion: {
            type: 'string',
            description: 'Ranking criterion (varies by entity type). For users: messages_sent, reactions_given, mentions_received, etc. For conversations: message_count, member_count, reaction_count, etc.'
          },
          period: {
            type: 'string',
            enum: ['1d', '7d', '30d', '60d', '90d', '180d', '365d', 'all'],
            default: '7d',
            description: 'Time period for ranking'
          },
          limit: {
            type: 'string',
            default: '50',
            description: 'Maximum number of results (max 100)'
          }
        }
      },
      response: {
        200: {
          description: 'Rankings successfully retrieved',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                entityType: { type: 'string' },
                criterion: { type: 'string' },
                period: { type: 'string' },
                startDate: { type: 'string', format: 'date-time', nullable: true },
                endDate: { type: 'string', format: 'date-time' },
                rankings: { type: 'array', items: { type: 'object' } },
                total: { type: 'number' }
              }
            }
          }
        },
        400: {
          description: 'Invalid entity type or criterion',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string' }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      const user = authContext.registeredUser;
      const permissions = permissionsService.getUserPermissions(user.role);

      if (!permissions.canViewAnalytics) {
        return reply.status(403).send({
          success: false,
          message: 'Permission insuffisante pour voir les classements'
        });
      }

      const {
        entityType = 'users',  // 'users' | 'conversations' | 'messages' | 'links'
        criterion = 'messages_sent',  // critere de classement
        period = '7d',  // '1d' | '7d' | '30d' | '60d' | '90d' | '180d' | '365d' | 'all'
        limit = '50'
      } = request.query as any;

      // Validate and cap the limit
      const limitNum = Math.min(Math.max(1, parseInt(limit, 10) || 50), 100);

      // Calculer la periode
      const now = new Date();
      let startDate: Date | undefined = new Date();

      if (period !== 'all') {
        switch (period) {
          case '1d':
          case '24h':
            startDate.setHours(startDate.getHours() - 24);
            break;
          case '7d':
            startDate.setDate(startDate.getDate() - 7);
            break;
          case '30d':
            startDate.setDate(startDate.getDate() - 30);
            break;
          case '60d':
            startDate.setDate(startDate.getDate() - 60);
            break;
          case '90d':
            startDate.setDate(startDate.getDate() - 90);
            break;
          case '180d':
            startDate.setDate(startDate.getDate() - 180);
            break;
          case '365d':
            startDate.setDate(startDate.getDate() - 365);
            break;
          default:
            startDate.setDate(startDate.getDate() - 7);
        }
      } else {
        startDate = undefined; // Pas de filtre de date pour 'all'
      }

      let rankings: any[] = [];

      // Classement des utilisateurs
      if (entityType === 'users') {
        switch (criterion) {
          case 'messages_sent':
            const allUsersWithMessages = await fastify.prisma.user.findMany({
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
                sentMessages: {
                  where: period !== 'all' ? {
                    createdAt: { gte: startDate },
                    isDeleted: false
                  } : { isDeleted: false },
                  select: { id: true }
                }
              }
            });

            rankings = allUsersWithMessages
              .map(u => ({
                id: u.id,
                username: u.username,
                displayName: u.displayName,
                avatar: u.avatar,
                count: u.sentMessages.length
              }))
              .filter(u => u.count > 0)
              .sort((a, b) => b.count - a.count)
              .slice(0, limitNum);
            break;

          case 'reactions_given':
            rankings = await fastify.prisma.user.findMany({
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
                _count: {
                  select: {
                    reactions: {
                      where: period !== 'all' ? {
                        createdAt: { gte: startDate }
                      } : {}
                    }
                  }
                }
              },
              orderBy: {
                reactions: {
                  _count: 'desc'
                }
              },
              take: limitNum
            });
            rankings = rankings.map(u => ({
              ...u,
              count: u._count.reactions,
              _count: undefined
            }));
            break;

          case 'mentions_received':
            // Compter les mentions recues par les utilisateurs
            // IMPORTANT: Prisma ne supporte pas where dans _count.select
            // On doit charger les mentions et compter manuellement
            const usersWithMentions = await fastify.prisma.user.findMany({
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
                mentions: {
                  where: period !== 'all' ? {
                    mentionedAt: { gte: startDate }
                  } : {},
                  select: {
                    id: true
                  }
                }
              }
            });

            rankings = usersWithMentions
              .map(u => ({
                id: u.id,
                username: u.username,
                displayName: u.displayName,
                avatar: u.avatar,
                count: u.mentions.length
              }))
              .filter(u => u.count > 0)
              .sort((a, b) => b.count - a.count)
              .slice(0, limitNum);
            break;

          case 'conversations_joined':
            // IMPORTANT: Prisma ne supporte pas where dans _count.select
            // On doit charger les conversations et compter manuellement
            const usersWithConversations = await fastify.prisma.user.findMany({
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
                conversations: {
                  where: period !== 'all' ? {
                    joinedAt: { gte: startDate },
                    isActive: true
                  } : { isActive: true },
                  select: {
                    id: true
                  }
                }
              }
            });

            rankings = usersWithConversations
              .map(u => ({
                id: u.id,
                username: u.username,
                displayName: u.displayName,
                avatar: u.avatar,
                count: u.conversations.length
              }))
              .filter(u => u.count > 0)
              .sort((a, b) => b.count - a.count)
              .slice(0, limitNum);
            break;

          case 'communities_created':
            rankings = await fastify.prisma.user.findMany({
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
                _count: {
                  select: {
                    createdCommunities: {
                      where: period !== 'all' ? {
                        createdAt: { gte: startDate }
                      } : {}
                    }
                  }
                }
              },
              orderBy: {
                createdCommunities: {
                  _count: 'desc'
                }
              },
              take: limitNum
            });
            rankings = rankings.map(u => ({
              ...u,
              count: u._count.createdCommunities,
              _count: undefined
            }));
            break;

          case 'share_links_created':
            rankings = await fastify.prisma.user.findMany({
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
                _count: {
                  select: {
                    createdShareLinks: {
                      where: period !== 'all' ? {
                        createdAt: { gte: startDate }
                      } : {}
                    }
                  }
                }
              },
              orderBy: {
                createdShareLinks: {
                  _count: 'desc'
                }
              },
              take: limitNum
            });
            rankings = rankings.map(u => ({
              ...u,
              count: u._count.createdShareLinks,
              _count: undefined
            }));
            break;

          case 'reactions_received':
            // Compter les reactions recues sur les messages de l'utilisateur
            const usersWithReactionsReceived = await fastify.prisma.user.findMany({
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
                sentMessages: {
                  select: {
                    _count: {
                      select: {
                        reactions: {
                          where: period !== 'all' ? {
                            createdAt: { gte: startDate }
                          } : {}
                        }
                      }
                    }
                  },
                  where: {
                    isDeleted: false
                  }
                }
              }
            });

            rankings = usersWithReactionsReceived
              .map(u => ({
                id: u.id,
                username: u.username,
                displayName: u.displayName,
                avatar: u.avatar,
                count: u.sentMessages.reduce((sum, msg) => sum + msg._count.reactions, 0)
              }))
              .sort((a, b) => b.count - a.count)
              .slice(0, limitNum);
            break;

          case 'replies_received':
            // Compter les reponses recues aux messages de l'utilisateur
            const usersWithRepliesReceived = await fastify.prisma.user.findMany({
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
                sentMessages: {
                  select: {
                    _count: {
                      select: {
                        replies: {
                          where: period !== 'all' ? {
                            createdAt: { gte: startDate },
                            isDeleted: false
                          } : { isDeleted: false }
                        }
                      }
                    }
                  },
                  where: {
                    isDeleted: false
                  }
                }
              }
            });

            rankings = usersWithRepliesReceived
              .map(u => ({
                id: u.id,
                username: u.username,
                displayName: u.displayName,
                avatar: u.avatar,
                count: u.sentMessages.reduce((sum, msg) => sum + msg._count.replies, 0)
              }))
              .sort((a, b) => b.count - a.count)
              .slice(0, limitNum);
            break;

          case 'mentions_sent':
            // Compter les mentions envoyees (dans les messages de l'utilisateur)
            // IMPORTANT: Prisma ne supporte pas where dans _count.select
            // On doit charger les mentions et compter manuellement
            const usersWithMentionsSent = await fastify.prisma.user.findMany({
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
                sentMessages: {
                  select: {
                    mentions: {
                      where: period !== 'all' ? {
                        mentionedAt: { gte: startDate }
                      } : {},
                      select: {
                        id: true
                      }
                    }
                  },
                  where: {
                    isDeleted: false
                  }
                }
              }
            });

            rankings = usersWithMentionsSent
              .map(u => ({
                id: u.id,
                username: u.username,
                displayName: u.displayName,
                avatar: u.avatar,
                count: u.sentMessages.reduce((sum, msg) => sum + msg.mentions.length, 0)
              }))
              .filter(u => u.count > 0)
              .sort((a, b) => b.count - a.count)
              .slice(0, limitNum);
            break;

          case 'reports_sent':
            // Compter les signalements envoyes par les utilisateurs
            const usersWithReportsSent = await fastify.prisma.user.findMany({
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true
              }
            });

            // Pour chaque utilisateur, compter les reports crees
            const reportsSentCount = await Promise.all(
              usersWithReportsSent.map(async (u) => {
                const reportCount = await fastify.prisma.report.count({
                  where: {
                    reporterId: u.id,
                    ...(startDate ? { createdAt: { gte: startDate } } : {})
                  }
                });
                return {
                  id: u.id,
                  username: u.username,
                  displayName: u.displayName,
                  avatar: u.avatar,
                  count: reportCount
                };
              })
            );

            rankings = reportsSentCount
              .sort((a, b) => b.count - a.count)
              .slice(0, limitNum);
            break;

          case 'reports_received':
            // Compter les signalements recus (sur les messages de l'utilisateur)
            const usersWithReportsReceived = await fastify.prisma.user.findMany({
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
                sentMessages: {
                  select: {
                    id: true
                  },
                  where: {
                    isDeleted: false
                  }
                }
              }
            });

            // Pour chaque utilisateur, compter les reports sur leurs messages
            const reportsCount = await Promise.all(
              usersWithReportsReceived.map(async (u) => {
                const messageIds = u.sentMessages.map(m => m.id);
                const reportCount = await fastify.prisma.report.count({
                  where: {
                    reportedType: 'message',
                    reportedEntityId: { in: messageIds },
                    ...(startDate ? { createdAt: { gte: startDate } } : {})
                  }
                });
                return {
                  id: u.id,
                  username: u.username,
                  displayName: u.displayName,
                  avatar: u.avatar,
                  count: reportCount
                };
              })
            );

            rankings = reportsCount
              .sort((a, b) => b.count - a.count)
              .slice(0, limitNum);
            break;

          case 'friend_requests_sent':
            rankings = await fastify.prisma.user.findMany({
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
                _count: {
                  select: {
                    sentFriendRequests: {
                      where: period !== 'all' ? {
                        createdAt: { gte: startDate }
                      } : {}
                    }
                  }
                }
              },
              orderBy: {
                sentFriendRequests: {
                  _count: 'desc'
                }
              },
              take: limitNum
            });
            rankings = rankings.map(u => ({
              ...u,
              count: u._count.sentFriendRequests,
              _count: undefined
            }));
            break;

          case 'friend_requests_received':
            rankings = await fastify.prisma.user.findMany({
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
                _count: {
                  select: {
                    receivedFriendRequests: {
                      where: period !== 'all' ? {
                        createdAt: { gte: startDate }
                      } : {}
                    }
                  }
                }
              },
              orderBy: {
                receivedFriendRequests: {
                  _count: 'desc'
                }
              },
              take: limitNum
            });
            rankings = rankings.map(u => ({
              ...u,
              count: u._count.receivedFriendRequests,
              _count: undefined
            }));
            break;

          case 'calls_initiated':
            rankings = await fastify.prisma.user.findMany({
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
                _count: {
                  select: {
                    initiatedCalls: {
                      where: period !== 'all' ? {
                        startedAt: { gte: startDate }
                      } : {}
                    }
                  }
                }
              },
              orderBy: {
                initiatedCalls: {
                  _count: 'desc'
                }
              },
              take: limitNum
            });
            rankings = rankings.map(u => ({
              ...u,
              count: u._count.initiatedCalls,
              _count: undefined
            }));
            break;

          case 'call_participations':
            rankings = await fastify.prisma.user.findMany({
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
                _count: {
                  select: {
                    callParticipations: {
                      where: period !== 'all' ? {
                        joinedAt: { gte: startDate }
                      } : {}
                    }
                  }
                }
              },
              orderBy: {
                callParticipations: {
                  _count: 'desc'
                }
              },
              take: limitNum
            });
            rankings = rankings.map(u => ({
              ...u,
              count: u._count.callParticipations,
              _count: undefined
            }));
            break;

          case 'files_shared':
            // Compter les fichiers partages (attachments dans les messages de l'utilisateur)
            const usersWithFilesShared = await fastify.prisma.user.findMany({
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
                sentMessages: {
                  select: {
                    _count: {
                      select: {
                        attachments: {
                          where: period !== 'all' ? {
                            createdAt: { gte: startDate }
                          } : {}
                        }
                      }
                    }
                  },
                  where: {
                    isDeleted: false
                  }
                }
              }
            });

            rankings = usersWithFilesShared
              .map(u => ({
                id: u.id,
                username: u.username,
                displayName: u.displayName,
                avatar: u.avatar,
                count: u.sentMessages.reduce((sum, msg) => sum + msg._count.attachments, 0)
              }))
              .sort((a, b) => b.count - a.count)
              .slice(0, limitNum);
            break;

          case 'most_referrals_via_affiliate':
            // Utilisateurs qui ont ramene le plus de membres via affiliation
            rankings = await fastify.prisma.user.findMany({
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
                _count: {
                  select: {
                    affiliateRelations: {
                      where: period !== 'all' ? {
                        createdAt: { gte: startDate }
                      } : {}
                    }
                  }
                }
              },
              orderBy: {
                affiliateRelations: {
                  _count: 'desc'
                }
              },
              take: limitNum
            });
            rankings = rankings.map(u => ({
              ...u,
              count: u._count.affiliateRelations,
              _count: undefined
            }));
            break;

          case 'most_referrals_via_sharelinks':
            // Utilisateurs qui ont ramene le plus de membres via liens de partage
            const usersWithShareLinkReferrals = await fastify.prisma.user.findMany({
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
                createdShareLinks: {
                  select: {
                    currentUniqueSessions: true
                  }
                }
              }
            });

            rankings = usersWithShareLinkReferrals
              .map(u => ({
                id: u.id,
                username: u.username,
                displayName: u.displayName,
                avatar: u.avatar,
                count: u.createdShareLinks.reduce((sum, link) => sum + link.currentUniqueSessions, 0)
              }))
              .sort((a, b) => b.count - a.count)
              .slice(0, limitNum);
            break;

          case 'most_contacts':
            // Utilisateurs avec le plus de contacts (demandes d'amitie acceptees)
            const usersWithContacts = await fastify.prisma.user.findMany({
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
                sentFriendRequests: {
                  select: {
                    status: true,
                    createdAt: true
                  }
                },
                receivedFriendRequests: {
                  select: {
                    status: true,
                    createdAt: true
                  }
                }
              }
            });

            rankings = usersWithContacts
              .map(u => ({
                id: u.id,
                username: u.username,
                displayName: u.displayName,
                avatar: u.avatar,
                count: [
                  ...u.sentFriendRequests.filter(fr =>
                    fr.status === 'accepted' &&
                    (!startDate || fr.createdAt >= startDate)
                  ),
                  ...u.receivedFriendRequests.filter(fr =>
                    fr.status === 'accepted' &&
                    (!startDate || fr.createdAt >= startDate)
                  )
                ].length
              }))
              .sort((a, b) => b.count - a.count)
              .slice(0, limitNum);
            break;

          case 'most_tracking_links_created':
            // Utilisateurs avec le plus de liens trackes crees
            rankings = await fastify.prisma.user.findMany({
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
                _count: {
                  select: {
                    createdTrackingLinks: {
                      where: period !== 'all' ? {
                        createdAt: { gte: startDate }
                      } : {}
                    }
                  }
                }
              },
              orderBy: {
                createdTrackingLinks: {
                  _count: 'desc'
                }
              },
              take: limitNum
            });
            rankings = rankings.map(u => ({
              ...u,
              count: u._count.createdTrackingLinks,
              _count: undefined
            }));
            break;

          case 'most_tracking_link_clicks':
            // Utilisateurs dont les liens trackes sont les plus visites
            const usersWithTrackingLinks = await fastify.prisma.user.findMany({
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true,
                createdTrackingLinks: {
                  select: {
                    totalClicks: true
                  },
                  where: period !== 'all' ? {
                    createdAt: { gte: startDate }
                  } : {}
                }
              }
            });

            rankings = usersWithTrackingLinks
              .map(u => ({
                id: u.id,
                username: u.username,
                displayName: u.displayName,
                avatar: u.avatar,
                count: u.createdTrackingLinks.reduce((sum, link) => sum + link.totalClicks, 0)
              }))
              .sort((a, b) => b.count - a.count)
              .slice(0, limitNum);
            break;

          default:
            return reply.status(400).send({
              success: false,
              message: 'Critere de classement invalide pour les utilisateurs'
            });
        }
      }
      // Classement des conversations
      else if (entityType === 'conversations') {
        switch (criterion) {
          case 'message_count':
            rankings = await fastify.prisma.conversation.findMany({
              select: {
                id: true,
                identifier: true,
                title: true,
                type: true,
                avatar: true,
                banner: true,
                _count: {
                  select: {
                    messages: {
                      where: period !== 'all' ? {
                        createdAt: { gte: startDate },
                        isDeleted: false
                      } : { isDeleted: false }
                    }
                  }
                }
              },
              where: {
                isActive: true,
                type: { not: 'global' }  // Exclure les conversations globales
              },
              orderBy: {
                messages: {
                  _count: 'desc'
                }
              },
              take: limitNum
            });
            rankings = rankings.map(c => ({
              ...c,
              count: c._count.messages,
              _count: undefined
            }));
            break;

          case 'member_count':
            rankings = await fastify.prisma.conversation.findMany({
              select: {
                id: true,
                identifier: true,
                title: true,
                type: true,
                avatar: true,
                banner: true,
                _count: {
                  select: {
                    members: {
                      where: {
                        isActive: true
                      }
                    }
                  }
                }
              },
              where: {
                isActive: true,
                type: { not: 'global' }
              },
              orderBy: {
                members: {
                  _count: 'desc'
                }
              },
              take: limitNum
            });
            rankings = rankings.map(c => ({
              ...c,
              count: c._count.members,
              _count: undefined
            }));
            break;

          case 'reaction_count':
            // Pour les reactions, on doit compter via les messages de la conversation
            const conversationsWithReactions = await fastify.prisma.conversation.findMany({
              select: {
                id: true,
                identifier: true,
                title: true,
                type: true,
                avatar: true,
                banner: true,
                messages: {
                  select: {
                    _count: {
                      select: {
                        reactions: {
                          where: period !== 'all' ? {
                            createdAt: { gte: startDate }
                          } : {}
                        }
                      }
                    }
                  }
                }
              },
              where: {
                isActive: true,
                type: { not: 'global' }
              }
            });

            rankings = conversationsWithReactions
              .map(c => ({
                id: c.id,
                identifier: c.identifier,
                title: c.title,
                type: c.type,
                avatar: c.avatar,
                banner: c.banner,
                count: c.messages.reduce((sum, m) => sum + m._count.reactions, 0)
              }))
              .sort((a, b) => b.count - a.count)
              .slice(0, limitNum);
            break;

          case 'recent_activity':
            rankings = await fastify.prisma.conversation.findMany({
              select: {
                id: true,
                identifier: true,
                title: true,
                type: true,
                avatar: true,
                banner: true,
                lastMessageAt: true
              },
              where: {
                isActive: true,
                type: { not: 'global' },
                ...(startDate ? { lastMessageAt: { gte: startDate } } : {})
              },
              orderBy: {
                lastMessageAt: 'desc'
              },
              take: limitNum
            });
            rankings = rankings.map(c => ({
              ...c,
              lastActivity: c.lastMessageAt
            }));
            break;

          case 'files_shared':
            // Conversations avec le plus de fichiers partages
            const conversationsWithFiles = await fastify.prisma.conversation.findMany({
              select: {
                id: true,
                identifier: true,
                title: true,
                type: true,
                avatar: true,
                banner: true,
                messages: {
                  select: {
                    _count: {
                      select: {
                        attachments: {
                          where: period !== 'all' ? {
                            createdAt: { gte: startDate }
                          } : {}
                        }
                      }
                    }
                  },
                  where: {
                    isDeleted: false
                  }
                }
              },
              where: {
                isActive: true,
                type: { not: 'global' }
              }
            });

            rankings = conversationsWithFiles
              .map(c => ({
                id: c.id,
                identifier: c.identifier,
                title: c.title,
                type: c.type,
                avatar: c.avatar,
                banner: c.banner,
                count: c.messages.reduce((sum, m) => sum + m._count.attachments, 0)
              }))
              .sort((a, b) => b.count - a.count)
              .slice(0, limitNum);
            break;

          case 'call_count':
            rankings = await fastify.prisma.conversation.findMany({
              select: {
                id: true,
                identifier: true,
                title: true,
                type: true,
                avatar: true,
                banner: true,
                _count: {
                  select: {
                    callSessions: {
                      where: period !== 'all' ? {
                        startedAt: { gte: startDate }
                      } : {}
                    }
                  }
                }
              },
              where: {
                isActive: true,
                type: { not: 'global' }
              },
              orderBy: {
                callSessions: {
                  _count: 'desc'
                }
              },
              take: limitNum
            });
            rankings = rankings.map(c => ({
              ...c,
              count: c._count.callSessions,
              _count: undefined
            }));
            break;

          default:
            return reply.status(400).send({
              success: false,
              message: 'Critere de classement invalide pour les conversations'
            });
        }
      }
      // Classement des messages
      else if (entityType === 'messages') {
        switch (criterion) {
          case 'most_reactions':
            // Messages avec le plus de reactions
            rankings = await fastify.prisma.message.findMany({
              select: {
                id: true,
                content: true,
                createdAt: true,
                messageType: true,
                conversationId: true,
                senderId: true,
                sender: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    avatar: true
                  }
                },
                conversation: {
                  select: {
                    id: true,
                    identifier: true,
                    title: true,
                    type: true
                  }
                },
                _count: {
                  select: {
                    reactions: {
                      where: period !== 'all' ? {
                        createdAt: { gte: startDate }
                      } : {}
                    }
                  }
                }
              },
              where: {
                isDeleted: false,
                ...(startDate ? { createdAt: { gte: startDate } } : {}),
                conversation: {
                  type: { not: 'global' }
                }
              },
              orderBy: {
                reactions: {
                  _count: 'desc'
                }
              },
              take: limitNum
            });
            rankings = rankings.map(m => ({
              ...m,
              count: m._count.reactions,
              _count: undefined,
              // Tronquer le contenu pour l'affichage
              contentPreview: m.content.length > 100 ? m.content.substring(0, 100) + '...' : m.content
            }));
            break;

          case 'most_replies':
            // Messages les plus repondus
            rankings = await fastify.prisma.message.findMany({
              select: {
                id: true,
                content: true,
                createdAt: true,
                messageType: true,
                conversationId: true,
                senderId: true,
                sender: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    avatar: true
                  }
                },
                conversation: {
                  select: {
                    id: true,
                    identifier: true,
                    title: true,
                    type: true
                  }
                },
                _count: {
                  select: {
                    replies: {
                      where: period !== 'all' ? {
                        createdAt: { gte: startDate },
                        isDeleted: false
                      } : { isDeleted: false }
                    }
                  }
                }
              },
              where: {
                isDeleted: false,
                ...(startDate ? { createdAt: { gte: startDate } } : {}),
                conversation: {
                  type: { not: 'global' }
                }
              },
              orderBy: {
                replies: {
                  _count: 'desc'
                }
              },
              take: limitNum
            });
            rankings = rankings.map(m => ({
              ...m,
              count: m._count.replies,
              _count: undefined,
              // Tronquer le contenu pour l'affichage
              contentPreview: m.content.length > 100 ? m.content.substring(0, 100) + '...' : m.content
            }));
            break;

          case 'most_mentions':
            // Messages avec le plus de mentions
            rankings = await fastify.prisma.message.findMany({
              select: {
                id: true,
                content: true,
                createdAt: true,
                messageType: true,
                conversationId: true,
                senderId: true,
                sender: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    avatar: true
                  }
                },
                conversation: {
                  select: {
                    id: true,
                    identifier: true,
                    title: true,
                    type: true
                  }
                },
                _count: {
                  select: {
                    mentions: {
                      where: period !== 'all' ? {
                        mentionedAt: { gte: startDate }
                      } : {}
                    }
                  }
                }
              },
              where: {
                isDeleted: false,
                ...(startDate ? { createdAt: { gte: startDate } } : {}),
                conversation: {
                  type: { not: 'global' }
                }
              },
              orderBy: {
                mentions: {
                  _count: 'desc'
                }
              },
              take: limitNum
            });
            rankings = rankings.map(m => ({
              ...m,
              count: m._count.mentions,
              _count: undefined,
              // Tronquer le contenu pour l'affichage
              contentPreview: m.content.length > 100 ? m.content.substring(0, 100) + '...' : m.content
            }));
            break;

          default:
            return reply.status(400).send({
              success: false,
              message: 'Critere de classement invalide pour les messages'
            });
        }
      }
      // Classement des liens
      else if (entityType === 'links') {
        switch (criterion) {
          case 'tracking_links_most_visited':
            // Liens trackes les plus visites (totalClicks)
            rankings = await fastify.prisma.trackingLink.findMany({
              select: {
                id: true,
                token: true,
                originalUrl: true,
                name: true,
                totalClicks: true,
                uniqueClicks: true,
                createdAt: true,
                creator: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    avatar: true
                  }
                }
              },
              where: period !== 'all' ? {
                createdAt: { gte: startDate }
              } : {},
              orderBy: {
                totalClicks: 'desc'
              },
              take: limitNum
            });
            rankings = rankings.map(l => ({
              ...l,
              shortCode: l.token,
              title: l.name,
              count: l.totalClicks,
              creator: l.creator,
              token: undefined,
              name: undefined
            }));
            break;

          case 'tracking_links_most_unique':
            // Liens trackes les plus visites (uniqueClicks)
            rankings = await fastify.prisma.trackingLink.findMany({
              select: {
                id: true,
                token: true,
                originalUrl: true,
                name: true,
                totalClicks: true,
                uniqueClicks: true,
                createdAt: true,
                creator: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    avatar: true
                  }
                }
              },
              where: period !== 'all' ? {
                createdAt: { gte: startDate }
              } : {},
              orderBy: {
                uniqueClicks: 'desc'
              },
              take: limitNum
            });
            rankings = rankings.map(l => ({
              ...l,
              shortCode: l.token,
              title: l.name,
              count: l.uniqueClicks,
              creator: l.creator,
              token: undefined,
              name: undefined
            }));
            break;

          case 'share_links_most_used':
            // Liens de partage les plus utilises (currentUses)
            rankings = await fastify.prisma.conversationShareLink.findMany({
              select: {
                id: true,
                identifier: true,
                currentUses: true,
                maxUses: true,
                currentUniqueSessions: true,
                expiresAt: true,
                createdAt: true,
                conversation: {
                  select: {
                    id: true,
                    identifier: true,
                    title: true,
                    type: true
                  }
                },
                creator: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    avatar: true
                  }
                }
              },
              where: {
                isActive: true,
                ...(startDate ? { createdAt: { gte: startDate } } : {})
              },
              orderBy: {
                currentUses: 'desc'
              },
              take: limitNum
            });
            rankings = rankings.map(l => ({
              ...l,
              count: l.currentUses,
              creator: l.creator
            }));
            break;

          case 'share_links_most_unique_sessions':
            // Liens de partage les plus utilises (currentUniqueSessions)
            rankings = await fastify.prisma.conversationShareLink.findMany({
              select: {
                id: true,
                identifier: true,
                currentUses: true,
                maxUses: true,
                currentUniqueSessions: true,
                expiresAt: true,
                createdAt: true,
                conversation: {
                  select: {
                    id: true,
                    identifier: true,
                    title: true,
                    type: true
                  }
                },
                creator: {
                  select: {
                    id: true,
                    username: true,
                    displayName: true,
                    avatar: true
                  }
                }
              },
              where: {
                isActive: true,
                ...(startDate ? { createdAt: { gte: startDate } } : {})
              },
              orderBy: {
                currentUniqueSessions: 'desc'
              },
              take: limitNum
            });
            rankings = rankings.map(l => ({
              ...l,
              count: l.currentUniqueSessions,
              creator: l.creator
            }));
            break;

          default:
            return reply.status(400).send({
              success: false,
              message: 'Critere de classement invalide pour les liens'
            });
        }
      } else {
        return reply.status(400).send({
          success: false,
          message: 'Type d\'entite invalide. Utilisez "users", "conversations", "messages" ou "links"'
        });
      }

      return reply.send({
        success: true,
        data: {
          entityType,
          criterion,
          period,
          startDate: startDate?.toISOString(),
          endDate: now.toISOString(),
          rankings,
          total: rankings.length
        }
      });

    } catch (error) {
      logError(fastify.log, 'Get ranking error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur interne du serveur'
      });
    }
  });
}
