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
import { BADGE_THRESHOLDS, STREAK_THRESHOLDS, type EngagementAxisKey } from '@meeshy/shared/types/engagement';
import { notificationString } from '@meeshy/shared/utils/notification-strings';
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

/** Prisma signale une violation d'index unique par le code `P2002`. */
function isP2002(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
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

    await this.updateStreak(userId);
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
          milestoneKey: `${axisKey}:${threshold}`,
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
        type: 'badge_earned',
        priority: 'normal',
        content: notificationString(lang, 'engagement.badgeEarned', { title: axisKey, count: threshold }),
        context: {},
        metadata: { action: 'view_details', axisKey, threshold },
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
   * Une activité qualifiante — n'importe quel appel à `recordActivity`, sur
   * n'importe quel axe (§ 5) — fait avancer la série de jours actifs.
   * Comparaison par JOUR CIVIL UTC : plusieurs activités le même jour ne
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
      select: { currentStreakDays: true, longestStreakDays: true, lastStreakDate: true },
    });
    if (!user) return;

    const today = startOfUtcDay(new Date());
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
          milestoneKey: `streak:${threshold}`,
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
        metadata: { action: 'view_details', threshold },
      });
    } catch (err) {
      log.warn('streak_milestone notification failed after milestone was recorded', {
        userId,
        threshold,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
