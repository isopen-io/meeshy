import { describe, expect, test } from 'bun:test';

import { gameBlockFixture } from '@/lib/api/game-fixture';

import { chestDetail } from './game-detail';

describe('la fiche de précisions du coffre du jour (#10567)', () => {
  test('fermé, verrouillé ou prêt : aucune précision sur son contenu', () => {
    const locked = gameBlockFixture().chest;
    expect(locked.reward).toBeNull();
    expect(chestDetail(locked).facts).toEqual([]);
    expect(chestDetail({ ...locked, status: 'ready' }).facts).toEqual([]);
  });

  test('ouvert : son contenu réel se dit', () => {
    const chest = gameBlockFixture().chest;
    const opened = chestDetail({ ...chest, status: 'claimed', reward: { points: 120, fragment: true, freeze: false } });
    expect(opened.facts).toHaveLength(1);
    expect(opened.facts[0]?.value).toContain('120');
  });
});
