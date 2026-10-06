/**
 * Le job des MISSIONS PERSONNELLES du Jeu Meeshy (#9539) — toutes les 5 minutes, `runNow` :
 *
 *  1. **tirage à l'avance** — un lot de comptes actifs (vus ces 7 derniers jours), par curseur d'identifiant,
 *     dont l'heure LOCALE est entre 5 h et 21 h : leur mission personnelle du jour est tirée avant qu'ils
 *     n'ouvrent l'app, sans quoi personne ne serait prévenu au début de sa plage. Un compte qui l'a déjà est
 *     écarté par UNE lecture de lot ; le curseur boucle quand la page est plus courte que le lot ;
 *  2. **annonce** — les plages qui viennent de s'ouvrir (`PersonalMissionService.notifyDue`) : push + in-app,
 *     une fois par mission.
 *
 * Chaque étape est idempotente et ISOLÉE : l'échec de l'une est journalisé et ne retient pas l'autre ; un
 * passage manqué se rattrape au suivant ; deux instances qui passent en même temps ne notifient qu'une fois
 * (la réclamation est une écriture conditionnelle). Jamais deux passages en même temps dans ce processus.
 *
 * Échelle : moins de 1 000 comptes actifs, un cycle complet du curseur tient en quelques passages ; à 100 000,
 * 500 passages — c'est le bon moment de passer le tirage à l'avance sur les seuls fuseaux qui s'éveillent.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { PERSONAL_MISSION_SLOT } from '@meeshy/shared/utils/game/personal-mission';
import { GameNotifier } from '../services/game/GameNotifier.js';
import { MissionService, READ_ONLY_CREDIT } from '../services/game/MissionService.js';
import { PersonalMissionService } from '../services/game/PersonalMissionService.js';
import { minuteOfDayInTimezone } from '../services/game/gameClock.js';
import { enhancedLogger } from '../utils/logger-enhanced.js';
import { guardedInterval } from '../utils/guarded-timer.js';

const logger = enhancedLogger.child({ module: 'GameMissionWindowJob' });

export const GAME_MISSION_WINDOW_INTERVAL_MS = 5 * 60 * 1000;
export const MISSION_SWEEP_BATCH = 200;
const ACTIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
/** Une ligne personnelle posée il y a moins de 30 h est celle de la journée en cours. */
const RECENT_ROW_MS = 30 * 60 * 60 * 1000;
const FIRST_LOCAL_MINUTE = 5 * 60;
const LAST_LOCAL_MINUTE = 21 * 60;

type PersonalPort = Pick<PersonalMissionService, 'ensure' | 'notifyDue'>;

export type GameMissionWindowJobDeps = {
  readonly personal?: PersonalPort;
  readonly batchSize?: number;
};

export type MissionWindowReport = { readonly drawn: number; readonly sent: number };

export class GameMissionWindowJob {
  private intervalId: NodeJS.Timeout | null = null;

  private running = false;

  private cursor: string | null = null;

  private readonly personal: PersonalPort;

  private readonly batchSize: number;

  constructor(
    private readonly prisma: PrismaClient,
    deps: GameMissionWindowJobDeps = {},
  ) {
    this.batchSize = deps.batchSize ?? MISSION_SWEEP_BATCH;
    this.personal =
      deps.personal ??
      new PersonalMissionService(prisma, {
        missions: new MissionService(prisma, { creditPoints: READ_ONLY_CREDIT }),
        notifier: new GameNotifier(prisma),
      });
  }

  start(): void {
    if (this.intervalId) {
      logger.warn('Job already running');
      return;
    }
    logger.info('Starting game mission window job (every 5 minutes)');
    this.intervalId = guardedInterval({ name: 'game-mission-window', everyMs: GAME_MISSION_WINDOW_INTERVAL_MS, logger, run: () => {
      this.runNow().catch(/* istanbul ignore next -- runNow() never rejects */ (err) => logger.error('Scheduled mission window pass failed', err));
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
  async runNow(now: Date = new Date()): Promise<MissionWindowReport | null> {
    if (this.running) return null;
    this.running = true;
    try {
      const drawn = await this.predraw(now).catch((error: unknown) => {
        logger.error('Mission pre-draw failed', error);
        return 0;
      });
      const sent = await this.personal
        .notifyDue({ now })
        .then((result) => result.sent)
        .catch((error: unknown) => {
          logger.error('Mission window announcement failed', error);
          return 0;
        });
      if (drawn + sent > 0) logger.info('Mission window pass done', { drawn, sent });
      return { drawn, sent };
    } finally {
      this.running = false;
    }
  }

  /** Un lot de comptes actifs, du curseur au lot suivant ; rend combien de missions ont été tirées. */
  private async predraw(now: Date): Promise<number> {
    const page = await this.prisma.user.findMany({
      where: {
        lastActiveAt: { gte: new Date(now.getTime() - ACTIVE_WINDOW_MS) },
        ...(this.cursor === null ? {} : { id: { gt: this.cursor } }),
      },
      orderBy: { id: 'asc' },
      take: this.batchSize,
      select: { id: true, timezone: true, isActive: true, deletedAt: true },
    });
    this.cursor = page.length < this.batchSize ? null : (page.at(-1)?.id ?? null);

    const awake = page.filter((user) => {
      if (user.isActive === false || user.deletedAt != null) return false;
      const minute = minuteOfDayInTimezone(now, user.timezone);
      return minute >= FIRST_LOCAL_MINUTE && minute < LAST_LOCAL_MINUTE;
    });
    if (awake.length === 0) return 0;

    const already = await this.prisma.dailyMission.findMany({
      where: { userId: { in: awake.map((user) => user.id) }, slot: PERSONAL_MISSION_SLOT, createdAt: { gte: new Date(now.getTime() - RECENT_ROW_MS) } },
      select: { userId: true },
      take: awake.length,
    });
    const has = new Set(already.map((row) => row.userId));

    let drawn = 0;
    for (const user of awake.filter((u) => !has.has(u.id))) {
      const row = await this.personal.ensure(user.id, now).catch((error: unknown) => {
        logger.warn('Personal mission pre-draw failed for one account', { userId: user.id, error: error instanceof Error ? error.message : String(error) });
        return null;
      });
      if (row !== null) drawn += 1;
    }
    return drawn;
  }
}
