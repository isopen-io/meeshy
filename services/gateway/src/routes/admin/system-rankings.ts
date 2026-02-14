import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { type RankingQuery } from './types';

const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  const authContext = (request as any).authContext;
  if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
    return reply.status(401).send({
      success: false,
      message: 'Authentification requise'
    });
  }

  const userRole = authContext.registeredUser.role;
  const canView = ['BIGBOSS', 'ADMIN', 'AUDIT', 'ANALYST'].includes(userRole);

  if (!canView) {
    return reply.status(403).send({
      success: false,
      message: 'Permission insuffisante'
    });
  }
};

function getPeriodStartDate(period: string): Date | null {
  const now = new Date();
  switch (period) {
    case '1d':
      return new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case '60d':
      return new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    case '90d':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case '180d':
      return new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
    case '365d':
      return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    case 'all':
    default:
      return null;
  }
}

export async function systemRankingsRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/v1/admin/ranking
   * Rankings par entityType, criterion, period
   */
  fastify.get('/ranking', {
    onRequest: [fastify.authenticate, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { entityType = 'users', criterion = 'messages', period = '30d', limit = '50' } = request.query as RankingQuery;
      const limitNum = Math.min(Math.max(1, parseInt(limit || '50', 10) || 50), 100);
      const startDate = getPeriodStartDate(period || '30d');

      let rankings: any[] = [];

      switch (entityType) {
        case 'users':
          rankings = await rankUsers(fastify, criterion || 'messages', startDate, limitNum);
          break;
        case 'conversations':
          rankings = await rankConversations(fastify, criterion || 'messages', startDate, limitNum);
          break;
        case 'messages':
          rankings = await rankMessages(fastify, criterion || 'reactions', startDate, limitNum);
          break;
        case 'links':
          rankings = await rankLinks(fastify, criterion || 'clicks', startDate, limitNum);
          break;
        default:
          return reply.status(400).send({
            success: false,
            message: `Type d'entite inconnu: ${entityType}`
          });
      }

      return reply.send({
        success: true,
        data: {
          rankings,
          entityType,
          criterion,
          period,
          total: rankings.length
        }
      });
    } catch (error) {
      logError(fastify.log, 'Get admin rankings error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la recuperation des classements'
      });
    }
  });
}

async function rankUsers(fastify: FastifyInstance, criterion: string, startDate: Date | null, limit: number) {
  const dateFilter = startDate ? { createdAt: { gte: startDate } } : {};

  switch (criterion) {
    case 'messages': {
      const topSenders = await fastify.prisma.message.groupBy({
        by: ['senderId'],
        where: { ...dateFilter, isDeleted: false, senderId: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit
      });

      const userIds = topSenders.map(s => s.senderId!).filter(Boolean);
      const users = await fastify.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true, displayName: true, avatar: true, lastActiveAt: true }
      });

      const userMap = new Map(users.map(u => [u.id, u]));
      return topSenders.map(s => {
        const user = userMap.get(s.senderId!);
        return {
          id: s.senderId,
          username: user?.username || 'Unknown',
          displayName: user?.displayName,
          avatar: user?.avatar,
          count: s._count.id,
          lastActivity: user?.lastActiveAt?.toISOString()
        };
      });
    }

    case 'reactions': {
      const topReactors = await fastify.prisma.reaction.groupBy({
        by: ['userId'],
        where: { ...dateFilter, userId: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit
      });

      const userIds = topReactors.map(r => r.userId!).filter(Boolean);
      const users = await fastify.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true, displayName: true, avatar: true }
      });

      const userMap = new Map(users.map(u => [u.id, u]));
      return topReactors.map(r => {
        const user = userMap.get(r.userId!);
        return {
          id: r.userId,
          username: user?.username || 'Unknown',
          displayName: user?.displayName,
          avatar: user?.avatar,
          count: r._count.id
        };
      });
    }

    case 'conversations': {
      const topConversors = await fastify.prisma.conversationMember.groupBy({
        by: ['userId'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit
      });

      const userIds = topConversors.map(c => c.userId).filter(Boolean);
      const users = await fastify.prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true, displayName: true, avatar: true }
      });

      const userMap = new Map(users.map(u => [u.id, u]));
      return topConversors.map(c => {
        const user = userMap.get(c.userId);
        return {
          id: c.userId,
          username: user?.username || 'Unknown',
          displayName: user?.displayName,
          avatar: user?.avatar,
          count: c._count.id
        };
      });
    }

    default:
      return [];
  }
}

async function rankConversations(fastify: FastifyInstance, criterion: string, startDate: Date | null, limit: number) {
  const dateFilter = startDate ? { createdAt: { gte: startDate } } : {};

  switch (criterion) {
    case 'messages': {
      const topConvos = await fastify.prisma.message.groupBy({
        by: ['conversationId'],
        where: { ...dateFilter, isDeleted: false },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit
      });

      const convoIds = topConvos.map(c => c.conversationId);
      const convos = await fastify.prisma.conversation.findMany({
        where: { id: { in: convoIds } },
        select: { id: true, identifier: true, title: true, type: true, avatar: true }
      });

      const convoMap = new Map(convos.map(c => [c.id, c]));
      return topConvos.map(c => {
        const convo = convoMap.get(c.conversationId);
        return {
          id: c.conversationId,
          identifier: convo?.identifier,
          title: convo?.title || convo?.identifier || 'Sans titre',
          type: convo?.type,
          image: convo?.avatar,
          count: c._count.id
        };
      });
    }

    case 'members': {
      const topConvos = await fastify.prisma.conversationMember.groupBy({
        by: ['conversationId'],
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit
      });

      const convoIds = topConvos.map(c => c.conversationId);
      const convos = await fastify.prisma.conversation.findMany({
        where: { id: { in: convoIds } },
        select: { id: true, identifier: true, title: true, type: true, avatar: true }
      });

      const convoMap = new Map(convos.map(c => [c.id, c]));
      return topConvos.map(c => {
        const convo = convoMap.get(c.conversationId);
        return {
          id: c.conversationId,
          identifier: convo?.identifier,
          title: convo?.title || convo?.identifier || 'Sans titre',
          type: convo?.type,
          image: convo?.avatar,
          count: c._count.id
        };
      });
    }

    default:
      return [];
  }
}

async function rankMessages(fastify: FastifyInstance, criterion: string, startDate: Date | null, limit: number) {
  const dateFilter = startDate ? { createdAt: { gte: startDate } } : {};

  switch (criterion) {
    case 'reactions': {
      const topMessages = await fastify.prisma.reaction.groupBy({
        by: ['messageId'],
        where: dateFilter,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit
      });

      const messageIds = topMessages.map(m => m.messageId);
      const messages = await fastify.prisma.message.findMany({
        where: { id: { in: messageIds } },
        select: {
          id: true,
          content: true,
          messageType: true,
          createdAt: true,
          sender: {
            select: { id: true, username: true, displayName: true, avatar: true }
          },
          conversation: {
            select: { id: true, identifier: true, title: true, type: true }
          }
        }
      });

      const msgMap = new Map(messages.map(m => [m.id, m]));
      return topMessages.map(m => {
        const msg = msgMap.get(m.messageId);
        return {
          id: m.messageId,
          content: msg?.content,
          contentPreview: msg?.content ? msg.content.substring(0, 100) : '',
          messageType: msg?.messageType,
          createdAt: msg?.createdAt?.toISOString(),
          sender: msg?.sender,
          conversation: msg?.conversation,
          count: m._count.id
        };
      });
    }

    case 'replies': {
      const topMessages = await fastify.prisma.message.groupBy({
        by: ['replyToId'],
        where: { ...dateFilter, replyToId: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit
      });

      const messageIds = topMessages.map(m => m.replyToId!).filter(Boolean);
      const messages = await fastify.prisma.message.findMany({
        where: { id: { in: messageIds } },
        select: {
          id: true,
          content: true,
          messageType: true,
          createdAt: true,
          sender: {
            select: { id: true, username: true, displayName: true, avatar: true }
          },
          conversation: {
            select: { id: true, identifier: true, title: true, type: true }
          }
        }
      });

      const msgMap = new Map(messages.map(m => [m.id, m]));
      return topMessages.map(m => {
        const msg = msgMap.get(m.replyToId!);
        return {
          id: m.replyToId,
          content: msg?.content,
          contentPreview: msg?.content ? msg.content.substring(0, 100) : '',
          messageType: msg?.messageType,
          createdAt: msg?.createdAt?.toISOString(),
          sender: msg?.sender,
          conversation: msg?.conversation,
          count: m._count.id
        };
      });
    }

    default:
      return [];
  }
}

async function rankLinks(fastify: FastifyInstance, criterion: string, startDate: Date | null, limit: number) {
  switch (criterion) {
    case 'clicks': {
      const dateFilter = startDate ? { clickedAt: { gte: startDate } } : {};
      const topLinks = await (fastify.prisma.trackingLinkClick.groupBy as any)({
        by: ['trackingLinkId'],
        where: dateFilter,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit
      });

      const linkIds = topLinks.map((l: any) => l.trackingLinkId);
      const links = await fastify.prisma.trackingLink.findMany({
        where: { id: { in: linkIds } },
        select: {
          id: true,
          token: true,
          originalUrl: true,
          totalClicks: true,
          uniqueClicks: true,
          createdAt: true,
          creator: {
            select: { id: true, username: true, displayName: true, avatar: true }
          }
        }
      });

      const linkMap = new Map(links.map(l => [l.id, l]));
      return topLinks.map((l: any) => {
        const link = linkMap.get(l.trackingLinkId);
        return {
          id: l.trackingLinkId,
          token: link?.token,
          originalUrl: link?.originalUrl,
          totalClicks: link?.totalClicks,
          uniqueClicks: link?.uniqueClicks,
          createdAt: link?.createdAt?.toISOString(),
          creator: link?.creator,
          count: l._count.id
        };
      });
    }

    case 'uses': {
      const topShareLinks = await fastify.prisma.conversationShareLink.findMany({
        where: { isActive: true },
        select: {
          id: true,
          linkId: true,
          identifier: true,
          name: true,
          currentUses: true,
          maxUses: true,
          createdAt: true,
          creator: {
            select: { id: true, username: true, displayName: true, avatar: true }
          },
          conversation: {
            select: { id: true, identifier: true, title: true, type: true }
          },
          _count: {
            select: { anonymousParticipants: true }
          }
        },
        orderBy: { currentUses: 'desc' },
        take: limit
      });

      return topShareLinks.map(l => ({
        id: l.id,
        name: l.name || l.identifier || l.linkId,
        identifier: l.identifier,
        currentUses: l.currentUses,
        maxUses: l.maxUses,
        createdAt: l.createdAt?.toISOString(),
        creator: l.creator,
        conversation: l.conversation,
        count: l.currentUses
      }));
    }

    default:
      return [];
  }
}
