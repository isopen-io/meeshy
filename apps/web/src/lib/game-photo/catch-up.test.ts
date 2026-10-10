import { describe, expect, test } from 'bun:test';

import { photoCatchUp, photoStepsReached } from '@meeshy/shared/utils/game/photo-catch-up';

import { gameBlockFixture } from '@/lib/api/game-fixture';
import { levelReading } from '@/lib/game/ladder';
import { shownRank } from '@/lib/view/game-copy';

import { catchUpMoments, catchUpStandingOf } from './catch-up';

/**
 * LE RATTRAPAGE DU CARNET (#9961, #9962) — l'état du jeu servi dit quelles
 * étapes sont franchies ; chaque étape devient un moment COMPLET (emblème et
 * deux lignes), dont l'identité est celle de l'étape, donc celle qu'une photo
 * gardée en direct porte déjà.
 */
describe('la situation lue dans le bloc du jeu', () => {
  test('rang et division servis, record du niveau, Prestige, Meeshes frappées, trésor', () => {
    const game = gameBlockFixture({ glory: 35_000, mintedLifetime: 12, balance: 400, prestige: 1 });
    const standing = catchUpStandingOf(game);
    const shown = shownRank(game.glory);
    expect(standing).toEqual({
      rank: shown.rank,
      division: shown.division,
      levelRecord: levelReading(game.level).record,
      prestige: 1,
      minted: 12,
      treasuryTier: game.treasury.tier,
      flameRecord: Math.max(game.level.ladder?.steps?.flameRecord ?? 0, game.flame.days),
    });
  });

  test('la Flamme retient le plus long : le record gravé, ou la série en cours si elle le dépasse', () => {
    expect(catchUpStandingOf(gameBlockFixture({ flameRecord: 40, streak: 6 })).flameRecord).toBe(40);
    expect(catchUpStandingOf(gameBlockFixture({ flameRecord: 4, streak: 9 })).flameRecord).toBe(9);
  });

  test('aucune Meesh frappée : zéro, jamais un nombre négatif', () => {
    expect(catchUpStandingOf(gameBlockFixture({ mintedLifetime: 0 })).minted).toBe(0);
  });
});

describe('chaque étape devient un moment complet', () => {
  const game = gameBlockFixture({ glory: 35_000, mintedLifetime: 21, balance: 5_000, prestige: 2, levelRecord: 100, flameRecord: 120, streak: 6 });
  const standing = catchUpStandingOf(game);
  const steps = photoStepsReached(standing);

  test('l’identité du moment EST celle de l’étape, piste par piste', () => {
    const entries = photoCatchUp(standing, []);
    const moments = catchUpMoments(entries);
    expect(moments.map((m) => m.moment.id)).toEqual(entries.map((e) => e.id));
    expect(new Set(steps.map((s) => s.track))).toEqual(new Set(['start', 'rank', 'tier', 'summit', 'meesh', 'treasury', 'flame']));
  });

  test('l’état ouvert ou fermé et l’étape qui bloque voyagent avec le moment', () => {
    const [first, second] = catchUpMoments(photoCatchUp(standing, ['start'])).filter((m) => m.track === 'meesh');
    expect(first).toMatchObject({ state: 'open', blockedBy: null });
    expect(second).toMatchObject({ state: 'locked', blockedBy: first?.moment.id });
  });

  test('l’emblème garde ce que dit l’étape : le sommet, le Prestige numéroté, la Meesh et son édition, la Flamme', () => {
    const byId = new Map(catchUpMoments(photoCatchUp(standing, [])).map((m) => [m.moment.id, m.moment]));
    expect(byId.get('level-100:0')?.emblem).toEqual({ kind: 'level-hundred', prestige: 0 });
    expect(byId.get('prestige:2')?.emblem).toEqual({ kind: 'prestige', number: 2 });
    expect(byId.get('meesh:10')?.emblem).toEqual({ kind: 'meesh', number: 10, edition: 'silver' });
    expect(byId.get('flame:100')?.emblem).toMatchObject({ kind: 'flame', days: 100 });
    expect(byId.get('start')?.title).toBe('Mon départ sur Meeshy');
  });
});
