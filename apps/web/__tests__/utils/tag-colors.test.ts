/**
 * Tests for tag-colors utility
 */

import { getTagColor, getAllTagColors } from '../../utils/tag-colors';

describe('tag-colors', () => {
  describe('getTagColor', () => {
    it('should return an object with bg, text, and border properties', () => {
      const result = getTagColor('test-tag');
      expect(result).toHaveProperty('bg');
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('border');
    });

    it('should return consistent colors for the same tag', () => {
      const result1 = getTagColor('my-tag');
      const result2 = getTagColor('my-tag');
      expect(result1).toEqual(result2);
    });

    it('should be case insensitive', () => {
      const result1 = getTagColor('TestTag');
      const result2 = getTagColor('testtag');
      expect(result1).toEqual(result2);
    });

    it('should return different colors for different tags', () => {
      const colors = new Set();
      const tags = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta'];

      tags.forEach(tag => {
        colors.add(JSON.stringify(getTagColor(tag)));
      });

      // At least some tags should have different colors
      expect(colors.size).toBeGreaterThan(1);
    });

    it('should handle empty string', () => {
      const result = getTagColor('');
      expect(result).toHaveProperty('bg');
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('border');
    });

    it('should handle special characters in tag names', () => {
      const result = getTagColor('tag-with-special-chars!@#');
      expect(result).toHaveProperty('bg');
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('border');
    });

    it('should return Tailwind-compatible class names', () => {
      const result = getTagColor('test');

      expect(result.bg).toMatch(/^bg-/);
      expect(result.text).toMatch(/^text-/);
      expect(result.border).toMatch(/^border-/);
    });

    it('should include dark mode variants', () => {
      const result = getTagColor('test');

      expect(result.bg).toContain('dark:');
      expect(result.text).toContain('dark:');
      expect(result.border).toContain('dark:');
    });

    it('should handle numeric tag names', () => {
      const result = getTagColor('123');
      expect(result).toHaveProperty('bg');
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('border');
    });

    it('should handle Unicode tag names', () => {
      const result = getTagColor('etiquette');
      expect(result).toHaveProperty('bg');
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('border');
    });

    it('should handle very long tag names', () => {
      const longTag = 'a'.repeat(1000);
      const result = getTagColor(longTag);
      expect(result).toHaveProperty('bg');
      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('border');
    });
  });

  describe('getAllTagColors', () => {
    it('should return an array', () => {
      const colors = getAllTagColors();
      expect(Array.isArray(colors)).toBe(true);
    });

    it('should return a non-empty array', () => {
      const colors = getAllTagColors();
      expect(colors.length).toBeGreaterThan(0);
    });

    it('should return at least 10 different colors', () => {
      const colors = getAllTagColors();
      expect(colors.length).toBeGreaterThanOrEqual(10);
    });

    it('should have objects with bg, text, and border properties', () => {
      const colors = getAllTagColors();

      colors.forEach(color => {
        expect(color).toHaveProperty('bg');
        expect(color).toHaveProperty('text');
        expect(color).toHaveProperty('border');
      });
    });

    it('should return Tailwind-compatible class names', () => {
      const colors = getAllTagColors();

      colors.forEach(color => {
        expect(color.bg).toMatch(/^bg-/);
        expect(color.text).toMatch(/^text-/);
        expect(color.border).toMatch(/^border-/);
      });
    });

    it('should include dark mode variants for all colors', () => {
      const colors = getAllTagColors();

      colors.forEach(color => {
        expect(color.bg).toContain('dark:');
        expect(color.text).toContain('dark:');
        expect(color.border).toContain('dark:');
      });
    });

    it('should return unique colors', () => {
      const colors = getAllTagColors();
      const uniqueColors = new Set(colors.map(c => JSON.stringify(c)));
      expect(uniqueColors.size).toBe(colors.length);
    });

    it('should include common color families', () => {
      const colors = getAllTagColors();
      const allBgClasses = colors.map(c => c.bg).join(' ');

      // Check for presence of common color families
      expect(allBgClasses).toContain('red');
      expect(allBgClasses).toContain('green');
      expect(allBgClasses).toContain('blue');
      expect(allBgClasses).toContain('purple');
    });
  });

  describe('hash consistency', () => {
    it('should always return the same color for the same tag across multiple calls', () => {
      const tag = 'consistent-tag';
      const results: any[] = [];

      for (let i = 0; i < 100; i++) {
        results.push(getTagColor(tag));
      }

      results.forEach(result => {
        expect(result).toEqual(results[0]);
      });
    });

    it('should distribute tags relatively evenly across colors', () => {
      const colors = getAllTagColors();
      const colorCounts = new Map<string, number>();

      // Generate many test tags
      for (let i = 0; i < 1000; i++) {
        const tag = `test-tag-${i}`;
        const color = getTagColor(tag);
        const key = JSON.stringify(color);
        colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
      }

      // Each color should be used at least once
      expect(colorCounts.size).toBe(colors.length);

      // No single color should dominate (>50% of tags)
      colorCounts.forEach(count => {
        expect(count).toBeLessThan(500);
      });
    });
  });
});
