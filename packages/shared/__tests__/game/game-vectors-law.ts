/**
 * LE JEU, MIS EN VECTEURS (#9373) — la table des cas et l'évaluateur de la loi.
 *
 * `fixtures/reading-modes/game.vectors.json` est PRODUIT par ce fichier
 * (`buildGameVectors`) et REJOUÉ par `game.vectors.test.ts`, puis par iOS
 * (`GameLawVectorTests`) : chaque cas porte `input.law`, le nom de la loi, et
 * `expected` est la sortie de la loi TS. Sur divergence, c'est le TS qui a
 * raison — le miroir bouge, jamais le vecteur sans lui.
 *
 * Régénérer après un changement VOULU de la loi :
 * `UPDATE_GAME_VECTORS=1 npx vitest run __tests__/vectors/game.vectors.test.ts`.
 */

import { seedOf, seededRng } from '../../utils/game/day-prng.js';
import { tailwindFactor, prismHourWindow } from '../../utils/game/boosts.js';
import { dailyChest } from '../../utils/game/chest.js';
import {
  advanceFlame,
  canRelight,
  flameBonus,
  flameBonusPercent,
  flameForm,
  flameStatus,
} from '../../utils/game/flame.js';
import {
  gloryForAchievement,
  gloryForFlameRecords,
  gloryForNewLevels,
  gloryStanding,
  levelCapForGlory,
  levelCapForRank,
  type AchievementRarity,
} from '../../utils/game/glory.js';
import { guideMoment, type GuideEvent } from '../../utils/game/guide.js';
import { canPrestige, legacyLevelProgress, levelProgress, levelThreshold, newLevelsReached, recordLevel } from '../../utils/game/levels.js';
import { meeshEdition, meeshPrice, previewMint } from '../../utils/game/mint.js';
import {
  drawDailyMissions,
  missionObjective,
  missionReward,
  rerollDailyMission,
  type MissionSignal,
} from '../../utils/game/missions.js';
import { treasuryTier } from '../../utils/game/treasury.js';
import { GAME_VECTOR_LAWS_V2, buildGameVectorsV2, evaluateGameVectorV2, isGameVectorInputV2, type GameVectorInputV2 } from './game-vectors-law-v2.js';

export type GameVectorInputV1 =
  | { readonly law: 'level'; readonly score: number; readonly glory: number }
  | { readonly law: 'level-record'; readonly level: number; readonly previousRecord: number | null; readonly prestige: number }
  | { readonly law: 'mint-price'; readonly n: number }
  | { readonly law: 'mint-preview'; readonly score: number; readonly mintedLifetime: number; readonly debitablePoints: number; readonly glory: number }
  | { readonly law: 'glory-standing'; readonly glory: number; readonly mythic: boolean; readonly mythicSeat?: { readonly number: number; readonly edition: number } | null }
  | {
      readonly law: 'glory-gain';
      readonly rarity: AchievementRarity;
      readonly level: number;
      readonly previousRecord: number | null;
      readonly previousLongest: number;
      readonly longest: number;
    }
  | { readonly law: 'treasury'; readonly held: number }
  | { readonly law: 'flame-form'; readonly days: number }
  | { readonly law: 'flame-advance'; readonly lastActiveDay: string | null; readonly today: string; readonly streak: number; readonly freezes: number }
  | { readonly law: 'flame-status'; readonly lastActiveDay: string | null; readonly today: string; readonly streak: number; readonly freezes: number }
  | {
      readonly law: 'flame-relight';
      readonly lastActiveDay: string | null;
      readonly today: string;
      readonly streakBeforeBreak: number;
      readonly lastRelightDay: string | null;
      readonly balance: number;
    }
  | { readonly law: 'tailwind'; readonly level: number; readonly levelRecord: number }
  | { readonly law: 'prism-hour'; readonly userId: string; readonly dayKey: string }
  | { readonly law: 'mission-objective'; readonly baseTarget: number; readonly level: number }
  | { readonly law: 'mission-reward'; readonly basePoints: number; readonly level: number; readonly flameDays: number }
  | { readonly law: 'rng'; readonly userId: string; readonly dayKey: string; readonly salt: string }
  | {
      readonly law: 'missions-draw';
      readonly userId: string;
      readonly dayKey: string;
      readonly level: number;
      readonly flameDays: number;
      readonly treasury: number;
      readonly unavailableSignals: readonly MissionSignal[];
    }
  | {
      readonly law: 'mission-reroll';
      readonly userId: string;
      readonly dayKey: string;
      readonly level: number;
      readonly flameDays: number;
      readonly index: number;
      readonly rerollCount: number;
    }
  | { readonly law: 'chest'; readonly userId: string; readonly dayKey: string }
  | { readonly law: 'guide'; readonly event: GuideEvent; readonly seen: readonly string[] };

/** La vague 1 puis la vague 2 : un seul fichier de vecteurs, une seule table de lois. */
export type GameVectorInput = GameVectorInputV1 | GameVectorInputV2;

const round6 = (value: number): number => Math.round(value * 1e6) / 1e6;

/** La sortie de la loi pour une entrée : c'est elle que le fichier fige et qu'iOS rejoue. */
export function evaluateGameVector(input: GameVectorInput): unknown {
  if (isGameVectorInputV2(input)) return evaluateGameVectorV2(input);
  return evaluateGameVectorV1(input);
}

function evaluateGameVectorV1(input: GameVectorInputV1): unknown {
  switch (input.law) {
    case 'level': {
      const p = levelProgress(input.score, levelCapForGlory(input.glory));
      const legacy = legacyLevelProgress(input.score);
      return {
        level: p.level,
        tier: p.tier,
        floorScore: p.floorScore,
        nextThreshold: p.nextThreshold,
        pointsToNext: p.pointsToNext,
        progress: round6(p.progress),
        isMax: p.isMax,
        cap: p.cap,
        legacyLevel: legacy.level,
        legacyTier: legacy.tier,
      };
    }
    case 'level-record': {
      const fresh = newLevelsReached({ level: input.level, previousRecord: input.previousRecord });
      return {
        record: recordLevel({ level: input.level, previousRecord: input.previousRecord }),
        newLevelsFrom: fresh.from,
        newLevelsTo: fresh.to,
        newLevelsCount: fresh.count,
        canPrestige: canPrestige({ level: input.level, prestige: input.prestige }),
      };
    }
    case 'mint-price':
      return { price: meeshPrice(input.n), edition: meeshEdition(input.n) };
    case 'mint-preview':
      return previewMint({ ...input, levelCap: levelCapForGlory(input.glory) });
    case 'glory-standing': {
      const s = gloryStanding(input);
      return {
        rank: s.rank,
        division: s.division,
        division5: s.division5,
        divisionMinGlory: s.divisionMinGlory,
        nextRank: s.next?.rank ?? null,
        nextDivision: s.next?.division ?? null,
        nextDivision5: s.next?.division5 ?? null,
        nextMinGlory: s.next?.minGlory ?? null,
        gloryMissing: s.gloryMissing,
        progress: round6(s.progress),
        mythicNumber: s.mythic?.number ?? null,
        mythicEdition: s.mythic?.edition ?? null,
        levelCap: levelCapForRank(s.rank),
      };
    }
    case 'glory-gain':
      return {
        achievement: gloryForAchievement(input.rarity),
        newLevels: gloryForNewLevels({ level: input.level, previousRecord: input.previousRecord }),
        flameRecords: gloryForFlameRecords({ previousLongest: input.previousLongest, longest: input.longest }),
      };
    case 'treasury': {
      const t = treasuryTier(input.held);
      return { tier: t.tier, nextKey: t.next?.key ?? null, missing: t.next?.missing ?? null };
    }
    case 'flame-form':
      return { form: flameForm(input.days), bonusPercent: flameBonusPercent(input.days), bonus: round6(flameBonus(input.days)) };
    case 'flame-advance':
      return advanceFlame(input);
    case 'flame-status':
      return { status: flameStatus(input) };
    case 'flame-relight':
      return canRelight(input);
    case 'tailwind':
      return { factor: tailwindFactor(input) };
    case 'prism-hour':
      return prismHourWindow(input);
    case 'mission-objective':
      return { target: missionObjective(input) };
    case 'mission-reward':
      return { reward: missionReward(input) };
    case 'rng': {
      const rng = seededRng(input);
      return { seed: seedOf(input), draws: [rng(), rng(), rng(), rng(), rng()] };
    }
    case 'missions-draw':
      return drawDailyMissions(input);
    case 'mission-reroll': {
      const today = drawDailyMissions({ ...input, unavailableSignals: [] });
      return {
        mission: rerollDailyMission({ ...input, missions: today.missions }),
      };
    }
    case 'chest':
      return dailyChest(input);
    case 'guide':
      return guideMoment(input.event, input.seen);
  }
}

const vector = (_label: string, input: GameVectorInput) => ({ _label, input, expected: evaluateGameVector(input) });

const SEEDS: readonly (readonly [string, string])[] = [
  ['u1', '2026-10-05'],
  ['6502f1a2b3c4d5e6f7a8b9c0', '2026-10-05'],
  ['6502f1a2b3c4d5e6f7a8b9c0', '2026-10-06'],
  ['6502f1a2b3c4d5e6f7a8b9c0', '2026-10-07'],
  ['amélie-été', '2026-02-28'],
  ['user-with-a-rather-long-identifier-0001', '2028-02-29'],
  ['', '2026-12-31'],
  ['7a7a', '2027-01-01'],
];

export function buildGameVectors() {
  const levels = [0, 9, 10, 39, 40, 89, 90, 249, 250, 999, 1000, 12_180, 24_999, 25_000, 56_250, 99_999, 100_000, 400_000]
    .map((score) => vector(`niveau pour un score de ${score}`, { law: 'level', score, glory: 0 }))
    .concat(
      [
        [levelThreshold(101), 0],
        [levelThreshold(200) - 1, 0],
        [levelThreshold(499), 129_999],
        [levelThreshold(500), 129_999],
        [levelThreshold(500), 130_000],
        [levelThreshold(1000), 379_999],
        [levelThreshold(1001), 379_999],
        [levelThreshold(1001), 380_000],
        [levelThreshold(2000) + 1234, 600_000],
        [levelThreshold(3000), 1_000_000],
      ].map(([score, glory]) => vector(`niveau ouvert par le rang : score ${score}, ${glory} de Gloire`, { law: 'level', score: score!, glory: glory! })),
    );

  const records = [
    { level: 34, previousRecord: 30, prestige: 0 },
    { level: 32, previousRecord: 36, prestige: 0 },
    { level: 2, previousRecord: null, prestige: 0 },
    { level: 100, previousRecord: 99, prestige: 4 },
    { level: 100, previousRecord: 100, prestige: 5 },
    { level: 640, previousRecord: 499, prestige: 0 },
    { level: 1000, previousRecord: 1000, prestige: 2 },
  ].map((c) => vector(`record niveau ${c.level}, ancien ${c.previousRecord}`, { law: 'level-record', ...c }));

  const prices = [1, 10, 11, 21, 50, 51, 100, 101, 150, 200, 249, 250, 251, 999, 1000, 2000, 0].map((n) =>
    vector(`prix de la Meesh n° ${n}`, { law: 'mint-price', n }),
  );

  const previews = [
    { score: 12_180, mintedLifetime: 12, debitablePoints: 12_180 },
    { score: 2250, mintedLifetime: 0, debitablePoints: 2250 },
    { score: 100_000, mintedLifetime: 99, debitablePoints: 100_000 },
    { score: 2000, mintedLifetime: 0, debitablePoints: 1000 },
    { score: 9000, mintedLifetime: 999, debitablePoints: 9000 },
    { score: 1300, mintedLifetime: 0, debitablePoints: 1300 },
  ]
    .map((c) => ({ ...c, glory: 0 }))
    .concat([
      { score: levelThreshold(640), mintedLifetime: 40, debitablePoints: levelThreshold(640), glory: 0 },
      { score: levelThreshold(640), mintedLifetime: 40, debitablePoints: levelThreshold(640), glory: 200_000 },
      { score: levelThreshold(1001) + 500, mintedLifetime: 300, debitablePoints: levelThreshold(1001) + 500, glory: 400_000 },
    ])
    .map((c) => vector(`aperçu de frappe : score ${c.score}, ${c.mintedLifetime} frappées, ${c.glory} de Gloire`, { law: 'mint-preview', ...c }));

  const glories = [
    0, 399, 400, 1999, 2000, 2799, 2800, 3600, 4400, 5199, 5200, 5999, 6000, 14_999, 15_000, 34_999, 35_000, 69_999, 70_000, 129_999,
    130_000, 229_999, 230_000, 379_999, 380_000, 599_999, 600_000, 680_000, 919_999, 920_000, 999_999, 1_000_000, 3_000_000,
  ].map(
    (glory) => vector(`rang pour ${glory} de Gloire`, { law: 'glory-standing', glory, mythic: false }),
  ).concat([
    vector('Mythe place 1, émission 1, servi par le serveur', { law: 'glory-standing', glory: 1_000_000, mythic: true, mythicSeat: { number: 1, edition: 1 } }),
    vector('Mythe place 100, émission 137, gardé même sous le seuil', { law: 'glory-standing', glory: 3000, mythic: true, mythicSeat: { number: 100, edition: 137 } }),
    vector('Mythe sur le seul drapeau, sans numéro', { law: 'glory-standing', glory: 1_200_000, mythic: true }),
    vector('place 101 ignorée : Légende I', { law: 'glory-standing', glory: 1_000_000, mythic: false, mythicSeat: { number: 101, edition: 1 } }),
  ]);

  const gains = [
    { rarity: 'common', level: 34, previousRecord: 30, previousLongest: 6, longest: 7 },
    { rarity: 'rare', level: 20, previousRecord: 25, previousLongest: 0, longest: 31 },
    { rarity: 'epic', level: 2, previousRecord: null, previousLongest: 99, longest: 365 },
    { rarity: 'legendary', level: 50, previousRecord: 49, previousLongest: 365, longest: 400 },
    { rarity: 'mythic', level: 100, previousRecord: 98, previousLongest: 0, longest: 0 },
    { rarity: 'common', level: 120, previousRecord: 98, previousLongest: 0, longest: 0 },
    { rarity: 'common', level: 1000, previousRecord: 100, previousLongest: 0, longest: 0 },
    { rarity: 'common', level: 1500, previousRecord: 999, previousLongest: 0, longest: 0 },
  ].map((c) => vector(`gains de Gloire (${c.rarity}, niveau ${c.level}, série ${c.longest})`, { law: 'glory-gain', ...(c as { rarity: AchievementRarity; level: number; previousRecord: number | null; previousLongest: number; longest: number }) }));

  const treasuries = [0, 1, 9, 10, 49, 50, 99, 100, 499, 500, 999, 1000, 5000].map((held) =>
    vector(`trésor de ${held} Meeshes`, { law: 'treasury', held }),
  );

  const forms = [0, 1, 6, 7, 29, 30, 99, 100, 364, 365, 800].map((days) =>
    vector(`Flamme de ${days} jours`, { law: 'flame-form', days }),
  );

  const advances = [
    { lastActiveDay: null, today: '2026-10-05', streak: 0, freezes: 0 },
    { lastActiveDay: '2026-10-05', today: '2026-10-05', streak: 4, freezes: 1 },
    { lastActiveDay: '2026-10-04', today: '2026-10-05', streak: 4, freezes: 1 },
    { lastActiveDay: '2026-10-03', today: '2026-10-05', streak: 10, freezes: 2 },
    { lastActiveDay: '2026-10-02', today: '2026-10-05', streak: 10, freezes: 2 },
    { lastActiveDay: '2026-10-01', today: '2026-10-05', streak: 10, freezes: 2 },
    { lastActiveDay: '2026-10-03', today: '2026-10-05', streak: 6, freezes: 0 },
    { lastActiveDay: '2026-12-31', today: '2027-01-02', streak: 6, freezes: 1 },
  ].map((c) => vector(`transition de Flamme ${c.lastActiveDay} → ${c.today}, série ${c.streak}, ${c.freezes} gel`, { law: 'flame-advance', ...c }));

  const statuses = [
    { lastActiveDay: null, today: '2026-10-05', streak: 0, freezes: 0 },
    { lastActiveDay: '2026-10-05', today: '2026-10-05', streak: 8, freezes: 0 },
    { lastActiveDay: '2026-10-04', today: '2026-10-05', streak: 8, freezes: 0 },
    { lastActiveDay: '2026-10-03', today: '2026-10-05', streak: 8, freezes: 2 },
    { lastActiveDay: '2026-10-02', today: '2026-10-05', streak: 8, freezes: 0 },
  ].map((c) => vector(`état de Flamme ${c.lastActiveDay} → ${c.today}, ${c.freezes} gel`, { law: 'flame-status', ...c }));

  const relights = [
    { lastActiveDay: '2026-10-02', today: '2026-10-03', streakBeforeBreak: 12, lastRelightDay: null, balance: 3 },
    { lastActiveDay: '2026-10-02', today: '2026-10-04', streakBeforeBreak: 12, lastRelightDay: null, balance: 3 },
    { lastActiveDay: '2026-10-02', today: '2026-10-05', streakBeforeBreak: 12, lastRelightDay: null, balance: 3 },
    { lastActiveDay: '2026-10-02', today: '2026-10-06', streakBeforeBreak: 12, lastRelightDay: null, balance: 3 },
    { lastActiveDay: '2026-10-02', today: '2026-10-04', streakBeforeBreak: 12, lastRelightDay: '2026-10-01', balance: 3 },
    { lastActiveDay: '2026-10-02', today: '2026-10-04', streakBeforeBreak: 12, lastRelightDay: '2026-09-28', balance: 3 },
    { lastActiveDay: '2026-10-02', today: '2026-10-04', streakBeforeBreak: 12, lastRelightDay: null, balance: 2 },
    { lastActiveDay: '2026-10-02', today: '2026-10-04', streakBeforeBreak: 0, lastRelightDay: null, balance: 9 },
  ].map((c) => vector(`rallumage ${c.lastActiveDay} → ${c.today}, mois ${c.lastRelightDay}, ${c.balance} Meeshes`, { law: 'flame-relight', ...c }));

  const tailwinds = [
    { level: 32, levelRecord: 36 },
    { level: 36, levelRecord: 36 },
    { level: 40, levelRecord: 36 },
  ].map((c) => vector(`Vent arrière niveau ${c.level}, record ${c.levelRecord}`, { law: 'tailwind', ...c }));

  const prismHours = SEEDS.map(([userId, dayKey]) => vector(`Heure du Prisme de « ${userId} » le ${dayKey}`, { law: 'prism-hour', userId, dayKey }));

  const objectives = [
    [5, 5],
    [5, 34],
    [5, 50],
    [3, 50],
    [1, 50],
    [4, 50],
    [20, 100],
    [8, 17],
  ].map(([baseTarget, level]) => vector(`objectif base ${baseTarget} niveau ${level}`, { law: 'mission-objective', baseTarget: baseTarget!, level: level! }));

  const rewards = [
    [30, 5, 0],
    [60, 34, 23],
    [30, 34, 23],
    [250, 50, 40],
    [120, 99, 25],
    [60, 100, 365],
  ].map(([basePoints, level, flameDays]) =>
    vector(`récompense base ${basePoints} niveau ${level}, Flamme ${flameDays} j`, {
      law: 'mission-reward',
      basePoints: basePoints!,
      level: level!,
      flameDays: flameDays!,
    }),
  );

  const rngs = SEEDS.map(([userId, dayKey]) => vector(`suite de « ${userId} » le ${dayKey}`, { law: 'rng', userId, dayKey, salt: 'missions' }));

  const draws = SEEDS.flatMap(([userId, dayKey], i) => [
    vector(`missions de « ${userId} » le ${dayKey}, niveau 20`, {
      law: 'missions-draw',
      userId,
      dayKey,
      level: 20,
      flameDays: 5,
      treasury: 0,
      unavailableSignals: [],
    }),
    vector(`missions de « ${userId} » le ${dayKey}, niveau ${i % 2 === 0 ? 50 : 12} avec trésor ${i % 2 === 0 ? 0 : 50}`, {
      law: 'missions-draw',
      userId,
      dayKey,
      level: i % 2 === 0 ? 50 : 12,
      flameDays: 23,
      treasury: i % 2 === 0 ? 0 : 50,
      unavailableSignals: [],
    }),
  ]).concat([
    vector('missions sans signal de langue ni réaction', {
      law: 'missions-draw',
      userId: 'u1',
      dayKey: '2026-10-05',
      level: 20,
      flameDays: 5,
      treasury: 0,
      unavailableSignals: ['foreign-language-message', 'axis:tool.reaction'],
    }),
  ]);

  const rerolls = [0, 1, 2].map((index) =>
    vector(`changer la mission ${index} de u1`, {
      law: 'mission-reroll',
      userId: 'u1',
      dayKey: '2026-10-05',
      level: 30,
      flameDays: 5,
      index,
      rerollCount: 1,
    }),
  );

  const chests = SEEDS.map(([userId, dayKey]) => vector(`coffre de « ${userId} » le ${dayKey}`, { law: 'chest', userId, dayKey }));

  const events: readonly GuideEvent[] = [
    { kind: 'first-level', level: 2, pointsToNext: 50 },
    { kind: 'new-tier', tier: 'lueur', nextTierLevel: 20 },
    { kind: 'missions-unlocked' },
    { kind: 'first-mint-possible', price: 1221, levelsLost: 5, gloryGain: 100 },
    { kind: 'first-mint', levelBefore: 14, levelAfter: 9, tailwindUntilLevel: 14 },
    { kind: 'badge-extinguished', missingActions: 37 },
    { kind: 'price-rises', nextPrice: 1294 },
    { kind: 'new-rank', rank: 'voix', division: 2, glory: 2200, gloryMissing: 634 },
    { kind: 'new-rank', rank: 'mythe', division: null, glory: 200_000, gloryMissing: null },
    { kind: 'treasury-tier', tier: 'escarcelle', nextTierMissing: 40 },
    { kind: 'flame-at-risk', days: 12 },
    { kind: 'flame-out', lostDays: 12, relightPrice: 3, canRelight: true },
    { kind: 'return-after-absence', daysAway: 9 },
    { kind: 'level-100', canPrestige: true },
  ];
  const guides = events.flatMap((event) => [
    vector(`guide « ${event.kind} » la première fois`, { law: 'guide', event, seen: [] }),
    vector(`guide « ${event.kind} » déjà vu`, { law: 'guide', event, seen: [event.kind] }),
  ]);

  return [
    ...levels,
    ...records,
    ...prices,
    ...previews,
    ...glories,
    ...gains,
    ...treasuries,
    ...forms,
    ...advances,
    ...statuses,
    ...relights,
    ...tailwinds,
    ...prismHours,
    ...objectives,
    ...rewards,
    ...rngs,
    ...draws,
    ...rerolls,
    ...chests,
    ...guides,
    ...buildGameVectorsV2(),
  ];
}

export { GAME_VECTOR_LAWS_V2 };

export const GAME_VECTORS_FORMAT = {
  input:
    "{ law, ...paramètres } — `law` nomme la loi du Jeu Meeshy (level, level-record, mint-price, mint-preview, glory-standing, glory-gain, treasury, flame-form, flame-advance, flame-status, flame-relight, tailwind, prism-hour, mission-objective, mission-reward, rng, missions-draw, mission-reroll, chest, guide, puis — vague 2, #9384 à #9392 — league-week, league-week-points, league-access, league-pseudonym, league-pseudonym-draw, league-pseudonym-check, league-snapshot, league-groups, league-settle, league-friends, league-visibility, duo-draw, duo-progress, duo-reward, duo-invite, duo-transition, season-calendar, season-at, season-progress, season-reward, season-claim, season-settlement, season-stars, season-seal, trophy-key, trophy-parse, trophy-flame, showcase-order, showcase-view, showcase-cap, trophy-month, atlas, atlas-language, prestige, rarity, rarity-display, mythic-seats, mythic-crossing, mythic-signature, badge-tier, badge-served, guide-v2, guide-choose, photo-moment). Les jours sont des clés AAAA-MM-JJ ; le jour, le fuseau et la graine sont des paramètres.",
  expected:
    'La sortie de la loi TS (packages/shared/utils/game/*) : level → {level, tier, floorScore, nextThreshold, pointsToNext, progress, isMax, cap (null : sans limite), legacyLevel, legacyTier} — le plafond se lit sur la Gloire (`glory`) ; mint-price → {price, edition} ; glory-standing → {rank, division (héritée 1–3), division5 (V=5 à I=1), …, mythicNumber, mythicEdition, levelCap (499, 1000 ou null)} ; flame-* → la transition ou la décision ; rng → {seed FNV-1a 32 bits de « userId|jour|sel », 5 tirages mulberry32} ; missions-draw → {dayKey, prismDay, missions[]} ; guide → le moment ; league-groups → {groups:[{groupId, memberIds}]} ; league-settle → {settled:[{userId, weekPoints, rank, zone, cup, outcome}], pointsToPromotion} ; season-calendar → le calendrier ; atlas → le résumé et les entrées ; rarity → {rarity, measured, border, glory} ; guide-v2 / guide-choose / photo-moment → le moment, la carte choisie, l\'emblème. Les fractions sont arrondies à 1e-6 et comparées à 1e-4.',
  provenance:
    "Contrat cross-plateforme de la loi du Jeu Meeshy (#9373, vague 2 #9384 à #9392 : les cas de la vague 2 viennent APRÈS ceux de la vague 1, jamais mêlés). TS le produit (__tests__/game/game-vectors-law.ts) et le rejoue (__tests__/vectors/game.vectors.test.ts) ; iOS le rejoue (GameLawVectorTests). Sur divergence, c'est le TS qui a raison — le miroir bouge, jamais le vecteur sans lui. Régénérer : UPDATE_GAME_VECTORS=1 npx vitest run __tests__/vectors/game.vectors.test.ts.",
} as const;
