/**
 * LA SITUATION DU CARNET LUE DANS LE BLOC `game` (#10155) — une seule dérivation, que le web, iOS et le
 * job serveur partagent. Le bloc vient du producteur (`buildGameBlock`), jamais d'une forme écrite à la main.
 */

import { describe, it, expect } from 'vitest';
import { buildGameBlock, type GameBlockFacts } from '../../utils/game/game-block.js';
import { catchUpStandingOf } from '../../utils/game/photo-catch-up.js';
import { parseGameBlock } from '../../types/game.js';

const facts = (over: Partial<GameBlockFacts> = {}): GameBlockFacts => ({
  userId: 'u1',
  today: '2026-10-05',
  score: 121_800,
  levelRecord: 36,
  prestige: 1,
  glory: 7000,
  mythic: false,
  mintedLifetime: 12,
  missionsDone: 3,
  flameRecord: 23,
  debitablePoints: 121_800,
  balance: 9,
  streak: 4,
  lastActiveDay: '2026-10-05',
  broken: null,
  freezes: 1,
  lastRelightDay: null,
  missions: [],
  rerollsUsedToday: 0,
  chestClaimed: false,
  chestReward: null,
  guideSeen: [],
  ...over,
});

describe('la situation lue dans le bloc du jeu', () => {
  it('rang et division servis, record du niveau, Prestige, Meeshes frappées, trésor, Flamme record', () => {
    const game = buildGameBlock(facts());
    expect(catchUpStandingOf(game)).toEqual({
      rank: game.glory.rank,
      division: game.glory.division5 ?? game.glory.division,
      levelRecord: game.level.ladder?.record ?? game.level.record,
      prestige: 1,
      minted: 12,
      treasuryTier: game.treasury.tier,
      flameRecord: 23,
    });
  });

  it('devant un ancien serveur : la division héritée et le record d’hier', () => {
    const served = buildGameBlock(facts());
    const { ladder: _ladder, ...level } = served.level;
    const { division5: _division5, ...glory } = served.glory;
    const standing = catchUpStandingOf({ ...served, level, glory });
    expect(standing.division).toBe(served.glory.division);
    expect(standing.levelRecord).toBe(served.level.record);
    expect(standing.flameRecord).toBe(served.flame.days);
  });

  it('la Flamme retient le plus long : la série en cours si elle dépasse le record gravé', () => {
    expect(catchUpStandingOf(buildGameBlock(facts({ flameRecord: 4, streak: 9 }))).flameRecord).toBe(9);
  });

  it('aucune Meesh frappée : zéro, jamais un nombre négatif', () => {
    expect(catchUpStandingOf(buildGameBlock(facts({ mintedLifetime: 0 }))).minted).toBe(0);
  });

  it('le record de chaque cycle clos, quand le bloc le sert (#10911) ; absent devant un serveur antérieur', () => {
    expect(catchUpStandingOf(buildGameBlock(facts({ pastCycleRecords: [120] }))).pastCycleRecords).toEqual([120]);
    expect('pastCycleRecords' in catchUpStandingOf(buildGameBlock(facts()))).toBe(false);
  });

  it('le contrat partagé garde le record des cycles clos : un champ non déclaré serait retiré à la validation', () => {
    expect(parseGameBlock(buildGameBlock(facts({ pastCycleRecords: [120] })))?.level.ladder?.pastCycleRecords).toEqual([120]);
  });
});
