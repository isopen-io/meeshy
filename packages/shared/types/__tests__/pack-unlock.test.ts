/**
 * #11276 — la boutique dit ce qui RESTE à débloquer et COMMENT l'obtenir :
 * le rang (Gloire actuelle et seuil), le trophée, la saison, la fenêtre.
 */
import { describe, expect, it } from 'vitest';
import { packRequirementPreview, type PackUnlockFacts } from '../pack-unlock';

const facts = (over: Partial<PackUnlockFacts> = {}): PackUnlockFacts => ({
  rank: 'echo',
  glory: 2500,
  trophyKeys: new Set<string>(),
  seasonNumbers: new Set<number>(),
  ...over,
});
const now = new Date('2026-11-10T00:00:00Z');

describe('packRequirementPreview', () => {
  it('un pack de rang : la Gloire actuelle, le seuil du rang, ce qui manque', () => {
    expect(packRequirementPreview({ reward: { kind: 'rank', rank: 'voix' } }, { facts: facts(), now })).toEqual({
      met: false,
      reward: { kind: 'rank', rank: 'voix', currentRank: 'echo', requirement: { current: 2500, required: 6000, missing: 3500, met: false } },
      window: null,
    });
  });

  it('un Mythe a rempli tout rang', () => {
    const preview = packRequirementPreview({ reward: { kind: 'rank', rank: 'legende' } }, { facts: facts({ rank: 'mythe', glory: 1_200_000 }), now });
    expect(preview?.met).toBe(true);
    expect(preview?.reward).toMatchObject({ requirement: { missing: 0, met: true } });
  });

  it('un pack de trophée ou de saison dit s’il est rempli', () => {
    expect(packRequirementPreview({ reward: { kind: 'trophy', key: 'coupe' } }, { facts: facts(), now })?.reward).toEqual({ kind: 'trophy', key: 'coupe', met: false });
    expect(packRequirementPreview({ reward: { kind: 'season', number: 3 } }, { facts: facts({ seasonNumbers: new Set([3]) }), now })?.reward).toEqual({ kind: 'season', number: 3, met: true });
  });

  it('la fenêtre : à venir, ouverte ou fermée, avec ses bornes', () => {
    const availability = { startsAt: '2026-12-01T00:00:00.000Z', endsAt: '2026-12-31T00:00:00.000Z' };
    expect(packRequirementPreview({ availability }, { facts: facts(), now })).toEqual({
      met: false,
      reward: null,
      window: { state: 'upcoming', startsAt: availability.startsAt, endsAt: availability.endsAt },
    });
  });

  it('une règle remplie dans une fenêtre ouverte : le pack est à débloquer maintenant', () => {
    const preview = packRequirementPreview(
      { reward: { kind: 'season', number: 2 }, availability: { endsAt: '2026-12-31T00:00:00.000Z' } },
      { facts: facts({ seasonNumbers: new Set([2]) }), now },
    );
    expect(preview).toMatchObject({ met: true, window: { state: 'open', endsAt: '2026-12-31T00:00:00.000Z' } });
  });

  it('rien à débloquer (ni récompense ni fenêtre) : null', () => {
    expect(packRequirementPreview({}, { facts: facts(), now })).toBeNull();
  });
});
