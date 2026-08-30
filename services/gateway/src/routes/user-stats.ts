import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { PostType } from '@meeshy/shared/prisma/client';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { sendInternalError } from '../utils/response';
import { NOT_DELETED } from '../services/posts/softDelete';

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
  /**
   * Compteurs de contenu du profil (phase 2 du bandeau de stats iOS —
   * `ProfilePostsStatsBand`). `storiesCount` compte TOUTES les stories non
   * supprimées de l'auteur, expirées comprises : l'auteur garde son archive,
   * et la valeur dérivée côté client était structurellement 0
   * (`GET /posts/user/:id` exclut le type STORY).
   */
  postsCount: number;
  reelsCount: number;
  storiesCount: number;
  languages: string[];
  achievements: Achievement[];
};

/**
 * Ce qu'un SUCCÈS a besoin de savoir — et rien d'autre (#4391).
 *
 * Les six métriques numériques de `ACHIEVEMENT_THRESHOLDS`, plus l'inventaire
 * de langues dont `languagesUsed` est le cardinal. `postsCount` / `reelsCount`
 * / `storiesCount` n'en font PAS partie : aucun succès ne les lit.
 */
export type UserAchievementStats = Pick<
  UserStats,
  | 'totalMessages'
  | 'totalConversations'
  | 'totalTranslations'
  | 'friendRequestsReceived'
  | 'languagesUsed'
  | 'memberDays'
  | 'languages'
  | 'achievements'
>;

/** Les trois compteurs de CONTENU publié — la part que les succès n'utilisent pas. */
type UserContentCounts = Pick<UserStats, 'postsCount' | 'reelsCount' | 'storiesCount'>;

/**
 * Les SIX agrégations dont dépendent les succès.
 *
 * Extraites de `computeUserStats` par #4391 : `GET /users/me/stats/achievements`
 * appelait le calcul ENTIER — neuf agrégations, dont trois `post.count` — pour
 * n'en garder qu'un champ. La projection paresseuse se fait donc à la LECTURE,
 * pas après elle : ce qui n'est pas servi n'est pas lu.
 *
 * Toutes comptent EN BASE. Le `groupBy` sur `originalLanguage` rend une ligne
 * par LANGUE distincte (au plus quelques dizaines), jamais une par message —
 * c'est une agrégation MongoDB, pas un rapatriement. Il reste sans borne
 * TEMPORELLE, et c'est délibéré : `languagesUsed`, `languages` et le succès
 * « Polyglotte » décrivent tout l'historique du compte ; les fenêtrer
 * changerait silencieusement une valeur servie (cf. #4391, décisions).
 */
export async function computeUserAchievementStats(
  prisma: PrismaClient,
  userId: string
): Promise<UserAchievementStats> {
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
        // Json?+Mongo : seule la forme not:{equals:null} passe le moteur Prisma
        // (null brut, Prisma.JsonNull et isSet sont tous rejetés à l'exécution
        // — vérifié contre la base réelle ; même forme que admin/dashboard.ts).
        translations: { not: { equals: null } },
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

/**
 * Les trois compteurs de contenu publié.
 *
 * `deletedAt: NOT_DELETED` (champ ABSENT sur un post vivant : `null` brut ne
 * matcherait rien sur Mongo, cf. softDelete.ts). Les stories comptent SANS
 * filtre d'expiration : l'auteur garde l'accès à ses stories passées
 * (archive), le compteur reflète tout ce qu'il a publié.
 */
async function computeUserContentCounts(
  prisma: PrismaClient,
  userId: string
): Promise<UserContentCounts> {
  const [postsCount, reelsCount, storiesCount] = await Promise.all([
    prisma.post.count({
      where: { authorId: userId, deletedAt: NOT_DELETED, type: PostType.POST },
    }),
    prisma.post.count({
      where: { authorId: userId, deletedAt: NOT_DELETED, type: PostType.REEL },
    }),
    prisma.post.count({
      where: { authorId: userId, deletedAt: NOT_DELETED, type: PostType.STORY },
    }),
  ]);

  return { postsCount, reelsCount, storiesCount };
}

/**
 * Single source of truth for a user's aggregated statistics.
 *
 * Mirrors the iOS `UserStats` decoding shape. Used by both the authenticated
 * `/users/me/stats` endpoint, the public `/users/:id/stats` endpoint
 * (routes/users/preferences.ts) and `?expand=stats` de
 * `/directory/people/:handle` (routes/directory/person.ts).
 *
 * `GET /users/me/stats/achievements` ne l'appelle PLUS (#4391) : il n'a besoin
 * que de `computeUserAchievementStats`.
 */
export async function computeUserStats(
  prisma: PrismaClient,
  userId: string
): Promise<UserStats> {
  const [base, contenu] = await Promise.all([
    computeUserAchievementStats(prisma, userId),
    computeUserContentCounts(prisma, userId),
  ]);

  return { ...base, ...contenu };
}

/**
 * Les quatre compteurs INTIMES d'un profil (#4161).
 *
 * `postsCount`, `reelsCount`, `storiesCount`, `memberDays`, `languagesUsed`,
 * `languages` et les `achievements` décrivent une AUDIENCE — ce que la personne
 * publie, et qui est déjà visible. Ces quatre-là décrivent son USAGE INTIME du
 * produit : combien elle écrit, dans combien de fils elle est présente, combien
 * de demandes d'amis elle reçoit.
 */
export const COMPTEURS_PRIVES = [
  'totalMessages',
  'totalConversations',
  'totalTranslations',
  'friendRequestsReceived',
] as const satisfies ReadonlyArray<keyof UserStats>;

export type StatsAudience = {
  /** Le lecteur est le sujet des statistiques. */
  readonly estSoi: boolean;
  /** Le lecteur a `canViewUsers` — ADMIN, BIGBOSS. */
  readonly estAdministration: boolean;
};

/**
 * Ce qu'un lecteur DONNÉ a le droit de lire d'un jeu de statistiques.
 *
 * SITE UNIQUE de la loi, parce que le calcul et l'autorisation doivent voyager
 * ensemble : `?expand=stats` et `GET /users/:userId/stats` servent le même
 * objet, et deux applications séparées de « qui voit quoi » divergeraient à la
 * première évolution — c'est exactement ce qui est arrivé au CALCUL, dont deux
 * exemplaires cohabitaient (l'un ici, l'autre recopié dans `preferences.ts`)
 * sous un doc-comment affirmant qu'il n'y en avait qu'un.
 *
 * Fail-CLOSED : un lecteur qui n'est ni le sujet ni l'administration reçoit la
 * part publique. C'est le défaut, pas une branche.
 */
export function servedUserStats(stats: UserStats, audience: StatsAudience): Partial<UserStats> {
  if (audience.estSoi || audience.estAdministration) return stats;
  const publics: Record<string, unknown> = { ...stats };
  for (const cle of COMPTEURS_PRIVES) delete publics[cle];
  return publics as Partial<UserStats>;
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

        // Un COUNT par tranche, en parallèle — jamais une ligne par message
        // (#4391). Ce handler ramenait `select: { createdAt: true }` SANS
        // `take` : une ligne pour CHAQUE message des 90 derniers jours, pour
        // n'en faire qu'un histogramme de 90 entiers. Le patron est celui de
        // `admin/analytics.ts` (`/hourly-activity`, `/volume-timeline`), qui a
        // fait le même remplacement : le comptage vit en base, la réponse ne
        // porte plus que ses tranches.
        //
        // Les CLÉS sont calculées exactement comme avant (`new Date()` reculé
        // de `i` jours, puis `toISOString().slice(0, 10)`), et chaque tranche
        // est bornée au JOUR UTC que sa clé dénote — c'est-à-dire précisément
        // l'ensemble que la boucle JS retenait pour cette clé. Aucune valeur
        // servie ne bouge, sous n'importe quel fuseau.
        const timeline = await Promise.all(
          Array.from({ length: days }, (_, index) => {
            const jour = new Date();
            jour.setDate(jour.getDate() - (days - 1 - index));
            const date = jour.toISOString().slice(0, 10);
            const debut = new Date(`${date}T00:00:00.000Z`);
            const fin = new Date(debut.getTime() + 24 * 60 * 60 * 1000);

            const where = { sender: { userId }, deletedAt: null, createdAt: { gte: debut, lt: fin } };
            return fastify.prisma.message.count({ where }).then((messages: number) => ({ date, messages }));
          })
        );

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
        // `computeUserAchievementStats`, pas `computeUserStats` (#4391) : la
        // route ne garde qu'un champ, elle ne paie donc plus les trois
        // `post.count` de `postsCount` / `reelsCount` / `storiesCount`.
        const { achievements } = await computeUserAchievementStats(fastify.prisma, userId);
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
