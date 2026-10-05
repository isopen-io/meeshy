/**
 * Le job des LIGUES du Jeu Meeshy (#9384) — toutes les 15 minutes, `runDue` :
 * instantanés quotidiens, règlements des groupes dont la fermeture (dimanche
 * 20 h, fuseau du groupe) est passée, placement de la semaine, purge de la
 * conservation. Chaque étape est idempotente (voir `LeagueSettlement`) : un
 * passage manqué se rattrape au suivant, deux instances qui passent en même
 * temps ne paient rien deux fois. Un passage qui échoue est journalisé et ne
 * retient jamais le suivant. Le même passage clôt les duos des semaines révolues
 * (`DuoService.expireOld`) : la part simple de qui a fini seul, les emplacements
 * libérés.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { EngagementService } from '../services/engagement/EngagementService.js';
import { DuoService } from '../services/game/DuoService.js';
import { LeagueSettlement } from '../services/game/LeagueSettlement.js';
import { enhancedLogger } from '../utils/logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'GameLeagueJob' });

export const GAME_LEAGUE_INTERVAL_MS = 15 * 60 * 1000;

export class GameLeagueJob {
  private intervalId: NodeJS.Timeout | null = null;

  private running = false;

  private readonly settlement: LeagueSettlement;

  private readonly duo: Pick<DuoService, 'expireOld'>;

  constructor(prisma: PrismaClient, settlement?: LeagueSettlement, duo?: Pick<DuoService, 'expireOld'>) {
    this.settlement = settlement ?? new LeagueSettlement(prisma);
    this.duo =
      duo ??
      new DuoService(prisma, {
        creditPoints: (userId, points, axisKey) => new EngagementService(prisma).creditGamePoints(userId, points, axisKey),
      });
  }

  start(): void {
    if (this.intervalId) {
      logger.warn('Job already running');
      return;
    }
    logger.info('Starting game league job (every 15 minutes)');
    this.intervalId = setInterval(() => {
      this.runNow().catch(/* istanbul ignore next -- runNow() never rejects */ (err) => logger.error('Scheduled league pass failed', err));
    }, GAME_LEAGUE_INTERVAL_MS);
    this.intervalId.unref?.();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** Un passage. Jamais deux en même temps dans ce processus ; rend `null` s'il a échoué. */
  async runNow(now: Date = new Date()) {
    if (this.running) return null;
    this.running = true;
    try {
      const report = await this.settlement.runDue(now);
      if (report.settled + report.placed + report.snapshots + report.purged > 0) logger.info('League pass done', report);
      await this.duo.expireOld(now).catch((error: unknown) => logger.error('Duo expiry failed', error));
      return report;
    } catch (error) {
      logger.error('League pass failed', error);
      return null;
    } finally {
      this.running = false;
    }
  }
}
