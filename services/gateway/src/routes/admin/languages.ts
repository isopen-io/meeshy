import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';

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
  const canView = ['BIGBOSS', 'ADMIN', 'AUDIT', 'ANALYST'].includes(userRole);

  if (!canView) {
    return reply.status(403).send({
      success: false,
      message: 'Permission insuffisante'
    });
  }
};

export async function languagesRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/admin/languages/stats
   * Statistiques détaillées des langues
   */
  fastify.get('/stats', {
    onRequest: [fastify.authenticate, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as any;
      const period = query.period || '30d';
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
        default:
          startDate.setDate(startDate.getDate() - 30);
      }

      // Top langues par nombre de messages
      const topLanguagesByMessages = await fastify.prisma.message.groupBy({
        by: ['originalLanguage'],
        where: {
          createdAt: { gte: startDate },
          isDeleted: false,
          originalLanguage: { not: null }
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

      // Enrichir avec pourcentages et nombre d'utilisateurs par langue
      const topLanguages = await Promise.all(
        topLanguagesByMessages.map(async (lang) => {
          // Compter utilisateurs distincts pour cette langue
          const users = await fastify.prisma.message.findMany({
            where: {
              originalLanguage: lang.originalLanguage,
              createdAt: { gte: startDate },
              isDeleted: false,
              senderId: { not: null }
            },
            select: {
              senderId: true
            },
            distinct: ['senderId']
          });

          return {
            language: lang.originalLanguage || 'Unknown',
            messageCount: lang._count.id,
            userCount: users.length,
            percentage: totalMessages > 0
              ? Math.round((lang._count.id / totalMessages) * 100)
              : 0
          };
        })
      );

      // Paires de langues les plus traduites (source -> target)
      // Since sourceLanguage is derived from message.originalLanguage, we need to aggregate manually
      const translations = await fastify.prisma.messageTranslation.findMany({
        where: {
          createdAt: { gte: startDate }
        },
        select: {
          targetLanguage: true,
          confidenceScore: true,
          message: {
            select: {
              originalLanguage: true
            }
          }
        }
      });

      // Aggregate language pairs manually
      const pairCounts: Record<string, { count: number; totalScore: number; scoreCount: number }> = {};

      translations.forEach(t => {
        const sourceLanguage = t.message?.originalLanguage || 'unknown';
        const key = `${sourceLanguage}|${t.targetLanguage}`;

        if (!pairCounts[key]) {
          pairCounts[key] = { count: 0, totalScore: 0, scoreCount: 0 };
        }
        pairCounts[key].count++;
        if (t.confidenceScore != null) {
          pairCounts[key].totalScore += t.confidenceScore;
          pairCounts[key].scoreCount++;
        }
      });

      const formattedPairs = Object.entries(pairCounts)
        .map(([key, data]) => {
          const [from, to] = key.split('|');
          return {
            from,
            to,
            translationCount: data.count,
            avgConfidence: data.scoreCount > 0
              ? Math.round((data.totalScore / data.scoreCount) * 100) / 100
              : 0
          };
        })
        .sort((a, b) => b.translationCount - a.translationCount)
        .slice(0, 10);

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
          isDeleted: false,
          originalLanguage: { not: null }
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

      return reply.send({
        success: true,
        data: {
          topLanguages,
          languagePairs: formattedPairs,
          usersByLanguage: usersLanguageMap,
          growth,
          period,
          totalMessages,
          totalLanguages: topLanguagesByMessages.length
        }
      });
    } catch (error) {
      logError(fastify.log, 'Get language stats error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la récupération des statistiques des langues'
      });
    }
  });

  /**
   * GET /api/admin/languages/timeline
   * Évolution des langues dans le temps
   */
  fastify.get('/timeline', {
    onRequest: [fastify.authenticate, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as any;
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
        default:
          days = 7;
      }

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      // Récupérer tous les messages de la période
      const where: any = {
        createdAt: { gte: startDate },
        isDeleted: false,
        originalLanguage: { not: null }
      };

      if (language) {
        where.originalLanguage = language;
      }

      const messages = await fastify.prisma.message.findMany({
        where,
        select: {
          createdAt: true,
          originalLanguage: true
        }
      });

      // Grouper par jour
      const dailyData: Record<string, Record<string, number>> = {};

      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateKey = date.toISOString().split('T')[0];
        dailyData[dateKey] = {};
      }

      messages.forEach(msg => {
        const dateKey = msg.createdAt.toISOString().split('T')[0];
        const lang = msg.originalLanguage || 'unknown';

        if (dailyData[dateKey]) {
          dailyData[dateKey][lang] = (dailyData[dateKey][lang] || 0) + 1;
        }
      });

      const timeline = Object.entries(dailyData).map(([date, languages]) => ({
        date,
        ...languages
      }));

      return reply.send({
        success: true,
        data: timeline
      });
    } catch (error) {
      logError(fastify.log, 'Get language timeline error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la récupération de la timeline des langues'
      });
    }
  });

  /**
   * GET /api/admin/languages/translation-accuracy
   * Précision des traductions par paire de langues
   */
  fastify.get('/translation-accuracy', {
    onRequest: [fastify.authenticate, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as any;
      const limit = parseInt(query.limit) || 10;

      // Fetch translations with their message's original language
      const translations = await fastify.prisma.messageTranslation.findMany({
        select: {
          targetLanguage: true,
          confidenceScore: true,
          message: {
            select: {
              originalLanguage: true
            }
          }
        }
      });

      // Aggregate by language pair manually
      const pairStats: Record<string, { count: number; totalScore: number; scoreCount: number }> = {};

      translations.forEach(t => {
        const sourceLanguage = t.message?.originalLanguage || 'unknown';
        const key = `${sourceLanguage}|${t.targetLanguage}`;

        if (!pairStats[key]) {
          pairStats[key] = { count: 0, totalScore: 0, scoreCount: 0 };
        }
        pairStats[key].count++;
        if (t.confidenceScore != null) {
          pairStats[key].totalScore += t.confidenceScore;
          pairStats[key].scoreCount++;
        }
      });

      const accuracy = Object.entries(pairStats)
        .map(([key, data]) => {
          const [from, to] = key.split('|');
          const avgConfidence = data.scoreCount > 0
            ? data.totalScore / data.scoreCount
            : 0;

          return {
            from,
            to,
            avgConfidence: Math.round(avgConfidence * 100),
            translationCount: data.count,
            quality: avgConfidence > 0.9
              ? 'excellent'
              : avgConfidence > 0.7
                ? 'good'
                : avgConfidence > 0.5
                  ? 'fair'
                  : 'poor'
          };
        })
        .sort((a, b) => b.translationCount - a.translationCount)
        .slice(0, limit);

      return reply.send({
        success: true,
        data: accuracy
      });
    } catch (error) {
      logError(fastify.log, 'Get translation accuracy error:', error);
      return reply.status(500).send({
        success: false,
        message: 'Erreur lors de la récupération de la précision des traductions'
      });
    }
  });
}
