import { beforeAll, describe, expect, test } from 'bun:test';

import { gloryLadder } from '@meeshy/shared/utils/game/glory';

import { gameBlockFixture } from '@/lib/api/game-fixture';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';

import { rankDetail } from './game-detail';

/**
 * LA FICHE DU BLASON (#9636) — la division V..I servie, le rang suivant à sa division, la place du
 * Mythe, et le niveau que le blason grave. Un serveur d'avant #9636 retombe sur la division héritée.
 */
beforeAll(async () => {
  await loadGameCatalog('fr');
});

const at = (rank: string, division5: number): number => gloryLadder().find((s) => s.rank === rank && s.division5 === division5)!.minGlory;

describe('rankDetail', () => {
  test('la division à cinq crans nomme le rang et le suivant ; le blason porte le niveau', () => {
    const game = gameBlockFixture({ glory: at('voix', 4) });
    const detail = rankDetail(game.glory, game.level.level);
    expect(detail.name).toBe('Voix IV');
    expect(detail.emblem).toEqual({ kind: 'rank', rank: 'voix', division: 4, mythic: null, level: game.level.level });
    expect(JSON.stringify(detail.facts)).toContain('Voix III');
  });

  test('un Mythe : sa place dans le nom, son émission sur le blason', () => {
    const game = gameBlockFixture({ glory: 1_000_000, mythic: true, mythicSeat: { number: 4, edition: 9 } });
    const detail = rankDetail(game.glory, 100);
    expect(detail.name).toBe('Mythe n° 4');
    expect(detail.emblem).toEqual({ kind: 'rank', rank: 'mythe', division: null, mythic: { number: 4, edition: 9 }, level: 100 });
  });

  test('un serveur d’avant #9636 : la division héritée, sans place ni niveau inventés', () => {
    const { division5: _d5, mythic: _m, ...legacy } = gameBlockFixture({ glory: at('voix', 4) }).glory;
    const detail = rankDetail({ ...legacy, next: legacy.next === null ? null : { rank: legacy.next.rank, division: legacy.next.division, minGlory: legacy.next.minGlory } });
    expect(detail.name).toBe('Voix III');
    expect(detail.emblem).toEqual({ kind: 'rank', rank: 'voix', division: 3, mythic: null, level: null });
  });
});
