import { describe, expect, it } from 'vitest';
import { birdLayoutOf, normalizeColor, targetOfSlug, usageOfTarget } from '../scripts/glory-frames-normalize';

describe('le normaliseur lit la cible d’un cadre dans son identifiant, avec les clés de la loi', () => {
  it('rangs à division, rangs à décorations, Mythe', () => {
    expect(targetOfSlug('savane', 'ambassadeur-5')).toEqual({ appliesTo: { family: 'rank', rank: 'ambassadeur', division: 5 }, option: 'V' });
    expect(targetOfSlug('neon', 'oracle-b')).toEqual({ appliesTo: { family: 'rank', rank: 'oracle', division: null }, option: 'B' });
    expect(targetOfSlug('egypte', 'mythe-c')).toEqual({ appliesTo: { family: 'rank', rank: 'mythe', division: null }, option: 'C' });
  });

  it('moments et trésor ; jamais la prose du manifeste', () => {
    expect(targetOfSlug('moments', 'palier-aurore')?.appliesTo).toEqual({ family: 'tier', tier: 'aurore' });
    expect(targetOfSlug('moments', 'flamme-365')?.appliesTo).toEqual({ family: 'flame', days: 365 });
    expect(['1', '10', '100', '1000'].map((n) => targetOfSlug('moments', `meesh-${n}`)?.appliesTo)).toEqual(
      ['first', 'silver', 'gold', 'prism'].map((edition) => ({ family: 'meesh', edition })),
    );
    expect(targetOfSlug('moments', 'meesh-7')).toBeNull();
    expect(targetOfSlug('moments', 'jour-b')).toEqual({ appliesTo: { family: 'day' }, option: 'b' });
    expect(targetOfSlug('tresor', 'coffre-c')).toEqual({ appliesTo: { family: 'treasury', treasury: 'coffre' }, option: 'c' });
    expect(targetOfSlug('savane', 'coffre-c')).toBeNull();
  });

  it('un cadre de rang sert son RANG, toutes divisions (D3 : les cinq décorations du rang se proposent à chaque division)', () => {
    expect(usageOfTarget({ family: 'rank', rank: 'ambassadeur', division: 3 })).toEqual({ kind: 'rank', rank: 'ambassadeur' });
    expect(usageOfTarget({ family: 'treasury', treasury: 'bourse' })).toEqual({ kind: 'moment', family: 'treasury' });
    expect(usageOfTarget({ family: 'achievement', rarity: null })).toEqual({ kind: 'achievement' });
  });
});

describe('les couleurs deviennent des données #RRGGBBAA', () => {
  it('hex court, long, avec alpha, rgb() avec opacité', () => {
    expect(normalizeColor('#fff')).toBe('#FFFFFFFF');
    expect(normalizeColor('#E8B53C')).toBe('#E8B53CFF');
    expect(normalizeColor('#00000099')).toBe('#00000099');
    expect(normalizeColor('rgb(255, 244, 194)', 0.5)).toBe('#FFF4C280');
    expect(() => normalizeColor('gold')).toThrow();
  });
});

describe('la mise en page des oiseaux, ramenée à la liste fermée', () => {
  it('le premier mot du manifeste, accents et pluriels compris ; une paire seule est un duo ; le selfie reste nommé', () => {
    expect(birdLayoutOf('perchés (Mee coucou, Meo cool)', 2)).toBe('perches');
    expect(birdLayoutOf('côtés', 2)).toBe('cotes');
    expect(birdLayoutOf('pied : Mee et Meo', 1)).toBe('duo');
    expect(birdLayoutOf('selfie : Meo prend la photo', 1)).toBe('selfie');
    expect(birdLayoutOf('balustrade', 2)).toBe('libre');
  });
});
