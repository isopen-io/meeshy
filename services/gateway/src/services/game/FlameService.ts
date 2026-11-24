/**
 * LA FLAMME côté passerelle (#9376) — la série de jours existante, ses gels et
 * son rallumage. La LOI vit dans `@meeshy/shared/utils/game/flame` ; ce module
 * l'applique contre la base, sans en réécrire une ligne.
 *
 *  - `planStreak` : la transition de série du GESTE du jour, écrite par
 *    `writeStreak` (appelée par `EngagementService.updateStreak`). Un jour
 *    manqué consomme un gel automatiquement quand les gels les couvrent TOUS ;
 *    sinon la Flamme s'éteint et la série perdue est GARDÉE (`brokenStreakDays`)
 *    pour le rallumage de 48 h. L'écriture est CONDITIONNELLE aux valeurs lues :
 *    un gel acheté ou une Flamme rallumée entre la lecture et l'écriture fait
 *    reprendre le calcul, jamais écraser l'achat ;
 *    Le 3e jour de la première Flamme de sa vie, le joueur reçoit sa première
 *    Veilleuse (`firstFreezeGift`, #17371), écrite dans le même geste avec
 *    son jour, que le bloc annonce ce jour-là (#20169) ;
 *  - `buyFreeze` : 1 Meesh, 2 en réserve au plus ;
 *  - `relight` : 3 Meeshes, dans les 48 h, une fois par mois ;
 *  - `relightByEffort` : deux rêves complets dans la même fenêtre rallument
 *    la Flamme sans payer (#20455), sans consommer le rallumage payé du mois ;
 *  - `pause` : une veille annoncée de 1 à 7 jours, une fois par trimestre
 *    (#17372). Les jours en veille ne sont ni gagnés ni manqués : `flameFactsOf`
 *    sert un dernier jour actif AVANCÉ d'autant (`restedLastActiveDay`), que
 *    tous les lecteurs de l'état reçoivent sans rien changer ; le geste du jour
 *    termine la veille la veille du geste.
 *
 * Les deux dépenses passent par `MeeshSpend` : ligne `spend` + effet dans une
 * même transaction, idempotentes par `requestId`.
 */

import type { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import {
  FLAME_FREEZE_PRICE,
  FLAME_RELIGHT_PRICE,
  advanceFlame,
  canBuyFreeze,
  canRelight,
  firstFreezeGift,
  flameStatus,
  relightFlame,
  type FlameOutcome,
} from '@meeshy/shared/utils/game/flame';
import { canRelightByEffort, relightByEffort, servedEffortRelight, wholeDreamDays } from '@meeshy/shared/utils/game/flame-effort';
import { canPauseFlame, flamePauseOf, pauseEndedBy, restedLastActiveDay, type FlamePause } from '@meeshy/shared/utils/game/flame-pause';
import { addDays } from '@meeshy/shared/utils/game/day-prng';
import { FULL_DREAM_ACTS } from '@meeshy/shared/utils/game/missions';
import { civilDayKey } from '../engagement/civilDay';
import { GameRefusal } from './GameRefusal';
import { GloryService } from './GloryService';
import { MeeshSpend } from './MeeshSpend';
import { dayKeyOf, markerOfDayKey } from './gameClock';

export const FLAME_USER_SELECT = {
  currentStreakDays: true,
  longestStreakDays: true,
  lastStreakDate: true,
  timezone: true,
  flameFreezes: true,
  lastRelightDay: true,
  flameFreezeGiftDay: true,
  brokenStreakDays: true,
  brokenStreakLastDay: true,
  flamePauseFrom: true,
  flamePauseUntil: true,
} as const;

/** Ce que Prisma relit d'un compte : tout peut être ABSENT sur un compte antérieur. */
export type FlameUserRow = {
  readonly currentStreakDays?: number | null;
  readonly longestStreakDays?: number | null;
  readonly lastStreakDate?: Date | null;
  readonly timezone?: string | null;
  readonly flameFreezes?: number | null;
  readonly lastRelightDay?: string | null;
  readonly flameFreezeGiftDay?: string | null;
  readonly brokenStreakDays?: number | null;
  readonly brokenStreakLastDay?: string | null;
  readonly flamePauseFrom?: string | null;
  readonly flamePauseUntil?: string | null;
};

export type FlameFacts = {
  readonly today: string;
  readonly streak: number;
  readonly longest: number;
  /**
   * Le dernier jour actif tel que la Flamme le VOIT aujourd'hui : celui du dernier geste, avancé des jours en veille
   * jusqu'à aujourd'hui inclus (#17372). C'est lui que lisent `flameStatus` et tous les lecteurs de l'état.
   */
  readonly lastActiveDay: string | null;
  /** Le jour du dernier geste, tel qu'écrit : ce que le geste du jour et un rallumage comparent à aujourd'hui. */
  readonly lastGestureDay: string | null;
  /** La dernière veille annoncée, `null` sans veille. */
  readonly pause: FlamePause | null;
  readonly freezes: number;
  readonly lastRelightDay: string | null;
  /** Le jour où la première Veilleuse a été offerte (#20169). */
  readonly freezeGiftDay: string | null;
  readonly brokenStreak: number | null;
  readonly brokenLastDay: string | null;
};

const count = (value: number | null | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;

export function flameFactsOf(row: FlameUserRow, now: Date): FlameFacts {
  const today = dayKeyOf(now, row.timezone);
  const lastGestureDay = row.lastStreakDate ? civilDayKey(row.lastStreakDate) : null;
  const pause = flamePauseOf(row);
  return {
    today,
    streak: count(row.currentStreakDays),
    longest: count(row.longestStreakDays),
    lastActiveDay: restedLastActiveDay({ lastActiveDay: lastGestureDay, through: today, pause }),
    lastGestureDay,
    pause,
    freezes: count(row.flameFreezes),
    lastRelightDay: row.lastRelightDay ?? null,
    freezeGiftDay: row.flameFreezeGiftDay ?? null,
    brokenStreak: row.brokenStreakDays ?? null,
    brokenLastDay: row.brokenStreakLastDay ?? null,
  };
}

/**
 * La série ROMPUE que le rallumage rendrait, avec son dernier jour actif
 * d'AVANT la rupture. Deux formes :
 *  - la Flamme est éteinte sans que le joueur soit revenu : c'est la série
 *    stockée elle-même ;
 *  - le joueur est revenu (la série repartie à 1) : c'est ce que la rupture a
 *    gardé. Une trace ancienne n'est jamais fausse — `canRelight` la refuse
 *    d'elle-même hors de la fenêtre.
 */
export function brokenFlame(facts: FlameFacts): { readonly streak: number; readonly lastActiveDay: string } | null {
  const status = flameStatus({
    lastActiveDay: facts.lastActiveDay,
    today: facts.today,
    streak: facts.streak,
    freezes: facts.freezes,
  });
  if (status === 'out' && facts.lastActiveDay !== null) return { streak: facts.streak, lastActiveDay: facts.lastActiveDay };
  if (facts.brokenStreak !== null && facts.brokenStreak > 0 && facts.brokenLastDay !== null) {
    return { streak: facts.brokenStreak, lastActiveDay: facts.brokenLastDay };
  }
  return null;
}

export type StreakPlan = {
  readonly outcome: FlameOutcome;
  readonly streak: number;
  readonly longest: number;
  readonly previousLongest: number;
  /** La première Veilleuse vient d'être offerte (#17371). */
  readonly freezeGifted: boolean;
  /** Ce que le compte doit porter ensuite ; `null` ⇒ rien à écrire (déjà actif aujourd'hui). */
  readonly data: Prisma.UserUpdateManyMutationInput | null;
};

/** La transition de série du geste du jour, appliquée à l'état courant. */
export function planStreak(facts: FlameFacts): StreakPlan {
  // Le jour du geste n'est jamais en veille — le geste la termine : la veille ne compte que jusqu'à hier.
  const lastActiveDay = restedLastActiveDay({ lastActiveDay: facts.lastGestureDay, through: addDays(facts.today, -1), pause: facts.pause });
  const ended = pauseEndedBy(facts.pause, facts.today);
  const transition = advanceFlame({
    lastActiveDay,
    today: facts.today,
    streak: facts.streak,
    freezes: facts.freezes,
  });
  if (transition.outcome === 'same-day') {
    return {
      outcome: 'same-day',
      streak: facts.streak,
      longest: facts.longest,
      previousLongest: facts.longest,
      freezeGifted: false,
      data: null,
    };
  }
  const longest = Math.max(facts.longest, transition.streak);
  const gift = firstFreezeGift({ previousLongest: facts.longest, streak: transition.streak, freezes: transition.freezes });
  return {
    outcome: transition.outcome,
    streak: transition.streak,
    longest,
    previousLongest: facts.longest,
    freezeGifted: gift.gifted,
    data: {
      currentStreakDays: transition.streak,
      longestStreakDays: longest,
      lastStreakDate: markerOfDayKey(facts.today),
      ...(transition.freezesUsed > 0 || gift.gifted ? { flameFreezes: gift.freezes } : {}),
      ...(gift.gifted ? { flameFreezeGiftDay: facts.today } : {}),
      ...(ended === null ? {} : { flamePauseUntil: ended.until }),
      ...(transition.outcome === 'broken' && transition.lostStreak > 0 && lastActiveDay !== null
        ? { brokenStreakDays: transition.lostStreak, brokenStreakLastDay: lastActiveDay }
        : {}),
    },
  };
}

/**
 * « Le champ vaut encore ce qu'on a lu » — y compris ABSENT. Sur MongoDB, Prisma
 * ne fait matcher `{ f: null }` qu'au champ PRÉSENT à null (leçon 318) : seul
 * `isSet: false` atteint un compte antérieur au jeu, qui n'a jamais porté le champ.
 */
export const flameFreezesUnchanged = (value: number | null | undefined): Prisma.UserWhereInput =>
  typeof value === 'number' ? { flameFreezes: value } : { OR: [{ flameFreezes: null }, { flameFreezes: { isSet: false } }] };

const lastStreakDateUnchanged = (value: Date | null | undefined): Prisma.UserWhereInput =>
  value ? { lastStreakDate: value } : { OR: [{ lastStreakDate: null }, { lastStreakDate: { isSet: false } }] };

const lastRelightDayUnchanged = (value: string | null | undefined): Prisma.UserWhereInput =>
  typeof value === 'string' ? { lastRelightDay: value } : { OR: [{ lastRelightDay: null }, { lastRelightDay: { isSet: false } }] };

const brokenStreakUnchanged = (row: FlameUserRow): Prisma.UserWhereInput[] => [
  typeof row.brokenStreakDays === 'number'
    ? { brokenStreakDays: row.brokenStreakDays }
    : { OR: [{ brokenStreakDays: null }, { brokenStreakDays: { isSet: false } }] },
  typeof row.brokenStreakLastDay === 'string'
    ? { brokenStreakLastDay: row.brokenStreakLastDay }
    : { OR: [{ brokenStreakLastDay: null }, { brokenStreakLastDay: { isSet: false } }] },
];

const flamePauseUnchanged = (row: FlameUserRow): Prisma.UserWhereInput[] => [
  typeof row.flamePauseFrom === 'string'
    ? { flamePauseFrom: row.flamePauseFrom }
    : { OR: [{ flamePauseFrom: null }, { flamePauseFrom: { isSet: false } }] },
  typeof row.flamePauseUntil === 'string'
    ? { flamePauseUntil: row.flamePauseUntil }
    : { OR: [{ flamePauseUntil: null }, { flamePauseUntil: { isSet: false } }] },
];

/**
 * La Flamme telle qu'on l'a LUE : la condition d'une écriture comparer-et-écrire.
 * Chaque écrivain de la série (geste du jour, gel acheté ou offert, rallumage,
 * veille annoncée) change au moins un champ optionnel gardé ici. Les deux compteurs requis
 * (`currentStreakDays`, `longestStreakDays`) ne se gardent que présents : Prisma
 * n'offre pas `isSet` sur un champ requis, et leurs écrivains changent toujours
 * `lastStreakDate` ou `lastRelightDay` avec eux.
 */
export function flameUnchanged(row: FlameUserRow): Prisma.UserWhereInput[] {
  return [
    lastStreakDateUnchanged(row.lastStreakDate),
    flameFreezesUnchanged(row.flameFreezes),
    lastRelightDayUnchanged(row.lastRelightDay),
    ...brokenStreakUnchanged(row),
    ...flamePauseUnchanged(row),
    ...(typeof row.currentStreakDays === 'number' ? [{ currentStreakDays: row.currentStreakDays }] : []),
    ...(typeof row.longestStreakDays === 'number' ? [{ longestStreakDays: row.longestStreakDays }] : []),
  ];
}

/** Un écrivain concurrent ne revient pas quatre fois de suite à l'échelle d'un geste humain. */
export const STREAK_WRITE_ATTEMPTS = 4;

export type StreakWrite = { readonly plan: StreakPlan; readonly previousStreak: number };

/**
 * Écrit la transition de série du geste du jour, CONDITIONNELLEMENT à l'état lu.
 * Si un autre écrivain a changé la Flamme entre-temps (un gel acheté, un
 * rallumage, un geste concurrent), rien n'est écrit et le calcul reprend depuis
 * une lecture neuve. `null` : rien à écrire (déjà actif aujourd'hui, compte
 * introuvable) ou contention persistante.
 */
export async function writeStreak(db: Pick<PrismaClient, 'user'>, userId: string, now: Date): Promise<StreakWrite | null> {
  for (let attempt = 0; attempt < STREAK_WRITE_ATTEMPTS; attempt += 1) {
    const row = await db.user.findUnique({ where: { id: userId }, select: FLAME_USER_SELECT });
    if (!row) return null;
    const plan = planStreak(flameFactsOf(row, now));
    if (plan.data === null) return null;
    const written = await db.user.updateMany({ where: { id: userId, AND: flameUnchanged(row) }, data: plan.data });
    if (written.count === 1) return { plan, previousStreak: count(row.currentStreakDays) };
  }
  return null;
}

export type FreezeResult =
  | { readonly status: 'bought' | 'already-bought'; readonly freezes: number; readonly balance: number };
export type RelightResult =
  | { readonly status: 'relit' | 'already-relit'; readonly streak: number; readonly balance: number };
export type EffortRelightResult = { readonly streak: number } | null;
export type FlamePauseResult = { readonly status: 'paused' | 'already-paused'; readonly pause: FlamePause };

type EffortDb = Pick<PrismaClient, 'user' | 'dailyMission'>;

/**
 * Une Flamme éteinte que deux rêves complets peuvent ENCORE rallumer (#20471) : seule celle-là vaut la lecture de ses
 * rêves. Une trace de rupture ancienne n'est jamais effacée ; sans cette borne, chaque lecture relirait des mois d'actes.
 */
export function effortRelightOpen(broken: { readonly streak: number; readonly lastActiveDay: string }, today: string): boolean {
  return servedEffortRelight({ brokenLastDay: broken.lastActiveDay, streakBeforeBreak: broken.streak, today, dreamDays: [] }) !== null;
}

/**
 * Les journées de Rêve complet d'après la rupture — la mission personnelle n'en fait pas partie. Lue par le rallumage
 * (`writeEffortRelight`) et par le bloc qui le dit (#20471) : une seule requête, une seule loi.
 */
export async function dreamDaysAfter(db: EffortDb, userId: string, brokenLastDay: string): Promise<readonly string[]> {
  const rows = await db.dailyMission.findMany({
    where: { userId, dayKey: { gt: brokenLastDay }, slot: { lt: FULL_DREAM_ACTS } },
    select: { dayKey: true, slot: true, completedAt: true },
  });
  return wholeDreamDays(rows.map((row) => ({ dayKey: row.dayKey, slot: row.slot, completed: row.completedAt != null })));
}

/**
 * Rallume la Flamme si deux rêves complets l'ont GAGNÉ (#20455). Appelée à l'achèvement de chaque acte : ne fait
 * rien tant que la loi refuse. L'écriture est CONDITIONNELLE à la Flamme lue, comme celle du geste du jour : un
 * geste, un gel ou un rallumage payé concurrent fait reprendre le calcul, jamais écraser. `null` : rien rallumé.
 */
export async function writeEffortRelight(db: EffortDb, userId: string, now: Date): Promise<{ readonly streak: number; readonly previousLongest: number; readonly longest: number } | null> {
  for (let attempt = 0; attempt < STREAK_WRITE_ATTEMPTS; attempt += 1) {
    const row = await db.user.findUnique({ where: { id: userId }, select: FLAME_USER_SELECT });
    if (!row) return null;
    const facts = flameFactsOf(row, now);
    const broken = brokenFlame(facts);
    if (broken === null || !effortRelightOpen(broken, facts.today)) return null;
    const verdict = canRelightByEffort({
      brokenLastDay: broken.lastActiveDay,
      streakBeforeBreak: broken.streak,
      today: facts.today,
      dreamDays: await dreamDaysAfter(db, userId, broken.lastActiveDay),
    });
    if (!verdict.allowed) return null;
    const restored = relightByEffort({
      brokenLastDay: broken.lastActiveDay,
      streakBeforeBreak: broken.streak,
      today: facts.today,
      lastActiveDay: facts.lastGestureDay,
      currentStreak: facts.streak,
    });
    const longest = Math.max(facts.longest, restored.streak);
    const written = await db.user.updateMany({
      where: { id: userId, AND: flameUnchanged(row) },
      data: {
        currentStreakDays: restored.streak,
        longestStreakDays: longest,
        lastStreakDate: markerOfDayKey(restored.lastActiveDay),
        brokenStreakDays: null,
        brokenStreakLastDay: null,
      },
    });
    if (written.count === 1) return { streak: restored.streak, previousLongest: facts.longest, longest };
  }
  return null;
}

type WriteInput = { readonly userId: string; readonly requestId: string; readonly now?: Date };

export class FlameService {
  private readonly spend: MeeshSpend;

  private readonly glory: GloryService;

  constructor(private readonly prisma: PrismaClient) {
    this.spend = new MeeshSpend(prisma);
    this.glory = new GloryService(prisma);
  }

  private async userRow(db: Pick<PrismaClient, 'user'>, userId: string): Promise<FlameUserRow> {
    return (await db.user.findUnique({ where: { id: userId }, select: FLAME_USER_SELECT })) ?? {};
  }

  /** Achète un gel de Flamme : 1 Meesh, 2 en réserve au plus. */
  async buyFreeze({ userId, requestId, now = new Date() }: WriteInput): Promise<FreezeResult> {
    void now;
    const assertRoom = async (db: Pick<PrismaClient, 'user'>): Promise<number> => {
      const freezes = count((await this.userRow(db, userId)).flameFreezes);
      const verdict = canBuyFreeze({ freezes, balance: FLAME_FREEZE_PRICE });
      if (verdict.allowed === false && verdict.reason === 'at-maximum') throw new GameRefusal('FREEZE_AT_MAXIMUM');
      return freezes;
    };

    const outcome = await this.spend.spend<number>({
      userId,
      requestId,
      price: FLAME_FREEZE_PRICE,
      kind: 'flame-freeze',
      guard: () => assertRoom(this.prisma).then(() => undefined),
      apply: async (tx) => {
        const next = (await assertRoom(tx)) + 1;
        await tx.user.update({ where: { id: userId }, data: { flameFreezes: next } });
        return next;
      },
    });

    if (outcome.status === 'insufficient') throw new GameRefusal('INSUFFICIENT_MEESHES', { balance: outcome.balance });
    if (outcome.status === 'spent') return { status: 'bought', freezes: outcome.result ?? 0, balance: outcome.balance };
    const row = await this.userRow(this.prisma, userId);
    return { status: 'already-bought', freezes: count(row.flameFreezes), balance: outcome.balance };
  }

  /** Rallume une Flamme éteinte depuis moins de 48 h : 3 Meeshes, une fois par mois. */
  async relight({ userId, requestId, now = new Date() }: WriteInput): Promise<RelightResult> {
    const decide = async (db: Pick<PrismaClient, 'user'>) => {
      const facts = flameFactsOf(await this.userRow(db, userId), now);
      const broken = brokenFlame(facts);
      const verdict = canRelight({
        lastActiveDay: broken?.lastActiveDay ?? null,
        today: facts.today,
        streakBeforeBreak: broken?.streak ?? 0,
        lastRelightDay: facts.lastRelightDay,
        balance: FLAME_RELIGHT_PRICE,
      });
      if (broken === null) {
        // Rien de rompu : soit la Flamme brûle encore (ou est couverte par un
        // gel), soit il n'y a jamais eu de série à rendre.
        const burning = facts.streak > 0 && facts.lastActiveDay !== null;
        throw new GameRefusal('RELIGHT_NOT_ALLOWED', { reason: burning ? 'not-extinguished' : 'no-streak' });
      }
      if (verdict.allowed === false) throw new GameRefusal('RELIGHT_NOT_ALLOWED', { reason: verdict.reason });
      return { facts, broken };
    };

    const outcome = await this.spend.spend<{ streak: number; previousLongest: number; longest: number }>({
      userId,
      requestId,
      price: FLAME_RELIGHT_PRICE,
      kind: 'flame-relight',
      guard: () => decide(this.prisma).then(() => undefined),
      apply: async (tx) => {
        const { facts, broken } = await decide(tx);
        const restored = relightFlame({ today: facts.today, streakBeforeBreak: broken.streak });
        // Déjà agi aujourd'hui après la rupture : le geste du jour s'ajoute à
        // la série rendue, comme il l'aurait fait sans la rupture.
        const replay =
          facts.lastGestureDay === facts.today
            ? advanceFlame({ lastActiveDay: restored.lastActiveDay, today: facts.today, streak: restored.streak, freezes: facts.freezes })
            : null;
        const streak = replay?.streak ?? restored.streak;
        const lastDay = replay ? facts.today : restored.lastActiveDay;
        const longest = Math.max(facts.longest, streak);
        await tx.user.update({
          where: { id: userId },
          data: {
            currentStreakDays: streak,
            longestStreakDays: longest,
            lastStreakDate: markerOfDayKey(lastDay),
            lastRelightDay: facts.today,
            brokenStreakDays: null,
            brokenStreakLastDay: null,
          },
        });
        return { streak, previousLongest: facts.longest, longest };
      },
    });

    if (outcome.status === 'insufficient') throw new GameRefusal('INSUFFICIENT_MEESHES', { balance: outcome.balance });
    if (outcome.status === 'spent' && outcome.result) {
      await this.glory
        .creditFlameRecords({ userId, previousLongest: outcome.result.previousLongest, longest: outcome.result.longest })
        .catch(() => 0);
      return { status: 'relit', streak: outcome.result.streak, balance: outcome.balance };
    }
    const row = await this.userRow(this.prisma, userId);
    return { status: 'already-relit', streak: count(row.currentStreakDays), balance: outcome.balance };
  }

  /**
   * Annonce une veille de `days` jours à partir de demain (#17372). Idempotente par son CONTENU : la même veille
   * annoncée le même jour rend `already-paused`, sans seconde écriture — le `requestId` ne porte pas d'effet à
   * rejouer, puisque rien n'est payé. L'écriture est conditionnelle à la Flamme lue : un geste ou un rallumage
   * concurrent fait reprendre la décision.
   */
  async pause({ userId, days, now = new Date() }: WriteInput & { readonly days: number }): Promise<FlamePauseResult> {
    for (let attempt = 0; attempt < STREAK_WRITE_ATTEMPTS; attempt += 1) {
      const row = await this.userRow(this.prisma, userId);
      const facts = flameFactsOf(row, now);
      const asked: FlamePause = { from: addDays(facts.today, 1), until: addDays(facts.today, days) };
      if (facts.pause !== null && facts.pause.from === asked.from && facts.pause.until === asked.until) {
        return { status: 'already-paused', pause: asked };
      }
      const status = flameStatus({ lastActiveDay: facts.lastActiveDay, today: facts.today, streak: facts.streak, freezes: facts.freezes });
      const verdict = canPauseFlame({ today: facts.today, days, status, pause: facts.pause });
      if (!verdict.allowed) throw new GameRefusal('FLAME_PAUSE_NOT_ALLOWED', { reason: verdict.reason });
      const written = await this.prisma.user.updateMany({
        where: { id: userId, AND: flameUnchanged(row) },
        data: { flamePauseFrom: verdict.pause.from, flamePauseUntil: verdict.pause.until },
      });
      if (written.count === 1) return { status: 'paused', pause: verdict.pause };
    }
    throw new Error('flame pause contention');
  }

  /** Deux rêves complets dans les 48 h rallument la Flamme, sans payer (#20455). `null` tant que ce n'est pas gagné. */
  async relightByEffort(userId: string, now: Date = new Date()): Promise<EffortRelightResult> {
    const relit = await writeEffortRelight(this.prisma, userId, now);
    if (relit === null) return null;
    await this.glory.creditFlameRecords({ userId, previousLongest: relit.previousLongest, longest: relit.longest }).catch(() => 0);
    return { streak: relit.streak };
  }
}
