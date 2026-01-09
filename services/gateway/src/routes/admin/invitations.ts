import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { validatePagination, buildPaginationMeta } from '../../utils/pagination';

// Middleware pour vérifier les permissions admin
const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  const authContext = (request as any).authContext;
  if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
    return reply.status(401).send({
      success: false,
      message: 'Authentification requise'
    });
  }

  const userRole = authContext.registeredUser.role;
  const canManage = ['BIGBOSS', 'ADMIN'].includes(userRole);

  if (!canManage) {
    return reply.status(403).send({
      success: false,
      message: 'Permission admin requise'
    });
  }
};

export async function invitationRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/admin/invitations
   * Liste des invitations avec pagination et filtres
   */
  fastify.get('/', {
    onRequest: [fastify.authenticate, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as any;
      const pagination = validatePagination(query.offset, query.limit, 100);

      // Construire les filtres
      const where: any = {};

      if (query.status) {
        where.status = query.status;
      }

      if (query.communityId) {
        where.communityId = query.communityId;
      }

      if (query.senderId) {
        where.senderId = query.senderId;
      }

      // Les invitations peuvent être de plusieurs types:
      // 1. FriendRequest (demandes d'ami)
      // 2. CommunityMember avec status pending (invitations communauté)

      // Pour l'instant, utilisons FriendRequest comme base
      const [friendRequests, totalFriendRequests] = await Promise.all([
        fastify.prisma.friendRequest.findMany({
          where,
          include: {
            sender: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true
              }
            },
            receiver: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip: pagination.offset,
          take: pagination.limit
        }),
        fastify.prisma.friendRequest.count({ where })
      ]);

      // Transformer en format d'invitation générique
      const invitations = friendRequests.map(fr => ({
        id: fr.id,
        senderId: fr.senderId,
        receiverId: fr.receiverId,
        type: 'friend' as const,
        status: fr.status,
        message: fr.message || undefined,
        createdAt: fr.createdAt,
        updatedAt: fr.updatedAt,
        sender: fr.sender,
        receiver: fr.receiver
      }));

      const paginationMeta = buildPaginationMeta(
        totalFriendRequests,
        pagination.offset,
        pagination.limit,
        friendRequests.length
      );

      return reply.send({
        success: true,
        data: {
          invitations,
          pagination: paginationMeta
        }
      });
    } catch (error) {
      logError(fastify.log, 'Get invitations error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la récupération des invitations'
      });
    }
  });

  /**
   * GET /api/admin/invitations/stats
   * Statistiques des invitations
   */
  fastify.get('/stats', {
    onRequest: [fastify.authenticate, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const [
        totalInvitations,
        pendingInvitations,
        acceptedInvitations,
        rejectedInvitations,
        invitationsByType
      ] = await Promise.all([
        fastify.prisma.friendRequest.count(),
        fastify.prisma.friendRequest.count({ where: { status: 'pending' } }),
        fastify.prisma.friendRequest.count({ where: { status: 'accepted' } }),
        fastify.prisma.friendRequest.count({ where: { status: 'rejected' } }),
        fastify.prisma.friendRequest.groupBy({
          by: ['status'],
          _count: {
            id: true
          }
        })
      ]);

      // Statistiques récentes (7 derniers jours)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const recentInvitations = await fastify.prisma.friendRequest.count({
        where: { createdAt: { gte: sevenDaysAgo } }
      });

      // Taux d'acceptation
      const acceptanceRate = totalInvitations > 0
        ? Math.round((acceptedInvitations / totalInvitations) * 100)
        : 0;

      return reply.send({
        success: true,
        data: {
          total: totalInvitations,
          pending: pendingInvitations,
          accepted: acceptedInvitations,
          rejected: rejectedInvitations,
          recentInvitations,
          acceptanceRate,
          byType: invitationsByType.reduce((acc, item) => {
            acc[item.status] = item._count.id;
            return acc;
          }, {} as Record<string, number>)
        }
      });
    } catch (error) {
      logError(fastify.log, 'Get invitation stats error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la récupération des statistiques'
      });
    }
  });

  /**
   * GET /api/admin/invitations/:id
   * Détails d'une invitation
   */
  fastify.get('/:id', {
    onRequest: [fastify.authenticate, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };

      const invitation = await fastify.prisma.friendRequest.findUnique({
        where: { id },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              displayName: true,
              firstName: true,
              lastName: true,
              avatar: true,
              email: true
            }
          },
          receiver: {
            select: {
              id: true,
              username: true,
              displayName: true,
              firstName: true,
              lastName: true,
              avatar: true,
              email: true
            }
          }
        }
      });

      if (!invitation) {
        return reply.status(404).send({
          success: false,
          message: 'Invitation non trouvée'
        });
      }

      return reply.send({
        success: true,
        data: {
          id: invitation.id,
          senderId: invitation.senderId,
          receiverId: invitation.receiverId,
          type: 'friend',
          status: invitation.status,
          message: invitation.message || undefined,
          createdAt: invitation.createdAt,
          updatedAt: invitation.updatedAt,
          sender: invitation.sender,
          receiver: invitation.receiver
        }
      });
    } catch (error) {
      logError(fastify.log, 'Get invitation details error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la récupération de l\'invitation'
      });
    }
  });

  /**
   * PATCH /api/admin/invitations/:id
   * Modifier le statut d'une invitation (admin action)
   */
  fastify.patch('/:id', {
    onRequest: [fastify.authenticate, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const { status } = request.body as { status: string };

      if (!['pending', 'accepted', 'rejected'].includes(status)) {
        return reply.status(400).send({
          success: false,
          message: 'Statut invalide'
        });
      }

      const invitation = await fastify.prisma.friendRequest.update({
        where: { id },
        data: { status },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              displayName: true
            }
          },
          receiver: {
            select: {
              id: true,
              username: true,
              displayName: true
            }
          }
        }
      });

      // Note: Le modèle Friend n'existe pas dans le schéma Prisma actuel
      // La logique d'amitié est gérée uniquement via FriendRequest avec status 'accepted'

      return reply.send({
        success: true,
        data: invitation,
        message: `Invitation ${status === 'accepted' ? 'acceptée' : status === 'rejected' ? 'rejetée' : 'mise à jour'}`
      });
    } catch (error) {
      logError(fastify.log, 'Update invitation error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la mise à jour de l\'invitation'
      });
    }
  });

  /**
   * GET /api/admin/invitations/timeline/daily
   * Évolution quotidienne des invitations sur 7 jours
   */
  fastify.get('/timeline/daily', {
    onRequest: [fastify.authenticate, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      sevenDaysAgo.setHours(0, 0, 0, 0);

      // Récupérer toutes les invitations des 7 derniers jours
      const invitations = await fastify.prisma.friendRequest.findMany({
        where: {
          createdAt: { gte: sevenDaysAgo }
        },
        select: {
          createdAt: true,
          status: true
        }
      });

      // Grouper par jour
      const dailyData: Record<string, { sent: number; accepted: number; rejected: number }> = {};

      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateKey = date.toISOString().split('T')[0];
        dailyData[dateKey] = { sent: 0, accepted: 0, rejected: 0 };
      }

      invitations.forEach(inv => {
        const dateKey = inv.createdAt.toISOString().split('T')[0];
        if (dailyData[dateKey]) {
          dailyData[dateKey].sent++;
          if (inv.status === 'accepted') dailyData[dateKey].accepted++;
          if (inv.status === 'rejected') dailyData[dateKey].rejected++;
        }
      });

      const timeline = Object.entries(dailyData).map(([date, data]) => ({
        date,
        sent: data.sent,
        accepted: data.accepted,
        rejected: data.rejected
      }));

      return reply.send({
        success: true,
        data: timeline
      });
    } catch (error) {
      logError(fastify.log, 'Get invitations timeline error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la récupération de la timeline'
      });
    }
  });
}
