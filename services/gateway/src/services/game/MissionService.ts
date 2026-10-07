/**
 * LES MISSIONS DU JOUR (#9375) — producteur UNIQUE de `DailyMission` et de
 * `GameDay`. La LOI (tirage, objectifs, récompenses, Heure du Prisme, coffre)
 * vit dans `@meeshy/shared/utils/game` ; ce service l'applique contre la base.
 *
 *  - **journée monotone** — la clé du jour vient du fuseau de l'utilisateur,
 *    mais ne recule jamais et ne s'ouvre pas moins de 20 h après la précédente
 *    (`resolveGameDayKey`) : changer de fuseau ne fait gagner ni missions ni coffre ;
 *  - **tirage paresseux** — au premier accès du jour dans le fuseau de
 *    l'utilisateur (la lecture de `GET /me/engagement`, ou le premier geste), par
 *    la graine déterministe de la loi : les trois clients lisent le même tirage.
 *    `(userId, dayKey, slot)` est unique : deux accès concurrents n'en font qu'un ;
 *  - **progression AU GESTE** — appelée depuis le point où `recordActivity`
 *    CRÉDITE. Un geste que les plafonds anti-triche ont refusé n'arrive jamais
 *    ici : les missions héritent des plafonds, elles ne les contournent pas.
 *    Aucun agrégat : une lecture indexée de ≤ 4 lignes, un incrément atomique ;
 *  - **récompense** — avec le Bonus de Flamme (fixé au tirage) et l'Heure du
 *    Prisme (le paiement double si le geste tombe dans l'heure du jour) ;
 *  - **idempotence** — l'achèvement est un `updateMany` conditionnel sur
 *    `completedAt: null` : la mission ne paie qu'une fois, quoi qu'il arrive.
 */

import type { DailyMission, PrismaClient } from '@meeshy/shared/prisma/client';
import type { EngagementAxisKey } from '@meeshy/shared/types/engagement';
import { isEngagementAxisKey } from '@meeshy/shared/types/engagement';
import type { GameChestReward, GameMission } from '@meeshy/shared/types/game';
import { PRISM_HOUR_MULTIPLIER, isInPrismHour, prismHourWindow } from '@meeshy/shared/utils/game/boosts';
import { dailyChest, type DailyChest } from '@meeshy/shared/utils/game/chest';
import { FLAME_FREEZE_MAX, flameStatus } from '@meeshy/shared/utils/game/flame';
import { levelFromScore } from '@meeshy/shared/utils/game/levels';
import {
  MISSIONS_MIN_LEVEL,
  MISSION_DIFFICULTIES,
  MISSION_REROLL_PER_DAY,
  MISSION_REROLL_PRICE,
  drawDailyMissions,
  replaceImpossibleMissions,
  rerollDailyMission,
  resolveGameDayKey,
  type DrawnMission,
  type MissionDifficulty,
  type MissionSignal,
} from '@meeshy/shared/utils/game/missions';
import { PERSONAL_MISSION_SLOT, isPersonalMissionOpen } from '@meeshy/shared/utils/game/personal-mission';
import { GameRefusal } from './GameRefusal';
import { FLAME_USER_SELECT, STREAK_WRITE_ATTEMPTS, flameFactsOf, flameFreezesUnchanged } from './FlameService';
import { GloryService } from './GloryService';
import { MeeshSpend } from './MeeshSpend';
import { dayKeyOf, minuteOfDayInTimezone } from './gameClock';
import { MISSION_PROFILE_USER_SELECT, missionProfileOf } from './MissionHabits';
import { meeshTotalsFromLedger } from '../meesh/MeeshService';
import { enhancedLogger } from '../../utils/logger-enhanced';

const log = enhancedLogger.child({ module: 'MissionService' });

/**
 * L'axe qui reçoit les points d'un gain de jeu qui n'est pas celui d'un axe
 * (coffre, réponse reçue, mission de signal composé) : le plus RENOUVELABLE du
 * débit de frappe — ces points restent débitables, comme ceux de l'axe d'où ils
 * viennent, sans fabriquer un compteur que la frappe ignorerait.
 */
export const GAME_BONUS_AXIS: EngagementAxisKey = 'content.text_message';

/** Trois missions par jour : facile, moyenne, difficile (ou Or). */
export const DAILY_MISSION_SLOTS = 3;

const USER_GAME_SELECT = { ...FLAME_USER_SELECT, ...MISSION_PROFILE_USER_SELECT, engagementScore: true, levelRecord: true } as const;

/**
 * Les trois missions du JOUR, à l'exclusion de la mission personnelle (#9539, emplacement 3) : le coffre,
 * le changement de mission et la complétion d'un tirage interrompu ne regardent qu'elles.
 */
const isDailySlot = (row: Pick<DailyMission, 'slot'>): boolean => row.slot < DAILY_MISSION_SLOTS;

/** Pour une lecture qui ne doit rien créditer : toute tentative de paiement échoue bruyamment. */
export const READ_ONLY_CREDIT: MissionServiceDeps['creditPoints'] = async () => {
  throw new Error('read-only mission service cannot credit points');
};

export type MissionServiceDeps = {
  /** Crédite des points de jeu au score et à un axe — `EngagementService.creditGamePoints`. */
  readonly creditPoints: (userId: string, points: number, axisKey: EngagementAxisKey) => Promise<void>;
  readonly chest?: (params: { readonly userId: string; readonly dayKey: string }) => DailyChest;
  readonly glory?: GloryService;
  /**
   * Une mission vient d'être ACHEVÉE ET PAYÉE (#9386) : la saison en tire ses
   * étoiles. Appelé UNE fois par mission (l'achèvement est réclamé), isolé — un
   * échec ne rend jamais la mission.
   */
  readonly onMissionCompleted?: (event: { readonly userId: string; readonly difficulty: MissionDifficulty; readonly now: Date }) => Promise<void>;
};

export type MissionDay = {
  readonly dayKey: string;
  readonly unlocked: boolean;
  readonly rows: readonly DailyMission[];
};

export type SignalOptions = {
  readonly now?: Date;
  /** Un signal « distinct » (conversation, auteur) : la clé qui ne compte qu'une fois. */
  readonly key?: string;
  readonly amount?: number;
  /** Déjà connus de l'appelant (voie chaude) : évitent une lecture du compte. */
  readonly dayKey?: string;
  readonly timezone?: string | null;
  readonly record?: number;
};

export type ChestResult = { readonly status: 'claimed' | 'already-claimed'; readonly reward: GameChestReward; readonly score: number };

/**
 * « Pas encore faite » — le champ À NULL **ou ABSENT**. Sur MongoDB, Prisma ne fait
 * matcher `{ f: null }` qu'au champ présent à null (leçon 318) : une ligne écrite
 * sans le champ ne serait jamais réclamée, la mission jamais payée.
 */
const NOT_COMPLETED = { OR: [{ completedAt: null }, { completedAt: { isSet: false } }] };
const CHEST_UNCLAIMED = { OR: [{ chestClaimedAt: null }, { chestClaimedAt: { isSet: false } }] };

function isP2002(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

export const axisOfSignal = (signal: string): EngagementAxisKey => {
  const axis = signal.startsWith('axis:') ? signal.slice('axis:'.length) : '';
  return isEngagementAxisKey(axis) ? axis : GAME_BONUS_AXIS;
};

const isDifficulty = (value: string): value is MissionDifficulty => (MISSION_DIFFICULTIES as readonly string[]).includes(value);

export function toGameMission(row: DailyMission): GameMission {
  return {
    id: row.id,
    templateKey: row.templateKey,
    difficulty: isDifficulty(row.difficulty) ? row.difficulty : 'easy',
    signal: row.signal,
    prism: row.prism,
    target: row.target,
    progress: Math.min(row.progress, row.target),
    reward: row.reward,
    glory: row.glory,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
  };
}

const drawnOf = (row: DailyMission): DrawnMission => ({
  difficulty: isDifficulty(row.difficulty) ? row.difficulty : 'easy',
  templateKey: row.templateKey,
  signal: row.signal as MissionSignal,
  prism: row.prism,
  target: row.target,
  reward: row.reward,
  glory: row.glory,
});

/**
 * Les missions devenues IMPOSSIBLES (gabarit inconnu du catalogue) et pas encore achevées reçoivent un gabarit
 * de même emplacement et même difficulté (la loi : `replaceImpossibleMissions`). La ligne garde son identité,
 * son emplacement, `rerolledAt` et sa plage ; ni `GameDay` (coffre, changements du jour) ni une mission achevée
 * ne bougent. L'écriture est conditionnelle sur le gabarit LU et sur « pas encore faite » : deux chargements
 * concurrents n'en écrivent qu'un, et une mission achevée entre-temps garde le sien.
 */
export async function replaceImpossibleMissionRows(
  prisma: Pick<PrismaClient, 'dailyMission'>,
  params: {
    readonly userId: string;
    readonly dayKey: string;
    readonly level: number;
    readonly flameDays: number;
    readonly rows: readonly DailyMission[];
  },
): Promise<DailyMission[]> {
  const replacements = replaceImpossibleMissions({
    userId: params.userId,
    dayKey: params.dayKey,
    level: params.level,
    flameDays: params.flameDays,
    missions: params.rows.map((row) => ({ ...drawnOf(row), completed: row.completedAt !== null })),
  });
  if (replacements.length === 0) return [...params.rows];
  for (const { index, mission } of replacements) {
    const row = params.rows[index]!;
    await prisma.dailyMission.updateMany({
      where: { id: row.id, templateKey: row.templateKey, ...NOT_COMPLETED },
      data: {
        templateKey: mission.templateKey,
        difficulty: mission.difficulty,
        signal: mission.signal,
        prism: mission.prism,
        target: mission.target,
        reward: mission.reward,
        glory: mission.glory,
        progress: 0,
        seen: [],
      },
    });
  }
  const fresh = await prisma.dailyMission.findMany({ where: { id: { in: params.rows.map((row) => row.id) } } });
  return params.rows.map((row) => fresh.find((candidate) => candidate.id === row.id) ?? row);
}

type RecentMission = Pick<DailyMission, 'dayKey' | 'createdAt'>;

/**
 * La dernière journée OUVERTE parmi des lignes triées par `dayKey` décroissant :
 * sa clé et son ouverture (le premier tirage de ses emplacements).
 */
function latestOpenedDay(rows: readonly RecentMission[]): { readonly dayKey: string; readonly openedAt: Date } | null {
  const top = rows[0];
  if (!top) return null;
  const openedAt = rows
    .filter((row) => row.dayKey === top.dayKey)
    .reduce((earliest, row) => Math.min(earliest, row.createdAt?.getTime() ?? 0), Number.POSITIVE_INFINITY);
  return { dayKey: top.dayKey, openedAt: new Date(Number.isFinite(openedAt) ? openedAt : 0) };
}

export class MissionService {
  private readonly glory: GloryService;

  private readonly spend: MeeshSpend;

  private readonly chestOf: NonNullable<MissionServiceDeps['chest']>;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly deps: MissionServiceDeps,
  ) {
    this.glory = deps.glory ?? new GloryService(prisma);
    this.spend = new MeeshSpend(prisma);
    this.chestOf = deps.chest ?? dailyChest;
  }

  private async userRow(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId }, select: USER_GAME_SELECT });
  }

  /**
   * Les lignes de la dernière journée tirée (au plus un tirage : les trois du jour et la personnelle), les plus
   * récentes d'abord. Une LECTURE rend à la fois la journée ouverte et la mission personnelle qui s'y trouve.
   */
  private async recentMissions(userId: string): Promise<DailyMission[]> {
    return this.prisma.dailyMission.findMany({ where: { userId }, orderBy: { dayKey: 'desc' }, take: DAILY_MISSION_SLOTS + 1 });
  }

  /** La clé de la journée de jeu : celle du fuseau, rendue monotone. */
  private async gameDayKey(userId: string, timezone: string | null | undefined, now: Date): Promise<string> {
    return resolveGameDayKey({ candidate: dayKeyOf(now, timezone), latest: latestOpenedDay(await this.recentMissions(userId)), now });
  }

  /** Le jour et ses missions — tirées au premier accès du jour, jamais retirées. */
  async ensureToday(userId: string, now: Date = new Date()): Promise<MissionDay> {
    const user = await this.userRow(userId);
    const recent = await this.recentMissions(userId);
    const dayKey = resolveGameDayKey({ candidate: dayKeyOf(now, user?.timezone), latest: latestOpenedDay(recent), now });
    const level = levelFromScore(user?.engagementScore ?? 0);
    const record = Math.max(level, user?.levelRecord ?? 0);
    const unlocked = record >= MISSIONS_MIN_LEVEL;

    const facts = flameFactsOf(user ?? {}, now);
    const status = flameStatus({ lastActiveDay: facts.lastActiveDay, today: dayKey, streak: facts.streak, freezes: facts.freezes });
    const flameDays = status === 'out' ? 0 : facts.streak;
    const existing = await replaceImpossibleMissionRows(this.prisma, {
      userId,
      dayKey,
      level,
      flameDays,
      rows: recent.filter((row) => row.dayKey === dayKey && isDailySlot(row)).sort((a, b) => a.slot - b.slot),
    });
    // Un tirage INTERROMPU (une écriture tombée entre deux emplacements) se
    // COMPLÈTE : les emplacements posés font foi, seuls les manquants s'écrivent.
    if (existing.length >= DAILY_MISSION_SLOTS || !unlocked) return { dayKey, unlocked, rows: existing };
    const taken = new Set(existing.map((row) => row.slot));

    const [treasury, profile] = await Promise.all([
      meeshTotalsFromLedger(this.prisma, userId).then((totals) => totals.balance),
      missionProfileOf({ prisma: this.prisma, userId, user: user ?? null, now }),
    ]);
    const draw = drawDailyMissions({
      userId,
      dayKey,
      level,
      flameDays,
      treasury,
      profile,
    });

    for (const [slot, mission] of draw.missions.entries()) {
      if (taken.has(slot)) continue;
      try {
        await this.prisma.dailyMission.create({
          data: {
            userId,
            dayKey,
            slot,
            templateKey: mission.templateKey,
            difficulty: mission.difficulty,
            signal: mission.signal,
            prism: mission.prism,
            target: mission.target,
            progress: 0,
            reward: mission.reward,
            glory: mission.glory,
            seen: [],
            // Posés À NULL, jamais omis : un champ omis est ABSENT en base.
            completedAt: null,
            paidPoints: null,
            rerolledAt: null,
          },
        });
      } catch (err) {
        // Un accès concurrent a tiré le même emplacement : sa ligne fait foi.
        if (!isP2002(err)) throw err;
      }
    }
    return {
      dayKey,
      unlocked,
      rows: await this.prisma.dailyMission.findMany({ where: { userId, dayKey, slot: { lt: DAILY_MISSION_SLOTS } }, orderBy: { slot: 'asc' } }),
    };
  }

  /**
   * Un fait observé à l'écriture : un axe crédité, une réponse dans une
   * conversation distincte, un message dans une autre langue, une réponse reçue
   * d'un auteur distinct. Fait avancer la mission qui l'attend, et la PAIE à
   * l'objectif.
   */
  async onSignal(userId: string, signal: MissionSignal | string, options: SignalOptions = {}): Promise<void> {
    const now = options.now ?? new Date();
    let { dayKey: candidate, timezone } = options;
    if (candidate === undefined) {
      timezone = (await this.userRow(userId))?.timezone ?? null;
      candidate = dayKeyOf(now, timezone);
    }

    // Une lecture indexée de ≤ 3 lignes rend À LA FOIS la journée ouverte et ses
    // missions : la clé du fuseau n'ouvre une journée que si la loi le permet.
    const recent = await this.recentMissions(userId);
    const dayKey = resolveGameDayKey({ candidate, latest: latestOpenedDay(recent), now });
    let rows = recent.filter((row) => row.dayKey === dayKey);
    if (rows.length === 0) {
      // Le geste précède toute lecture du jour : on tire ici, sinon il serait perdu.
      if (options.record !== undefined && options.record < MISSIONS_MIN_LEVEL) return;
      const today = await this.ensureToday(userId, now);
      if (!today.unlocked) return;
      rows = [...today.rows];
    }

    // La mission personnelle n'avance que DANS sa plage — début inclus, fin exclue : passé `endsAt`, le serveur
    // ne l'accepte plus, quel que soit l'appareil qui rejoue le geste (#9539).
    const reachable = (row: DailyMission): boolean =>
      row.slot !== PERSONAL_MISSION_SLOT ||
      (row.startsAt != null && row.endsAt != null && isPersonalMissionOpen({ startsAt: row.startsAt, endsAt: row.endsAt, now }));
    for (const row of rows.filter((r) => r.signal === signal && r.completedAt === null && reachable(r))) {
      const progress = options.key !== undefined
        ? await this.advanceDistinct(row, options.key)
        : await this.advanceCounted(row, options.amount ?? 1);
      if (progress !== null && progress >= row.target) {
        await this.complete(row, now, timezone ?? (await this.userRow(userId))?.timezone ?? null);
      }
    }
  }

  private async advanceCounted(row: DailyMission, amount: number): Promise<number> {
    const after = await this.prisma.dailyMission.update({
      where: { id: row.id },
      data: { progress: { increment: amount } },
      select: { progress: true },
    });
    return after.progress;
  }

  /** `null` quand la clé était déjà comptée (ou la mission faite entre-temps). */
  private async advanceDistinct(row: DailyMission, key: string): Promise<number | null> {
    let current: DailyMission | null = row;
    for (let attempt = 0; attempt < 3 && current !== null; attempt += 1) {
      if (current.completedAt !== null || current.seen.includes(key)) return null;
      const written = await this.prisma.dailyMission.updateMany({
        where: { id: current.id, progress: current.progress, ...NOT_COMPLETED },
        data: { progress: current.progress + 1, seen: { push: key } },
      });
      if (written.count === 1) return current.progress + 1;
      current = await this.prisma.dailyMission.findUnique({ where: { id: current.id } });
    }
    return null;
  }

  /**
   * L'achèvement : la ligne est réclamée d'abord (conditionnelle sur
   * `completedAt: null`, donc une seule requête paie), la Gloire d'Or — idempotente
   * par clé — ensuite, les points en DERNIER. Si les points échouent, la
   * réclamation est rendue : le prochain geste réessaiera, sans double paiement
   * possible puisque la Gloire est déjà gravée sous sa clé.
   */
  private async complete(row: DailyMission, now: Date, timezone: string | null): Promise<void> {
    const inPrismHour = isInPrismHour(prismHourWindow({ userId: row.userId, dayKey: row.dayKey }), minuteOfDayInTimezone(now, timezone));
    const paid = row.reward * (inPrismHour ? PRISM_HOUR_MULTIPLIER : 1);

    const claimed = await this.prisma.dailyMission.updateMany({
      where: { id: row.id, ...NOT_COMPLETED },
      data: { completedAt: now, paidPoints: paid },
    });
    if (claimed.count === 0) return;

    try {
      if (row.glory > 0) {
        await this.glory.credit({
          userId: row.userId,
          delta: row.glory,
          reason: row.difficulty === 'gold' ? 'mission-gold' : 'mission',
          requestId: `mission:${row.id}`,
          meta: { templateKey: row.templateKey, dayKey: row.dayKey },
        });
      }
      await this.deps.creditPoints(row.userId, paid, axisOfSignal(row.signal));
    } catch (error) {
      await this.prisma.dailyMission.updateMany({ where: { id: row.id, completedAt: now }, data: { completedAt: null, paidPoints: null } });
      log.warn('mission reward failed, completion handed back', { userId: row.userId, missionId: row.id });
      throw error;
    }
    // La mission est PAYÉE : ce qui suit est un appoint, jamais une raison de la rendre.
    if (this.deps.onMissionCompleted && isDifficulty(row.difficulty)) {
      await this.deps.onMissionCompleted({ userId: row.userId, difficulty: row.difficulty, now }).catch((error: unknown) =>
        log.warn('mission completion follow-up failed', { userId: row.userId, error: error instanceof Error ? error.message : String(error) }),
      );
    }
  }

  private async ensureGameDay(userId: string, dayKey: string): Promise<void> {
    const present = await this.prisma.gameDay.findUnique({ where: { userId_dayKey: { userId, dayKey } }, select: { id: true } });
    if (present) return;
    try {
      await this.prisma.gameDay.create({
        data: { userId, dayKey, chestClaimedAt: null, chestPoints: null, chestFragment: null, chestFreeze: null },
      });
    } catch (err) {
      if (!isP2002(err)) throw err;
    }
  }

  /** Les changements consommés ce jour et l'état du coffre. */
  async gameDay(userId: string, dayKey: string) {
    return this.prisma.gameDay.findUnique({ where: { userId_dayKey: { userId, dayKey } } });
  }

  /** Change UNE mission du jour : 1 Meesh, une fois par jour, même difficulté. */
  async reroll(params: { readonly userId: string; readonly missionId: string; readonly requestId: string; readonly now?: Date }) {
    const { userId, missionId, requestId } = params;
    const now = params.now ?? new Date();
    const user = await this.userRow(userId);
    const dayKey = await this.gameDayKey(userId, user?.timezone, now);
    await this.ensureGameDay(userId, dayKey);

    const assertAllowed = async (db: Pick<PrismaClient, 'dailyMission' | 'gameDay' | 'user'>): Promise<DailyMission> => {
      const row = await db.dailyMission.findUnique({ where: { id: missionId } });
      if (!row || row.userId !== userId || row.dayKey !== dayKey) throw new GameRefusal('MISSION_NOT_FOUND');
      // La mission personnelle (#9539) est la SIENNE : tirée sur ses usages et sa plage, elle ne se change pas.
      if (row.slot === PERSONAL_MISSION_SLOT) throw new GameRefusal('MISSION_REROLL_UNAVAILABLE');
      const account = await db.user.findUnique({ where: { id: userId }, select: USER_GAME_SELECT });
      const record = Math.max(levelFromScore(account?.engagementScore ?? 0), account?.levelRecord ?? 0);
      if (record < MISSIONS_MIN_LEVEL) throw new GameRefusal('MISSIONS_LOCKED');
      if (row.completedAt !== null) throw new GameRefusal('MISSION_REROLL_UNAVAILABLE');
      const day = await db.gameDay.findUnique({ where: { userId_dayKey: { userId, dayKey } }, select: { rerollCount: true } });
      if ((day?.rerollCount ?? 0) >= MISSION_REROLL_PER_DAY) throw new GameRefusal('MISSION_REROLL_EXHAUSTED');
      return row;
    };

    const outcome = await this.spend.spend<string>({
      userId,
      requestId,
      price: MISSION_REROLL_PRICE,
      kind: 'mission-reroll',
      meta: { missionId, dayKey },
      guard: () => assertAllowed(this.prisma).then(() => undefined),
      apply: async (tx) => {
        const row = await assertAllowed(tx);
        const account = await tx.user.findUnique({ where: { id: userId }, select: USER_GAME_SELECT });
        const facts = flameFactsOf(account ?? {}, now);
        const status = flameStatus({ lastActiveDay: facts.lastActiveDay, today: dayKey, streak: facts.streak, freezes: facts.freezes });
        const day = await tx.gameDay.findUnique({ where: { userId_dayKey: { userId, dayKey } }, select: { rerollCount: true } });
        const all = await tx.dailyMission.findMany({ where: { userId, dayKey, slot: { lt: DAILY_MISSION_SLOTS } }, orderBy: { slot: 'asc' } });
        const profile = await missionProfileOf({ prisma: this.prisma, userId, user: account ?? null, now });
        const next = rerollDailyMission({
          profile,
          userId,
          dayKey,
          level: levelFromScore(account?.engagementScore ?? 0),
          flameDays: status === 'out' ? 0 : facts.streak,
          missions: all.map(drawnOf),
          index: row.slot,
          rerollCount: day?.rerollCount ?? 0,
        });
        if (next === null) throw new GameRefusal('MISSION_REROLL_UNAVAILABLE');
        await tx.dailyMission.update({
          where: { id: row.id },
          data: {
            templateKey: next.templateKey,
            signal: next.signal,
            prism: next.prism,
            target: next.target,
            reward: next.reward,
            glory: next.glory,
            progress: 0,
            seen: [],
            completedAt: null,
            paidPoints: null,
            rerolledAt: now,
          },
        });
        await tx.gameDay.update({
          where: { userId_dayKey: { userId, dayKey } },
          data: { rerollCount: (day?.rerollCount ?? 0) + 1 },
        });
        return row.id;
      },
    });

    if (outcome.status === 'insufficient') throw new GameRefusal('INSUFFICIENT_MEESHES', { balance: outcome.balance });
    const rerolledId =
      outcome.status === 'spent'
        ? outcome.result
        : typeof (outcome.meta as { missionId?: unknown } | null)?.missionId === 'string'
          ? (outcome.meta as { missionId: string }).missionId
          : undefined;
    const row = rerolledId ? await this.prisma.dailyMission.findUnique({ where: { id: rerolledId } }) : null;
    if (!row) throw new GameRefusal('MISSION_NOT_FOUND');
    return { mission: toGameMission(row), balance: outcome.balance };
  }

  /** Ouvre le coffre du jour — réclamable une fois les trois missions faites. */
  async claimChest(params: { readonly userId: string; readonly requestId: string; readonly now?: Date }): Promise<ChestResult> {
    const { userId } = params;
    const now = params.now ?? new Date();
    const user = await this.userRow(userId);
    const dayKey = await this.gameDayKey(userId, user?.timezone, now);

    const stored = await this.gameDay(userId, dayKey);
    if (stored?.chestClaimedAt) return this.alreadyClaimed(userId, stored);

    const rows = await this.prisma.dailyMission.findMany({ where: { userId, dayKey, slot: { lt: DAILY_MISSION_SLOTS } } });
    if (rows.length < DAILY_MISSION_SLOTS || rows.some((r) => r.completedAt === null)) throw new GameRefusal('CHEST_NOT_READY');

    await this.ensureGameDay(userId, dayKey);
    const reward = this.chestOf({ userId, dayKey });
    const claimed = await this.prisma.gameDay.updateMany({
      where: { userId, dayKey, ...CHEST_UNCLAIMED },
      data: { chestClaimedAt: now, chestPoints: reward.points, chestFragment: reward.fragment, chestFreeze: reward.freeze },
    });
    if (claimed.count === 0) return this.alreadyClaimed(userId, await this.gameDay(userId, dayKey));

    try {
      await this.deps.creditPoints(userId, reward.points, GAME_BONUS_AXIS);
    } catch (error) {
      await this.prisma.gameDay.updateMany({
        where: { userId, dayKey, chestClaimedAt: now },
        data: { chestClaimedAt: null, chestPoints: null, chestFragment: null, chestFreeze: null },
      });
      throw error;
    }
    // Les points sont PAYÉS : rendre le coffre maintenant les ferait payer deux
    // fois. Le gel offert est un appoint — son échec se journalise, sans plus.
    if (reward.freeze) {
      await this.grantFreeze(userId).catch((error: unknown) =>
        log.warn('chest freeze not granted', { userId, error: error instanceof Error ? error.message : String(error) }),
      );
    }
    return { status: 'claimed', reward, score: (await this.userRow(userId))?.engagementScore ?? 0 };
  }

  /**
   * Un gel offert par le coffre ne remplit jamais la réserve au-delà du maximum.
   * L'écriture est conditionnelle à la réserve LUE : un gel acheté entre-temps
   * fait relire, jamais écraser l'achat.
   */
  async grantFreeze(userId: string): Promise<void> {
    for (let attempt = 0; attempt < STREAK_WRITE_ATTEMPTS; attempt += 1) {
      const row = await this.prisma.user.findUnique({ where: { id: userId }, select: { flameFreezes: true } });
      if (!row) return;
      const freezes = row.flameFreezes ?? 0;
      if (freezes >= FLAME_FREEZE_MAX) return;
      const written = await this.prisma.user.updateMany({
        where: { id: userId, ...flameFreezesUnchanged(row.flameFreezes) },
        data: { flameFreezes: freezes + 1 },
      });
      if (written.count === 1) return;
    }
    throw new Error('chest freeze contended');
  }

  private async alreadyClaimed(
    userId: string,
    day: { chestPoints: number | null; chestFragment: boolean | null; chestFreeze: boolean | null } | null,
  ): Promise<ChestResult> {
    return {
      status: 'already-claimed',
      reward: { points: day?.chestPoints ?? 0, fragment: day?.chestFragment ?? false, freeze: day?.chestFreeze ?? false },
      score: (await this.userRow(userId))?.engagementScore ?? 0,
    };
  }
}
