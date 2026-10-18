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

import { CHEST_ODDS, chestContentForEffort, dayEffort } from './chest.js';
import { prismHourWindow, PRISM_HOUR_MULTIPLIER, sparksTailwindFactor, tailwindFactor } from './boosts.js';
import {
  FLAME_FREEZE_MAX,
  FLAME_FREEZE_PRICE,
  FLAME_RELIGHT_PRICE,
  canRelight,
  flameBonusPercent,
  flameForm,
  flameStatus,
} from './flame.js';
import { gloryStanding, levelCapForRank, type MythicSeatRef } from './glory.js';
import type { LevelStepFacts } from './level-steps.js';
import { meeshPrice, previewMint } from './mint.js';
import { levelSparksOf, previewSparksMint, type SparksFacts } from './sparks.js';
import { levelOnTheWire, mintOnTheWire } from './level-wire.js';
import { MISSIONS_MIN_LEVEL, MISSION_REROLL_PER_DAY, MISSION_REROLL_PRICE, isPrismDay } from './missions.js';
import { personalMissionState } from './personal-mission.js';
import { treasuryReserveAccess, treasuryTier } from './treasury.js';
import { buildGameBlockExtras, type GameBlockExtrasFacts } from './game-block-extras.js';
import type { GameBlock, GameChestReward, GameMission } from '../../types/game.js';

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
  /**
   * Le score en poche (`User.engagementScore`) — la loi d'HIER, où la frappe le débite et le fait baisser le niveau.
   * Avec `sparks`, il est ignoré.
   */
  readonly score: number;
  /**
   * LES ÉTINCELLES (#10846) : la poche que la frappe dépense et que lit le NIVEAU (#10892), le cycle (depuis le
   * dernier prestige) et le total à vie, indicatifs. Présentes, c'est la loi d'aujourd'hui : le prix de la frappe suit
   * le niveau ACTUEL (#10847), les réserves du trésor s'ouvrent par le rang (#10848), le Vent arrière souffle à 7 niveaux
   * ou plus sous le record (#10896).
   * Absentes, le bloc garde exactement la forme d'hier.
   */
  readonly sparks?: SparksFacts;
  /** Le niveau max à vie (#10846), qui survit au prestige. Lu seulement avec `sparks`. */
  readonly levelMaxLifetime?: number | null;
  /** Le record de chaque cycle clos par un Prestige (#10911, `User.prestigeLevelRecords`). Absent : le champ ne part pas. */
  readonly pastCycleRecords?: readonly number[];
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
  /**
   * Les Meeshes frappées AVANT l'ouverture du jour de jeu (#10219, `chestPriceCutoff`), gravées sur `GameDay.chestMintBase` : le
   * cours de la prime du coffre. Absent ou `null` : `mintedLifetime`, le calcul d'avant.
   */
  readonly chestMintBase?: number | null;
  /** Missions du jour accomplies à vie, comptées jusqu'à `LEVEL_STEP_MISSIONS_COUNTED` (#9706). */
  readonly missionsDone: number;
  /** La plus longue Flamme, en jours — le record que jugent les étapes 40 et 90 (#9706). */
  readonly flameRecord: number;
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
  /** Le contenu servi du coffre ouvert — un jour d'avant #10011 n'a ni Gloire ni prime. */
  readonly chestReward: GameChestReward | null;
  /**
   * Les fragments d'étoile collectés à vie, toutes sources confondues (#10011, `star-fragments.ts`) — LUS par la
   * passerelle. Absent : elle ne les sert pas.
   */
  readonly starFragments?: number;
  readonly guideSeen: readonly string[];
  /**
   * Les faits de la VAGUE 2 (ligues, duo, saison, trophées, Atlas, Prestige,
   * visibilité). Absents, le bloc garde exactement la forme de la vague 1 — un
   * serveur qui n'a pas encore ces données persistées ne sert rien de plus.
   */
  readonly extras?: GameBlockExtrasFacts;
};

export function buildGameBlock(facts: GameBlockFacts): GameBlock {
  const standing = gloryStanding({ glory: facts.glory, mythic: facts.mythic, mythicSeat: facts.mythicSeat ?? null });
  const levelCap = levelCapForRank(standing.rank);
  const steps: LevelStepFacts = {
    minted: facts.mintedLifetime,
    missionsDone: facts.missionsDone,
    flameRecord: facts.flameRecord,
    glory: standing.glory,
    rank: standing.rank,
  };
  const sparks = facts.sparks;
  const level = levelOnTheWire({
    score: sparks === undefined ? facts.score : levelSparksOf(sparks),
    levelCap,
    levelRecord: facts.levelRecord,
    prestige: facts.prestige,
    steps,
    ...(sparks === undefined ? {} : { sparks, levelMaxLifetime: facts.levelMaxLifetime ?? null }),
    ...(facts.pastCycleRecords === undefined ? {} : { pastCycleRecords: facts.pastCycleRecords }),
  });
  const record = level.ladder?.record ?? level.record;
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
    level,
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
    treasury: {
      held: treasury.held,
      tier: treasury.tier,
      next: treasury.next,
      ...(sparks === undefined ? {} : { access: [...treasuryReserveAccess({ glory: standing.glory, mythic: standing.rank === 'mythe' })] }),
    },
    mint: mintOnTheWire(
      sparks === undefined
        ? previewMint({
            score: facts.score,
            mintedLifetime: facts.mintedLifetime,
            debitablePoints: facts.debitablePoints,
            levelCap,
            steps,
          })
        : previewSparksMint({
            sparks: sparks.pocket,
            mintedLifetime: facts.mintedLifetime,
            held: facts.balance,
            glory: standing.glory,
            mythic: standing.rank === 'mythe',
            levelCap,
            steps,
            debt: sparks.debt,
          }),
    ),
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
      // Le contenu CERTAIN et les primes possibles, dits avant l'ouverture (#10011) : l'effort des missions du
      // jour tirées, et le cours de la prochaine Meesh du compte, figé au début du jour de jeu (#10219).
      today:
        facts.missions.length === 0 ? null : chestContentForEffort(dayEffort(facts.missions), meeshPrice((facts.chestMintBase ?? facts.mintedLifetime) + 1)),
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
      // Avec les étincelles, le Vent arrière souffle à 7 niveaux ou plus sous le record (#10896) ; sans, la loi d'hier.
      tailwind: (sparks === undefined ? tailwindFactor : sparksTailwindFactor)({ level: level.ladder?.level ?? level.level, levelRecord: record }),
      prismHour: { ...prismHourWindow({ userId: facts.userId, dayKey: facts.today }), multiplier: PRISM_HOUR_MULTIPLIER },
    },
    guideSeen: [...facts.guideSeen],
    ...(facts.starFragments === undefined ? {} : { starFragments: { collected: Math.max(0, Math.trunc(facts.starFragments)) } }),
    ...(facts.extras === undefined ? {} : buildGameBlockExtras(facts.extras)),
  };
}
