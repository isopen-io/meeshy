import { describe, expect, test } from 'bun:test';

import { SWIFT_VALUE, swiftDesignTokens } from './swift-design-tokens.mjs';

/**
 * UNE COTE SWIFT S'ÉCRIT EN NOMBRE OU EN JETON (#8877). Depuis la charte
 * visuelle iOS, `cornerRadius: 22` s'écrit `cornerRadius: MeeshyRadius.xlPlus`
 * — même valeur, autre graphie. Une garde de parité qui ne lit que des
 * chiffres déclarerait « introuvable » une cote qui n'a pas bougé.
 */

const DESIGN_TOKENS = `
public nonisolated enum MeeshyRadius {
    public static let lg: CGFloat = 16
    public static let xlPlus: CGFloat = 22
    public static let full: CGFloat = .infinity
}

public nonisolated enum MeeshyOpacity {
    public static let strong: Double = 0.5
}
`;

const COLORS = `
public nonisolated struct MeeshyColors {
    public static let mediaScrim = Color.black.opacity(0.5)
    public static let mediaChromeFill = Color.black.opacity(MeeshyOpacity.strong)
    public static let brandPrimary = indigo500
}
`;

const tokens = () => swiftDesignTokens({ designTokens: DESIGN_TOKENS, colors: COLORS });

describe('swiftDesignTokens', () => {
  test('un nombre littéral se lit tel quel', () => {
    expect(tokens().value('22')).toBe(22);
    expect(tokens().value('0.5')).toBe(0.5);
  });

  test('un jeton d’échelle se résout à sa valeur déclarée', () => {
    expect(tokens().value('MeeshyRadius.xlPlus')).toBe(22);
    expect(tokens().value('MeeshyOpacity.strong')).toBe(0.5);
  });

  test('un voile MeeshyColors se résout à son opacité, littérale ou en jeton', () => {
    expect(tokens().veilOpacity('MeeshyColors.mediaScrim')).toBe(0.5);
    expect(tokens().veilOpacity('MeeshyColors.mediaChromeFill')).toBe(0.5);
  });

  test('un voile alias de l’échelle noire translucide (#8879) se résout à son opacité', () => {
    const scale = swiftDesignTokens({
      designTokens: DESIGN_TOKENS,
      colors: `
public nonisolated struct MeeshyColors {
    public static let mediaScrim = scrim
    public static let mediaChromeFill = mediaBackdrop.opacity(0.35)
    public static let onMediaMuted = onMedia.opacity(0.7)
    public static let onMedia = Color(hex: "FFFFFF")
    public static let mediaBackdrop = Color(hex: "000000")
    public static let scrim = mediaBackdrop.opacity(0.5)
}
`,
    });
    expect(scale.veilOpacity('MeeshyColors.mediaScrim')).toBe(0.5);
    expect(scale.veilOpacity('MeeshyColors.mediaChromeFill')).toBe(0.35);
    expect(scale.veilOpacity('MeeshyColors.onMediaMuted')).toBeNull();
  });

  test('un jeton inconnu ou non numérique rend null, jamais une valeur inventée', () => {
    expect(tokens().value('MeeshyRadius.nope')).toBeNull();
    expect(tokens().value('MeeshyRadius.full')).toBeNull();
    expect(tokens().veilOpacity('MeeshyColors.brandPrimary')).toBeNull();
  });

  test('le motif SWIFT_VALUE capture un nombre OU un jeton', () => {
    const cote = new RegExp(`cornerRadius: ${SWIFT_VALUE}\\)`);
    expect(cote.exec('cornerRadius: 16)')?.[1]).toBe('16');
    expect(cote.exec('cornerRadius: MeeshyRadius.lg)')?.[1]).toBe('MeeshyRadius.lg');
  });
});
