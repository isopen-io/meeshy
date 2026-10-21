import { describe, expect, it } from 'vitest';
import {
  CONSTELLATION_COSMETIC_KINDS,
  CONSTELLATION_FRAGMENTS_PER_STAR,
  constellationOf,
  constellationStarCosmetic,
  constellationVisitorBound,
  constellationVisitorBoundInstant,
  countsForVisitor,
  isConstellationCosmeticKey,
} from '../../utils/game/constellation.js';

describe('la constellation (#10053, décision du porteur du 2026-10-11)', () => {
  it('une étoile s\'allume tous les dix fragments d\'étoile collectés : étoiles = ⌊total ÷ 10⌋', () => {
    expect(CONSTELLATION_FRAGMENTS_PER_STAR).toBe(10);
    expect(constellationOf(0).stars).toBe(0);
    expect(constellationOf(9).stars).toBe(0);
    expect(constellationOf(10).stars).toBe(1);
    expect(constellationOf(19).stars).toBe(1);
    expect(constellationOf(20).stars).toBe(2);
    expect(constellationOf(137).stars).toBe(13);
  });

  it('dit où en est l\'étoile suivante, sans jamais dépenser un fragment', () => {
    expect(constellationOf(0)).toMatchObject({ collected: 0, stars: 0, inStar: 0, toNextStar: 10 });
    expect(constellationOf(7)).toMatchObject({ collected: 7, stars: 0, inStar: 7, toNextStar: 3 });
    expect(constellationOf(10)).toMatchObject({ collected: 10, stars: 1, inStar: 0, toNextStar: 10 });
    expect(constellationOf(23)).toMatchObject({ collected: 23, stars: 2, inStar: 3, toNextStar: 7 });
  });

  it('un total illisible ou négatif est une constellation éteinte', () => {
    for (const bad of [-1, -40, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(constellationOf(bad)).toEqual({ collected: 0, stars: 0, inStar: 0, toNextStar: 10, cosmetics: [] });
    }
    expect(constellationOf(25.9).stars).toBe(2);
  });

  it('chaque étoile allumée débloque UN cosmétique de profil, à clé déterministe', () => {
    expect(CONSTELLATION_COSMETIC_KINDS).toEqual(['halo', 'frame', 'sparkle']);
    expect(constellationStarCosmetic(1)).toEqual({ star: 1, kind: 'halo', cosmeticKey: 'constellation.star-1.halo' });
    expect(constellationStarCosmetic(2)).toEqual({ star: 2, kind: 'frame', cosmeticKey: 'constellation.star-2.frame' });
    expect(constellationStarCosmetic(3)).toEqual({ star: 3, kind: 'sparkle', cosmeticKey: 'constellation.star-3.sparkle' });
    expect(constellationStarCosmetic(4)).toEqual({ star: 4, kind: 'halo', cosmeticKey: 'constellation.star-4.halo' });
    expect(constellationStarCosmetic(0)).toBeNull();
    expect(constellationStarCosmetic(-2)).toBeNull();
    expect(constellationStarCosmetic(1.5)).toBeNull();
    expect(constellationOf(35).cosmetics.map((c) => c.cosmeticKey)).toEqual([
      'constellation.star-1.halo',
      'constellation.star-2.frame',
      'constellation.star-3.sparkle',
    ]);
  });

  it('une clé de cosmétique de constellation se reconnaît, et elle seule', () => {
    expect(isConstellationCosmeticKey('constellation.star-1.halo')).toBe(true);
    expect(isConstellationCosmeticKey('constellation.star-12.sparkle')).toBe(true);
    expect(isConstellationCosmeticKey('constellation.star-2.halo')).toBe(false);
    expect(isConstellationCosmeticKey('constellation.star-0.halo')).toBe(false);
    expect(isConstellationCosmeticKey('season-1.seal-1')).toBe(false);
  });

  it('aucune valeur : ni points, ni Meesh, ni argent — la constellation ne porte que des étoiles et des clés', () => {
    const shape = constellationOf(42);
    expect(Object.keys(shape).sort()).toEqual(['collected', 'cosmetics', 'inStar', 'stars', 'toNextStar']);
    shape.cosmetics.forEach((c) => expect(Object.keys(c).sort()).toEqual(['cosmeticKey', 'kind', 'star']));
  });
});

describe('la constellation vue par un visiteur est figée au mois (#10053, présence)', () => {
  it('la borne est aussi un INSTANT : minuit UTC du 1er du mois', () => {
    expect(constellationVisitorBoundInstant('2026-10-01').toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('la borne est le 1er du mois courant (UTC) : rien de ce mois ne se voit', () => {
    expect(constellationVisitorBound(new Date('2026-10-11T12:00:00Z'))).toBe('2026-10-01');
    expect(constellationVisitorBound(new Date('2026-10-31T23:59:59Z'))).toBe('2026-10-01');
    expect(constellationVisitorBound(new Date('2026-11-01T00:00:00Z'))).toBe('2026-11-01');
  });

  it('un coffre compte s’il est d’un jour d’avant la borne ; une saison, si elle s’est terminée avant', () => {
    expect(countsForVisitor({ dayKey: '2026-09-30' }, '2026-10-01')).toBe(true);
    expect(countsForVisitor({ dayKey: '2026-10-01' }, '2026-10-01')).toBe(false);
    expect(countsForVisitor({ season: 1 }, '2027-02-14')).toBe(false);
    expect(countsForVisitor({ season: 1 }, '2027-03-01')).toBe(true);
    // Une étape se réclame jusqu'au dimanche 20 h LOCAL de la fin : deux jours de marge sur la borne UTC.
    expect(countsForVisitor({ season: 1 }, '2027-02-16')).toBe(false);
    expect(countsForVisitor({ season: 1 }, '2027-02-17')).toBe(true);
    expect(countsForVisitor({ season: 0 }, '2099-01-01')).toBe(false);
  });
});
