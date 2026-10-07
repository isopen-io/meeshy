/**
 * L'ASSEMBLEUR DU BLOC `game` (#9378) — la partie DÉRIVÉE, écrite une fois.
 *
 * La passerelle sait ce qu'elle PERSISTE (score, record, Gloire, solde, série,
 * gels, missions et leur avancement, coffre, clés de guide) ; tout le reste se
 * déduit par les lois de ce dossier. Elle passe ses faits ici plutôt que de
 * recomposer niveau, rang, prix, Flamme et boosts à la main : c'est la
 * recomposition par site qui fait diverger les clients.
 *
 * Pur : `today` (clé de jour dans le fuseau de l'utilisateur) est un paramètre.
 */

import type { DailyChest } from './chest.js';
import { CHEST_ODDS } from './chest.js';
import { prismHourWindow, PRISM_HOUR_MULTIPLIER, tailwindFactor } from './boosts.js';
import {
  FLAME_FREEZE_MAX,
  FLAME_FREEZE_PRICE,
  FLAME_RELIGHT_PRICE,
  canRelight,
  flameBonusPercent,
  flameForm,
  flameStatus,
} from './flame.js';
import { gloryStanding, type MythicSeatRef } from './glory.js';
import { canPrestige, levelProgress, recordLevel } from './levels.js';
import { previewMint } from './mint.js';
import { MISSIONS_MIN_LEVEL, MISSION_REROLL_PER_DAY, MISSION_REROLL_PRICE, isPrismDay } from './missions.js';
import { personalMissionState } from './personal-mission.js';
import { treasuryTier } from './treasury.js';
import { buildGameBlockExtras, type GameBlockExtrasFacts } from './game-block-extras.js';
import type { GameBlock, GameMission } from '../../types/game.js';

/** Une mission telle que la passerelle la persiste. */
export type GameMissionRecord = GameMission;

export type GameBlockFacts = {
  readonly userId: string;
  /**
   * Clé de la JOURNÉE DE JEU `AAAA-MM-JJ` (missions, coffre, boosts) : celle du
   * fuseau de l'utilisateur, rendue monotone (`resolveGameDayKey`).
   */
  readonly today: string;
  /**
   * Clé de jour CIVILE de la Flamme, quand elle diffère de la journée de jeu
   * (une journée ouverte il y a moins de 20 h continue après minuit) — repli
   * `today`.
   */
  readonly flameToday?: string;
  /** Le score en poche (`User.engagementScore`). */
  readonly score: number;
  readonly levelRecord: number | null;
  readonly prestige: number;
  readonly glory: number;
  /**
   * Le Mythe, fourni par le serveur (#9636) : `mythicSeat` porte la place (1 à 100) et l'émission (sa
   * Signature). `mythic` reste pour l'appelant qui ne connaît que le rang servi.
   */
  readonly mythic: boolean;
  readonly mythicSeat?: MythicSeatRef | null;
  readonly mintedLifetime: number;
  readonly debitablePoints: number;
  /** Meeshes gardées (le trésor). */
  readonly balance: number;
  /**
   * La série STOCKÉE (celle du dernier jour actif) : le bloc rend `days: 0`
   * quand `flameStatus` la dit éteinte, sans que la passerelle l'ait déjà remise
   * à zéro.
   */
  readonly streak: number;
  readonly lastActiveDay: string | null;
  /**
   * La série ROMPUE que le rallumage rendrait, avec son dernier jour actif
   * d'AVANT la rupture — `null` quand rien n'est rompu. Tant que le joueur n'est
   * pas revenu, c'est la série stockée elle-même ; s'il est revenu et que
   * `advanceFlame` a rendu `broken`, la passerelle a gardé `lostStreak` et
   * l'ancien dernier jour pour la fenêtre de 48 h.
   */
  readonly broken: { readonly streak: number; readonly lastActiveDay: string } | null;
  readonly freezes: number;
  readonly lastRelightDay: string | null;
  readonly missions: readonly GameMissionRecord[];
  /** La mission personnelle du jour (#9539) : sa plage, et l'instant qui fixe son état. Absente : rien n'est servi. */
  readonly personalMission?: {
    readonly record: GameMissionRecord;
    readonly startsAt: string;
    readonly endsAt: string;
    readonly now: string;
  } | null;
  readonly rerollsUsedToday: number;
  readonly chestClaimed: boolean;
  readonly chestReward: DailyChest | null;
  readonly guideSeen: readonly string[];
  /**
   * Les faits de la VAGUE 2 (ligues, duo, saison, trophées, Atlas, Prestige,
   * visibilité). Absents, le bloc garde exactement la forme de la vague 1 — un
   * serveur qui n'a pas encore ces données persistées ne sert rien de plus.
   */
  readonly extras?: GameBlockExtrasFacts;
};

export function buildGameBlock(facts: GameBlockFacts): GameBlock {
  const progress = levelProgress(facts.score);
  const record = recordLevel({ level: progress.level, previousRecord: facts.levelRecord });
  const standing = gloryStanding({ glory: facts.glory, mythic: facts.mythic, mythicSeat: facts.mythicSeat ?? null });
  const treasury = treasuryTier(facts.balance);

  const flameToday = facts.flameToday ?? facts.today;
  const status = flameStatus({
    lastActiveDay: facts.lastActiveDay,
    today: flameToday,
    streak: facts.streak,
    freezes: facts.freezes,
  });
  const days = status === 'out' ? 0 : Math.max(0, Math.trunc(facts.streak));
  const relight = canRelight({
    lastActiveDay: facts.broken?.lastActiveDay ?? null,
    today: flameToday,
    streakBeforeBreak: facts.broken?.streak ?? 0,
    lastRelightDay: facts.lastRelightDay,
    balance: facts.balance,
  });

  const unlocked = record >= MISSIONS_MIN_LEVEL;
  const allDone = facts.missions.length > 0 && facts.missions.every((m) => m.completedAt !== null);
  const chestStatus = facts.chestClaimed ? 'claimed' : allDone ? 'ready' : 'locked';

  return {
    level: {
      level: progress.level,
      tier: progress.tier,
      score: progress.score,
      floorScore: progress.floorScore,
      nextThreshold: progress.nextThreshold,
      pointsToNext: progress.pointsToNext,
      progress: progress.progress,
      record,
      prestige: facts.prestige,
      canPrestige: canPrestige({ level: progress.level, prestige: facts.prestige }),
    },
    glory: {
      glory: standing.glory,
      rank: standing.rank,
      division: standing.division,
      division5: standing.division5,
      next: standing.next,
      gloryMissing: standing.gloryMissing,
      progress: standing.progress,
      mythic: standing.mythic,
    },
    treasury: { held: treasury.held, tier: treasury.tier, next: treasury.next },
    mint: previewMint({
      score: facts.score,
      mintedLifetime: facts.mintedLifetime,
      debitablePoints: facts.debitablePoints,
    }),
    missions: {
      dayKey: facts.today,
      prismDay: isPrismDay({ userId: facts.userId, dayKey: facts.today }),
      unlocked,
      items: [...facts.missions],
      ...(facts.personalMission == null
        ? {}
        : {
            personal: {
              ...facts.personalMission.record,
              startsAt: facts.personalMission.startsAt,
              endsAt: facts.personalMission.endsAt,
              state: personalMissionState({
                startsAt: new Date(facts.personalMission.startsAt),
                endsAt: new Date(facts.personalMission.endsAt),
                completedAt: facts.personalMission.record.completedAt === null ? null : new Date(facts.personalMission.record.completedAt),
                now: new Date(facts.personalMission.now),
              }),
            },
          }),
      rerollAvailable:
        unlocked &&
        facts.missions.some((m) => m.completedAt === null) &&
        facts.rerollsUsedToday < MISSION_REROLL_PER_DAY &&
        facts.balance >= MISSION_REROLL_PRICE,
    },
    chest: {
      status: chestStatus,
      odds: { ...CHEST_ODDS },
      reward: chestStatus === 'claimed' ? facts.chestReward : null,
    },
    flame: {
      days,
      form: flameForm(days),
      bonusPercent: flameBonusPercent(days),
      freezes: facts.freezes,
      maxFreezes: FLAME_FREEZE_MAX,
      freezePrice: FLAME_FREEZE_PRICE,
      relightPrice: FLAME_RELIGHT_PRICE,
      status,
      canRelight: relight.allowed,
    },
    boosts: {
      tailwind: tailwindFactor({ level: progress.level, levelRecord: record }),
      prismHour: { ...prismHourWindow({ userId: facts.userId, dayKey: facts.today }), multiplier: PRISM_HOUR_MULTIPLIER },
    },
    guideSeen: [...facts.guideSeen],
    ...(facts.extras === undefined ? {} : buildGameBlockExtras(facts.extras)),
  };
}
