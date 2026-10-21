/**
 * Le job des ÉTAPES DU JEU FRANCHIES APP FERMÉE (#10175, L19 — § 5.16.4) — toutes les 5 minutes, `runNow` :
 *
 *  0. **interrupteur** — rien du tout tant que `GAME_PHOTO_PUSH` ne vaut pas exactement `on` (livré éteint en
 *     production jusqu'à la recette ; relu à chaque passage) ;
 *  1. **détection** — un lot de comptes marqués « à évaluer » par les écritures du jeu (`PhotoMomentMarks`),
 *     chacun évalué une fois : ligne de base au premier passage, étapes neuves au registre ensuite ;
 *  2. **envoi** — les résumés dus (`GamePhotoMomentService.deliver`) : une notification groupée par compte, au
 *     plus une notification de jeu par jour.
 *
 * Chaque étape est ISOLÉE : un compte qui échoue est journalisé et ne retient ni les autres ni l'envoi ; un
 * passage manqué se rattrape au suivant. Jamais deux passages en même temps dans ce processus.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { GamePhotoMomentService } from '../services/game/GamePhotoMomentService.js';
import { getPhotoMomentMarks, type PhotoMomentMarks } from '../services/game/PhotoMomentMarks.js';
import { isGamePhotoPushOn } from '../services/game/photoPushFlag.js';
import { enhancedLogger } from '../utils/logger-enhanced.js';
import { guardedInterval } from '../utils/guarded-timer.js';

const logger = enhancedLogger.child({ module: 'GamePhotoMomentsJob' });

export const GAME_PHOTO_MOMENTS_INTERVAL_MS = 5 * 60 * 1000;
export const PHOTO_EVALUATION_BATCH = 200;

type PhotoPort = Pick<GamePhotoMomentService, 'detect' | 'deliver'>;

export type GamePhotoMomentsJobDeps = {
  readonly service?: PhotoPort;
  readonly marks?: PhotoMomentMarks;
  readonly enabled?: () => boolean;
  readonly batchSize?: number;
};

export type PhotoMomentsReport = { readonly off: true } | { readonly evaluated: number; readonly sent: number; readonly deferred: number };

export class GamePhotoMomentsJob {
  private intervalId: NodeJS.Timeout | null = null;

  private running = false;

  private readonly service: PhotoPort;

  private readonly marks: PhotoMomentMarks;

  private readonly enabled: () => boolean;

  private readonly batchSize: number;

  constructor(prisma: PrismaClient, deps: GamePhotoMomentsJobDeps = {}) {
    this.service = deps.service ?? new GamePhotoMomentService(prisma);
    this.marks = deps.marks ?? getPhotoMomentMarks();
    this.enabled = deps.enabled ?? (() => isGamePhotoPushOn());
    this.batchSize = deps.batchSize ?? PHOTO_EVALUATION_BATCH;
  }

  start(): void {
    if (this.intervalId) {
      logger.warn('Job already running');
      return;
    }
    logger.info('Starting game photo moments job (every 5 minutes)', { enabled: this.enabled() });
    this.intervalId = guardedInterval({ name: 'game-photo-moments', everyMs: GAME_PHOTO_MOMENTS_INTERVAL_MS, logger, run: () => {
      this.runNow().catch(/* istanbul ignore next -- runNow() never rejects */ (err) => logger.error('Scheduled photo moments pass failed', err));
    } });
    this.intervalId.unref?.();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** Un passage. `{ off: true }` interrupteur éteint ; `null` s'il en tourne déjà un. */
  async runNow(now: Date = new Date()): Promise<PhotoMomentsReport | null> {
    if (!this.enabled()) return { off: true };
    if (this.running) return null;
    this.running = true;
    try {
      const evaluated = await this.evaluate(now).catch((error: unknown) => {
        logger.error('Photo moments detection failed', error);
        return 0;
      });
      const delivery = await this.service.deliver(now).catch((error: unknown) => {
        logger.error('Photo moments delivery failed', error);
        return { sent: 0, deferred: 0 };
      });
      if (evaluated + delivery.sent + delivery.deferred > 0) logger.info('Photo moments pass done', { evaluated, ...delivery });
      return { evaluated, ...delivery };
    } finally {
      this.running = false;
    }
  }

  private async evaluate(now: Date): Promise<number> {
    const userIds = await this.marks.drain(this.batchSize);
    let evaluated = 0;
    for (const userId of userIds) {
      const ok = await this.service
        .detect(userId, now)
        .then(() => true)
        .catch((error: unknown) => {
          logger.warn('Photo moments detection failed for one account', { userId, error: error instanceof Error ? error.message : String(error) });
          return false;
        });
      if (ok) evaluated += 1;
    }
    return evaluated;
  }
}
