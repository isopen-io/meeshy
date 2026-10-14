import { describe, expect, it } from 'vitest';
import { APPEARANCE_GAMUT, GAMUT_KEYS, contrastRatio, inkOnAccent, isGamutKey } from '../design/appearance/gamut';

const SCHEMES = ['light', 'dark'] as const;

describe('la gamme de 16 couleurs (#10632, § 7)', () => {
  it('compte 16 clés uniques, toutes servies', () => {
    expect(GAMUT_KEYS).toHaveLength(16);
    expect(new Set(GAMUT_KEYS).size).toBe(16);
    expect(Object.keys(APPEARANCE_GAMUT).sort()).toEqual([...GAMUT_KEYS].sort());
  });

  it('ne porte que des hex majuscules', () => {
    const hexes = GAMUT_KEYS.flatMap((key) => SCHEMES.flatMap((scheme) => Object.values(APPEARANCE_GAMUT[key][scheme])));
    expect(hexes.every((hex) => /^#[0-9A-F]{6}$/.test(hex))).toBe(true);
  });

  it.each(GAMUT_KEYS.flatMap((key) => SCHEMES.map((scheme) => [key, scheme] as const)))('%s en %s : l’accent tient 3:1 sur sa surface', (key, scheme) => {
    const { surface, accent } = APPEARANCE_GAMUT[key][scheme];
    expect(contrastRatio(accent, surface)).toBeGreaterThanOrEqual(3);
  });

  it('inkOnAccent sert le noir ou le blanc, le plus contrasté', () => {
    expect(inkOnAccent('#FFFFFF')).toBe('#000000');
    expect(inkOnAccent('#27272A')).toBe('#FFFFFF');
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
  });

  it('reconnaît ses clés', () => {
    expect(isGamutKey('indigo')).toBe(true);
    expect(isGamutKey('fuchsia')).toBe(false);
    expect(isGamutKey(3)).toBe(false);
  });
});
