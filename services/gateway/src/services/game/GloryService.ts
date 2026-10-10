/**
 * LA GLOIRE (#9374) — producteur UNIQUE du registre `GloryLedger`.
 *
 * Aucune route, aucun handler n'écrit ce registre : comme `MeeshService` l'est
 * des Meeshes, ce service est le seul point d'écriture. Trois propriétés :
 *
 *  - **en ajout seul** — la Gloire ne baisse jamais ; une correction est une
 *    ligne inverse, jamais une réécriture ;
 *  - **lue au registre** — `Σ(delta)`, jamais une colonne incrémentée (leçon
 *    #6428 : sur MongoDB un champ absent + `$add` rend `null`) ;
 *  - **idempotente** — `(userId, requestId)` est unique. Chaque source de
 *    Gloire porte une clé qui dit CE QUI la paie (`level:23`, `flame-record:30`,
 *    `mission:<id>`), de sorte que rejouer un geste ne le paie qu'une fois.
 *
 * Les barèmes (`GLORY_POINTS`, `FLAME_RECORD_GLORY`) et la loi des niveaux
 * viennent de `@meeshy/shared/utils/game` : rien n'est réécrit ici.
 *
 * Une ligne POSITIVE gravée peut faire franchir 1 000 000 : le crédit demande
 * alors sa place du Mythe (#9636, `MythicSeatService`) — un appoint, qui ne
 * fait jamais échouer le crédit déjà gravé.
 *
 * Elle peut aussi faire passer un rang, qui OUVRE des niveaux — Ambassadeur et
 * Oracle (#9688), Écho, Voix, Conteur et Passeur, étapes des dizaines (#9706) :
 * le compte monte alors aussitôt jusqu'où son score le porte, et la Gloire du
 * premier passage de ces niveaux se grave — sans rien regagner (`level:<n>`).
 */

import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import { FLAME_RECORD_GLORY, gloryForLevel, gloryStanding } from '@meeshy/shared/utils/game/glory';
import { levelCapWithSteps } from '@meeshy/shared/utils/game/level-steps';
import { levelFromScore, newLevelsReached, recordLevel, type LevelCap } from '@meeshy/shared/utils/game/levels';
import type { AchievementRarity } from '@meeshy/shared/utils/game/glory';
import { achievementGloryAtEarning } from '@meeshy/shared/utils/game/rarity';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { MythicSeatService } from './MythicSeatService';
import { LEVEL_STEP_USER_SELECT, countMissionsDone, levelStepFactsOf } from './LevelStepFacts';

const log = enhancedLogger.child({ module: 'GloryService' });

export type GloryReason =
  | 'mint'
  | 'level'
  | 'flame-record'
  | 'mission-gold'
  | 'mission'
  | 'achievement'
  | 'league'
  | 'season'
  | 'prestige'
  | 'correction';

export type GloryCredit = {
  readonly userId: string;
  readonly delta: number;
  readonly reason: GloryReason;
  readonly requestId: string;
  readonly actorId?: string;
  readonly meta?: Prisma.InputJsonObject;
};

type GloryDb = Pick<PrismaClient, 'gloryLedger'>;

function isP2002(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

/** Le total de Gloire — le seul endroit qui le calcule. */
export async function gloryTotalFromLedger(db: GloryDb, userId: string): Promise<number> {
  const somme = await db.gloryLedger.aggregate({ where: { userId }, _sum: { delta: true } });
  return somme._sum.delta ?? 0;
}

export class GloryService {
  private readonly seats: Pick<MythicSeatService, 'claimIfEligible'>;

  constructor(
    private readonly prisma: PrismaClient,
    deps: { readonly seats?: Pick<MythicSeatService, 'claimIfEligible'> } = {},
  ) {
    this.seats = deps.seats ?? new MythicSeatService(prisma);
  }

  async total(userId: string): Promise<number> {
    return gloryTotalFromLedger(this.prisma, userId);
  }

  /**
   * Grave UNE ligne. `true` si elle est écrite, `false` si la clé existait déjà
   * (rejeu) ou si `delta` est nul.
   *
   * À appeler HORS transaction : sur MongoDB une violation d'unicité avorte la
   * transaction qui la subit. Dans une transaction (la frappe), l'appelant
   * a déjà tranché l'idempotence et écrit la ligne lui-même.
   */
  async credit(entry: GloryCredit): Promise<boolean> {
    const written = await this.writeLine(entry);
    if (!written || entry.delta <= 0) return written;
    await this.claimMythicSeat(entry.userId);
    // Les lignes de niveau ouvrent les niveaux en fin de passage (`creditLevelProgress`), une fois pour toutes.
    if (entry.reason !== 'level') await this.openLevelsIfRankRose(entry.userId, entry.delta);
    return true;
  }

  private async writeLine(entry: GloryCredit): Promise<boolean> {
    if (!Number.isInteger(entry.delta) || entry.delta === 0) return false;
    try {
      await this.prisma.gloryLedger.create({
        data: {
          userId: entry.userId,
          delta: entry.delta,
          reason: entry.reason,
          requestId: entry.requestId,
          ...(entry.actorId !== undefined ? { actorId: entry.actorId } : {}),
          ...(entry.meta !== undefined ? { meta: entry.meta } : {}),
        },
      });
    } catch (err) {
      if (isP2002(err)) return false;
      throw err;
    }
    return true;
  }

  /**
   * Le rang vient-il d'ouvrir des niveaux (#9688, #9706) ? Si la Gloire gravée a fait passer un rang, le
   * compte monte jusqu'où son score le porte. Un appoint, comme la place du Mythe : jamais une raison
   * de faire échouer le crédit déjà gravé — le prochain geste rattrape.
   */
  private async openLevelsIfRankRose(userId: string, delta: number): Promise<void> {
    try {
      const total = await this.total(userId);
      if (gloryStanding({ glory: total - delta }).rank === gloryStanding({ glory: total }).rank) return;
      await this.openLevels(userId);
    } catch (error) {
      log.warn('level opening after a rank rise failed, the next gesture will catch up', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Une ÉTAPE vient peut-être d'être faite (#9706) — une Meesh frappée, une mission du jour accomplie, un
   * record de Flamme : le niveau qui attendait monte d'un coup jusqu'où le score le porte. Sans rien à
   * ouvrir, rien ne s'écrit. Jamais une raison de faire échouer le geste qui l'a appelée.
   */
  async openLevels(userId: string): Promise<number> {
    try {
      const account = await this.prisma.user.findUnique({ where: { id: userId }, select: { engagementScore: true, levelRecord: true } });
      if (account === null) return 0;
      return await this.creditLevelProgress({ userId, score: account.engagementScore ?? 0, previousRecord: account.levelRecord ?? null });
    } catch (error) {
      log.warn('level opening after a step failed, the next gesture will catch up', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Le plafond du niveau SERVI (#9688, #9706) : le rang lu sur la Gloire, et les dix étapes — Meeshes
   * frappées et record de Flamme sur la ligne du compte, missions du jour comptées. Trois lectures
   * indexées, en parallèle.
   */
  private async servedLevelCap(userId: string): Promise<LevelCap> {
    const [row, missionsDone, glory] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: LEVEL_STEP_USER_SELECT }),
      countMissionsDone(this.prisma, userId),
      this.total(userId),
    ]);
    const steps = levelStepFactsOf({ row, missionsDone, glory });
    return levelCapWithSteps({ rank: steps.rank, steps });
  }

  /** La place du Mythe si cette Gloire l'ouvre — jamais une raison de faire échouer le crédit. */
  private async claimMythicSeat(userId: string): Promise<void> {
    try {
      await this.seats.claimIfEligible(userId);
    } catch (error) {
      log.warn('mythic seat claim failed, the nightly sweep will retry', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * La Gloire du PREMIER passage de chaque niveau, et la hausse du record.
   *
   * Le niveau se lit sous le plafond que le rang ouvre (#9688) : 499 sous
   * Ambassadeur, 1000 pour Ambassadeur et Orateur, sans limite à partir
   * d'Oracle — et sous le palier des étapes (#9706) : sans l'étape d'une
   * dizaine, il attend juste en dessous. Une ligne par niveau qui paie (`level:<n>`, `gloryForLevel` :
   * chacun jusqu'à 100, puis chaque dizaine) : le registre dit lui-même quels
   * niveaux ont payé, et une montée concurrente ou rejouée ne paie pas deux
   * fois. Le record ne fait que monter (`levelRecord < nouveau`, ou absent) :
   * redescendre par une frappe ne l'abaisse pas, c'est lui qui règle le Vent
   * arrière.
   *
   * @returns la Gloire effectivement gravée par CET appel.
   */
  async creditLevelProgress(params: {
    readonly userId: string;
    readonly score: number;
    readonly previousRecord: number | null;
  }): Promise<number> {
    const level = levelFromScore(params.score, await this.servedLevelCap(params.userId));
    const reached = newLevelsReached({ level, previousRecord: params.previousRecord });
    if (reached.count === 0) return 0;

    let gained = 0;
    for (let n = reached.from; n <= reached.to; n += 1) {
      const delta = gloryForLevel(n);
      if (delta === 0) continue;
      const written = await this.credit({ userId: params.userId, delta, reason: 'level', requestId: `level:${n}` });
      if (written) gained += delta;
    }

    const record = recordLevel({ level, previousRecord: params.previousRecord });
    await this.prisma.user.updateMany({
      // `isSet: false` : sur MongoDB, `{ levelRecord: null }` n'atteint PAS un
      // champ ABSENT — celui de tous les comptes d'avant le jeu (leçon 318).
      where: {
        id: params.userId,
        OR: [{ levelRecord: null }, { levelRecord: { isSet: false } }, { levelRecord: { lt: record } }],
      },
      data: { levelRecord: record },
    });
    // La Gloire de ces niveaux a pu faire franchir Ambassadeur ou Oracle : le plafond qu'elle lève s'ouvre aussitôt.
    if (gained > 0) await this.openLevelsIfRankRose(params.userId, gained);
    return gained;
  }

  /** La Gloire des records de Flamme franchis par cette série — une ligne par record. */
  async creditFlameRecords(params: {
    readonly userId: string;
    readonly previousLongest: number;
    readonly longest: number;
  }): Promise<number> {
    let gained = 0;
    for (const record of FLAME_RECORD_GLORY) {
      if (!(params.previousLongest < record.days && params.longest >= record.days)) continue;
      const written = await this.credit({
        userId: params.userId,
        delta: record.glory,
        reason: 'flame-record',
        requestId: `flame-record:${record.days}`,
        meta: { days: record.days },
      });
      if (written) gained += record.glory;
    }
    return gained;
  }

  /**
   * La Gloire d'un succès OBTENU (#9390), FIGÉE à l'obtention : le montant dépend
   * de la rareté mesurée par le dernier instantané nocturne (`commun` quand il
   * n'y en a pas : sous 1 000 comptes, ou succès trop récent), et ne bouge
   * JAMAIS ensuite — un succès qui devient commun ne reprend rien, un succès
   * devenu rare ne paie rien de plus. Une ligne par succès (`achievement:<clé>`) :
   * le graver deux fois, ou le revoir au balayage, ne le paie qu'une fois.
   *
   * @returns la Gloire gravée par CET appel (0 si la ligne existait déjà).
   */
  async creditAchievement(userId: string, milestoneKey: string): Promise<number> {
    const stat = await this.prisma.achievementRarityStat.findUnique({ where: { milestoneKey }, select: { rarity: true } });
    const rarity = (stat?.rarity ?? null) as AchievementRarity | null;
    const delta = achievementGloryAtEarning(rarity);
    const written = await this.credit({
      userId,
      delta,
      reason: 'achievement',
      requestId: `achievement:${milestoneKey}`,
      meta: { milestoneKey, rarity: rarity ?? 'common' },
    });
    return written ? delta : 0;
  }
}
