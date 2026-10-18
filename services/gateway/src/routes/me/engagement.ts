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
import { ENGAGEMENT_AXES, ENGAGEMENT_AXIS_FAMILIES } from '@meeshy/shared/types/engagement';
import { meeshPrice } from '@meeshy/shared/utils/game/mint';
import type { GameBlock } from '@meeshy/shared/types/game';
import { elanUnderScaleFromRows } from '@meeshy/shared/types/engagement-scale';
import { engagementScaleServiceFor } from '../../services/engagement/EngagementScaleService';
import { engagementAxisFamily, isEngagementAxisKey, maxEngagementMilestonesPerUser } from '@meeshy/shared/types/engagement';
import { ACHIEVEMENT_FAMILIES } from '@meeshy/shared/types/achievement-families';
import { AchievementReachService } from '../../services/achievements/AchievementReachService';
import { GlobalAchievements } from '../../services/achievements/GlobalAchievements';
import { meeshTotalsFromLedger } from '../../services/meesh/MeeshService';
import { SPARKS_USER_SELECT, currentLevelOf, sparksOf } from '../../services/game/SparksFacts';
import { effectiveMeeshPrice, levelSparksOf, mintCostFactor } from '@meeshy/shared/utils/game/sparks';
import { GameBlockService, type AxisRow } from '../../services/game/GameBlockService';
import { gameRevisionToServe } from '../../services/game/GameRevision';
import { knowsGameWave2, milestonesServedTo } from '../../services/game/clientCapabilities';
import { MissionService, READ_ONLY_CREDIT } from '../../services/game/MissionService';
import { PersonalMissionService } from '../../services/game/PersonalMissionService';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { ENGAGEMENT_STREAK_ACTS, type ActStreakView } from '@meeshy/shared/types/engagement-act-streaks';
import { ActStreakRecorder } from '../../services/engagement/ActStreakRecorder';
import { sendSuccess, sendUnauthorized, sendNotFound, sendInternalError } from '../../utils/response.js';
import { logError } from '../../utils/logger';

// Le solde et les frappes n'y sont PAS : ils se lisent au registre (#6428),
// une colonne absente en ressortant zéro après une frappe bien réelle.
const log = enhancedLogger.child({ module: 'me-engagement' });

const USER_ENGAGEMENT_SELECT = {
  currentStreakDays: true,
  longestStreakDays: true,
  ...SPARKS_USER_SELECT,
} as const;

type UserEngagementColumns = {
  currentStreakDays: number | null | undefined;
  longestStreakDays: number | null | undefined;
  engagementScore: number | null | undefined;
  sparksSincePrestige?: bigint | number | null;
  sparksEarnedLifetime?: bigint | number | null;
  levelRecord?: number | null;
  levelMaxLifetime?: number | null;
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
            // Les ÉTINCELLES (#10846), additives : la poche, le cycle (base du niveau), le total à vie, le niveau max à vie.
            sparks: { type: 'number' },
            sparksCycle: { type: 'number' },
            sparksLifetime: { type: 'number' },
            sparksDebt: { type: 'number' },
            levelMaxLifetime: { type: 'number' },
          },
        },
        // La carte d'atteignabilité des succès (#5759) — `additionalProperties`
        // parce que ses clés sont des identifiants de famille, pas un ensemble
        // fermé : une famille ajoutée au catalogue ne doit pas exiger de
        // modifier ce schéma.
        achievementReach: { type: 'object', additionalProperties: { type: 'number' } },
        // L'ÉLAN courant (#5749) — servi pour être MONTRÉ.
        elan: {
          type: 'object',
          properties: {
            factor: { type: 'number' },
            activeFamilyCount: { type: 'number' },
            // La LISTE derrière le cardinal (#5897) : sans elle, un client
            // n'a que le score CUMULÉ pour approximer les chips — faux dès
            // qu'une famille est abandonnée depuis plus de `windowDays`.
            activeFamilies: { type: 'array', items: { type: 'string', enum: [...ENGAGEMENT_AXIS_FAMILIES] } },
            hasStanding: { type: 'boolean' },
            windowDays: { type: 'number' },
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
            // Le prix de rang et le facteur du niveau actuel (#10847), à côté du prix effectif `mintCost`.
            sparksDebt: { type: 'number' },
            blockedBy: { type: ['string', 'null'] },
            baseMintCost: { type: 'number' },
            costFactor: { type: 'number' },
            firstMintedAt: { type: ['string', 'null'] },
            lastMintedAt: { type: ['string', 'null'] },
          },
        },
        // Le JEU (#9378) — ajouté à côté de l'existant : un ancien client
        // l'ignore. `additionalProperties` parce que la forme est tenue par le
        // schéma Zod partagé (`gameBlockSchema`), validé avant de partir.
        game: { type: 'object', additionalProperties: true },
        // Le marqueur d'ordre de l'état servi (#10900, `types/game-sync.ts`) : la révision gravée du compte (#10912) — toute
        // écriture du jeu gravée avant elle est dans cette charge. Un client ignore une source de révision plus petite.
        gameRevision: { type: 'number' },
        // Les séries PAR ACTE (#10389) — additif : un ancien client l'ignore,
        // `streak` reste la série globale. `currentDays` est l'état écrit au
        // dernier jour compté (`lastDay`) : un client le fait retomber à 0
        // quand `lastDay` est antérieur à hier.
        actStreaks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              act: { type: 'string', enum: [...ENGAGEMENT_STREAK_ACTS] },
              currentDays: { type: 'number' },
              longestDays: { type: 'number' },
              lastDay: { type: 'string' },
            },
          },
        },
      },
    },
  },
} as const;

/**
 * Le bloc `game` (#9378) : servi À CÔTÉ des champs actuels, jamais à leur place.
 * Un `null` — jeu en panne, bloc refusé par le schéma partagé — fait partir la
 * charge SANS lui, comme un serveur d'avant le jeu : le client sait ne pas l'avoir.
 */
export type EngagementRoutesOptions = {
  readonly gameBlock?: (params: { readonly userId: string; readonly counters: readonly AxisRow[] }) => Promise<GameBlock | null>;
};

/** Tout ce qu'un compte PEUT porter — calculé, donc jamais périmé. */
const PLAFOND_PALIERS = maxEngagementMilestonesPerUser(ACHIEVEMENT_FAMILIES);

export async function meEngagementRoutes(fastify: FastifyInstance, options: EngagementRoutesOptions = {}) {
  // UNE instance pour la vie du plugin (#7909) : son cache d'une heure ne sert
  // que si elle survit à la requête. Construite par requête, elle rejouait
  // trois `groupBy` sur des collections entières à chaque ouverture.
  const reachService = new AchievementReachService(fastify.prisma);
  // La lecture du jeu ne crédite rien : `READ_ONLY_CREDIT` le garantit, la
  // pose des missions du jour est la seule écriture qu'elle puisse faire.
  const gameMissions = new MissionService(fastify.prisma, { creditPoints: READ_ONLY_CREDIT });
  const gameBlocks = new GameBlockService(fastify.prisma, {
    missions: gameMissions,
    // La mission personnelle du jour (#9539) : la lecture la tire au premier accès du jour, comme les trois autres.
    personal: new PersonalMissionService(fastify.prisma, { missions: gameMissions }),
  });
  const buildGameBlock = options.gameBlock ?? ((params) => gameBlocks.build(params));
  const actStreakRecorder = new ActStreakRecorder(fastify.prisma);

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
        // Le balayage des succès AVANT la lecture : il grave ce qui est franchi,
        // et la charge servie le reflète immédiatement. Idempotent (anti-rejeu
        // par contrainte unique) et best-effort — un échec ici ne doit pas
        // fermer un écran de consultation.
        await new GlobalAchievements(fastify.prisma).sweep(userId).catch(() => undefined);
        // Le marqueur d'ordre (#10900) est la révision GRAVÉE (#10912), lue SEULE et AVANT toute lecture de l'état : ce qui
        // s'écrit après peut y être, ce qui s'est gravé avant y est forcément. Jamais l'heure de la réponse — deux
        // passerelles aux horloges décalées serviraient un ordre faux. Compte sans révision gravée : l'instant, comme avant.
        const gameRevision = await gameRevisionToServe(fastify.prisma, userId);

        const [user, counters, milestones, frappes, totauxMeesh, reach, scale, actStreaks] = await Promise.all([
          fastify.prisma.user.findUnique({ where: { id: userId }, select: USER_ENGAGEMENT_SELECT }),
          // `take` borné, jamais retiré (#4165 critère 4) — même si le
          // maximum THÉORIQUE tient déjà sous la borne : au plus
          // `ENGAGEMENT_AXES.length` lignes par utilisateur (une par axe,
          // contrainte unique `@@unique([userId, axisKey])`), aujourd'hui 13.
          fastify.prisma.engagementCounter.findMany({
            where: { userId },
            // `updatedAt` sert l'ÉLAN (#5749) : la seule écriture sur ce modèle
            // est l'incrément d'activité, donc cette date EST celle du dernier
            // geste sur l'axe. L'élan se dérive ainsi SANS requête de plus.
            select: { axisKey: true, count: true, points: true, updatedAt: true },
            take: 100,
          }),
          // `take` DÉRIVÉ du catalogue, jamais écrit à la main (#5847). Le
          // commentaire d'origine annonçait « 82 aujourd'hui » et la borne
          // valait 200 : justes au moment de leur écriture, faux depuis que
          // quatre axes sociaux (#5766) et cent quatorze succès composés
          // (#5758) sont arrivés — plafond réel 216. Avec `desc`, c'étaient
          // les paliers les plus ANCIENS qui tombaient : les tout premiers
          // succès de l'utilisateur, absents de son tableau de bord sans que
          // rien ne le signale.
          fastify.prisma.engagementMilestone.findMany({
            where: { userId },
            select: { milestoneType: true, milestoneKey: true, reachedAt: true },
            orderBy: { reachedAt: 'desc' },
            take: PLAFOND_PALIERS,
          }),
          // LES BORNES DU REGISTRE DE FRAPPE (#5839).
          //
          // `reason: 'mint'` n'est pas un détail : le registre porte AUSSI les
          // dons reçus, les octrois et les sanctions. Sans ce filtre, le
          // sous-menu annoncerait « première frappe » la date d'un cadeau — un
          // mensonge que rien ne signalerait, puisque la date, elle, serait
          // vraie.
          //
          // Un `aggregate` plutôt que deux `findFirst` : un seul aller-retour,
          // servi par l'index `[userId, createdAt]` déjà déclaré au modèle.
          fastify.prisma.meeshLedger.aggregate({
            where: { userId, reason: 'mint' },
            _min: { createdAt: true },
            _max: { createdAt: true },
          }),
          // LE SOLDE ET LES FRAPPES, lus au registre (#6428) — la même loi que
          // la frappe écrit, jamais la colonne qu'un incrément a pu laisser nulle.
          meeshTotalsFromLedger(fastify.prisma, userId),
          // La carte d'atteignabilité — mise en cache une heure par l'instance
          // du plugin : la plus grande conversation du produit ne bouge pas
          // plus vite. Lue EN MÊME TEMPS que le reste, jamais après.
          reachService.load(),
          // Le barème de l'administration (#8906) : l'élan AFFICHÉ est celui
          // que le crédit appliquera, fenêtre, seuils et plafond par niveau
          // compris — jamais les constantes d'avant le barème.
          engagementScaleServiceFor(fastify.prisma).current(),
          // Les séries par acte (#10389) : une panne les retire de la charge,
          // jamais l'écran entier.
          actStreakRecorder.list(userId).catch((error: unknown): readonly ActStreakView[] | null => {
            log.warn('act streaks unavailable, engagement served without them', {
              userId,
              error: error instanceof Error ? error.message : String(error),
            });
            return null;
          }),
        ]);

        if (!user) {
          return sendNotFound(reply, 'USER_NOT_FOUND');
        }

        const streakUser = user as UserEngagementColumns;

        // Les ÉTINCELLES (#10846) : la poche que la frappe dépense et que lit le niveau (#10892), le cycle et le total à vie. TOUT est
        // convertible : plus de plancher inaliénable ni de débit par axe — `debitablePoints` est la poche entière,
        // `floorPoints` vaut 0 (champs conservés pour les clients publiés).
        const sparks = sparksOf(streakUser);

        // L'élan COURANT — ce que le PROCHAIN geste créditera. Dérivé des lignes
        // déjà lues, jamais relu : la route paierait deux fois la même
        // information. Même LOI que le crédit (`computeEngagementElan`), donc le
        // chiffre affiché est celui qui sera appliqué.
        const elan = elanUnderScaleFromRows({
          rules: scale.multiplier,
          counters,
          milestones,
          familyOf: (axisKey) => (isEngagementAxisKey(axisKey) ? engagementAxisFamily(axisKey) : null),
          engagementScore: levelSparksOf(sparks),
        });

        // Le prix EFFECTIF de la prochaine pièce (#9374, #10847) : le prix de rang × le facteur du niveau ACTUEL. Le bloc
        // `game` le sert déjà tel que la frappe le recalculera (étapes et rang compris) ; sans lui, repli sur le niveau lu
        // sur la poche seule (#10892). Les anciens clients lisent `mintCost` et `missingPoints`, qui doivent dire vrai.
        const baseMintCost = meeshPrice(totauxMeesh.mintedLifetime + 1);
        const fallbackLevel = currentLevelOf(streakUser);
        const fallbackPrice = effectiveMeeshPrice(totauxMeesh.mintedLifetime + 1, fallbackLevel);

        const counterRows = counters.map((c: { axisKey: string; count: number; points: number }) => ({
          axisKey: c.axisKey,
          count: c.count,
          points: c.points,
        }));
        const game = await buildGameBlock({ userId, counters: counterRows }).catch((error: unknown) => {
          log.warn('game block unavailable, engagement served without it', {
            userId,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        });

        const mintCost = game?.mint.price ?? fallbackPrice;
        return sendSuccess(reply, {
          counters: counterRows,
          // Les paliers 1 000 et 5 000 ne partent qu'aux clients qui déclarent la vague 2 :
          // un ancien client garde sa liste d'avant (#9392, rétrocompatibilité).
          milestones: milestonesServedTo(milestones, { knowsExtendedTiers: knowsGameWave2(request.headers) }).map((m: { milestoneType: string; milestoneKey: string; reachedAt: Date }) => ({
            milestoneType: m.milestoneType,
            milestoneKey: m.milestoneKey,
            reachedAt: m.reachedAt.toISOString(),
          })),
          streak: {
            currentStreakDays: streakUser.currentStreakDays ?? 0,
            longestStreakDays: streakUser.longestStreakDays ?? 0,
          },
          level: {
            engagementScore: sparks.pocket,
            sparks: sparks.pocket,
            sparksCycle: sparks.cycle,
            sparksLifetime: sparks.lifetime,
            sparksDebt: sparks.debt,
            levelMaxLifetime: game?.level.levelMaxLifetime ?? Math.max(streakUser.levelRecord ?? 1, streakUser.levelMaxLifetime ?? 1),
          },
          achievementReach: Object.fromEntries(reach),
          elan: {
            factor: elan.factor,
            activeFamilyCount: elan.activeFamilyCount,
            activeFamilies: elan.activeFamilies,
            hasStanding: elan.hasStanding,
            windowDays: scale.multiplier.windowDays,
          },
          meesh: {
            balance: totauxMeesh.balance,
            mintedLifetime: totauxMeesh.mintedLifetime,
            debitablePoints: sparks.pocket,
            floorPoints: 0,
            missingPoints: Math.max(0, mintCost - sparks.pocket),
            sparksDebt: sparks.debt,
            blockedBy: sparks.debt > 0 ? 'debt' : null,
            mintCost,
            baseMintCost: game?.mint.basePrice ?? baseMintCost,
            costFactor: game?.mint.costFactor ?? mintCostFactor(fallbackLevel),
            firstMintedAt: frappes._min.createdAt?.toISOString() ?? null,
            lastMintedAt: frappes._max.createdAt?.toISOString() ?? null,
          },
          ...(game ? { game } : {}),
          gameRevision,
          ...(actStreaks ? { actStreaks } : {}),
        });
      } catch (error) {
        logError('Error fetching engagement', error, { source: 'me-engagement-routes' });
        return sendInternalError(reply, 'FETCH_ERROR', { message: 'Failed to fetch engagement' });
      }
    }
  );
}
