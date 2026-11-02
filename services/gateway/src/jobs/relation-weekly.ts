/**
 * Le job des CERCLES (#13932) : le rattrapage de la Connaissance automatique,
 * passé sous `BackgroundJobsManager.startAll`.
 *
 * Le nom dit la maille de la série (la semaine ISO UTC), pas le pas du job : la
 * Connaissance se calcule sur une semaine GLISSANTE, donc le rattrapage passe
 * toutes les quinze minutes. Idempotent — un redémarrage ou une seconde instance
 * rejoue le même résultat (voir `relationCatchUp`).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { createAcquaintanceNotifier } from '../services/relations/acquaintanceNotifier.js';
import { runRelationCatchUp, type RelationCatchUpReport } from '../services/relations/relationCatchUp.js';
import { enhancedLogger } from '../utils/logger-enhanced.js';
import { guardedInterval } from '../utils/guarded-timer.js';

const logger = enhancedLogger.child({ module: 'RelationWeeklyJob' });

export const RELATION_WEEKLY_CHECK_MS = 15 * 60 * 1000;

export class RelationWeeklyJob {
  private intervalId: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaClient) {}

  start(): void {
    if (this.intervalId) {
      logger.warn('Job already running');
      return;
    }
    logger.info('Starting relation job (automatic acquaintance catch-up, every 15 minutes)');
    this.intervalId = guardedInterval({
      name: 'relation-weekly',
      everyMs: RELATION_WEEKLY_CHECK_MS,
      logger,
      run: () => {
        this.runNow().catch(/* istanbul ignore next -- runNow() never rejects */ (err) => logger.error('Relation catch-up failed', err));
      },
    });
    this.intervalId.unref?.();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** `null` quand la passe a échoué (journalisé) : le job survit, la prochaine passe rattrape. */
  async runNow(now: Date = new Date()): Promise<RelationCatchUpReport | null> {
    try {
      const report = await runRelationCatchUp({
        prisma: this.prisma,
        now: () => now,
        notify: createAcquaintanceNotifier(this.prisma),
      });
      if (report.created + report.raised + report.cancelled + report.failed > 0) logger.info('Relation catch-up done', report);
      return report;
    } catch (error) {
      logger.error('Relation catch-up failed', error);
      return null;
    }
  }
}
