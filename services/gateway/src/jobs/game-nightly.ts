/**
 * Le job NOCTURNE du Jeu Meeshy (#9390) : l'instantané de rareté des succès et
 * le drapeau Mythe (les 100 Légendes les plus glorieuses). Une fois par jour
 * UTC, à partir de 3 h : le job se réveille toutes les 30 minutes et ne calcule
 * que si le jour n'a pas encore été fait par CE processus. Idempotent — un
 * redémarrage ou une seconde instance recalcule le même résultat, rien de plus.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { AchievementRarityService } from '../services/game/AchievementRarityService.js';
import { enhancedLogger } from '../utils/logger-enhanced.js';
import { guardedInterval } from '../utils/guarded-timer.js';

const logger = enhancedLogger.child({ module: 'GameNightlyJob' });

export const GAME_NIGHTLY_CHECK_MS = 30 * 60 * 1000;
export const GAME_NIGHTLY_HOUR_UTC = 3;

export class GameNightlyJob {
  private intervalId: NodeJS.Timeout | null = null;

  private lastRunDay: string | null = null;

  private readonly rarity: AchievementRarityService;

  constructor(prisma: PrismaClient, rarity?: AchievementRarityService) {
    this.rarity = rarity ?? new AchievementRarityService(prisma);
  }

  start(): void {
    if (this.intervalId) {
      logger.warn('Job already running');
      return;
    }
    logger.info('Starting game nightly job (rarity and Mythe, once a day after 03:00 UTC)');
    this.intervalId = guardedInterval({ name: 'game-nightly', everyMs: GAME_NIGHTLY_CHECK_MS, logger, run: () => {
      this.runIfDue().catch(/* istanbul ignore next -- runIfDue() never rejects */ (err) => logger.error('Nightly check failed', err));
    } });
    this.intervalId.unref?.();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** Calcule si l'heure est passée et que le jour n'a pas été fait. `true` quand le calcul a eu lieu. */
  async runIfDue(now: Date = new Date()): Promise<boolean> {
    const day = now.toISOString().slice(0, 10);
    if (now.getUTCHours() < GAME_NIGHTLY_HOUR_UTC || this.lastRunDay === day) return false;
    await this.runNow(now);
    return this.lastRunDay === day;
  }

  /** Les deux calculs, isolés : l'échec de l'un ne retient pas l'autre. */
  async runNow(now: Date = new Date()): Promise<void> {
    const day = now.toISOString().slice(0, 10);
    const steps: readonly [string, () => Promise<unknown>][] = [
      ['rarity', () => this.rarity.recomputeRarity(now)],
      ['mythic', () => this.rarity.recomputeMythic(now)],
    ];
    let failed = false;
    for (const [name, work] of steps) {
      try {
        await work();
      } catch (error) {
        failed = true;
        logger.error(`Nightly ${name} failed`, error);
      }
    }
    if (!failed) this.lastRunDay = day;
  }
}
