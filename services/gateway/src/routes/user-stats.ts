import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { sendInternalError } from '../utils/response';

const ACHIEVEMENT_THRESHOLDS = {
  polyglotte: { field: 'languagesUsed', threshold: 5, icon: 'globe', color: '#3498DB' },
  bavard: { field: 'totalMessages', threshold: 1000, icon: 'bubble.left.and.bubble.right.fill', color: '#FF6B6B' },
  connecteur: { field: 'totalConversations', threshold: 10, icon: 'person.2.fill', color: '#4ECDC4' },
  traducteur: { field: 'totalTranslations', threshold: 100, icon: 'character.book.closed.fill', color: '#9B59B6' },
  fidele: { field: 'memberDays', threshold: 30, icon: 'calendar.badge.checkmark', color: '#F8B500' },
  populaire: { field: 'friendRequestsReceived', threshold: 50, icon: 'star.fill', color: '#E91E63' },
} as const;

type AchievementKey = keyof typeof ACHIEVEMENT_THRESHOLDS;

export type Achievement = {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  isUnlocked: boolean;
  progress: number;
  threshold: number;
  current: number;
};

export type UserStats = {
  totalMessages: number;
  totalConversations: number;
  totalTranslations: number;
  friendRequestsReceived: number;
  languagesUsed: number;
  memberDays: number;
  languages: string[];
  achievements: Achievement[];
};

/**
 * Single source of truth for a user's aggregated statistics.
 *
 * Mirrors the iOS `UserStats` decoding shape. Used by both the authenticated
 * `/users/me/stats*` endpoints and the public `/users/:id/stats` endpoint.
 */
export async function computeUserStats(
  prisma: PrismaClient,
  userId: string
): Promise<UserStats> {
  const [
    totalMessages,
    totalConversations,
    totalTranslations,
    friendRequestsReceived,
    languagesRaw,
    user,
  ] = await Promise.all([
    prisma.message.count({
      where: { sender: { userId }, deletedAt: null },
    }),
    // Only conversations the user is CURRENTLY in. Leaving, being banned, or
    // "delete for me" soft-deactivates the Participant row (isActive: false,
    // leftAt) — it is never hard-deleted — so a bare `{ userId }` count would
    // include every conversation ever joined and inflate `totalConversations`
    // (and falsely unlock the `connecteur` achievement). Mirrors the
    // `isActive: true` membership filter used everywhere else in the codebase.
    prisma.participant.count({
      where: { userId, isActive: true },
    }),
    prisma.message.count({
      where: {
        sender: { userId },
        deletedAt: null,
        NOT: [{ translations: null }],
      },
    }),
    prisma.friendRequest.count({
      where: { receiverId: userId },
    }),
    prisma.message.groupBy({
      by: ['originalLanguage'],
      where: {
        sender: { userId },
        deletedAt: null,
      },
    }),
    prisma.user.findUnique({
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
  const languages = languagesRaw
    .map((l: { originalLanguage: string | null }) => l.originalLanguage)
    .filter((lang: string | null): lang is string => Boolean(lang));
  const achievements = computeAchievements(numericStats);

  return { ...numericStats, languages, achievements };
}

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
              data: { type: 'object', additionalProperties: true },
            },
          },
          401: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const userId = request.user!.userId;
        const stats = await computeUserStats(fastify.prisma, userId);
        return { success: true, data: stats };
      } catch (error) {
        fastify.log.error({ error }, 'Error fetching user stats');
        return sendInternalError(reply, 'Failed to fetch user stats');
      }
    }
  );

  // NOTE: `GET /users/:id/stats` (stats for any user by id/username) is owned by
  // `getUserStats` in routes/users/preferences.ts (registered as
  // `/users/:userId/stats`). A second registration here collided with it
  // (find-my-way treats `/users/:id/stats` and `/users/:userId/stats` as the
  // same route) → FST_ERR_DUPLICATED_ROUTE at boot, so the gateway failed to
  // start and prod silently kept the old image. This file only owns the
  // `/users/me/stats*` family.

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
        const userId = request.user!.userId;
        /* istanbul ignore next -- AJV useDefaults:true always injects the default; destructuring fallback is unreachable */
        const { days = 30 } = request.query as { days?: number };

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        startDate.setHours(0, 0, 0, 0);

        const messages = await fastify.prisma.message.findMany({
          where: {
            sender: { userId },
            deletedAt: null,
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
        return sendInternalError(reply, 'Failed to fetch user timeline');
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
        const userId = request.user!.userId;
        const { achievements } = await computeUserStats(fastify.prisma, userId);
        return { success: true, data: achievements };
      } catch (error) {
        fastify.log.error({ error }, 'Error fetching achievements');
        return sendInternalError(reply, 'Failed to fetch achievements');
      }
    }
  );
}

function computeAchievements(
  stats: Record<string, number>
): Achievement[] {
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
      /* istanbul ignore next -- ACHIEVEMENT_THRESHOLDS.field always matches numericStats keys; ?? 0 is unreachable */
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
