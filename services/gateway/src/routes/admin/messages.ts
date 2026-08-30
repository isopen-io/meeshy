import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { sendSuccess, sendUnauthorized, sendForbidden, sendInternalError } from '../../utils/response.js';
import { validateQuery } from '../../validation/helpers.js';
import { AdminMessagesStatsQuerySchema, AdminMessagesEngagementQuerySchema } from '../../validation/admin-schemas.js';
import { requirePermission } from '../../middleware/authorize';
import type { Prisma } from '@meeshy/shared/prisma/client';

/**
 * Volume quotidien + longueur moyenne, agrégés côté MongoDB (#4391).
 *
 * `GET /admin/messages/stats` faisait un `findMany` sur TOUTE la fenêtre
 * (`select: { createdAt, content }` — le texte intégral de chaque message, sans
 * `take`) pour en tirer un histogramme par jour et une moyenne de longueur.
 * Les deux se calculent en base, en UNE passe : `$facet` fait les deux
 * agrégations sur le même `$match`, et ne rend qu'un document.
 *
 * Le patron (`aggregateRaw` + `$dateToString`) est celui de `admin/languages.ts`
 * — le tour est pris là où `groupBy` ne sait pas dériver un jour depuis une date.
 */
type FenetreFacet = {
  readonly daily?: ReadonlyArray<{ _id: string; count: number }>;
  readonly length?: ReadonlyArray<{ avg: number | null }>;
};

/**
 * Heure de pointe + jour le plus actif, agrégés côté MongoDB (#4465).
 *
 * `GET /admin/messages/trends` faisait un `findMany` sur les 7 derniers jours
 * (`select: { createdAt }`, sans `take`) pour replier chaque ligne en JS dans
 * un histogramme par heure (0-23) et par jour de semaine (0-6). Les deux
 * bucketings sont des repliements MODULO — l'heure/le jour se répètent
 * chaque jour de la fenêtre — donc pas le patron `count` par tranche
 * contiguë de `admin/analytics.ts` (`/hourly-activity`, `/volume-timeline`) :
 * `$hour`/`$dayOfWeek` font l'extraction, `$facet` fait les DEUX agrégations
 * sur le même `$match` en un seul document (même tour que `fenetreMessagesPipeline`
 * juste au-dessus).
 *
 * `timezone: 'UTC'` : ni le Dockerfile ni docker-compose.{prod,staging}.yml ne
 * fixent `TZ` (seuls dev/local le forcent à Europe/Paris) — le process tourne
 * donc en UTC en production comme en CI, exactement ce que `getHours()` /
 * `getDay()` (JS, remplacés ici) y rendaient déjà puisqu'ils sont eux-mêmes
 * dépendants du fuseau du process.
 */
type TendancesFacet = {
  readonly hourly?: ReadonlyArray<{ _id: number; count: number }>;
  readonly weekday?: ReadonlyArray<{ _id: number; count: number }>;
};

function tendancesMessagesPipeline(since: Date): Prisma.InputJsonValue[] {
  return [
    { $match: { createdAt: { $gte: { $date: since.toISOString() } }, deletedAt: null } },
    {
      $facet: {
        hourly: [
          { $group: { _id: { $hour: { date: '$createdAt', timezone: 'UTC' } }, count: { $sum: 1 } } },
        ],
        // $dayOfWeek: 1=dimanche..7=samedi ; Date#getDay() (JS): 0=dimanche..6=samedi.
        weekday: [
          { $group: { _id: { $dayOfWeek: { date: '$createdAt', timezone: 'UTC' } }, count: { $sum: 1 } } },
        ],
      },
    },
  ] as unknown as Prisma.InputJsonValue[];
}

function fenetreMessagesPipeline(since: Date): Prisma.InputJsonValue[] {
  return [
    { $match: { createdAt: { $gte: { $date: since.toISOString() } }, deletedAt: null } },
    {
      $facet: {
        daily: [
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } },
              count: { $sum: 1 },
            },
          },
        ],
        // `filter(len > 0)` de la version JS : la moyenne ne porte que sur les
        // messages au contenu NON VIDE. `$strLenCP` compte les points de code
        // (la version JS comptait des unités UTF-16, qui doublent les emoji).
        length: [
          { $project: { len: { $strLenCP: { $ifNull: ['$content', ''] } } } },
          { $match: { len: { $gt: 0 } } },
          { $group: { _id: null, avg: { $avg: '$len' } } },
        ],
      },
    },
  ] as unknown as Prisma.InputJsonValue[];
}

// Middleware pour vérifier les permissions admin
// `requireAdmin` était une garde LOCALE : elle rejouait une liste de rôles en dur
// (#4153). Elle nomme désormais la permission qu'elle exige, et la matrice
// décide — un seul endroit où lire la loi, un seul où la changer.
//
// Ces routes sont des ANALYSES (stats, tendances, engagement), mais leur
// admission d'aujourd'hui inclut MODERATOR et exclut ANALYST — l'inverse de
// `canViewAnalytics`. Le lot uniformise le VOCABULAIRE sans changer un seul
// rôle admis : la question du bon niveau appartient à #4157, qui la relira
// pour ce qu'elle est.
const requireAdmin = requirePermission('canAccessAdmin');

export async function messagesRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/admin/messages/stats
   * Statistiques détaillées des messages
   */
  fastify.get('/stats', {
    onRequest: [fastify.authenticate, requireAdmin],
    preHandler: [validateQuery(AdminMessagesStatsQuerySchema)]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as any;
      const period = query.period || /* istanbul ignore next -- Zod provides default */ '30d';

      // Calculer la date de début
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
        /* istanbul ignore next -- Zod z.enum enforces valid period; default unreachable */
        default:
          startDate.setDate(startDate.getDate() - 30);
      }

      // Total messages
      const [totalMessages, deletedMessages, editedMessages] = await Promise.all([
        fastify.prisma.message.count({
          where: {
            createdAt: { gte: startDate },
            deletedAt: null
          }
        }),
        fastify.prisma.message.count({
          where: {
            createdAt: { gte: startDate },
            deletedAt: { not: null }
          }
        }),
        fastify.prisma.message.count({
          where: {
            createdAt: { gte: startDate },
            isEdited: true,
            deletedAt: null
          }
        })
      ]);

      // Messages par type
      const messagesByType = await fastify.prisma.message.groupBy({
        by: ['messageType'],
        where: {
          createdAt: { gte: startDate },
          deletedAt: null
        },
        _count: {
          id: true
        }
      });

      const typeDistribution = messagesByType.reduce((acc, item) => {
        acc[item.messageType] = item._count.id;
        return acc;
      }, {} as Record<string, number>);

      // Messages par période (timeline) + longueur moyenne — UNE agrégation
      // MongoDB, un document en retour (#4391).
      const facets = await fastify.prisma.message.aggregateRaw({
        pipeline: fenetreMessagesPipeline(startDate)
      }) as unknown as ReadonlyArray<FenetreFacet>;
      const fenetre: FenetreFacet = facets[0] ?? {};

      const comptesParJour = new Map<string, number>(
        (fenetre.daily ?? []).map(ligne => [ligne._id, ligne.count])
      );

      // Grouper par jour
      const dailyMessages: Record<string, number> = {};
      const days = Math.ceil((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateKey = date.toISOString().split('T')[0];
        dailyMessages[dateKey] = comptesParJour.get(dateKey) ?? 0;
      }

      const messagesByPeriod = Object.entries(dailyMessages).map(([date, count]) => ({
        date,
        count
      }));

      // Longueur moyenne des messages
      const averageLength = Math.round((fenetre.length ?? [])[0]?.avg ?? 0);

      // Messages traduits (ont au moins une traduction dans le JSON)
      const messagesWithTranslations = await fastify.prisma.message.count({
        where: {
          createdAt: { gte: startDate },
          translations: {
            not: null
          }
        }
      });

      const translatedPercentage = totalMessages > 0
        ? Math.round((messagesWithTranslations / totalMessages) * 100)
        : 0;

      // Top utilisateurs les plus actifs (envoi de messages)
      const topSenders = await fastify.prisma.message.groupBy({
        by: ['senderId'],
        where: {
          createdAt: { gte: startDate },
          deletedAt: null,
          senderId: { not: null }
        },
        _count: {
          id: true
        },
        orderBy: {
          _count: {
            id: 'desc'
          }
        },
        take: 10
      });

      const participantIds = topSenders.map(s => s.senderId!).filter(Boolean);
      const participants = await fastify.prisma.participant.findMany({
        where: { id: { in: participantIds } },
        select: { id: true, userId: true, user: { select: { username: true, displayName: true } } }
      });
      const participantMap = new Map(participants.map(p => [p.id, p]));

      const topSendersData = topSenders.map((sender) => {
        const participant = participantMap.get(sender.senderId!);
        return {
          userId: participant?.userId || sender.senderId,
          username: participant?.user?.username || 'Unknown',
          displayName: participant?.user?.displayName,
          messageCount: sender._count.id
        };
      });

      // Messages avec pièces jointes
      const messagesWithAttachments = await fastify.prisma.message.count({
        where: {
          createdAt: { gte: startDate },
          deletedAt: null,
          attachments: {
            some: {}
          }
        }
      });

      return sendSuccess(reply, {
          totalMessages,
          deletedMessages,
          editedMessages,
          messagesByType: typeDistribution,
          messagesByPeriod,
          averageLength,
          translatedMessages: messagesWithTranslations,
          translatedPercentage,
          topSenders: topSendersData,
          messagesWithAttachments,
          attachmentRate: totalMessages > 0
            ? Math.round((messagesWithAttachments / totalMessages) * 100)
            : 0,
          period
        });
    } catch (error) {
      logError(fastify.log, 'Get message stats error:', error);
      return sendInternalError(reply, 'Erreur lors de la récupération des statistiques des messages');
    }
  });

  /**
   * GET /api/admin/messages/trends
   * Tendances des messages (heure de pointe, jours actifs, etc.)
   */
  fastify.get('/trends', {
    onRequest: [fastify.authenticate, requireAdmin]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Heure de pointe + jour actif — UNE agrégation MongoDB, un document en
      // retour (#4465, patron de fenetreMessagesPipeline juste au-dessus).
      const facets = await fastify.prisma.message.aggregateRaw({
        pipeline: tendancesMessagesPipeline(sevenDaysAgo)
      }) as unknown as ReadonlyArray<TendancesFacet>;
      const fenetre: TendancesFacet = facets[0] ?? {};

      // Analyser par heure
      const hourlyActivity: Record<number, number> = {};
      for (let i = 0; i < 24; i++) {
        hourlyActivity[i] = 0;
      }
      (fenetre.hourly ?? []).forEach(ligne => {
        hourlyActivity[ligne._id] = ligne.count;
      });

      // Analyser par jour de semaine
      const weekdayActivity: Record<number, number> = {};
      for (let i = 0; i < 7; i++) {
        weekdayActivity[i] = 0;
      }
      (fenetre.weekday ?? []).forEach(ligne => {
        weekdayActivity[ligne._id - 1] = ligne.count;
      });

      // Trouver l'heure de pointe
      const peakHour = Object.entries(hourlyActivity).reduce((max, [hour, count]) => {
        return count > max.count ? { hour: parseInt(hour), count } : max;
      }, { hour: 0, count: 0 });

      // Trouver le jour le plus actif
      const weekdayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
      const peakWeekday = Object.entries(weekdayActivity).reduce((max, [day, count]) => {
        return count > max.count ? { day: parseInt(day), count } : max;
      }, { day: 0, count: 0 });

      return sendSuccess(reply, {
          peakHour: {
            hour: peakHour.hour,
            label: `${peakHour.hour}h`,
            count: peakHour.count
          },
          peakWeekday: {
            day: peakWeekday.day,
            label: weekdayNames[peakWeekday.day],
            count: peakWeekday.count
          },
          hourlyActivity: Object.entries(hourlyActivity).map(([hour, count]) => ({
            hour: `${hour}h`,
            count
          })),
          weekdayActivity: Object.entries(weekdayActivity).map(([day, count]) => ({
            day: weekdayNames[parseInt(day)],
            count
          }))
        });
    } catch (error) {
      logError(fastify.log, 'Get message trends error:', error);
      return sendInternalError(reply, 'Erreur lors de la récupération des tendances');
    }
  });

  /**
   * GET /api/admin/messages/engagement
   * Métriques d'engagement (réactions, réponses, etc.)
   */
  fastify.get('/engagement', {
    onRequest: [fastify.authenticate, requireAdmin],
    preHandler: [validateQuery(AdminMessagesEngagementQuerySchema)]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as any;
      const period = query.period || /* istanbul ignore next -- Zod provides default */ '7d';

      const now = new Date();
      let startDate = new Date();

      switch (period) {
        case '7d':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(startDate.getDate() - 30);
          break;
        /* istanbul ignore next -- Zod z.enum enforces valid period; default unreachable */
        default:
          startDate.setDate(startDate.getDate() - 7);
      }

      const [
        totalMessages,
        messagesWithReactions,
        messagesWithReplies,
        totalReactions,
        totalReplies
      ] = await Promise.all([
        fastify.prisma.message.count({
          where: {
            createdAt: { gte: startDate },
            deletedAt: null
          }
        }),
        fastify.prisma.message.count({
          where: {
            createdAt: { gte: startDate },
            deletedAt: null,
            reactions: {
              some: {}
            }
          }
        }),
        fastify.prisma.message.count({
          where: {
            createdAt: { gte: startDate },
            deletedAt: null,
            replies: {
              some: {}
            }
          }
        }),
        fastify.prisma.reaction.count({
          where: {
            createdAt: { gte: startDate }
          }
        }),
        fastify.prisma.message.count({
          where: {
            createdAt: { gte: startDate },
            deletedAt: null,
            replyToId: { not: null }
          }
        })
      ]);

      // Engagement rates
      const reactionRate = totalMessages > 0
        ? Math.round((messagesWithReactions / totalMessages) * 100)
        : 0;

      const replyRate = totalMessages > 0
        ? Math.round((messagesWithReplies / totalMessages) * 100)
        : 0;

      return sendSuccess(reply, {
          totalMessages,
          messagesWithReactions,
          messagesWithReplies,
          totalReactions,
          totalReplies,
          reactionRate,
          replyRate,
          avgReactionsPerMessage: totalMessages > 0
            ? Math.round((totalReactions / totalMessages) * 10) / 10
            : 0,
          avgRepliesPerMessage: totalMessages > 0
            ? Math.round((totalReplies / totalMessages) * 10) / 10
            : 0
        });
    } catch (error) {
      logError(fastify.log, 'Get message engagement error:', error);
      return sendInternalError(reply, "Erreur lors de la récupération de l'engagement");
    }
  });
}
