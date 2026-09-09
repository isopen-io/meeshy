/**
 * Producteur UNIQUE des compteurs d'engagement (#5530).
 *
 * `recordActivity` est le seul point d'écriture d'`EngagementCounter` — aucune
 * route ni handler socket ne doit incrémenter ce modèle directement (§ 3 du
 * document). Chacune des issues d'axe (sous-issues de #3695) appelle cette
 * méthode une fois son ACK métier posé (message persisté, post publié…),
 * jamais avant confirmation.
 *
 * @see docs/product/streaks-badges-modele.md § 3, § 4
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  BADGE_THRESHOLDS,
  STREAK_THRESHOLDS,
  LEVEL_THRESHOLDS,
  ENGAGEMENT_AXIS_WEIGHTS,
  CONTENT_ENGAGEMENT_AXES,
  CONVERSATION_ENGAGEMENT_AXES,
  badgeMilestoneKey,
  levelMilestoneKey,
  streakMilestoneKey,
  type EngagementAxisKey,
  type EngagementAchievementKey,
} from '@meeshy/shared/types/engagement';
import { notificationString } from '@meeshy/shared/utils/notification-strings';
import { engagementAchievementTitle, engagementAxisLabel } from '@meeshy/shared/utils/engagement-labels';
import { NotificationService } from '../notifications/NotificationService';
import { getSharedNotificationService } from '../notifications/notification-service-registry';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../../utils/recipient-language';
import { enhancedLogger } from '../../utils/logger-enhanced';

const log = enhancedLogger.child({ module: 'EngagementService' });

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Jour civil UTC (minuit) — la comparaison de série ne dépend jamais de l'heure de l'appel. */
function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Jour civil de `date` dans `timezone` (repli UTC si absent ou invalide, #5734) —
 * rendu comme un marqueur `Date.UTC(y, m, d)`, jamais comme le début RÉEL du jour
 * dans ce fuseau. La série ne compare que des ÉTIQUETTES de jour civil, jamais des
 * instants : deux jours civils consécutifs valent toujours exactement `ONE_DAY_MS`
 * sous ce marqueur, y compris à cheval sur une transition d'heure d'été — ce que
 * l'instant réel de minuit local ne garantit pas.
 */
function civilDayInTimezone(date: Date, timezone: string | null | undefined): Date {
  if (!timezone) return startOfUtcDay(date);

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const year = Number(parts.find((p) => p.type === 'year')?.value);
    const month = Number(parts.find((p) => p.type === 'month')?.value);
    const day = Number(parts.find((p) => p.type === 'day')?.value);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      return startOfUtcDay(date);
    }
    return new Date(Date.UTC(year, month - 1, day));
  } catch {
    // `timezone` porte une valeur qu'`Intl` refuse (IANA invalide, corrompue) —
    // repli UTC, jamais une levée qui casserait `recordActivity`.
    return startOfUtcDay(date);
  }
}

/** Prisma signale une violation d'index unique par le code `P2002`. */
function isP2002(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

/**
 * L'indice de route que les QUATRE notifications de réengagement transportent
 * (`metadata.route`, projeté en `data.route` sur le fil push) : l'écran
 * « Progression », qui RESTITUE le palier annoncé. Un client qui sait naviguer
 * par nom de route (iOS `pushNavigateToRoute`, la v3.1 web) le suit tel quel ;
 * un client qui route par TYPE de notification n'a rien à lire ici.
 */
export const ENGAGEMENT_ROUTE = 'progression';

/** Le rang d'un seuil de score dans l'échelle des niveaux — « niveau 3 » pour le palier 150. */
export function levelIndexOf(threshold: number): number {
  const index = LEVEL_THRESHOLDS.indexOf(threshold as (typeof LEVEL_THRESHOLDS)[number]);
  return index === -1 ? 0 : index + 1;
}

export class EngagementService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Incrémente le compteur de `axisKey` pour `userId` et notifie chaque
   * palier `BADGE_THRESHOLDS` franchi par CET incrément précis (jamais un
   * recalcul complet) — un compteur qui passe de N à N+1 ne peut rendre
   * neuf qu'un palier dans `]N, N+1]`.
   */
  async recordActivity(userId: string, axisKey: EngagementAxisKey): Promise<void> {
    const counter = await this.prisma.engagementCounter.upsert({
      where: { userId_axisKey: { userId, axisKey } },
      create: { userId, axisKey, count: 1 },
      update: { count: { increment: 1 } },
      select: { count: true },
    });

    const newCount = counter.count;
    const previousCount = newCount - 1;
    const crossedThresholds = BADGE_THRESHOLDS.filter(
      (threshold) => threshold > previousCount && threshold <= newCount,
    );

    for (const threshold of crossedThresholds) {
      await this.tryAwardBadge(userId, axisKey, threshold);
    }

    await this.tryAwardAchievements(userId, axisKey, previousCount);
    await this.updateStreak(userId);
    await this.updateEngagementScore(userId, axisKey);
  }

  /**
   * Incrémente un axe « conversation distincte » (`conversation.private`,
   * `conversation.public`, `conversation.community`) au PREMIER message
   * envoyé dans CETTE conversation par CET utilisateur — jamais aux
   * suivants (docs/product/streaks-badges-modele.md § 2).
   *
   * La déduplication est portée par la contrainte unique
   * `EngagementConversationCredit(userId, axisKey, conversationId)`, jamais
   * par une relecture avant écriture — même garde anti-course que
   * `tryAwardBadge`. Un conflit signifie « cette conversation a déjà
   * crédité cet axe » : no-op silencieux, `recordActivity` n'est pas
   * appelée une seconde fois.
   */
  async recordConversationActivity(
    userId: string,
    axisKey: EngagementAxisKey,
    conversationId: string,
  ): Promise<void> {
    try {
      await this.prisma.engagementConversationCredit.create({
        data: { userId, axisKey, conversationId },
      });
    } catch (err) {
      if (isP2002(err)) return;
      throw err;
    }

    await this.recordActivity(userId, axisKey);
  }

  /**
   * Garde anti-rejeu portée par la BASE (contrainte unique
   * `EngagementMilestone`), jamais par une relecture avant écriture — ça
   * évite la course entre deux écritures concurrentes du même utilisateur
   * (§ 4). Un conflit signifie « palier déjà servi » : no-op silencieux.
   */
  private async tryAwardBadge(
    userId: string,
    axisKey: EngagementAxisKey,
    threshold: number,
  ): Promise<void> {
    try {
      await this.prisma.engagementMilestone.create({
        data: {
          userId,
          milestoneType: 'badge',
          milestoneKey: badgeMilestoneKey(axisKey, threshold),
        },
      });
    } catch (err) {
      if (isP2002(err)) return;
      throw err;
    }

    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: RECIPIENT_LANG_SELECT });
      const lang = recipientLanguage(user, 'fr');
      const notificationService = getSharedNotificationService() ?? new NotificationService(this.prisma);
      // Le MOT, jamais la clé : « Badge débloqué : conversation.private ·
      // palier 10 » a été servi en production (2026-09-08) parce que la clé
      // stable tenait lieu de titre. Le libellé se résout à la langue du
      // LECTEUR (`engagementAxisLabel`, même catalogue que la v3.1 web et le
      // miroir iOS) ; `route` dit au client où le tap MÈNE — l'écran
      // « Progression » (#5547 web, #5698 iOS), jamais un autre.
      await notificationService.createNotification({
        userId,
        type: 'badge_earned',
        priority: 'normal',
        content: notificationString(lang, 'engagement.badgeEarned', {
          title: engagementAxisLabel(lang, axisKey),
          count: threshold,
        }),
        context: {},
        metadata: { action: 'view_details', route: ENGAGEMENT_ROUTE, axisKey, threshold },
      });
    } catch (err) {
      log.warn('badge_earned notification failed after milestone was recorded', {
        userId,
        axisKey,
        threshold,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Succès composés (§ 8, #5546) — cinq conditions ponctuelles évaluées
   * après l'incrément du compteur d'axe. Toutes ne peuvent devenir vraies
   * qu'au moment où UN axe passe de 0 à 1 : un axe déjà non nul ne change
   * pas l'ensemble des axes atteints, donc ne peut compléter aucune
   * condition — `previousCount !== 0` élimine tout appel qui ne peut rien
   * déclencher, sans lecture supplémentaire.
   */
  private async tryAwardAchievements(
    userId: string,
    axisKey: EngagementAxisKey,
    previousCount: number,
  ): Promise<void> {
    if (previousCount !== 0) return;

    if (CONTENT_ENGAGEMENT_AXES.includes(axisKey)) {
      await this.tryAwardAchievement(userId, 'achievement.first_content');
      if (await this.hasAllAxes(userId, CONTENT_ENGAGEMENT_AXES)) {
        await this.tryAwardAchievement(userId, 'achievement.all_content_types');
      }
    }

    if (axisKey === 'content.audio_message' || axisKey === 'comment.audio') {
      await this.tryAwardAchievement(userId, 'achievement.first_voice');
    }

    if (axisKey === 'tool.in_app_edit') {
      await this.tryAwardAchievement(userId, 'achievement.editor');
    }

    if (CONVERSATION_ENGAGEMENT_AXES.includes(axisKey)) {
      if (await this.hasAllAxes(userId, CONVERSATION_ENGAGEMENT_AXES)) {
        await this.tryAwardAchievement(userId, 'achievement.three_conversation_kinds');
      }
    }
  }

  /** `true` si CHACUN des `axes` a déjà un `EngagementCounter.count` strictement positif pour `userId`. */
  private async hasAllAxes(userId: string, axes: readonly EngagementAxisKey[]): Promise<boolean> {
    const rows = await this.prisma.engagementCounter.findMany({
      where: { userId, axisKey: { in: [...axes] }, count: { gt: 0 } },
      select: { axisKey: true },
    });
    return rows.length >= axes.length;
  }

  /**
   * Même garde anti-rejeu que `tryAwardBadge` (§ 4), portée par la contrainte
   * unique `EngagementMilestone`. `achievementKey` porte déjà son préfixe
   * `achievement.` (§ 8) : contrairement à `badge`/`streak`/`level`, il EST
   * la `milestoneKey`, sans transformation.
   */
  private async tryAwardAchievement(
    userId: string,
    achievementKey: EngagementAchievementKey,
  ): Promise<void> {
    try {
      await this.prisma.engagementMilestone.create({
        data: {
          userId,
          milestoneType: 'achievement',
          milestoneKey: achievementKey,
        },
      });
    } catch (err) {
      if (isP2002(err)) return;
      throw err;
    }

    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: RECIPIENT_LANG_SELECT });
      const lang = recipientLanguage(user, 'fr');
      const notificationService = getSharedNotificationService() ?? new NotificationService(this.prisma);
      await notificationService.createNotification({
        userId,
        type: 'achievement_unlocked',
        priority: 'normal',
        content: notificationString(lang, 'engagement.achievementUnlocked', {
          title: engagementAchievementTitle(lang, achievementKey),
        }),
        context: {},
        metadata: { action: 'view_details', route: ENGAGEMENT_ROUTE, achievementKey },
      });
    } catch (err) {
      log.warn('achievement_unlocked notification failed after milestone was recorded', {
        userId,
        achievementKey,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Une activité qualifiante — n'importe quel appel à `recordActivity`, sur
   * n'importe quel axe (§ 5) — fait avancer la série de jours actifs.
   * Comparaison par JOUR CIVIL DANS LE FUSEAU DE L'UTILISATEUR (`User.timezone`,
   * repli UTC si absent — #5734) : plusieurs activités le même jour civil ne
   * l'incrémentent qu'une fois ; un jour sauté la remet à 1.
   *
   * Lecture puis écriture, pas une transaction : la fenêtre de course (deux
   * activités du même utilisateur dans le même instant, à cheval sur minuit)
   * est acceptée — cette mécanique de réengagement n'a pas la même exigence
   * de justesse que le compteur d'axe (upsert atomique) ou l'anti-rejeu de
   * palier (contrainte unique), qui la restent.
   *
   * `currentStreakDays`/`longestStreakDays` portent un `@default(0)` dans le
   * schéma, qui ne s'applique qu'à la CRÉATION — un `User` créé avant cette
   * migration a ces champs ABSENTS, pas à zéro (même piège que
   * `Conversation.firstMessageSentAt`, cf. `packages/shared/CLAUDE.md`).
   * D'où les replis `?? 0` : une série pour un compte pré-existant démarre
   * à 1, jamais `NaN`.
   */
  private async updateStreak(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { currentStreakDays: true, longestStreakDays: true, lastStreakDate: true, timezone: true },
    });
    if (!user) return;

    const today = civilDayInTimezone(new Date(), user.timezone);
    // `lastStreakDate` already stores a CIVIL-DAY MARKER (`Date.UTC(y, m, d)`,
    // written below) — re-running it through `civilDayInTimezone` would
    // reinterpret that midnight-UTC instant AS IF it were a fresh moment in the
    // user's timezone, shifting it a day off for any non-UTC offset. Only
    // `startOfUtcDay` (idempotent on an already-normalized marker) belongs here.
    const lastDay = user.lastStreakDate ? startOfUtcDay(user.lastStreakDate) : null;

    if (lastDay && lastDay.getTime() === today.getTime()) {
      return;
    }

    const previousStreak = user.currentStreakDays ?? 0;
    const isConsecutiveDay = lastDay !== null && today.getTime() - lastDay.getTime() === ONE_DAY_MS;
    const newStreak = isConsecutiveDay ? previousStreak + 1 : 1;
    const newLongest = Math.max(user.longestStreakDays ?? 0, newStreak);

    await this.prisma.user.update({
      where: { id: userId },
      data: { currentStreakDays: newStreak, longestStreakDays: newLongest, lastStreakDate: today },
    });

    const crossedThresholds = STREAK_THRESHOLDS.filter(
      (threshold) => threshold > previousStreak && threshold <= newStreak,
    );

    for (const threshold of crossedThresholds) {
      await this.tryAwardStreakMilestone(userId, threshold);
    }
  }

  /**
   * Même garde anti-rejeu que `tryAwardBadge` (§ 4), portée par la contrainte
   * unique `EngagementMilestone(userId, milestoneType, milestoneKey)`.
   */
  private async tryAwardStreakMilestone(userId: string, threshold: number): Promise<void> {
    try {
      await this.prisma.engagementMilestone.create({
        data: {
          userId,
          milestoneType: 'streak',
          milestoneKey: streakMilestoneKey(threshold),
        },
      });
    } catch (err) {
      if (isP2002(err)) return;
      throw err;
    }

    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: RECIPIENT_LANG_SELECT });
      const lang = recipientLanguage(user, 'fr');
      const notificationService = getSharedNotificationService() ?? new NotificationService(this.prisma);
      await notificationService.createNotification({
        userId,
        type: 'streak_milestone',
        priority: 'normal',
        content: notificationString(lang, 'engagement.streakMilestone', { count: threshold }),
        context: {},
        metadata: { action: 'view_details', route: ENGAGEMENT_ROUTE, threshold },
      });
    } catch (err) {
      log.warn('streak_milestone notification failed after milestone was recorded', {
        userId,
        threshold,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Ajoute le poids de `axisKey` (`ENGAGEMENT_AXIS_WEIGHTS`) au score agrégé
   * `User.engagementScore` et notifie chaque palier `LEVEL_THRESHOLDS`
   * franchi par CET incrément précis — même mécanique que le compteur d'axe
   * (§ 5, § 7). Lecture puis écriture explicite, comme `updateStreak` —
   * jamais un `increment` nu : `engagementScore` n'est pas seulement ABSENT
   * sur un `User` pré-migration, il vaut `null` sur les 9 premiers comptes
   * qui ont eu une activité (#5742, mesuré contre Mongo 8 : `$inc` sur un
   * champ `null` lève `Cannot apply $inc to a value of non-numeric type`,
   * silencieusement avalé par `recordActivity` qui n'attend rien de cet
   * appel — le score restait `null` pour toujours, sans une ligne de log).
   * Le repli `?? 0` couvre les deux cas (absent et `null`) d'un seul geste.
   */
  private async updateEngagementScore(userId: string, axisKey: EngagementAxisKey): Promise<void> {
    const weight = ENGAGEMENT_AXIS_WEIGHTS[axisKey];
    const current = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { engagementScore: true },
    });
    if (!current) return;

    const previousScore = current.engagementScore ?? 0;
    const newScore = previousScore + weight;

    await this.prisma.user.update({
      where: { id: userId },
      data: { engagementScore: newScore },
    });

    const crossedThresholds = LEVEL_THRESHOLDS.filter(
      (threshold) => threshold > previousScore && threshold <= newScore,
    );

    for (const threshold of crossedThresholds) {
      await this.tryAwardLevelUp(userId, threshold);
    }
  }

  /**
   * Même garde anti-rejeu que `tryAwardBadge`/`tryAwardStreakMilestone`
   * (§ 4), portée par la contrainte unique `EngagementMilestone`.
   */
  private async tryAwardLevelUp(userId: string, threshold: number): Promise<void> {
    try {
      await this.prisma.engagementMilestone.create({
        data: {
          userId,
          milestoneType: 'level',
          milestoneKey: levelMilestoneKey(threshold),
        },
      });
    } catch (err) {
      if (isP2002(err)) return;
      throw err;
    }

    try {
      const user = await this.prisma.user.findUnique({ where: { id: userId }, select: RECIPIENT_LANG_SELECT });
      const lang = recipientLanguage(user, 'fr');
      const notificationService = getSharedNotificationService() ?? new NotificationService(this.prisma);
      await notificationService.createNotification({
        userId,
        type: 'level_up',
        priority: 'normal',
        // Le NIVEAU, jamais le seuil de score : « Niveau 150 atteint » (le
        // palier de points) se lisait comme un cent-cinquantième niveau. Le
        // niveau est le RANG du palier dans l'échelle (§ 7) — le même que
        // l'écran « Progression » affiche (`EngagementLevelProgress.level`).
        content: notificationString(lang, 'engagement.levelUp', { count: levelIndexOf(threshold) }),
        context: {},
        metadata: { action: 'view_details', route: ENGAGEMENT_ROUTE, threshold, level: levelIndexOf(threshold) },
      });
    } catch (err) {
      log.warn('level_up notification failed after milestone was recorded', {
        userId,
        threshold,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
