import { describe, expect, test } from 'bun:test';

import type { GameBlock } from '@meeshy/shared/types/game';

import { levelMaxReading, sparksReading } from './ladder';

/**
 * LES ÉTINCELLES ET LE NIVEAU MAX, tels que l'écran les lit (porteur 2026-10-16) : la poche en grand, le total à vie en
 * petit ; le niveau actuel et le niveau max à vie. Devant un serveur antérieur (aucun champ neuf), la poche est l'ancien
 * score et le reste n'est pas inventé.
 */
const level = (over: Partial<GameBlock['level']> = {}): GameBlock['level'] =>
  ({
    level: 34,
    tier: 'eclat',
    score: 9000,
    floorScore: 8100,
    nextThreshold: 10000,
    pointsToNext: 1000,
    progress: 0.4,
    record: 36,
    prestige: 0,
    canPrestige: false,
    ...over,
  }) as GameBlock['level'];

describe('sparksReading', () => {
  test('lit la poche, le total à vie et la dette servis', () => {
    expect(sparksReading(level({ sparks: 300, sparksCycle: 9000, sparksLifetime: 5_000_000_000, sparksDebt: 40 }))).toEqual({ pocket: 300, cycle: 9000, lifetime: 5_000_000_000, debt: 40 });
  });

  test('devant un serveur antérieur : la poche est l\'ancien score, le total à vie n\'est pas inventé, aucune dette', () => {
    expect(sparksReading(level())).toEqual({ pocket: 9000, cycle: null, lifetime: null, debt: 0 });
  });
});

describe('levelMaxReading', () => {
  test('lit le niveau max à vie servi', () => {
    expect(levelMaxReading(level({ levelMaxLifetime: 52 }))).toBe(52);
  });

  test('préfère ladder.levelMaxLifetime (la lecture au-delà de 100)', () => {
    expect(levelMaxReading(level({ levelMaxLifetime: 52, ladder: { level: 640, tier: 'amas', levelMaxLifetime: 700 } as GameBlock['level']['ladder'] }))).toBe(700);
  });

  test('sans champ servi : le record, jamais sous le niveau actuel', () => {
    expect(levelMaxReading(level({ record: 36 }))).toBe(36);
    expect(levelMaxReading(level({ record: 3 }))).toBe(34);
  });
});
