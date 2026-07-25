import { getLanguageColor, theme } from '@/components/v2/theme';

const COLOR_FR = theme.languageColors.fr; // Indigo
const COLOR_ES = theme.languageColors.es; // Amber
const COLOR_DE = theme.languageColors.de; // Deep Indigo
const COLOR_DEFAULT = theme.languageColors.default;

describe('v2/theme getLanguageColor', () => {
  it('returns the mapped color for a known 2-letter code', () => {
    expect(getLanguageColor('fr')).toBe(COLOR_FR);
    expect(getLanguageColor('es')).toBe(COLOR_ES);
  });

  it('is case-insensitive', () => {
    expect(getLanguageColor('FR')).toBe(COLOR_FR);
  });

  it('extracts the primary subtag from a BCP-47 locale', () => {
    expect(getLanguageColor('es-ES')).toBe(COLOR_ES);
    expect(getLanguageColor('de_DE')).toBe(COLOR_DE);
  });

  // Regression: a blind slice(0, 2) mapped 'spa' → 'sp' (miss → gray default)
  // and 'deu' → 'de' only by accident. The shared SSOT reduces 639-2/3 codes to
  // their supported 639-1 form, keeping the accent color consistent across every
  // code shape the same way getFlag does for the flag badge.
  it('reduces ISO 639-2/639-3 codes to their 639-1 color', () => {
    expect(getLanguageColor('spa')).toBe(COLOR_ES);
    expect(getLanguageColor('deu')).toBe(COLOR_DE);
  });

  it('falls back to the default color for unknown or empty codes', () => {
    expect(getLanguageColor('')).toBe(COLOR_DEFAULT);
    expect(getLanguageColor('xx')).toBe(COLOR_DEFAULT);
    // 'fil' (Filipino) has no supported reduction — never truncated to 'fi'.
    expect(getLanguageColor('fil')).toBe(COLOR_DEFAULT);
  });
});
