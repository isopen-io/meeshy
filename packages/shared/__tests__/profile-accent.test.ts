import { describe, it, expect } from 'vitest';
import {
  PROFILE_ACCENT_COLORS,
  parseProfileAccentColor,
  servedProfileAccentColor,
} from '../utils/profile-accent';
import { updateUserProfileSchema } from '../utils/validation';

const LIGHT_SURFACE = '#FFFFFF';
const DARK_SURFACE = '#0B0B12';

const channel = (hex: string, offset: number): number => {
  const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

const luminance = (hex: string): number =>
  0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);

const contrast = (a: string, b: string): number => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
};

describe('PROFILE_ACCENT_COLORS : la liste FERMÉE des teintes de la vitrine (#19201)', () => {
  it('porte les sept pastilles de la planche, dans son ordre', () => {
    expect(PROFILE_ACCENT_COLORS.map((tone) => tone.hex)).toEqual([
      '#A855F7', '#4ECDC4', '#FF6B6B', '#F8B500', '#3498DB', '#2ECC71', '#FF2E63',
    ]);
  });

  it('chaque teinte a une encre lisible (4.5:1) sur une surface claire ET sur une surface sombre', () => {
    for (const tone of PROFILE_ACCENT_COLORS) {
      expect(contrast(tone.inkOnLight, LIGHT_SURFACE)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tone.inkOnDark, DARK_SURFACE)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('chaque clé est unique', () => {
    const keys = PROFILE_ACCENT_COLORS.map((tone) => tone.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('parseProfileAccentColor : une teinte de la liste ou rien', () => {
  it('rend la forme canonique d’une teinte de la liste, quelle que soit sa casse', () => {
    expect(parseProfileAccentColor('#a855f7')).toBe('#A855F7');
    expect(parseProfileAccentColor(' #4ecdc4 ')).toBe('#4ECDC4');
  });

  it('refuse un hex hors liste, un nom, du texte libre et tout ce qui n’est pas une chaîne', () => {
    for (const value of ['#123456', 'violet', 'red', 'A855F7', '#A855F7;background:url(x)', '', 42, {}, undefined]) {
      expect(parseProfileAccentColor(value)).toBeNull();
    }
  });
});

describe('servedProfileAccentColor : ce qui part vers un lecteur', () => {
  it('`null` (automatique) reste `null` : le client calcule l’accent comme aujourd’hui', () => {
    expect(servedProfileAccentColor(null)).toBeNull();
    expect(servedProfileAccentColor(undefined)).toBeNull();
  });

  it('une valeur stockée hors liste n’est jamais servie (elle retombe sur l’automatique)', () => {
    expect(servedProfileAccentColor('#123456')).toBeNull();
    expect(servedProfileAccentColor('#FF2E63')).toBe('#FF2E63');
  });
});

describe('updateUserProfileSchema : profileAccentColor', () => {
  it('accepte une teinte de la liste, canonisée', () => {
    expect(updateUserProfileSchema.parse({ profileAccentColor: '#ff6b6b' }).profileAccentColor).toBe('#FF6B6B');
  });

  it('accepte `null` : retour à l’accent calculé', () => {
    expect(updateUserProfileSchema.parse({ profileAccentColor: null }).profileAccentColor).toBeNull();
  });

  it('refuse une valeur hors liste', () => {
    expect(updateUserProfileSchema.safeParse({ profileAccentColor: '#123456' }).success).toBe(false);
    expect(updateUserProfileSchema.safeParse({ profileAccentColor: 'violet' }).success).toBe(false);
  });

  it('un ancien client qui ne nomme pas le champ reste inchangé', () => {
    expect('profileAccentColor' in updateUserProfileSchema.parse({ bio: 'Salut' })).toBe(false);
  });
});
