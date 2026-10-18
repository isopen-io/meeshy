import { describe, expect, test } from 'bun:test';

import type { GameBlock, GameChestReward } from '@meeshy/shared/types/game';
import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';
import { buildGameBlock, type GameBlockFacts } from '@meeshy/shared/utils/game/game-block';
import { buildGameBlockExtras, type GameBlockExtrasFacts } from '@meeshy/shared/utils/game/game-block-extras';
import { gloryLadder, GLORY_POINTS } from '@meeshy/shared/utils/game/glory';
import { levelThreshold } from '@meeshy/shared/utils/game/levels';
import type { SparksFacts } from '@meeshy/shared/utils/game/sparks';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { ALL_LEVEL_STEPS, gameExtrasFactsFixture, gameFactsFixture } from '@/lib/api/game-fixture';

import { afterMint, withChestReward } from './game-optimistic';
import { afterPrestige } from './game-optimistic-v2';

/**
 * L'OPTIMISTE REND CE QUE LA PASSERELLE SERVIRAIT (#10902) — pour un même compte, le geste rejoué en local et le bloc que
 * `buildGameBlock` bâtit sur les faits d'APRÈS le geste sont le MÊME bloc : étincelles, niveau, record, Vent arrière, prix
 * suivant, réserves du trésor, ligue et duo. Un champ que l'optimiste ne sait pas recalculer, il le garde ; il n'en invente
 * aucun.
 */

const base = resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE);
const served = (game: GameBlock): EngagementWithGame => ({ ...base, game });

const minGlory = (rank: string, division5: number): number =>
  gloryLadder().find((step) => step.rank === rank && step.division5 === division5)?.minGlory ?? Number.NaN;

const sparksAccount = (sparks: SparksFacts, patch: Partial<GameBlockFacts> = {}): GameBlockFacts =>
  gameFactsFixture({ ...ALL_LEVEL_STEPS, score: sparks.pocket, debitablePoints: sparks.pocket, sparks, chestMintBase: 5, ...patch });

const gameOf = (view: EngagementWithGame): GameBlock => {
  if (view.game === undefined) throw new Error('le bloc game est attendu');
  return view.game;
};

/** Les faits que la passerelle lit après UNE frappe : la poche paie, une Meesh de plus gardée et frappée, la Gloire de la frappe. */
const factsAfterMint = (facts: GameBlockFacts, price: number): GameBlockFacts => {
  const sparks = facts.sparks;
  if (sparks === undefined) throw new Error('un compte des étincelles est attendu');
  const pocket = sparks.pocket - price;
  return {
    ...facts,
    score: pocket,
    debitablePoints: pocket,
    sparks: { ...sparks, pocket },
    mintedLifetime: facts.mintedLifetime + 1,
    balance: facts.balance + 1,
    glory: facts.glory + GLORY_POINTS.mint,
  };
};

describe('la frappe optimiste rend le bloc que la passerelle servirait', () => {
  const cases: readonly { readonly label: string; readonly facts: GameBlockFacts }[] = [
    {
      label: 'record du cycle au niveau courant',
      facts: sparksAccount({ pocket: levelThreshold(20) + 500, cycle: 600_000, lifetime: 900_000, debt: 0 }, { levelRecord: 20, levelMaxLifetime: 40 }),
    },
    {
      label: 'record du cycle loin au-dessus : le Vent arrière souffle après la frappe',
      facts: sparksAccount({ pocket: levelThreshold(12) + 10, cycle: 600_000, lifetime: 900_000, debt: 0 }, { levelRecord: 19, levelMaxLifetime: 19 }),
    },
    {
      label: 'la Gloire de la frappe fait passer Voix I : le Coffre s’ouvre au trésor',
      facts: sparksAccount(
        { pocket: levelThreshold(30), cycle: 600_000, lifetime: 900_000, debt: 0 },
        { levelRecord: 30, levelMaxLifetime: 30, glory: minGlory('voix', 1) - GLORY_POINTS.mint, balance: 40, mintedLifetime: 40 },
      ),
    },
    {
      label: 'après deux Prestiges : le record de chaque cycle clos voyage avec le niveau (#10911)',
      facts: sparksAccount({ pocket: levelThreshold(20) + 500, cycle: 600_000, lifetime: 900_000, debt: 0 }, { levelRecord: 20, levelMaxLifetime: 150, prestige: 2, pastCycleRecords: [150, 100] }),
    },
  ];

  for (const { label, facts } of cases) {
    test(label, () => {
      const before = served(buildGameBlock(facts));
      const price = gameOf(before).mint.price;
      expect(gameOf(before).mint.canMint).toBe(true);
      expect(gameOf(afterMint(before))).toEqual(buildGameBlock(factsAfterMint(facts, price)));
    });
  }

  test('le trésor garde ses réserves après la frappe (#10848)', () => {
    const facts = cases[2]?.facts ?? sparksAccount({ pocket: 0, cycle: 0, lifetime: 0, debt: 0 });
    const after = gameOf(afterMint(served(buildGameBlock(facts))));
    expect(after.treasury.access?.find((reserve) => reserve.key === 'coffre')?.locked).toBe(false);
  });
});

describe('le coffre optimiste rend le bloc que la passerelle servirait', () => {
  const reward: GameChestReward = { points: 4_000, fragment: false, freeze: false, glory: 0, bonus: 'none', bonusPoints: 0 };
  const completed = (facts: GameBlockFacts): GameBlockFacts => ({
    ...facts,
    missions: facts.missions.map((mission) => ({ ...mission, progress: mission.target, completedAt: '2026-10-05T09:00:00.000Z' })),
  });

  const cases: readonly { readonly label: string; readonly sparks: SparksFacts; readonly patch: Partial<GameBlockFacts> }[] = [
    { label: 'sans dette : la poche, le cycle et le total à vie montent', sparks: { pocket: levelThreshold(12) + 10, cycle: 600_000, lifetime: 900_000, debt: 0 }, patch: { levelRecord: 19, levelMaxLifetime: 19 } },
    { label: 'sous une dette : le gain la rembourse d’abord', sparks: { pocket: levelThreshold(12) + 10, cycle: 600_000, lifetime: 900_000, debt: 1_500 }, patch: { levelRecord: 12, levelMaxLifetime: 12 } },
    { label: 'après un Prestige : le record du cycle clos voyage avec le niveau (#10911)', sparks: { pocket: levelThreshold(12) + 10, cycle: 600_000, lifetime: 900_000, debt: 0 }, patch: { levelRecord: 19, levelMaxLifetime: 120, prestige: 1, pastCycleRecords: [120] } },
  ];

  for (const { label, sparks, patch } of cases) {
    test(label, () => {
      const facts = completed(sparksAccount(sparks, patch));
      const before = served(buildGameBlock(facts));
      expect(gameOf(before).chest.status).toBe('ready');
      const debtAfter = Math.max(0, sparks.debt - reward.points);
      const pocket = sparks.pocket + reward.points - (sparks.debt - debtAfter);
      const after: GameBlockFacts = {
        ...facts,
        score: pocket,
        debitablePoints: pocket,
        sparks: { pocket, cycle: sparks.cycle + reward.points, lifetime: sparks.lifetime + reward.points, debt: debtAfter },
        chestClaimed: true,
        chestReward: reward,
      };
      expect(gameOf(withChestReward(before, reward, pocket))).toEqual(buildGameBlock(after));
    });
  }
});

describe('le Prestige optimiste rend le bloc que la passerelle servirait', () => {
  const sparks: SparksFacts = { pocket: levelThreshold(100) + 40, cycle: 1_500_000, lifetime: 2_000_000, debt: 0 };
  const facts = sparksAccount(sparks, { levelRecord: 100, levelMaxLifetime: 104, prestige: 1, glory: 60_000, pastCycleRecords: [150] });
  const extras = (patch: Partial<GameBlockExtrasFacts>): GameBlockExtrasFacts =>
    gameExtrasFactsFixture({ score: facts.score, levelRecord: facts.levelRecord, levelMaxLifetime: facts.levelMaxLifetime ?? null, prestige: facts.prestige, balance: facts.balance, flameDays: facts.streak, ...patch });
  const block = (blockFacts: GameBlockFacts, extrasFacts: GameBlockExtrasFacts): GameBlock => ({ ...buildGameBlock(blockFacts), ...buildGameBlockExtras(extrasFacts) });

  const before = served(block(facts, extras({})));
  const passed = gameOf(afterPrestige(before));
  const afterFacts: GameBlockFacts = {
    ...facts,
    score: 0,
    debitablePoints: 0,
    sparks: { pocket: 0, cycle: 0, lifetime: sparks.lifetime, debt: 0 },
    levelRecord: 1,
    levelMaxLifetime: 104,
    prestige: 2,
    glory: facts.glory + GLORY_POINTS.prestige,
    // Le cycle que le passage clôt rejoint la liste (#10911) — l'écriture même de la passerelle (`closedCycleRecord`).
    pastCycleRecords: [150, 100],
  };
  const expected = block(afterFacts, extras({ score: 0, levelRecord: 1, levelMaxLifetime: 104, prestige: 2 }));

  test('la proposition est ouverte avant le geste', () => {
    expect(gameOf(before).prestige?.canPrestige).toBe(true);
  });

  test('niveau, étincelles, Gloire, Vent arrière, prix suivant et trésor', () => {
    expect(passed.level).toEqual(expected.level);
    expect(passed.glory).toEqual(expected.glory);
    expect(passed.boosts).toEqual(expected.boosts);
    expect(passed.mint).toEqual(expected.mint);
    expect(passed.treasury).toEqual(expected.treasury);
  });

  test('la ligue et le duo restent ouverts : le niveau max à vie survit au passage', () => {
    expect(passed.league).toEqual(expected.league);
    expect(passed.duo).toEqual(expected.duo);
  });

  test('l’étoile se pose et la proposition se referme', () => {
    expect(passed.prestige).toEqual(expected.prestige);
  });

  test('le prix suivant est celui de la pièce SUIVANTE', () => {
    expect(passed.mint.number).toBe(facts.mintedLifetime + 1);
  });
});
