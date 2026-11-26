/**
 * Le job du RAPPEL DU SOIR de la Flamme (#17368, #20612) — toutes les 10 minutes, `runNow` :
 *
 *  - un lot de comptes dont la Flamme a trois jours ou plus et dont le dernier geste date de moins de neuf jours
 *    (au-delà, aucune Veilleuse ne couvre l'écart : la Flamme est éteinte), par curseur d'identifiant ;
 *  - ceux pour qui la loi partagée dit le rappel dû (`flameEveningReminderDue` : aucun geste aujourd'hui, de 18 h à
 *    21 h dans LEUR fuseau) reçoivent `flame-evening`, le jour LOCAL en clé.
 *
 * Un compte dont aucun appareil ne sait ouvrir la fiche de la Flamme n'est pas annoncé (`accountRoutesPushType`,
 * #10267) : un rappel qui n'atteindrait que la cloche ne prend pas un des deux créneaux du jour.
 *
 * Le notifieur relit la loi à l'envoi (un geste fait entre-temps tait le rappel), tient « une fois par jour »,
 * le plafond de deux, la veille, « Jeu masqué » et `gameEnabled`. Le job retient en mémoire qui a déjà eu sa
 * réponse ce soir-là, pour ne pas relire ces comptes à chaque passage ; une panne n'est pas une réponse, elle se
 * réessaie au passage suivant. Une entrée par compte, écrasée le lendemain : la mémoire est bornée par le lot.
 *
 * Échelle : un cycle complet du curseur doit tenir dans les trois heures du soir. 200 comptes toutes les
 * 10 minutes en couvrent 3 600 ; au-delà, passer le relevé sur les seuls fuseaux dont c'est le soir.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { flameStatus } from '@meeshy/shared/utils/game/flame';
import { GAME_FLAME_EVENING_MIN_DAYS, flameEveningReminderDue } from '@meeshy/shared/utils/game/notifications';
import { FLAME_USER_SELECT, flameFactsOf, servedFlameDays } from '../services/game/FlameService.js';
import { GameNotifier, type GameNotifyResult } from '../services/game/GameNotifier.js';
import { accountRoutesPushType } from '../services/push-type-routing.js';
import { minuteOfDayInTimezone } from '../services/game/gameClock.js';
import { enhancedLogger } from '../utils/logger-enhanced.js';
import { guardedInterval } from '../utils/guarded-timer.js';

const logger = enhancedLogger.child({ module: 'GameFlameEveningJob' });

export const GAME_FLAME_EVENING_INTERVAL_MS = 10 * 60 * 1000;
export const FLAME_EVENING_BATCH = 200;
const LAST_GESTURE_WINDOW_MS = 9 * 24 * 60 * 60 * 1000;

type NotifierPort = Pick<GameNotifier, 'notify'>;

export type GameFlameEveningJobDeps = {
  readonly notifier?: NotifierPort;
  /** Le compte a-t-il un appareil qui sait ouvrir la fiche de la Flamme ? (`accountRoutesPushType`, #10267.) */
  readonly routes?: (userId: string) => Promise<boolean>;
  readonly batchSize?: number;
};

export type FlameEveningReport = { readonly examined: number; readonly sent: number };

export class GameFlameEveningJob {
  private intervalId: NodeJS.Timeout | null = null;

  private running = false;

  private cursor: string | null = null;

  /** Le dernier jour local où chaque compte a eu sa réponse (envoyé, déjà parti, ou tu par le notifieur). */
  private readonly answered = new Map<string, string>();

  private readonly notifier: NotifierPort;

  private readonly routes: (userId: string) => Promise<boolean>;

  private readonly batchSize: number;

  constructor(
    private readonly prisma: PrismaClient,
    deps: GameFlameEveningJobDeps = {},
  ) {
    this.batchSize = deps.batchSize ?? FLAME_EVENING_BATCH;
    this.notifier = deps.notifier ?? new GameNotifier(prisma);
    this.routes = deps.routes ?? ((userId) => accountRoutesPushType(prisma, userId, 'game_flame_evening'));
  }

  start(): void {
    if (this.intervalId) {
      logger.warn('Job already running');
      return;
    }
    logger.info('Starting game flame evening job (every 10 minutes)');
    this.intervalId = guardedInterval({ name: 'game-flame-evening', everyMs: GAME_FLAME_EVENING_INTERVAL_MS, logger, run: () => {
      this.runNow().catch(/* istanbul ignore next -- runNow() never rejects */ (err) => logger.error('Scheduled flame evening pass failed', err));
    } });
    this.intervalId.unref?.();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /** Un passage. Jamais deux en même temps dans ce processus : `null` s'il en tourne déjà un. */
  async runNow(now: Date = new Date()): Promise<FlameEveningReport | null> {
    if (this.running) return null;
    this.running = true;
    try {
      const report = await this.pass(now).catch((error: unknown) => {
        logger.error('Flame evening pass failed', error);
        return { examined: 0, sent: 0 };
      });
      if (report.sent > 0) logger.info('Flame evening pass done', report);
      return report;
    } finally {
      this.running = false;
    }
  }

  private async pass(now: Date): Promise<FlameEveningReport> {
    const page = await this.prisma.user.findMany({
      where: {
        currentStreakDays: { gte: GAME_FLAME_EVENING_MIN_DAYS },
        lastStreakDate: { gte: new Date(now.getTime() - LAST_GESTURE_WINDOW_MS) },
        ...(this.cursor === null ? {} : { id: { gt: this.cursor } }),
      },
      orderBy: { id: 'asc' },
      take: this.batchSize,
      select: { id: true, isActive: true, deletedAt: true, ...FLAME_USER_SELECT },
    });
    this.cursor = page.length < this.batchSize ? null : (page.at(-1)?.id ?? null);

    const due = page.flatMap((user) => {
      if (user.isActive === false || user.deletedAt != null) return [];
      const facts = flameFactsOf(user, now);
      if (this.answered.get(user.id) === facts.today) return [];
      const status = flameStatus({ lastActiveDay: facts.lastActiveDay, today: facts.today, streak: facts.streak, freezes: facts.freezes });
      const minuteOfDay = minuteOfDayInTimezone(now, user.timezone);
      return flameEveningReminderDue({ status, days: servedFlameDays(facts), minuteOfDay }) ? [{ id: user.id, dayKey: facts.today }] : [];
    });

    let sent = 0;
    for (const user of due) {
      // #10267 — aucun appareil ne saurait l'ouvrir : un rappel qui n'atteindrait que la cloche ne prend pas un créneau.
      const result = await this.deliver(user.id, user.dayKey, now).catch((error: unknown): GameNotifyResult => {
        logger.warn('Flame evening reminder failed for one account', { userId: user.id, error: error instanceof Error ? error.message : String(error) });
        return 'failed';
      });
      if (result === 'sent') sent += 1;
      if (result !== 'failed') this.answered.set(user.id, user.dayKey);
    }
    return { examined: due.length, sent };
  }

  private async deliver(userId: string, dayKey: string, now: Date): Promise<GameNotifyResult | 'unroutable'> {
    if (!(await this.routes(userId))) return 'unroutable';
    return this.notifier.notify({ kind: 'flame-evening', recipientId: userId, dayKey }, now);
  }
}
