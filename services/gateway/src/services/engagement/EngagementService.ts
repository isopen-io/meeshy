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
import { BADGE_THRESHOLDS, type EngagementAxisKey } from '@meeshy/shared/types/engagement';
import { NotificationService } from '../notifications/NotificationService';
import { getSharedNotificationService } from '../notifications/notification-service-registry';
import { enhancedLogger } from '../../utils/logger-enhanced';

const log = enhancedLogger.child({ module: 'EngagementService' });

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
      const notificationService = getSharedNotificationService() ?? new NotificationService(this.prisma);
      await notificationService.createBadgeEarnedNotification({ userId, axisKey, threshold });
    } catch (err) {
      log.warn('createBadgeEarnedNotification failed after milestone was recorded', {
        userId,
        axisKey,
        threshold,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
