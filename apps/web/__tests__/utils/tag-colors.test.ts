/**
 * Tests for utils/tag-colors.ts
 */

import { getTagColor, getAllTagColors } from '@/utils/tag-colors';

describe('getTagColor', () => {
  it('returns an object with bg, text, and border fields', () => {
    const color = getTagColor('work');
    expect(color).toHaveProperty('bg');
    expect(color).toHaveProperty('text');
    expect(color).toHaveProperty('border');
  });

  it('returns consistent color for the same tag name', () => {
    const color1 = getTagColor('work');
    const color2 = getTagColor('work');
    expect(color1).toEqual(color2);
  });

  it('is case-insensitive (same color for Work and work)', () => {
    expect(getTagColor('Work')).toEqual(getTagColor('work'));
  });

  it('returns different colors for different tags (most of the time)', () => {
    const tagA = getTagColor('aaaaa');
    const tagB = getTagColor('zzzzz');
    // These are different strings — they should hash to different indices
    // (not guaranteed but almost certain for distinct strings)
    expect(tagA.bg !== tagB.bg || tagA.text !== tagB.text).toBe(true);
  });

  it('returns a bg string that starts with "bg-"', () => {
    const color = getTagColor('anything');
    expect(color.bg).toMatch(/^bg-/);
  });

  it('returns a text string that starts with "text-"', () => {
    const color = getTagColor('anything');
    expect(color.text).toMatch(/^text-/);
  });

  it('returns a border string that starts with "border-"', () => {
    const color = getTagColor('anything');
    expect(color.border).toMatch(/^border-/);
  });

  it('handles empty string without throwing', () => {
    expect(() => getTagColor('')).not.toThrow();
  });

  it('handles very long strings without throwing', () => {
    expect(() => getTagColor('a'.repeat(1000))).not.toThrow();
  });
});

describe('getAllTagColors', () => {
  it('returns an array', () => {
    expect(Array.isArray(getAllTagColors())).toBe(true);
  });

  it('returns at least one color', () => {
    expect(getAllTagColors().length).toBeGreaterThan(0);
  });

  it('each entry has bg, text, and border', () => {
    for (const color of getAllTagColors()) {
      expect(color).toHaveProperty('bg');
      expect(color).toHaveProperty('text');
      expect(color).toHaveProperty('border');
    }
  });
});
