/**
 * Tests for utils/community-identifier.ts
 */

import {
  generateCommunityIdentifier,
  validateCommunityIdentifier,
  sanitizeCommunityIdentifier,
} from '@/utils/community-identifier';

// ─── generateCommunityIdentifier ──────────────────────────────────────────────

describe('generateCommunityIdentifier', () => {
  it('returns a non-empty string', () => {
    expect(generateCommunityIdentifier('My Community')).toBeTruthy();
  });

  it('lowercases the title', () => {
    const id = generateCommunityIdentifier('Hello World');
    expect(id).not.toMatch(/[A-Z]/);
  });

  it('replaces spaces with hyphens', () => {
    const id = generateCommunityIdentifier('hello world');
    expect(id.startsWith('hello-world')).toBe(true);
  });

  it('removes special characters', () => {
    const id = generateCommunityIdentifier('Hello! World?');
    expect(id).not.toMatch(/[!?]/);
  });

  it('appends a 6-char random suffix after a hyphen', () => {
    const id = generateCommunityIdentifier('test');
    const parts = id.split('-');
    const suffix = parts[parts.length - 1];
    expect(suffix).toHaveLength(6);
  });

  it('uses "community" prefix for empty title', () => {
    const id = generateCommunityIdentifier('');
    expect(id.startsWith('community-')).toBe(true);
  });

  it('uses "community" prefix for special-char-only title', () => {
    const id = generateCommunityIdentifier('!!!');
    expect(id.startsWith('community-')).toBe(true);
  });

  it('generates different ids on successive calls', () => {
    const id1 = generateCommunityIdentifier('test');
    const id2 = generateCommunityIdentifier('test');
    // random suffix makes them differ almost always
    // Run several pairs to be sure
    let differs = false;
    for (let i = 0; i < 5; i++) {
      if (generateCommunityIdentifier('test') !== generateCommunityIdentifier('test')) {
        differs = true;
        break;
      }
    }
    expect(differs).toBe(true);
  });

  it('collapses multiple spaces into a single hyphen', () => {
    const id = generateCommunityIdentifier('hello   world');
    expect(id.startsWith('hello-world')).toBe(true);
  });

  it('truncates title to 50 chars', () => {
    const longTitle = 'a'.repeat(100);
    const id = generateCommunityIdentifier(longTitle);
    // The normalized title portion (before the suffix) should be ≤ 50 chars
    const withoutSuffix = id.split('-').slice(0, -1).join('-');
    expect(withoutSuffix.length).toBeLessThanOrEqual(50);
  });
});

// ─── validateCommunityIdentifier ─────────────────────────────────────────────

describe('validateCommunityIdentifier', () => {
  it('returns true for lowercase alphanumeric', () => {
    expect(validateCommunityIdentifier('mycommunity')).toBe(true);
  });

  it('returns true for identifiers with hyphens', () => {
    expect(validateCommunityIdentifier('my-community')).toBe(true);
  });

  it('returns true for identifiers with underscores', () => {
    expect(validateCommunityIdentifier('my_community')).toBe(true);
  });

  it('returns true for identifiers with @', () => {
    expect(validateCommunityIdentifier('@mycommunity')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(validateCommunityIdentifier('')).toBe(false);
  });

  it('returns false for identifiers with spaces', () => {
    expect(validateCommunityIdentifier('my community')).toBe(false);
  });

  it('returns false for identifiers with special chars', () => {
    expect(validateCommunityIdentifier('my!community')).toBe(false);
  });

  it('returns false for uppercase letters', () => {
    expect(validateCommunityIdentifier('MyCommunity')).toBe(false);
  });
});

// ─── sanitizeCommunityIdentifier ─────────────────────────────────────────────

describe('sanitizeCommunityIdentifier', () => {
  it('lowercases the identifier', () => {
    expect(sanitizeCommunityIdentifier('HELLO')).toBe('hello');
  });

  it('removes special characters', () => {
    expect(sanitizeCommunityIdentifier('my!community')).toBe('mycommunity');
  });

  it('keeps hyphens', () => {
    expect(sanitizeCommunityIdentifier('my-community')).toBe('my-community');
  });

  it('collapses multiple hyphens', () => {
    expect(sanitizeCommunityIdentifier('my--community')).toBe('my-community');
  });

  it('strips leading and trailing hyphens', () => {
    expect(sanitizeCommunityIdentifier('-my-community-')).toBe('my-community');
  });

  it('keeps underscores and @', () => {
    expect(sanitizeCommunityIdentifier('my_@community')).toBe('my_@community');
  });

  it('handles empty string', () => {
    expect(sanitizeCommunityIdentifier('')).toBe('');
  });
});
