import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { type RankingQuery } from './types';
import { UnifiedAuthRequest } from '../../middleware/auth';

const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  const authContext = (request as UnifiedAuthRequest).authContext;
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

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

type UserInfo = { id: string; username: string; displayName: string | null; avatar: string | null; lastActiveAt: Date | null };
type ConvoInfo = { id: string; identifier: string; title: string | null; type: string; avatar: string | null };

async function fetchUserDetails(fastify: FastifyInstance, userIds: string[]): Promise<Map<string, UserInfo>> {
  if (userIds.length === 0) return new Map();
  const users = await fastify.prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true, displayName: true, avatar: true, lastActiveAt: true }
  });
  return new Map(users.map(u => [u.id, u]));
}

function buildUserRankings(sorted: Array<[string, number]>, userMap: Map<string, UserInfo>) {
  return sorted.map(([userId, count]) => {
    const user = userMap.get(userId);
    return {
      id: userId,
      username: user?.username || 'Unknown',
      displayName: user?.displayName,
      avatar: user?.avatar,
      count,
      lastActivity: user?.lastActiveAt?.toISOString()
    };
  });
}

async function fetchConvoDetails(fastify: FastifyInstance, convoIds: string[]): Promise<Map<string, ConvoInfo>> {
  if (convoIds.length === 0) return new Map();
  const convos = await fastify.prisma.conversation.findMany({
    where: { id: { in: convoIds } },
    select: { id: true, identifier: true, title: true, type: true, avatar: true }
  });
  return new Map(convos.map(c => [c.id, c]));
}

function buildConvoRankings(sorted: Array<[string, number]>, convoMap: Map<string, ConvoInfo>) {
  return sorted.map(([convoId, count]) => {
    const convo = convoMap.get(convoId);
    return {
      id: convoId,
      identifier: convo?.identifier,
      title: convo?.title || convo?.identifier || 'Sans titre',
      type: convo?.type,
      image: convo?.avatar,
      count
    };
  });
}

function sortAndLimit(map: Map<string, number>, limit: number): Array<[string, number]> {
  return Array.from(map.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit);
}

function dateWhere(startDate: Date | null, field = 'createdAt') {
  return startDate ? { [field]: { gte: startDate } } : {};
}

// ═══════════════════════════════════════════════════════════════════
// RANK USERS
// ═══════════════════════════════════════════════════════════════════

async function rankUsers(fastify: FastifyInstance, criterion: string, startDate: Date | null, limit: number) {
  const msgDateFilter = dateWhere(startDate);

  switch (criterion) {
    case 'messages_sent':
    case 'messages': {
      const topSenders = await fastify.prisma.message.groupBy({
        by: ['senderId'],
        where: { ...msgDateFilter, deletedAt: null, senderId: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit
      });
      const senderParticipantIds = topSenders.map(s => s.senderId!).filter(Boolean);
      const senderParticipants = await fastify.prisma.participant.findMany({
        where: { id: { in: senderParticipantIds } },
        select: { id: true, userId: true }
      });
      const senderPartToUser = new Map(senderParticipants.map(p => [p.id, p.userId]));
      const senderUserIds = [...new Set(senderParticipants.map(p => p.userId).filter(Boolean))] as string[];
      const userMap = await fetchUserDetails(fastify, senderUserIds);
      return buildUserRankings(
        topSenders.map(s => [senderPartToUser.get(s.senderId!) || s.senderId!, s._count.id] as [string, number]),
        userMap
      );
    }

    case 'reactions_given':
    case 'reactions': {
      const topReactors = await fastify.prisma.reaction.groupBy({
        by: ['participantId'],
        where: { ...msgDateFilter },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit
      });
      const participantIds = topReactors.map(r => r.participantId);
      const participants = await fastify.prisma.participant.findMany({
        where: { id: { in: participantIds }, userId: { not: null } },
        select: { id: true, userId: true }
      });
      const partToUser = new Map(participants.map(p => [p.id, p.userId!]));
      const userIds = [...new Set(participants.map(p => p.userId!).filter(Boolean))];
      const userMap = await fetchUserDetails(fastify, userIds);
      return buildUserRankings(
        topReactors.map(r => [partToUser.get(r.participantId) || r.participantId, r._count.id] as [string, number]).filter(([id]) => id),
        userMap
      );
    }

    case 'reactions_received': {
      const reactionsByMsg = await fastify.prisma.reaction.groupBy({
        by: ['messageId'],
        where: dateWhere(startDate),
        _count: { id: true }
      });
      const messageIds = reactionsByMsg.map(r => r.messageId);
      const messages = await fastify.prisma.message.findMany({
        where: { id: { in: messageIds } },
        select: { id: true, senderId: true }
      });
      const msgSenderMap = new Map(messages.map(m => [m.id, m.senderId]));
      const senderCounts = new Map<string, number>();
      for (const r of reactionsByMsg) {
        const senderId = msgSenderMap.get(r.messageId);
        if (senderId) {
          senderCounts.set(senderId, (senderCounts.get(senderId) || 0) + r._count.id);
        }
      }
      const sorted = sortAndLimit(senderCounts, limit);
      const userMap = await fetchUserDetails(fastify, sorted.map(([id]) => id));
      return buildUserRankings(sorted, userMap);
    }

    case 'replies_received': {
      const replies = await fastify.prisma.message.groupBy({
        by: ['replyToId'],
        where: { ...msgDateFilter, replyToId: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit * 5
      });
      const originalIds = replies.map(r => r.replyToId!).filter(Boolean);
      const originals = await fastify.prisma.message.findMany({
        where: { id: { in: originalIds } },
        select: { id: true, senderId: true }
      });
      const origSenderMap = new Map(originals.map(m => [m.id, m.senderId]));
      const senderCounts = new Map<string, number>();
      for (const r of replies) {
        const senderId = origSenderMap.get(r.replyToId!);
        if (senderId) {
          senderCounts.set(senderId, (senderCounts.get(senderId) || 0) + r._count.id);
        }
      }
      const sorted = sortAndLimit(senderCounts, limit);
      const userMap = await fetchUserDetails(fastify, sorted.map(([id]) => id));
      return buildUserRankings(sorted, userMap);
    }

    case 'mentions_received': {
      const topMentioned = await fastify.prisma.mention.groupBy({
        by: ['mentionedParticipantId'],
        where: dateWhere(startDate, 'mentionedAt'),
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit
      });
      const mentionedParticipantIds = topMentioned.map(m => m.mentionedParticipantId);
      const mentionedParticipants = await fastify.prisma.participant.findMany({
        where: { id: { in: mentionedParticipantIds }, userId: { not: null } },
        select: { id: true, userId: true }
      });
      const mentPartToUser = new Map(mentionedParticipants.map(p => [p.id, p.userId!]));
      const mentUserIds = [...new Set(mentionedParticipants.map(p => p.userId!).filter(Boolean))];
      const userMap = await fetchUserDetails(fastify, mentUserIds);
      return buildUserRankings(
        topMentioned.map(m => [mentPartToUser.get(m.mentionedParticipantId) || m.mentionedParticipantId, m._count.id] as [string, number]).filter(([id]) => id),
        userMap
      );
    }

    case 'mentions_sent': {
      const mentions = await fastify.prisma.mention.findMany({
        where: dateWhere(startDate, 'mentionedAt'),
        select: { message: { select: { senderId: true } } }
      });
      const senderCounts = new Map<string, number>();
      for (const m of mentions) {
        const senderId = m.message?.senderId;
        if (senderId) {
          senderCounts.set(senderId, (senderCounts.get(senderId) || 0) + 1);
        }
      }
      const sorted = sortAndLimit(senderCounts, limit);
      const userMap = await fetchUserDetails(fastify, sorted.map(([id]) => id));
      return buildUserRankings(sorted, userMap);
    }

    case 'conversations_joined':
    case 'conversations': {
      const topConversors = await fastify.prisma.participant.groupBy({
        by: ['userId'],
        where: dateWhere(startDate, 'joinedAt'),
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit
      });
      const userIds = topConversors.map(c => c.userId).filter(Boolean);
      const userMap = await fetchUserDetails(fastify, userIds);
      return buildUserRankings(
        topConversors.map(c => [c.userId, c._count.id] as [string, number]),
        userMap
      );
    }

    case 'communities_created': {
      const groupConvos = await fastify.prisma.conversation.findMany({
        where: { type: { in: ['group', 'public'] }, ...dateWhere(startDate) },
        select: { id: true }
      });
      const convoIds = groupConvos.map(c => c.id);
      const adminMembers = await fastify.prisma.participant.findMany({
        where: { conversationId: { in: convoIds }, role: 'admin' },
        select: { userId: true, conversationId: true },
        orderBy: { joinedAt: 'asc' }
      });
      const seen = new Set<string>();
      const creatorCounts = new Map<string, number>();
      for (const m of adminMembers) {
        if (!seen.has(m.conversationId)) {
          seen.add(m.conversationId);
          creatorCounts.set(m.userId, (creatorCounts.get(m.userId) || 0) + 1);
        }
      }
      const sorted = sortAndLimit(creatorCounts, limit);
      const userMap = await fetchUserDetails(fastify, sorted.map(([id]) => id));
      return buildUserRankings(sorted, userMap);
    }

    case 'share_links_created': {
      const topCreators = await fastify.prisma.conversationShareLink.groupBy({
        by: ['createdBy'],
        where: dateWhere(startDate),
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit
      });
      const userIds = topCreators.map(c => c.createdBy).filter(Boolean);
      const userMap = await fetchUserDetails(fastify, userIds);
      return buildUserRankings(
        topCreators.map(c => [c.createdBy, c._count.id] as [string, number]),
        userMap
      );
    }

    case 'files_shared': {
      const topSenders = await fastify.prisma.message.groupBy({
        by: ['senderId'],
        where: {
          ...msgDateFilter,
          deletedAt: null,
          senderId: { not: null },
          messageType: { in: ['image', 'file', 'video', 'audio'] }
        },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit
      });
      const filePartIds = topSenders.map(s => s.senderId!).filter(Boolean);
      const fileParticipants = await fastify.prisma.participant.findMany({
        where: { id: { in: filePartIds } },
        select: { id: true, userId: true }
      });
      const filePartToUser = new Map(fileParticipants.map(p => [p.id, p.userId]));
      const fileUserIds = [...new Set(fileParticipants.map(p => p.userId).filter(Boolean))] as string[];
      const userMap = await fetchUserDetails(fastify, fileUserIds);
      return buildUserRankings(
        topSenders.map(s => [filePartToUser.get(s.senderId!) || s.senderId!, s._count.id] as [string, number]),
        userMap
      );
    }

    case 'reports_sent': {
      const topReporters = await fastify.prisma.report.groupBy({
        by: ['reporterId'],
        where: { ...dateWhere(startDate), reporterId: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit
      });
      const userIds = topReporters.map(r => r.reporterId!).filter(Boolean);
      const userMap = await fetchUserDetails(fastify, userIds);
      return buildUserRankings(
        topReporters.map(r => [r.reporterId!, r._count.id] as [string, number]),
        userMap
      );
    }

    case 'reports_received': {
      const topReported = await fastify.prisma.report.groupBy({
        by: ['reportedEntityId'],
        where: { ...dateWhere(startDate), reportedType: 'user' },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit
      });
      const userIds = topReported.map(r => r.reportedEntityId).filter(Boolean);
      const userMap = await fetchUserDetails(fastify, userIds);
      return buildUserRankings(
        topReported.map(r => [r.reportedEntityId, r._count.id] as [string, number]),
        userMap
      );
    }

    case 'friend_requests_sent': {
      const topSenders = await fastify.prisma.friendRequest.groupBy({
        by: ['senderId'],
        where: dateWhere(startDate),
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit
      });
      const userIds = topSenders.map(s => s.senderId).filter(Boolean);
      const userMap = await fetchUserDetails(fastify, userIds);
      return buildUserRankings(
        topSenders.map(s => [s.senderId, s._count.id] as [string, number]),
        userMap
      );
    }

    case 'friend_requests_received': {
      const topReceivers = await fastify.prisma.friendRequest.groupBy({
        by: ['receiverId'],
        where: dateWhere(startDate),
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit
      });
      const userIds = topReceivers.map(r => r.receiverId).filter(Boolean);
      const userMap = await fetchUserDetails(fastify, userIds);
      return buildUserRankings(
        topReceivers.map(r => [r.receiverId, r._count.id] as [string, number]),
        userMap
      );
    }

    case 'calls_initiated': {
      const topInitiators = await fastify.prisma.callSession.groupBy({
        by: ['initiatorId'],
        where: dateWhere(startDate, 'startedAt'),
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit
      });
      const userIds = topInitiators.map(c => c.initiatorId).filter(Boolean);
      const userMap = await fetchUserDetails(fastify, userIds);
      return buildUserRankings(
        topInitiators.map(c => [c.initiatorId, c._count.id] as [string, number]),
        userMap
      );
    }

    case 'call_participations': {
      const topCallParticipants = await fastify.prisma.callParticipant.groupBy({
        by: ['participantId'],
        where: dateWhere(startDate, 'joinedAt'),
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit
      });
      const callPartIds = topCallParticipants.map(p => p.participantId);
      const callParts = await fastify.prisma.participant.findMany({
        where: { id: { in: callPartIds }, userId: { not: null } },
        select: { id: true, userId: true }
      });
      const callPartToUser = new Map(callParts.map(p => [p.id, p.userId!]));
      const callUserIds = [...new Set(callParts.map(p => p.userId!).filter(Boolean))];
      const userMap = await fetchUserDetails(fastify, callUserIds);
      return buildUserRankings(
        topCallParticipants.map(p => [callPartToUser.get(p.participantId) || p.participantId, p._count.id] as [string, number]).filter(([id]) => id),
        userMap
      );
    }

    case 'most_referrals_via_affiliate': {
      const relations = await fastify.prisma.affiliateRelation.groupBy({
        by: ['affiliateUserId'],
        where: dateWhere(startDate),
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit
      });
      const userIds = relations.map(r => r.affiliateUserId).filter(Boolean);
      const userMap = await fetchUserDetails(fastify, userIds);
      return buildUserRankings(
        relations.map(r => [r.affiliateUserId, r._count.id] as [string, number]),
        userMap
      );
    }

    case 'most_referrals_via_sharelinks': {
      const links = await fastify.prisma.conversationShareLink.findMany({
        where: { ...dateWhere(startDate), currentUses: { gt: 0 } },
        select: { createdBy: true, currentUses: true }
      });
      const userCounts = new Map<string, number>();
      for (const link of links) {
        if (link.createdBy) {
          userCounts.set(link.createdBy, (userCounts.get(link.createdBy) || 0) + link.currentUses);
        }
      }
      const sorted = sortAndLimit(userCounts, limit);
      const userMap = await fetchUserDetails(fastify, sorted.map(([id]) => id));
      return buildUserRankings(sorted, userMap);
    }

    case 'most_contacts': {
      const accepted = await fastify.prisma.friendRequest.findMany({
        where: { status: 'accepted' },
        select: { senderId: true, receiverId: true }
      });
      const contactCounts = new Map<string, number>();
      for (const fr of accepted) {
        contactCounts.set(fr.senderId, (contactCounts.get(fr.senderId) || 0) + 1);
        contactCounts.set(fr.receiverId, (contactCounts.get(fr.receiverId) || 0) + 1);
      }
      const sorted = sortAndLimit(contactCounts, limit);
      const userMap = await fetchUserDetails(fastify, sorted.map(([id]) => id));
      return buildUserRankings(sorted, userMap);
    }

    case 'most_tracking_links_created': {
      const topCreators = await fastify.prisma.trackingLink.groupBy({
        by: ['createdBy'],
        where: { ...dateWhere(startDate), createdBy: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit
      });
      const userIds = topCreators.map(c => c.createdBy!).filter(Boolean);
      const userMap = await fetchUserDetails(fastify, userIds);
      return buildUserRankings(
        topCreators.map(c => [c.createdBy!, c._count.id] as [string, number]),
        userMap
      );
    }

    case 'most_tracking_link_clicks': {
      const links = await fastify.prisma.trackingLink.findMany({
        where: { ...dateWhere(startDate), createdBy: { not: null }, totalClicks: { gt: 0 } },
        select: { createdBy: true, totalClicks: true }
      });
      const userCounts = new Map<string, number>();
      for (const link of links) {
        if (link.createdBy) {
          userCounts.set(link.createdBy, (userCounts.get(link.createdBy) || 0) + link.totalClicks);
        }
      }
      const sorted = sortAndLimit(userCounts, limit);
      const userMap = await fetchUserDetails(fastify, sorted.map(([id]) => id));
      return buildUserRankings(sorted, userMap);
    }

    default:
      return [];
  }
}

// ═══════════════════════════════════════════════════════════════════
// RANK CONVERSATIONS
// ═══════════════════════════════════════════════════════════════════

async function rankConversations(fastify: FastifyInstance, criterion: string, startDate: Date | null, limit: number) {
  switch (criterion) {
    case 'message_count':
    case 'messages': {
      const topConvos = await fastify.prisma.message.groupBy({
        by: ['conversationId'],
        where: { ...dateWhere(startDate), deletedAt: null },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit
      });
      const convoIds = topConvos.map(c => c.conversationId);
      const convoMap = await fetchConvoDetails(fastify, convoIds);
      return buildConvoRankings(
        topConvos.map(c => [c.conversationId, c._count.id] as [string, number]),
        convoMap
      );
    }

    case 'member_count':
    case 'members': {
      const topConvos = await fastify.prisma.participant.groupBy({
        by: ['conversationId'],
        where: { isActive: true },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit
      });
      const convoIds = topConvos.map(c => c.conversationId);
      const convoMap = await fetchConvoDetails(fastify, convoIds);
      return buildConvoRankings(
        topConvos.map(c => [c.conversationId, c._count.id] as [string, number]),
        convoMap
      );
    }

    case 'reaction_count': {
      const reactions = await fastify.prisma.reaction.findMany({
        where: dateWhere(startDate),
        select: { message: { select: { conversationId: true } } }
      });
      const convoCounts = new Map<string, number>();
      for (const r of reactions) {
        const cId = r.message?.conversationId;
        if (cId) {
          convoCounts.set(cId, (convoCounts.get(cId) || 0) + 1);
        }
      }
      const sorted = sortAndLimit(convoCounts, limit);
      const convoMap = await fetchConvoDetails(fastify, sorted.map(([id]) => id));
      return buildConvoRankings(sorted, convoMap);
    }

    case 'files_shared': {
      const topConvos = await fastify.prisma.message.groupBy({
        by: ['conversationId'],
        where: {
          ...dateWhere(startDate),
          deletedAt: null,
          messageType: { in: ['image', 'file', 'video', 'audio'] }
        },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit
      });
      const convoIds = topConvos.map(c => c.conversationId);
      const convoMap = await fetchConvoDetails(fastify, convoIds);
      return buildConvoRankings(
        topConvos.map(c => [c.conversationId, c._count.id] as [string, number]),
        convoMap
      );
    }

    case 'call_count': {
      const topConvos = await fastify.prisma.callSession.groupBy({
        by: ['conversationId'],
        where: dateWhere(startDate, 'startedAt'),
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit
      });
      const convoIds = topConvos.map(c => c.conversationId);
      const convoMap = await fetchConvoDetails(fastify, convoIds);
      return buildConvoRankings(
        topConvos.map(c => [c.conversationId, c._count.id] as [string, number]),
        convoMap
      );
    }

    case 'recent_activity': {
      const convos = await fastify.prisma.conversation.findMany({
        where: startDate ? { lastMessageAt: { gte: startDate } } : {},
        select: { id: true, identifier: true, title: true, type: true, avatar: true, lastMessageAt: true },
        orderBy: { lastMessageAt: 'desc' },
        take: limit
      });
      return convos.map(c => ({
        id: c.id,
        identifier: c.identifier,
        title: c.title || c.identifier || 'Sans titre',
        type: c.type,
        image: c.avatar,
        count: 0,
        lastActivity: c.lastMessageAt?.toISOString()
      }));
    }

    default:
      return [];
  }
}

// ═══════════════════════════════════════════════════════════════════
// RANK MESSAGES
// ═══════════════════════════════════════════════════════════════════

async function rankMessages(fastify: FastifyInstance, criterion: string, startDate: Date | null, limit: number) {
  const dateFilter = dateWhere(startDate);

  async function fetchAndBuildMessageRankings(
    entries: Array<{ messageId: string; count: number }>
  ) {
    const messageIds = entries.map(e => e.messageId);
    const messages = await fastify.prisma.message.findMany({
      where: { id: { in: messageIds } },
      select: {
        id: true,
        content: true,
        messageType: true,
        createdAt: true,
        sender: {
          select: { id: true, userId: true, displayName: true, avatar: true, user: { select: { username: true } } }
        },
        conversation: {
          select: { id: true, identifier: true, title: true, type: true }
        }
      }
    });
    const msgMap = new Map(messages.map(m => [m.id, m]));
    return entries.map(e => {
      const msg = msgMap.get(e.messageId);
      return {
        id: e.messageId,
        content: msg?.content,
        contentPreview: msg?.content ? msg.content.substring(0, 100) : '',
        messageType: msg?.messageType,
        createdAt: msg?.createdAt?.toISOString(),
        sender: msg?.sender ? { ...msg.sender, username: msg.sender.user?.username } : undefined,
        conversation: msg?.conversation,
        count: e.count
      };
    });
  }

  switch (criterion) {
    case 'most_reactions':
    case 'reactions': {
      const topMessages = await fastify.prisma.reaction.groupBy({
        by: ['messageId'],
        where: dateFilter,
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit
      });
      return fetchAndBuildMessageRankings(
        topMessages.map(m => ({ messageId: m.messageId, count: m._count.id }))
      );
    }

    case 'most_replies':
    case 'replies': {
      const topMessages = await fastify.prisma.message.groupBy({
        by: ['replyToId'],
        where: { ...dateFilter, replyToId: { not: null } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit
      });
      return fetchAndBuildMessageRankings(
        topMessages.map(m => ({ messageId: m.replyToId!, count: m._count.id }))
      );
    }

    case 'most_mentions': {
      const topMessages = await fastify.prisma.mention.groupBy({
        by: ['messageId'],
        where: dateWhere(startDate, 'mentionedAt'),
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: limit
      });
      return fetchAndBuildMessageRankings(
        topMessages.map(m => ({ messageId: m.messageId, count: m._count.id }))
      );
    }

    default:
      return [];
  }
}

// ═══════════════════════════════════════════════════════════════════
// RANK LINKS
// ═══════════════════════════════════════════════════════════════════

async function rankLinks(fastify: FastifyInstance, criterion: string, startDate: Date | null, limit: number) {
  switch (criterion) {
    case 'tracking_links_most_visited':
    case 'clicks': {
      const links = await fastify.prisma.trackingLink.findMany({
        where: { ...dateWhere(startDate), totalClicks: { gt: 0 } },
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
        },
        orderBy: { totalClicks: 'desc' },
        take: limit
      });
      return links.map(l => ({
        id: l.id,
        token: l.token,
        originalUrl: l.originalUrl,
        totalClicks: l.totalClicks,
        uniqueClicks: l.uniqueClicks,
        createdAt: l.createdAt?.toISOString(),
        creator: l.creator,
        count: l.totalClicks
      }));
    }

    case 'tracking_links_most_unique': {
      const links = await fastify.prisma.trackingLink.findMany({
        where: { ...dateWhere(startDate), uniqueClicks: { gt: 0 } },
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
        },
        orderBy: { uniqueClicks: 'desc' },
        take: limit
      });
      return links.map(l => ({
        id: l.id,
        token: l.token,
        originalUrl: l.originalUrl,
        totalClicks: l.totalClicks,
        uniqueClicks: l.uniqueClicks,
        createdAt: l.createdAt?.toISOString(),
        creator: l.creator,
        count: l.uniqueClicks
      }));
    }

    case 'share_links_most_used':
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

    case 'share_links_most_unique_sessions': {
      const topShareLinks = await fastify.prisma.conversationShareLink.findMany({
        where: { isActive: true, currentUniqueSessions: { gt: 0 } },
        select: {
          id: true,
          linkId: true,
          identifier: true,
          name: true,
          currentUses: true,
          currentUniqueSessions: true,
          maxUses: true,
          createdAt: true,
          creator: {
            select: { id: true, username: true, displayName: true, avatar: true }
          },
          conversation: {
            select: { id: true, identifier: true, title: true, type: true }
          }
        },
        orderBy: { currentUniqueSessions: 'desc' },
        take: limit
      });
      return topShareLinks.map(l => ({
        id: l.id,
        name: l.name || l.identifier || l.linkId,
        identifier: l.identifier,
        currentUses: l.currentUses,
        currentUniqueSessions: l.currentUniqueSessions,
        maxUses: l.maxUses,
        createdAt: l.createdAt?.toISOString(),
        creator: l.creator,
        conversation: l.conversation,
        count: l.currentUniqueSessions
      }));
    }

    default:
      return [];
  }
}

// ═══════════════════════════════════════════════════════════════════
// ROUTE
// ═══════════════════════════════════════════════════════════════════

export async function systemRankingsRoutes(fastify: FastifyInstance) {
  fastify.get('/ranking', {
    onRequest: [fastify.authenticate, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { entityType = 'users', criterion = 'messages_sent', period = '30d', limit = '50' } = request.query as RankingQuery;
      const limitNum = Math.min(Math.max(1, parseInt(limit || '50', 10) || 50), 100);
      const startDate = getPeriodStartDate(period || '30d');

      let rankings: any[] = [];

      switch (entityType) {
        case 'users':
          rankings = await rankUsers(fastify, criterion || 'messages_sent', startDate, limitNum);
          break;
        case 'conversations':
          rankings = await rankConversations(fastify, criterion || 'message_count', startDate, limitNum);
          break;
        case 'messages':
          rankings = await rankMessages(fastify, criterion || 'most_reactions', startDate, limitNum);
          break;
        case 'links':
          rankings = await rankLinks(fastify, criterion || 'tracking_links_most_visited', startDate, limitNum);
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
