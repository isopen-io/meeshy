import { describe, it, expect } from 'vitest';
import {
  isValidEmoji,
  sanitizeEmoji,
  POPULAR_EMOJIS,
} from '../../types/reaction.js';

describe('isValidEmoji', () => {
  describe('valid single emoji (Emoji_Presentation)', () => {
    it('accepts a smiley emoji', () => {
      expect(isValidEmoji('😀')).toBe(true);
    });

    it('accepts thumbs-up', () => {
      expect(isValidEmoji('👍')).toBe(true);
    });

    it('accepts fire emoji', () => {
      expect(isValidEmoji('🔥')).toBe(true);
    });

    it('accepts star emoji', () => {
      expect(isValidEmoji('⭐')).toBe(true);
    });

    it('accepts rocket emoji', () => {
      expect(isValidEmoji('🚀')).toBe(true);
    });

    it('accepts party popper emoji', () => {
      expect(isValidEmoji('🎉')).toBe(true);
    });

    it('accepts hundred points emoji', () => {
      expect(isValidEmoji('💯')).toBe(true);
    });
  });

  describe('valid single emoji requiring variation selector FE0F', () => {
    it('accepts heart with FE0F variation selector', () => {
      // ❤️ = U+2764 + U+FE0F — variation selector makes it emoji presentation
      expect(isValidEmoji('❤️')).toBe(true);
    });
  });

  describe('trims surrounding whitespace before validation', () => {
    it('accepts emoji with leading space', () => {
      expect(isValidEmoji(' 😀')).toBe(true);
    });

    it('accepts emoji with trailing space', () => {
      expect(isValidEmoji('😀 ')).toBe(true);
    });

    it('accepts emoji surrounded by spaces', () => {
      expect(isValidEmoji('  🔥  ')).toBe(true);
    });
  });

  describe('invalid inputs', () => {
    it('rejects plain text', () => {
      expect(isValidEmoji('hello')).toBe(false);
    });

    it('rejects a single ASCII letter', () => {
      expect(isValidEmoji('a')).toBe(false);
    });

    it('rejects a digit character (no variation selector)', () => {
      // Digits 0-9 have Emoji property but NOT Emoji_Presentation
      expect(isValidEmoji('1')).toBe(false);
    });

    it('rejects an empty string', () => {
      expect(isValidEmoji('')).toBe(false);
    });

    it('rejects a whitespace-only string', () => {
      // trim() → '' → regex does not match
      expect(isValidEmoji('   ')).toBe(false);
    });

    it('rejects two emojis concatenated', () => {
      // ^ and $ anchors allow only a single emoji unit
      expect(isValidEmoji('😀😀')).toBe(false);
    });

    it('rejects a flag sequence (two regional-indicator letters)', () => {
      // 🇫🇷 = U+1F1EB + U+1F1F7 — two code points, cannot match single-unit regex
      expect(isValidEmoji('🇫🇷')).toBe(false);
    });

    it('rejects an emoji followed by extra text', () => {
      expect(isValidEmoji('😀abc')).toBe(false);
    });
  });
});

describe('sanitizeEmoji', () => {
  it('returns the trimmed emoji for a valid emoji', () => {
    expect(sanitizeEmoji('😀')).toBe('😀');
  });

  it('trims surrounding whitespace and returns the emoji', () => {
    expect(sanitizeEmoji('  🔥  ')).toBe('🔥');
  });

  it('returns the emoji with FE0F variation selector', () => {
    expect(sanitizeEmoji('❤️')).toBe('❤️');
  });

  it('returns null for plain text', () => {
    expect(sanitizeEmoji('hello')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(sanitizeEmoji('')).toBeNull();
  });

  it('returns null for whitespace-only input', () => {
    expect(sanitizeEmoji('   ')).toBeNull();
  });

  it('returns null for two concatenated emojis', () => {
    expect(sanitizeEmoji('👍👎')).toBeNull();
  });
});

describe('POPULAR_EMOJIS', () => {
  it('contains exactly 10 entries', () => {
    expect(POPULAR_EMOJIS).toHaveLength(10);
  });

  it('contains the star emoji for backward-compat with legacy reactions', () => {
    expect(POPULAR_EMOJIS).toContain('⭐');
  });

  it('contains heart, thumbs-up and fire as expected popular reactions', () => {
    expect(POPULAR_EMOJIS).toContain('❤️');
    expect(POPULAR_EMOJIS).toContain('👍');
    expect(POPULAR_EMOJIS).toContain('🔥');
  });

  it('every entry passes isValidEmoji', () => {
    for (const emoji of POPULAR_EMOJIS) {
      expect(isValidEmoji(emoji)).toBe(true);
    }
  });

  it('has no duplicate entries', () => {
    const unique = new Set(POPULAR_EMOJIS);
    expect(unique.size).toBe(POPULAR_EMOJIS.length);
  });
});
