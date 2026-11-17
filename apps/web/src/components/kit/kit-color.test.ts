import { describe, expect, test } from 'bun:test';

import { contrastRatio, ensureContrast, hueShiftHex, inkOn, mixHex, parseHex } from './kit-color';

describe('les couleurs du kit — une seule source pour les assemblages', () => {
  test('un hexadécimal court ou long se lit, le reste est refusé', () => {
    expect(parseHex('#FF8000')).toEqual({ r: 255, g: 128, b: 0 });
    expect(parseHex('#0f0')).toEqual({ r: 0, g: 255, b: 0 });
    expect(parseHex('var(--accent)')).toBeNull();
    expect(parseHex('#12')).toBeNull();
  });

  test('le contraste suit la norme : noir sur blanc 21, une couleur sur elle-même 1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#4ECDC4', '#4ECDC4')).toBeCloseTo(1, 5);
  });

  test('une teinte claire s’assombrit jusqu’à tenir 4,5:1 sur sa plaque, et ne bouge pas quand elle tient déjà', () => {
    for (const tint of ['#818CF8', '#FBBF24', '#34D399', '#4ECDC4', '#F8B500']) {
      expect(contrastRatio(ensureContrast(tint, '#F5F3FF'), '#F5F3FF')).toBeGreaterThanOrEqual(4.5);
    }
    expect(ensureContrast('#1B1140', '#F5F3FF')).toBe('#1B1140');
  });

  test('l’encre d’un fond est celle qui contraste le plus, au moins 4,5:1 quel que soit le fond', () => {
    for (const bg of ['#818CF8', '#4F46E5', '#FBBF24', '#34D399', '#777777', '#A855F7']) {
      expect(contrastRatio(inkOn(bg), bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('mêler une teinte au blanc la rapproche du blanc ; la roue tourne de −30° sans perdre le gris', () => {
    expect(mixHex('#FF0000', '#FFFFFF', 0)).toBe('#ffffff');
    expect(mixHex('#FF0000', '#FFFFFF', 1)).toBe('#ff0000');
    expect(hueShiftHex('#808080', -30)).toBe('#808080');
    expect(hueShiftHex('#FF0000', 120)).toBe('#00ff00');
    expect(hueShiftHex('#FF0000', -30)).not.toBe('#ff0000');
  });
});
