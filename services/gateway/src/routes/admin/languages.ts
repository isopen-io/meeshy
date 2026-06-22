import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Prisma } from '@meeshy/shared/prisma/client';
import { logError } from '../../utils/logger';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { sendSuccess, sendUnauthorized, sendForbidden, sendInternalError } from '../../utils/response.js';
import { validateQuery } from '../../validation/helpers.js';
import { LanguageStatsQuerySchema, LanguageTimelineQuerySchema, TranslationAccuracyQuerySchema } from '../../validation/admin-schemas.js';

// Les agrégations lourdes (utilisateurs distincts, paires de traduction, timeline)
// sont exécutées côté MongoDB via aggregateRaw : seuls les agrégats traversent le
// réseau, jamais les collections de messages (iter 40).

type TranslationPairRow = {
  _id: { from: string; to: string };
  count: number;
  totalScore: number;
  scoreCount: number;
};

type UserCountRow = { _id: string; userCount: number };

type TimelineRow = { _id: { date: string; lang: string }; count: number };

const NON_EMPTY_LANGUAGE = { $nin: [null, ''] };

function extendedJsonDate(date: Date) {
  return { $date: date.toISOString() };
}

function translationPairsPipeline(options: { since?: Date; limit: number }): Prisma.InputJsonValue[] {
  const match: Record<string, unknown> = { translations: { $ne: null } };
  if (options.since) {
    match.createdAt = { $gte: extendedJsonDate(options.since) };
  }
  return [
    { $match: match },
    { $project: { originalLanguage: 1, pair: { $objectToArray: '$translations' } } },
    { $unwind: '$pair' },
    {
      $group: {
        _id: { from: { $ifNull: ['$originalLanguage', 'unknown'] }, to: '$pair.k' },
        count: { $sum: 1 },
        totalScore: { $sum: { $ifNull: ['$pair.v.confidenceScore', 0] } },
        scoreCount: { $sum: { $cond: [{ $ne: ['$pair.v.confidenceScore', null] }, 1, 0] } },
      },
    },
    { $sort: { count: -1 } },
    { $limit: options.limit },
  ] as unknown as Prisma.InputJsonValue[];
}

function distinctUsersByLanguagePipeline(options: { since: Date; languages: string[] }): Prisma.InputJsonValue[] {
  return [
    {
      $match: {
        createdAt: { $gte: extendedJsonDate(options.since) },
        deletedAt: null,
        originalLanguage: { $in: options.languages },
        senderId: { $ne: null },
      },
    },
    { $lookup: { from: 'Participant', localField: 'senderId', foreignField: '_id', as: 'sender' } },
    { $unwind: '$sender' },
    { $match: { 'sender.userId': { $ne: null } } },
    { $group: { _id: { lang: '$originalLanguage', userId: '$sender.userId' } } },
    { $group: { _id: '$_id.lang', userCount: { $sum: 1 } } },
  ] as unknown as Prisma.InputJsonValue[];
}

function dailyLanguageCountsPipeline(options: { since: Date; language?: string }): Prisma.InputJsonValue[] {
  return [
    {
      $match: {
        createdAt: { $gte: extendedJsonDate(options.since) },
        deletedAt: null,
        originalLanguage: options.language ?? NON_EMPTY_LANGUAGE,
      },
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          lang: { $ifNull: ['$originalLanguage', 'unknown'] },
        },
        count: { $sum: 1 },
      },
    },
  ] as unknown as Prisma.InputJsonValue[];
}

// Middleware pour vérifier les permissions admin
const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  const authContext = (request as UnifiedAuthRequest).authContext;
  if (!authContext || !authContext.isAuthenticated || !authContext.registeredUser) {
    return sendUnauthorized(reply, 'Authentification requise');
  }

  const userRole = authContext.registeredUser.role;
  const canView = ['BIGBOSS', 'ADMIN', 'AUDIT', 'ANALYST'].includes(userRole);

  if (!canView) {
    return sendForbidden(reply, 'Permission insuffisante');
  }
};

export async function languagesRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/admin/languages/stats
   * Statistiques détaillées des langues
   */
  fastify.get('/stats', {
    onRequest: [fastify.authenticate, requireAdmin],
    preHandler: [validateQuery(LanguageStatsQuerySchema)]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as any;
      /* istanbul ignore next -- unreachable: validateQuery/Zod provides default */
      const period = query.period || '30d';
      /* istanbul ignore next -- unreachable: validateQuery/Zod provides default */
      const limit = parseInt(query.limit) || 10;

      // Calculer la date de début
      const now = new Date();
      let startDate = new Date();

      switch (period) {
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(startDate.getDate() - 90);
          break;
        /* istanbul ignore next -- unreachable: Zod enum exhausts all valid period values */
        default:
          startDate.setDate(startDate.getDate() - 30);
      }

      // Top langues par nombre de messages
      const topLanguagesByMessages = await fastify.prisma.message.groupBy({
        by: ['originalLanguage'],
        where: {
          createdAt: { gte: startDate },
          deletedAt: null,
          originalLanguage: { not: '' } // Prisma+Mongo rejects `not: null`; exclude empties with a concrete value
        },
        _count: {
          id: true
        },
        orderBy: {
          _count: {
            id: 'desc'
          }
        },
        take: limit
      });

      // Total messages pour calculer les pourcentages
      const totalMessages = topLanguagesByMessages.reduce(
        (sum, lang) => sum + lang._count.id,
        0
      );

      // Utilisateurs distincts par langue — agrégé côté MongoDB ($lookup Participant)
      const topLangCodes = topLanguagesByMessages.map(l => l.originalLanguage).filter(Boolean) as string[];
      const userCountRows = topLangCodes.length > 0
        ? (await fastify.prisma.message.aggregateRaw({
            pipeline: distinctUsersByLanguagePipeline({ since: startDate, languages: topLangCodes }),
          }) as unknown as UserCountRow[])
        : [];

      const usersByLang = new Map(userCountRows.map((row) => [row._id, row.userCount]));

      const topLanguages = topLanguagesByMessages.map((lang) => ({
        language: lang.originalLanguage || 'Unknown',
        messageCount: lang._count.id,
        userCount: usersByLang.get(lang.originalLanguage ?? '') ?? 0,
        percentage: totalMessages > 0
          ? Math.round((lang._count.id / totalMessages) * 100)
          : 0
      }));

      // Paires de langues les plus traduites (source -> target) — agrégé côté MongoDB
      const pairRows = await fastify.prisma.message.aggregateRaw({
        pipeline: translationPairsPipeline({ since: startDate, limit: 10 }),
      }) as unknown as TranslationPairRow[];

      const formattedPairs = pairRows.map((row) => ({
        from: row._id.from,
        to: row._id.to,
        translationCount: row.count,
        avgConfidence: row.scoreCount > 0
          ? Math.round((row.totalScore / row.scoreCount) * 100) / 100
          : 0
      }));

      // Utilisateurs par langue préférée (langue système)
      const usersByLanguage = await fastify.prisma.user.groupBy({
        by: ['systemLanguage'],
        where: {
          systemLanguage: { not: null }
        },
        _count: {
          id: true
        }
      });

      const usersLanguageMap = usersByLanguage.reduce((acc, item) => {
        if (item.systemLanguage) {
          acc[item.systemLanguage] = item._count.id;
        }
        return acc;
      }, {} as Record<string, number>);

      // Calculer la croissance par langue (comparer avec période précédente)
      const previousPeriodStart = new Date(startDate);
      const periodDuration = now.getTime() - startDate.getTime();
      previousPeriodStart.setTime(startDate.getTime() - periodDuration);

      const previousPeriodMessages = await fastify.prisma.message.groupBy({
        by: ['originalLanguage'],
        where: {
          createdAt: {
            gte: previousPeriodStart,
            lt: startDate
          },
          deletedAt: null,
          originalLanguage: { not: '' } // Prisma+Mongo rejects `not: null`; exclude empties with a concrete value
        },
        _count: {
          id: true
        }
      });

      const previousCounts = previousPeriodMessages.reduce((acc, lang) => {
        if (lang.originalLanguage) {
          acc[lang.originalLanguage] = lang._count.id;
        }
        return acc;
      }, {} as Record<string, number>);

      const growth = topLanguagesByMessages.reduce((acc, lang) => {
        const currentCount = lang._count.id;
        const previousCount = previousCounts[lang.originalLanguage || ''] || 0;

        if (previousCount > 0) {
          const growthPercent = Math.round(
            ((currentCount - previousCount) / previousCount) * 100
          );
          if (lang.originalLanguage) {
            acc[lang.originalLanguage] = growthPercent;
          }
        } else if (lang.originalLanguage) {
          acc[lang.originalLanguage] = 100; // Nouvelle langue
        }

        return acc;
      }, {} as Record<string, number>);

      return sendSuccess(reply, {
          topLanguages,
          languagePairs: formattedPairs,
          usersByLanguage: usersLanguageMap,
          growth,
          period,
          totalMessages,
          totalLanguages: topLanguagesByMessages.length
        });
    } catch (error) {
      logError(fastify.log, 'Get language stats error:', error);
      return sendInternalError(reply, 'Erreur lors de la récupération des statistiques des langues');
    }
  });

  /**
   * GET /api/admin/languages/timeline
   * Évolution des langues dans le temps
   */
  fastify.get('/timeline', {
    onRequest: [fastify.authenticate, requireAdmin],
    preHandler: [validateQuery(LanguageTimelineQuerySchema)]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as any;
      /* istanbul ignore next -- unreachable: validateQuery/Zod provides default */
      const period = query.period || '7d';
      const language = query.language; // Langue spécifique (optionnel)

      const now = new Date();
      let days = 7;

      switch (period) {
        case '7d':
          days = 7;
          break;
        case '30d':
          days = 30;
          break;
        /* istanbul ignore next -- unreachable: Zod enum exhausts all valid period values */
        default:
          days = 7;
      }

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      // Comptage par jour et par langue — agrégé côté MongoDB ($dateToString)
      const timelineRows = await fastify.prisma.message.aggregateRaw({
        pipeline: dailyLanguageCountsPipeline({ since: startDate, language }),
      }) as unknown as TimelineRow[];

      const dailyData: Record<string, Record<string, number>> = {};

      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateKey = date.toISOString().split('T')[0];
        dailyData[dateKey] = {};
      }

      timelineRows.forEach((row) => {
        if (dailyData[row._id.date]) {
          dailyData[row._id.date][row._id.lang] = row.count;
        }
      });

      const timeline = Object.entries(dailyData).map(([date, languages]) => ({
        date,
        ...languages
      }));

      return sendSuccess(reply, timeline);
    } catch (error) {
      logError(fastify.log, 'Get language timeline error:', error);
      return sendInternalError(reply, 'Erreur lors de la récupération de la timeline des langues');
    }
  });

  /**
   * GET /api/admin/languages/translation-accuracy
   * Précision des traductions par paire de langues
   */
  fastify.get('/translation-accuracy', {
    onRequest: [fastify.authenticate, requireAdmin],
    preHandler: [validateQuery(TranslationAccuracyQuerySchema)]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as any;
      /* istanbul ignore next -- unreachable: validateQuery/Zod provides default */
      const limit = parseInt(query.limit) || 10;

      // Précision par paire de langues — agrégé côté MongoDB
      const pairRows = await fastify.prisma.message.aggregateRaw({
        pipeline: translationPairsPipeline({ limit }),
      }) as unknown as TranslationPairRow[];

      const accuracy = pairRows.map((row) => {
        const avgConfidence = row.scoreCount > 0
          ? row.totalScore / row.scoreCount
          : 0;

        return {
          from: row._id.from,
          to: row._id.to,
          avgConfidence: Math.round(avgConfidence * 100),
          translationCount: row.count,
          quality: avgConfidence > 0.9
            ? 'excellent'
            : avgConfidence > 0.7
              ? 'good'
              : avgConfidence > 0.5
                ? 'fair'
                : 'poor'
        };
      });

      return sendSuccess(reply, accuracy);
    } catch (error) {
      logError(fastify.log, 'Get translation accuracy error:', error);
      return sendInternalError(reply, 'Erreur lors de la récupération de la précision des traductions');
    }
  });
}
