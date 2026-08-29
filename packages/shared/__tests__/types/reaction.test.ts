import { describe, it, expect } from 'vitest';
import {
  isValidEmoji,
  sanitizeEmoji,
  POPULAR_EMOJIS,
  EMOJI_MAX_LENGTH,
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

  describe('valid multi-code-point emoji (RGI sequences)', () => {
    // A reaction is any single RGI (Recommended for General Interchange) emoji
    // grapheme — the exact set every modern messenger (WhatsApp, Slack,
    // iMessage) lets a user pick. The former single-code-point regex rejected
    // all of these, so users could not react with the most common modern
    // emojis; they hit "Invalid emoji" at the gateway reaction gate.
    it('accepts a skin-tone modified emoji (thumbs-up + Fitzpatrick modifier)', () => {
      // 👍🏽 = U+1F44D + U+1F3FD — base emoji + skin-tone modifier
      expect(isValidEmoji('👍🏽')).toBe(true);
    });

    it('accepts a ZWJ profession sequence', () => {
      // 👩‍💻 = U+1F469 + U+200D + U+1F4BB — woman + ZWJ + laptop
      expect(isValidEmoji('👩‍💻')).toBe(true);
    });

    it('accepts a regional-indicator flag sequence', () => {
      // 🇫🇷 = U+1F1EB + U+1F1F7 — two regional indicators forming one flag
      expect(isValidEmoji('🇫🇷')).toBe(true);
    });

    it('accepts a keycap sequence', () => {
      // #️⃣ = U+0023 + U+FE0F + U+20E3 — the RGI keycap grapheme
      expect(isValidEmoji('#️⃣')).toBe(true);
    });

    it('accepts a multi-person ZWJ family sequence (11 UTF-16 units)', () => {
      // 👨‍👩‍👧‍👦 = man·ZWJ·woman·ZWJ·girl·ZWJ·boy — a single RGI grapheme
      expect(isValidEmoji('👨‍👩‍👧‍👦')).toBe(true);
    });

    it('accepts the longest common RGI grapheme: kiss with two skin tones (15 units)', () => {
      // 👩🏽‍❤️‍💋‍👨🏼 — the longest RGI emoji-zwj sequence in current Unicode
      expect(isValidEmoji('👩🏽‍❤️‍💋‍👨🏼')).toBe(true);
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

    it('rejects a digit followed by a variation selector', () => {
      // 1️ = U+0031 + U+FE0F. A bare digit is not a standalone emoji, and
      // appending FE0F does not make it one — the keycap emoji is the full
      // sequence 1️⃣ (digit + FE0F + U+20E3). The former regex admitted this
      // via its `\p{Emoji}️` branch, so the gateway persisted "1️" as a
      // reaction. RGI matching rejects it.
      expect(isValidEmoji('1️')).toBe(false);
    });

    it('rejects a lone asterisk followed by a variation selector', () => {
      // *️ = U+002A + U+FE0F — same false-positive class as the digit case.
      expect(isValidEmoji('*️')).toBe(false);
    });

    it('rejects an empty string', () => {
      expect(isValidEmoji('')).toBe(false);
    });

    it('rejects a whitespace-only string', () => {
      // trim() → '' → regex does not match
      expect(isValidEmoji('   ')).toBe(false);
    });

    it('rejects two emojis concatenated', () => {
      // ^ and $ anchors allow only a single RGI emoji grapheme; two smileys
      // are two graphemes.
      expect(isValidEmoji('😀😀')).toBe(false);
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

  it('returns a skin-tone modified emoji unchanged', () => {
    expect(sanitizeEmoji('👍🏽')).toBe('👍🏽');
  });

  it('returns a flag sequence unchanged', () => {
    expect(sanitizeEmoji('🇫🇷')).toBe('🇫🇷');
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

describe('EMOJI_MAX_LENGTH (length bound SSOT)', () => {
  // The Zod `.max()` length bound on reaction/sticker emoji fields counts
  // UTF-16 code units (String.length). It MUST admit every emoji that the
  // validity SSOT `isValidEmoji` accepts — otherwise a valid RGI grapheme is
  // rejected by the length pre-check before the format check ever runs.
  it('admits the longest common RGI grapheme (kiss with two skin tones, 15 units)', () => {
    const longest = '👩🏽‍❤️‍💋‍👨🏼';
    expect(isValidEmoji(longest)).toBe(true);
    expect(longest.length).toBeLessThanOrEqual(EMOJI_MAX_LENGTH);
  });

  it('admits a multi-person family sequence (11 units)', () => {
    const family = '👨‍👩‍👧‍👦';
    expect(family.length).toBeLessThanOrEqual(EMOJI_MAX_LENGTH);
  });

  it('leaves headroom beyond the longest measured RGI grapheme', () => {
    expect(EMOJI_MAX_LENGTH).toBeGreaterThanOrEqual(15);
  });
});
