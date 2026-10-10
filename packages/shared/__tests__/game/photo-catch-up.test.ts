/**
 * LE RATTRAPAGE DU CARNET (#9961, #9962) : chaque étape passée sans photo se propose, dans l'ordre.
 */

import { describe, it, expect } from 'vitest';
import {
  photoCatchUp,
  photoOfferFor,
  photoStepsReached,
  photoTrackOf,
  type PhotoCatchUpStanding,
} from '../../utils/game/photo-catch-up.js';

const standing = (overrides: Partial<PhotoCatchUpStanding> = {}): PhotoCatchUpStanding => ({
  rank: 'murmure',
  division: 5,
  levelRecord: 1,
  prestige: 0,
  minted: 0,
  treasuryTier: null,
  flameRecord: 0,
  ...overrides,
});

const ids = (entries: readonly { readonly id: string }[]): string[] => entries.map((entry) => entry.id);

describe('les étapes franchies', () => {
  it('un compte neuf ne franchit que le départ', () => {
    expect(ids(photoStepsReached(standing()))).toEqual(['start']);
  });

  it('les Meeshes se photographient à la première puis chaque dixième', () => {
    const meesh = photoStepsReached(standing({ minted: 53 })).filter((step) => step.track === 'meesh');
    expect(ids(meesh)).toEqual(['meesh:1', 'meesh:10', 'meesh:20', 'meesh:30', 'meesh:40', 'meesh:50']);
  });

  it('une Meesh centième porte son édition or', () => {
    const hundred = photoStepsReached(standing({ minted: 100 })).find((step) => step.id === 'meesh:100');
    expect(hundred?.emblem).toEqual({ kind: 'meesh', number: 100, edition: 'gold' });
  });

  it('le rang monte division par division, de Murmure IV au rang servi, sans le point de départ', () => {
    const ranks = ids(photoStepsReached(standing({ rank: 'echo', division: 4 })).filter((step) => step.track === 'rank'));
    expect(ranks).toEqual([
      'rank:murmure:4',
      'rank:murmure:3',
      'rank:murmure:2',
      'rank:murmure:1',
      'rank:echo:5',
      'rank:echo:4',
    ]);
  });

  it('le Mythe vient après Légende I, sans division', () => {
    const ranks = ids(photoStepsReached(standing({ rank: 'mythe', division: null })).filter((step) => step.track === 'rank'));
    expect(ranks.at(-2)).toBe('rank:legende:1');
    expect(ranks.at(-1)).toBe('rank:mythe:0');
  });

  it('les paliers de niveau suivent le record, avec leur premier niveau', () => {
    const tiers = photoStepsReached(standing({ levelRecord: 34 })).filter((step) => step.track === 'tier');
    expect(ids(tiers)).toEqual(['tier:lueur', 'tier:lumiere', 'tier:eclat']);
    expect(tiers[2]?.emblem).toEqual({ kind: 'tier', tier: 'eclat', level: 30 });
  });

  it('le sommet puis chaque Prestige', () => {
    const summit = ids(photoStepsReached(standing({ levelRecord: 100, prestige: 2 })).filter((step) => step.track === 'summit'));
    expect(summit).toEqual(['level-100:0', 'prestige:1', 'prestige:2']);
  });

  it('le trésor jusqu’au palier tenu, la Flamme jusqu’au record', () => {
    const reached = photoStepsReached(standing({ treasuryTier: 'coffret', flameRecord: 45 }));
    expect(ids(reached.filter((step) => step.track === 'treasury'))).toEqual(['treasury:bourse', 'treasury:escarcelle', 'treasury:coffret']);
    expect(ids(reached.filter((step) => step.track === 'flame'))).toEqual(['flame:7', 'flame:30']);
  });
});

describe('le rattrapage dans l’ordre', () => {
  it('seule la première étape sans photo de chaque piste est ouverte', () => {
    const meesh = photoCatchUp(standing({ minted: 53 }), ['start', 'meesh:1', 'meesh:10', 'meesh:20', 'meesh:30']).filter(
      (entry) => entry.track === 'meesh',
    );
    expect(meesh.map((entry) => [entry.id, entry.state, entry.blockedBy])).toEqual([
      ['meesh:40', 'open', null],
      ['meesh:50', 'locked', 'meesh:40'],
    ]);
  });

  it('une photo gardée ouvre l’étape suivante', () => {
    const before = photoCatchUp(standing({ minted: 53 }), ['meesh:1', 'meesh:10', 'meesh:20', 'meesh:30']);
    const after = photoCatchUp(standing({ minted: 53 }), ['meesh:1', 'meesh:10', 'meesh:20', 'meesh:30', 'meesh:40']);
    expect(before.find((entry) => entry.id === 'meesh:50')?.state).toBe('locked');
    expect(after.find((entry) => entry.id === 'meesh:50')?.state).toBe('open');
  });

  it('les pistes ne s’attendent pas entre elles', () => {
    const open = photoCatchUp(standing({ minted: 12, flameRecord: 8 }), []).filter((entry) => entry.state === 'open');
    expect(ids(open)).toEqual(['start', 'meesh:1', 'flame:7']);
  });

  it('un carnet complet ne propose plus rien', () => {
    expect(photoCatchUp(standing({ minted: 1 }), ['start', 'meesh:1'])).toEqual([]);
  });
});

describe('une seule proposition à la fois', () => {
  it('une transition qui produit plusieurs moments n’en propose qu’un, le plus marquant', () => {
    const s = standing({ rank: 'murmure', division: 4, minted: 10, levelRecord: 10 });
    const kept = ['start', 'meesh:1'];
    expect(photoOfferFor(['meesh:10', 'tier:lueur', 'rank:murmure:4'], s, kept)).toBe('rank:murmure:4');
  });

  it('une Meesh 50 sans la 40 propose la 40', () => {
    const s = standing({ minted: 50 });
    const kept = ['start', 'meesh:1', 'meesh:10', 'meesh:20', 'meesh:30'];
    expect(photoOfferFor(['meesh:50'], s, kept)).toBe('meesh:40');
  });

  it('un moment hors piste (succès, trophée) passe tel quel', () => {
    expect(photoOfferFor(['achievement:first_message'], standing(), ['start'])).toBe('achievement:first_message');
  });

  it('rien à proposer quand la piste est déjà photographiée', () => {
    expect(photoOfferFor(['meesh:1'], standing({ minted: 1 }), ['start', 'meesh:1'])).toBeNull();
  });

  it('la piste se lit dans l’identité', () => {
    expect(photoTrackOf('rank:voix:2')).toBe('rank');
    expect(photoTrackOf('level-100:0')).toBe('summit');
    expect(photoTrackOf('prestige:3')).toBe('summit');
    expect(photoTrackOf('league-up:2026-W40:or')).toBeNull();
  });
});
