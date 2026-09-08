/**
 * `GET /me/engagement` — écran de consultation « Progression » (#5547,
 * docs/product/streaks-badges-modele.md § 9).
 *
 * Lecture SEULE : `EngagementCounter` (compteurs par axe) +
 * `EngagementMilestone` (badges/streaks/niveaux/succès déjà servis, les
 * quatre `milestoneType` mélangés — c'est la mémoire d'anti-rejeu de #5530,
 * donc déjà la liste exacte de ce qui a été notifié) +
 * `User.{currentStreakDays, longestStreakDays, engagementScore}`. Aucune
 * écriture : le seul point d'incrémentation reste
 * `EngagementService.recordActivity` (§ 3 du document) — cette route ne
 * fait que RELIRE ce qu'il a déjà posé.
 *
 * Montage AUTONOME au préfixe `/me` (`onRequest: [fastify.authenticate]`,
 * pas un `preHandler` de parent) — même patron que `me/consents.ts` (#4348)
 * et `me/categories.ts` (#4359).
 *
 * `currentStreakDays`/`longestStreakDays`/`engagementScore` portent un
 * `@default(0)` qui ne s'applique qu'à la CRÉATION (même piège que
 * `Conversation.firstMessageSentAt`, cf. packages/shared/CLAUDE.md) : un
 * `User` créé avant cette migration a ces champs ABSENTS, pas à zéro — d'où
 * les replis `?? 0`, cohérents avec `EngagementService.updateStreak`.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ENGAGEMENT_AXES, type EngagementAxisKey } from '@meeshy/shared/types/engagement';
import { computeMeeshMintPlan, MEESH_MINT_COST } from '@meeshy/shared/utils/meesh';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { sendSuccess, sendUnauthorized, sendNotFound, sendInternalError } from '../../utils/response.js';
import { logError } from '../../utils/logger';

const USER_ENGAGEMENT_SELECT = {
  currentStreakDays: true,
  longestStreakDays: true,
  engagementScore: true,
  meeshBalance: true,
  meeshMintedLifetime: true,
} as const;

type UserEngagementColumns = {
  currentStreakDays: number | null | undefined;
  longestStreakDays: number | null | undefined;
  engagementScore: number | null | undefined;
};

/**
 * Débit par COMPTE, lecture seule — même raisonnement « pas de journal à
 * protéger, rien ne part vers un tiers » que `consentRateLimitConfig('read')`
 * (`me/consents.ts`) : `skipOnError: true`, une panne du magasin de
 * compteurs ne doit pas fermer un écran de consultation.
 */
function engagementRateLimitConfig() {
  return {
    max: 120,
    timeWindow: '1 minute',
    hook: 'preHandler' as const,
    skipOnError: true,
    keyGenerator: (request: FastifyRequest) => {
      const userId = request.auth?.userId;
      return userId ? `me:engagement:${userId}` : `me:engagement:ip:${request.ip}`;
    },
    errorResponseBuilder: () => ({
      success: false,
      error: 'Trop de requêtes (me/engagement). Veuillez patienter.',
      statusCode: 429,
    }),
  };
}

const counterEntrySchema = {
  type: 'object',
  properties: {
    axisKey: { type: 'string', enum: [...ENGAGEMENT_AXES] },
    count: { type: 'number' },
    points: { type: 'number' },
  },
} as const;

const milestoneEntrySchema = {
  type: 'object',
  properties: {
    milestoneType: { type: 'string', enum: ['badge', 'streak', 'level', 'achievement'] },
    milestoneKey: { type: 'string' },
    reachedAt: { type: 'string', format: 'date-time' },
  },
} as const;

const engagementResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'object',
      properties: {
        counters: { type: 'array', items: counterEntrySchema },
        milestones: { type: 'array', items: milestoneEntrySchema },
        streak: {
          type: 'object',
          properties: {
            currentStreakDays: { type: 'number' },
            longestStreakDays: { type: 'number' },
          },
        },
        level: {
          type: 'object',
          properties: {
            engagementScore: { type: 'number' },
          },
        },
        // Les Meeshes (#5743). Le SERVEUR sert le prix : aucun client ne le
        // code en dur, donc aucun ne devient faux le jour où il change.
        meesh: {
          type: 'object',
          properties: {
            balance: { type: 'number' },
            mintedLifetime: { type: 'number' },
            debitablePoints: { type: 'number' },
            floorPoints: { type: 'number' },
            missingPoints: { type: 'number' },
            mintCost: { type: 'number' },
          },
        },
      },
    },
  },
} as const;

export async function meEngagementRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/engagement',
    {
      onRequest: [fastify.authenticate],
      config: { rateLimit: engagementRateLimitConfig() },
      schema: {
        description:
          'Écran « Progression » (#5547) : compteurs par axe, paliers déjà ' +
          "servis (badges/streaks/niveaux/succès) et série/niveau courants de " +
          "l'utilisateur AUTHENTIFIÉ. Lecture seule — recordActivity (#5530) " +
          'reste le seul point d\'écriture.',
        tags: ['me', 'engagement'],
        summary: 'Get engagement progression',
        response: {
          200: engagementResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
          429: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = request.auth?.userId;
      if (!userId) {
        return sendUnauthorized(reply, 'Authentication required');
      }

      try {
        const [user, counters, milestones] = await Promise.all([
          fastify.prisma.user.findUnique({ where: { id: userId }, select: USER_ENGAGEMENT_SELECT }),
          // `take` borné, jamais retiré (#4165 critère 4) — même si le
          // maximum THÉORIQUE tient déjà sous la borne : au plus
          // `ENGAGEMENT_AXES.length` lignes par utilisateur (une par axe,
          // contrainte unique `@@unique([userId, axisKey])`), aujourd'hui 13.
          fastify.prisma.engagementCounter.findMany({
            where: { userId },
            select: { axisKey: true, count: true, points: true },
            take: 100,
          }),
          // Idem : au plus (nb axes × BADGE_THRESHOLDS) + STREAK_THRESHOLDS +
          // LEVEL_THRESHOLDS + ENGAGEMENT_ACHIEVEMENT_KEYS lignes par
          // utilisateur (13×5 + 6 + 6 + 5 = 82 aujourd'hui) — `take` large
          // devant ce plafond réel, pas un chiffre choisi au hasard.
          fastify.prisma.engagementMilestone.findMany({
            where: { userId },
            select: { milestoneType: true, milestoneKey: true, reachedAt: true },
            orderBy: { reachedAt: 'desc' },
            take: 200,
          }),
        ]);

        if (!user) {
          return sendNotFound(reply, 'USER_NOT_FOUND');
        }

        const streakUser = user as UserEngagementColumns;

        // Le plan de frappe est DÉRIVÉ des compteurs déjà lus — aucune
        // requête de plus, et le client rejoue exactement le même calcul pour
        // décider s'il montre le bouton. Le score TOTAL et le score DÉBITABLE
        // sont deux chiffres distincts : les conversations comptent dans le
        // niveau et ne se dépensent jamais (plancher inaliénable, #5743).
        const plan = computeMeeshMintPlan(
          counters.map((c: { axisKey: string; count: number; points: number }) => ({
            axisKey: c.axisKey as EngagementAxisKey,
            count: c.count,
            points: c.points,
          })),
        );

        return sendSuccess(reply, {
          counters: counters.map((c: { axisKey: string; count: number; points: number }) => ({
            axisKey: c.axisKey,
            count: c.count,
            points: c.points,
          })),
          milestones: milestones.map((m: { milestoneType: string; milestoneKey: string; reachedAt: Date }) => ({
            milestoneType: m.milestoneType,
            milestoneKey: m.milestoneKey,
            reachedAt: m.reachedAt.toISOString(),
          })),
          streak: {
            currentStreakDays: streakUser.currentStreakDays ?? 0,
            longestStreakDays: streakUser.longestStreakDays ?? 0,
          },
          level: {
            engagementScore: streakUser.engagementScore ?? 0,
          },
          meesh: {
            balance: (streakUser as { meeshBalance?: number }).meeshBalance ?? 0,
            mintedLifetime: (streakUser as { meeshMintedLifetime?: number }).meeshMintedLifetime ?? 0,
            debitablePoints: plan.debitablePoints,
            floorPoints: plan.floorPoints,
            missingPoints: plan.missingPoints,
            mintCost: MEESH_MINT_COST,
          },
});
      } catch (error) {
        logError('Error fetching engagement', error, { source: 'me-engagement-routes' });
        return sendInternalError(reply, 'FETCH_ERROR', { message: 'Failed to fetch engagement' });
      }
    }
  );
}
