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
 *  - `buyFreeze` : 1 Meesh, 2 en réserve au plus ;
 *  - `relight` : 3 Meeshes, dans les 48 h, une fois par mois.
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
  flameStatus,
  relightFlame,
  type FlameOutcome,
} from '@meeshy/shared/utils/game/flame';
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
  brokenStreakDays: true,
  brokenStreakLastDay: true,
} as const;

/** Ce que Prisma relit d'un compte : tout peut être ABSENT sur un compte antérieur. */
export type FlameUserRow = {
  readonly currentStreakDays?: number | null;
  readonly longestStreakDays?: number | null;
  readonly lastStreakDate?: Date | null;
  readonly timezone?: string | null;
  readonly flameFreezes?: number | null;
  readonly lastRelightDay?: string | null;
  readonly brokenStreakDays?: number | null;
  readonly brokenStreakLastDay?: string | null;
};

export type FlameFacts = {
  readonly today: string;
  readonly streak: number;
  readonly longest: number;
  readonly lastActiveDay: string | null;
  readonly freezes: number;
  readonly lastRelightDay: string | null;
  readonly brokenStreak: number | null;
  readonly brokenLastDay: string | null;
};

const count = (value: number | null | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;

export function flameFactsOf(row: FlameUserRow, now: Date): FlameFacts {
  return {
    today: dayKeyOf(now, row.timezone),
    streak: count(row.currentStreakDays),
    longest: count(row.longestStreakDays),
    lastActiveDay: row.lastStreakDate ? civilDayKey(row.lastStreakDate) : null,
    freezes: count(row.flameFreezes),
    lastRelightDay: row.lastRelightDay ?? null,
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
  /** Ce que le compte doit porter ensuite ; `null` ⇒ rien à écrire (déjà actif aujourd'hui). */
  readonly data: Prisma.UserUpdateManyMutationInput | null;
};

/** La transition de série du geste du jour, appliquée à l'état courant. */
export function planStreak(facts: FlameFacts): StreakPlan {
  const transition = advanceFlame({
    lastActiveDay: facts.lastActiveDay,
    today: facts.today,
    streak: facts.streak,
    freezes: facts.freezes,
  });
  if (transition.outcome === 'same-day') {
    return { outcome: 'same-day', streak: facts.streak, longest: facts.longest, previousLongest: facts.longest, data: null };
  }
  const longest = Math.max(facts.longest, transition.streak);
  return {
    outcome: transition.outcome,
    streak: transition.streak,
    longest,
    previousLongest: facts.longest,
    data: {
      currentStreakDays: transition.streak,
      longestStreakDays: longest,
      lastStreakDate: markerOfDayKey(facts.today),
      ...(transition.freezesUsed > 0 ? { flameFreezes: transition.freezes } : {}),
      ...(transition.outcome === 'broken' && transition.lostStreak > 0 && facts.lastActiveDay !== null
        ? { brokenStreakDays: transition.lostStreak, brokenStreakLastDay: facts.lastActiveDay }
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

/**
 * La Flamme telle qu'on l'a LUE : la condition d'une écriture comparer-et-écrire.
 * Chaque écrivain de la série (geste du jour, gel acheté ou offert, rallumage)
 * change au moins un champ optionnel gardé ici. Les deux compteurs requis
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
          facts.lastActiveDay === facts.today
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
}
