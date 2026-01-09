import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logError } from '../utils/logger';
import { UserRoleEnum } from '@meeshy/shared/types';

// Types pour les rôles et permissions
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

// Schémas de validation
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
  // Utiliser le nouveau système d'authentification unifié
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
      message: 'Accès administrateur requis'
    });
  }
};

export async function adminRoutes(fastify: FastifyInstance) {
  // Tableau de bord administrateur
  fastify.get('/dashboard', {
    onRequest: [fastify.authenticate, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      const user = authContext.registeredUser;

      // Statistiques générales - Toutes les métriques demandées
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
        // Signalements réels depuis la table Report
        fastify.prisma.report.count(),
        // Pour les invitations, on utilise les demandes d'amitié comme proxy
        fastify.prisma.friendRequest.count({ where: { status: 'pending' } }),
        // Statistiques des langues les plus utilisées
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

      // Statistiques d'activité récente (7 derniers jours)
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

      // Statistiques par rôle
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
            // 4. Communautés
            totalCommunities,
            // 5. Traductions
            totalTranslations,
            // 6. Liens créés pour conversations
            totalShareLinks,
            activeShareLinks,
            // 7. Signalements (proxy avec messages supprimés)
            totalReports,
            // 8. Invitations à rejoindre communauté (proxy avec demandes d'amitié)
            totalInvitations,
            // 9. Langues les plus utilisées
            topLanguages: languagesStats.map(lang => ({
              language: lang.originalLanguage,
              count: lang._count.originalLanguage
            })),
            // Métadonnées supplémentaires
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
    onRequest: [fastify.authenticate, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      const user = authContext.registeredUser;
      const permissions = permissionsService.getUserPermissions(user.role);

      if (!permissions.canManageUsers) {
        return reply.status(403).send({
          success: false,
          message: 'Permission insuffisante pour gérer les utilisateurs'
        });
      }

      const { offset = '0', limit = '20', search, role, status } = request.query as any;
      const offsetNum = parseInt(offset, 10);
      const limitNum = parseInt(limit, 10);


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
            lastSeen: true,
            lastActiveAt: true,
            createdAt: true,
            updatedAt: true,
            // Champs de sécurité et vérification
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
    onRequest: [fastify.authenticate, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      const user = authContext.registeredUser;
      const permissions = permissionsService.getUserPermissions(user.role);

      if (!permissions.canManageUsers) {
        return reply.status(403).send({
          success: false,
          message: 'Permission insuffisante pour gérer les utilisateurs'
        });
      }

      const { offset = '0', limit = '20', search, status } = request.query as any;
      const offsetNum = parseInt(offset, 10);
      const limitNum = parseInt(limit, 10);

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
            lastSeenAt: true,
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

  // Détails d'un utilisateur
  fastify.get('/users/:id', {
    onRequest: [fastify.authenticate, requireAdmin]
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
          message: 'Utilisateur non trouvé'
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

  // Modifier le rôle d'un utilisateur
  fastify.patch('/users/:id/role', {
    onRequest: [fastify.authenticate, requireAdmin]
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

      // Récupérer l'utilisateur cible
      const targetUser = await fastify.prisma.user.findUnique({
        where: { id }
      });

      if (!targetUser) {
        return reply.status(404).send({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      // Vérifier si l'admin peut modifier ce rôle
      if (!permissionsService.canManageUser(user.role, targetUser.role as UserRole)) {
        return reply.status(403).send({
          success: false,
          message: 'Vous ne pouvez pas modifier le rôle de cet utilisateur'
        });
      }

      if (!permissionsService.canManageUser(user.role, body.role)) {
        return reply.status(403).send({
          success: false,
          message: 'Vous ne pouvez pas attribuer ce rôle'
        });
      }

      // Mettre à jour le rôle
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
        message: `Rôle mis à jour vers ${body.role}`
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          message: 'Données invalides',
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

  // Activer/désactiver un utilisateur
  fastify.patch('/users/:id/status', {
    onRequest: [fastify.authenticate, requireAdmin]
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

      // Récupérer l'utilisateur cible
      const targetUser = await fastify.prisma.user.findUnique({
        where: { id }
      });

      if (!targetUser) {
        return reply.status(404).send({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      // Vérifier les permissions
      if (!permissionsService.canManageUser(user.role, targetUser.role as UserRole)) {
        return reply.status(403).send({
          success: false,
          message: 'Vous ne pouvez pas modifier le statut de cet utilisateur'
        });
      }

      // Mettre à jour le statut
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
        message: body.isActive ? 'Utilisateur activé' : 'Utilisateur désactivé'
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          message: 'Données invalides',
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
    onRequest: [fastify.authenticate, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      const user = authContext.registeredUser;
      const permissions = permissionsService.getUserPermissions(user.role);

      if (!permissions.canModerateContent) {
        return reply.status(403).send({
          success: false,
          message: 'Permission insuffisante pour gérer les messages'
        });
      }

      const { offset = '0', limit = '20', search, type, period } = request.query as any;
      const offsetNum = parseInt(offset, 10);
      const limitNum = parseInt(limit, 10);

      // Construire les filtres
      const where: any = { isDeleted: false };

      if (search) {
        where.content = { contains: search, mode: 'insensitive' };
      }

      if (type) {
        where.messageType = type;
      }

      // Filtre par période
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

  // Gestion des communautés - Liste avec pagination
  fastify.get('/communities', {
    onRequest: [fastify.authenticate, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      const user = authContext.registeredUser;
      const permissions = permissionsService.getUserPermissions(user.role);

      if (!permissions.canManageCommunities) {
        return reply.status(403).send({
          success: false,
          message: 'Permission insuffisante pour gérer les communautés'
        });
      }

      const { offset = '0', limit = '20', search, isPrivate } = request.query as any;
      const offsetNum = parseInt(offset, 10);
      const limitNum = parseInt(limit, 10);

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
    onRequest: [fastify.authenticate, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      const user = authContext.registeredUser;
      const permissions = permissionsService.getUserPermissions(user.role);

      if (!permissions.canManageTranslations) {
        return reply.status(403).send({
          success: false,
          message: 'Permission insuffisante pour gérer les traductions'
        });
      }

      const { offset = '0', limit = '20', sourceLanguage, targetLanguage, period } = request.query as any;
      const offsetNum = parseInt(offset, 10);
      const limitNum = parseInt(limit, 10);

      // Construire les filtres
      const where: any = {};

      if (sourceLanguage) {
        where.sourceLanguage = sourceLanguage;
      }

      if (targetLanguage) {
        where.targetLanguage = targetLanguage;
      }

      // Filtre par période
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
          select: {
            id: true,
            sourceLanguage: true,
            targetLanguage: true,
            translatedContent: true,
            translationModel: true,
            confidenceScore: true,
            createdAt: true,
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
          ...translation,
          message: {
            ...translation.message,
            // S'assurer que le content est toujours le contenu original
            originalContent: translation.message.content
          }
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
    onRequest: [fastify.authenticate, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as any).authContext;
      const user = authContext.registeredUser;
      const permissions = permissionsService.getUserPermissions(user.role);

      if (!permissions.canManageConversations) {
        return reply.status(403).send({
          success: false,
          message: 'Permission insuffisante pour gérer les liens de partage'
        });
      }

      const { offset = '0', limit = '20', search, isActive } = request.query as any;
      const offsetNum = parseInt(offset, 10);
      const limitNum = parseInt(limit, 10);

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

  // Statistiques avancées
  fastify.get('/analytics', {
    onRequest: [fastify.authenticate, requireAdmin]
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

      // Calculer la période
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

      // Statistiques d'activité
      const [
        userActivity,
        messageActivity,
        conversationActivity,
        usersByRole,
        topActiveUsers
      ] = await Promise.all([
        // Nouveaux utilisateurs par période
        fastify.prisma.user.groupBy({
          by: ['createdAt'],
          where: {
            createdAt: { gte: startDate }
          },
          _count: { id: true }
        }),
        
        // Messages par période
        fastify.prisma.message.groupBy({
          by: ['createdAt'],
          where: {
            createdAt: { gte: startDate },
            isDeleted: false
          },
          _count: { id: true }
        }),
        
        // Nouvelles conversations par période
        fastify.prisma.conversation.groupBy({
          by: ['createdAt'],
          where: {
            createdAt: { gte: startDate }
          },
          _count: { id: true }
        }),

        // Répartition par rôle
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
    onRequest: [fastify.authenticate, requireAdmin]
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
        criterion = 'messages_sent',  // critère de classement
        period = '7d',  // '1d' | '7d' | '30d' | '60d' | '90d' | '180d' | '365d' | 'all'
        limit = 50
      } = request.query as any;

      // Calculer la période
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
              .slice(0, parseInt(limit));
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
              take: parseInt(limit)
            });
            rankings = rankings.map(u => ({
              ...u,
              count: u._count.reactions,
              _count: undefined
            }));
            break;

          case 'mentions_received':
            // Compter les mentions reçues par les utilisateurs
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
              .slice(0, parseInt(limit));
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
              .slice(0, parseInt(limit));
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
              take: parseInt(limit)
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
              take: parseInt(limit)
            });
            rankings = rankings.map(u => ({
              ...u,
              count: u._count.createdShareLinks,
              _count: undefined
            }));
            break;

          case 'reactions_received':
            // Compter les réactions reçues sur les messages de l'utilisateur
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
              .slice(0, parseInt(limit));
            break;

          case 'replies_received':
            // Compter les réponses reçues aux messages de l'utilisateur
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
              .slice(0, parseInt(limit));
            break;

          case 'mentions_sent':
            // Compter les mentions envoyées (dans les messages de l'utilisateur)
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
              .slice(0, parseInt(limit));
            break;

          case 'reports_sent':
            // Compter les signalements envoyés par les utilisateurs
            const usersWithReportsSent = await fastify.prisma.user.findMany({
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true
              }
            });

            // Pour chaque utilisateur, compter les reports créés
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
              .slice(0, parseInt(limit));
            break;

          case 'reports_received':
            // Compter les signalements reçus (sur les messages de l'utilisateur)
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
              .slice(0, parseInt(limit));
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
              take: parseInt(limit)
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
              take: parseInt(limit)
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
              take: parseInt(limit)
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
              take: parseInt(limit)
            });
            rankings = rankings.map(u => ({
              ...u,
              count: u._count.callParticipations,
              _count: undefined
            }));
            break;

          case 'files_shared':
            // Compter les fichiers partagés (attachments dans les messages de l'utilisateur)
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
              .slice(0, parseInt(limit));
            break;

          case 'most_referrals_via_affiliate':
            // Utilisateurs qui ont ramené le plus de membres via affiliation
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
              take: parseInt(limit)
            });
            rankings = rankings.map(u => ({
              ...u,
              count: u._count.affiliateRelations,
              _count: undefined
            }));
            break;

          case 'most_referrals_via_sharelinks':
            // Utilisateurs qui ont ramené le plus de membres via liens de partage
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
              .slice(0, parseInt(limit));
            break;

          case 'most_contacts':
            // Utilisateurs avec le plus de contacts (demandes d'amitié acceptées)
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
              .slice(0, parseInt(limit));
            break;

          case 'most_tracking_links_created':
            // Utilisateurs avec le plus de liens trackés créés
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
              take: parseInt(limit)
            });
            rankings = rankings.map(u => ({
              ...u,
              count: u._count.createdTrackingLinks,
              _count: undefined
            }));
            break;

          case 'most_tracking_link_clicks':
            // Utilisateurs dont les liens trackés sont les plus visités
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
              .slice(0, parseInt(limit));
            break;

          default:
            return reply.status(400).send({
              success: false,
              message: 'Critère de classement invalide pour les utilisateurs'
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
                image: true,
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
              take: parseInt(limit)
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
                image: true,
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
              take: parseInt(limit)
            });
            rankings = rankings.map(c => ({
              ...c,
              count: c._count.members,
              _count: undefined
            }));
            break;

          case 'reaction_count':
            // Pour les réactions, on doit compter via les messages de la conversation
            const conversationsWithReactions = await fastify.prisma.conversation.findMany({
              select: {
                id: true,
                identifier: true,
                title: true,
                type: true,
                avatar: true,
                image: true,
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
                image: c.image,
                count: c.messages.reduce((sum, m) => sum + m._count.reactions, 0)
              }))
              .sort((a, b) => b.count - a.count)
              .slice(0, parseInt(limit));
            break;

          case 'recent_activity':
            rankings = await fastify.prisma.conversation.findMany({
              select: {
                id: true,
                identifier: true,
                title: true,
                type: true,
                avatar: true,
                image: true,
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
              take: parseInt(limit)
            });
            rankings = rankings.map(c => ({
              ...c,
              lastActivity: c.lastMessageAt
            }));
            break;

          case 'files_shared':
            // Conversations avec le plus de fichiers partagés
            const conversationsWithFiles = await fastify.prisma.conversation.findMany({
              select: {
                id: true,
                identifier: true,
                title: true,
                type: true,
                avatar: true,
                image: true,
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
                image: c.image,
                count: c.messages.reduce((sum, m) => sum + m._count.attachments, 0)
              }))
              .sort((a, b) => b.count - a.count)
              .slice(0, parseInt(limit));
            break;

          case 'call_count':
            rankings = await fastify.prisma.conversation.findMany({
              select: {
                id: true,
                identifier: true,
                title: true,
                type: true,
                avatar: true,
                image: true,
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
              take: parseInt(limit)
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
              message: 'Critère de classement invalide pour les conversations'
            });
        }
      }
      // Classement des messages
      else if (entityType === 'messages') {
        switch (criterion) {
          case 'most_reactions':
            // Messages avec le plus de réactions
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
              take: parseInt(limit)
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
            // Messages les plus répondus
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
              take: parseInt(limit)
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
              take: parseInt(limit)
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
              message: 'Critère de classement invalide pour les messages'
            });
        }
      }
      // Classement des liens
      else if (entityType === 'links') {
        switch (criterion) {
          case 'tracking_links_most_visited':
            // Liens trackés les plus visités (totalClicks)
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
              take: parseInt(limit)
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
            // Liens trackés les plus visités (uniqueClicks)
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
              take: parseInt(limit)
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
            // Liens de partage les plus utilisés (currentUses)
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
              take: parseInt(limit)
            });
            rankings = rankings.map(l => ({
              ...l,
              count: l.currentUses,
              creator: l.creator
            }));
            break;

          case 'share_links_most_unique_sessions':
            // Liens de partage les plus utilisés (currentUniqueSessions)
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
              take: parseInt(limit)
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
              message: 'Critère de classement invalide pour les liens'
            });
        }
      } else {
        return reply.status(400).send({
          success: false,
          message: 'Type d\'entité invalide. Utilisez "users", "conversations", "messages" ou "links"'
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
