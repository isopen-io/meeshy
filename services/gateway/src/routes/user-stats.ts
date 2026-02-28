import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';

const ACHIEVEMENT_THRESHOLDS = {
  polyglotte: { field: 'languagesUsed', threshold: 5, icon: 'globe', color: '#3498DB' },
  bavard: { field: 'totalMessages', threshold: 1000, icon: 'bubble.left.and.bubble.right.fill', color: '#FF6B6B' },
  connecteur: { field: 'totalConversations', threshold: 10, icon: 'person.2.fill', color: '#4ECDC4' },
  traducteur: { field: 'totalTranslations', threshold: 100, icon: 'character.book.closed.fill', color: '#9B59B6' },
  fidele: { field: 'memberDays', threshold: 30, icon: 'calendar.badge.checkmark', color: '#F8B500' },
  populaire: { field: 'friendRequestsReceived', threshold: 50, icon: 'star.fill', color: '#E91E63' },
} as const;

type AchievementKey = keyof typeof ACHIEVEMENT_THRESHOLDS;

export async function userStatsRoutes(fastify: FastifyInstance) {

  fastify.get(
    '/users/me/stats',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Get user statistics summary',
        tags: ['user-stats'],
        summary: 'User stats overview',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'object' },
            },
          },
          401: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { userId } = request.user as { userId: string };

        const [
          totalMessages,
          totalConversations,
          totalTranslations,
          friendRequestsReceived,
          languagesRaw,
          user,
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
              NOT: { translations: null },
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
            },
          }),
          fastify.prisma.user.findUnique({
            where: { id: userId },
            select: { createdAt: true },
          }),
        ]);

        const languagesUsed = languagesRaw.length;
        const memberDays = user
          ? Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24))
          : 0;

        const numericStats = {
          totalMessages,
          totalConversations,
          totalTranslations,
          friendRequestsReceived,
          languagesUsed,
          memberDays,
        };
        const languages = languagesRaw.map((l) => l.originalLanguage).filter(Boolean);
        const achievements = computeAchievements(numericStats);

        return {
          success: true,
          data: { ...numericStats, languages, achievements },
        };
      } catch (error) {
        fastify.log.error({ error }, 'Error fetching user stats');
        return reply.code(500).send({
          success: false,
          error: 'Failed to fetch user stats',
        });
      }
    }
  );

  fastify.get(
    '/users/me/stats/timeline',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Get daily message activity timeline for charts',
        tags: ['user-stats'],
        summary: 'User activity timeline',
        querystring: {
          type: 'object',
          properties: {
            days: { type: 'number', default: 30, minimum: 7, maximum: 90 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'array' },
            },
          },
          401: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { userId } = request.user as { userId: string };
        const { days = 30 } = request.query as { days?: number };

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        startDate.setHours(0, 0, 0, 0);

        const messages = await fastify.prisma.message.findMany({
          where: {
            senderId: userId,
            isDeleted: false,
            createdAt: { gte: startDate },
          },
          select: { createdAt: true },
        });

        const dailyCounts: Record<string, number> = {};
        for (let i = days - 1; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          dailyCounts[d.toISOString().slice(0, 10)] = 0;
        }

        for (const msg of messages) {
          const key = msg.createdAt.toISOString().slice(0, 10);
          if (key in dailyCounts) {
            dailyCounts[key]++;
          }
        }

        const timeline = Object.entries(dailyCounts).map(([date, count]) => ({
          date,
          messages: count,
        }));

        return { success: true, data: timeline };
      } catch (error) {
        fastify.log.error({ error }, 'Error fetching user timeline');
        return reply.code(500).send({
          success: false,
          error: 'Failed to fetch user timeline',
        });
      }
    }
  );

  fastify.get(
    '/users/me/stats/achievements',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Get user achievement badges',
        tags: ['user-stats'],
        summary: 'User achievements',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'array' },
            },
          },
          401: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { userId } = request.user as { userId: string };

        const [
          totalMessages,
          totalConversations,
          totalTranslations,
          friendRequestsReceived,
          languagesRaw,
          user,
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
              NOT: { translations: null },
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
            },
          }),
          fastify.prisma.user.findUnique({
            where: { id: userId },
            select: { createdAt: true },
          }),
        ]);

        const stats = {
          totalMessages,
          totalConversations,
          totalTranslations,
          friendRequestsReceived,
          languagesUsed: languagesRaw.length,
          memberDays: user
            ? Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24))
            : 0,
        };

        return { success: true, data: computeAchievements(stats) };
      } catch (error) {
        fastify.log.error({ error }, 'Error fetching achievements');
        return reply.code(500).send({
          success: false,
          error: 'Failed to fetch achievements',
        });
      }
    }
  );
}

function computeAchievements(
  stats: Record<string, number>
): Array<{
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  isUnlocked: boolean;
  progress: number;
  threshold: number;
  current: number;
}> {
  const labels: Record<AchievementKey, { name: string; description: string }> = {
    polyglotte: { name: 'Polyglotte', description: 'Utiliser 5+ langues' },
    bavard: { name: 'Bavard', description: 'Envoyer 1000+ messages' },
    connecteur: { name: 'Connecteur', description: 'Rejoindre 10+ conversations' },
    traducteur: { name: 'Traducteur', description: 'Traduire 100+ messages' },
    fidele: { name: 'Fidele', description: 'Membre pendant 30+ jours' },
    populaire: { name: 'Populaire', description: 'Recevoir 50+ demandes d\'amis' },
  };

  return (Object.entries(ACHIEVEMENT_THRESHOLDS) as [AchievementKey, typeof ACHIEVEMENT_THRESHOLDS[AchievementKey]][]).map(
    ([key, config]) => {
      const current = stats[config.field] ?? 0;
      const progress = Math.min(current / config.threshold, 1);
      return {
        id: key,
        name: labels[key].name,
        description: labels[key].description,
        icon: config.icon,
        color: config.color,
        isUnlocked: current >= config.threshold,
        progress,
        threshold: config.threshold,
        current,
      };
    }
  );
}
