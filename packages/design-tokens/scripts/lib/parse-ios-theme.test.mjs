import { describe, expect, test } from 'bun:test';

import { parseColors, parseHexConstants } from './parse-ios-theme.mjs';

const refuse = (message) => {
  throw new Error(message);
};

const base = `
  public static let indigo500 = Color(hex: "6366F1")
  public static let brandPrimaryHex = "6366F1"
  public static let brandPrimary = indigo500
  public static let scrim = indigo500.opacity(0.5)
  public static func textPrimary(isDark: Bool) -> Color {
      isDark ? Color(hex: "EEF2FF") : indigo500
  }
`;

describe('parseColors — les trois formes de constante', () => {
  test('Color(hex:), jumeau chaîne et alias sont résolus', () => {
    const { constantes } = parseColors(base, refuse);
    expect(constantes.get('indigo500')).toBe('#6366f1');
    expect(constantes.get('brandPrimaryHex')).toBe('#6366f1');
    expect(constantes.get('brandPrimary')).toBe('#6366f1');
  });

  test('une fonction isDark rend ses deux faces', () => {
    const { fonctions } = parseColors(base, refuse);
    expect(fonctions.get('textPrimary')).toEqual({ dark: '#eef2ff', light: '#6366f1' });
  });

  test("un alias vers une constante inconnue est REFUSÉ, jamais sauté", () => {
    expect(() => parseColors('public static let x = inconnue', refuse)).toThrow(/alias non résolu/);
  });

  test('une forme de fonction inconnue est REFUSÉE', () => {
    const swift = `${base}\n public static func bad(isDark: Bool) -> Color {\n isDark ? mystere() : indigo500\n }`;
    expect(() => parseColors(swift, refuse)).toThrow(/forme non reconnue/);
  });
});

describe('parseHexConstants', () => {
  test('ne rend que les Color(hex:), en majuscules et dans l’ordre', () => {
    expect(parseHexConstants(base)).toEqual([['indigo500', '6366F1']]);
  });
});
