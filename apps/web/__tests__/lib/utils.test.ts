/**
 * Tests for utils module
 * Tests the cn (className merger) utility function
 */

import { cn } from '../../lib/utils';

describe('Utils Module', () => {
  describe('cn function', () => {
    it('should merge class names correctly', () => {
      const result = cn('class1', 'class2');
      expect(result).toContain('class1');
      expect(result).toContain('class2');
    });

    it('should handle single class name', () => {
      const result = cn('single-class');
      expect(result).toBe('single-class');
    });

    it('should handle empty inputs', () => {
      const result = cn();
      expect(result).toBe('');
    });

    it('should handle undefined and null values', () => {
      const result = cn('class1', undefined, null, 'class2');
      expect(result).toContain('class1');
      expect(result).toContain('class2');
      expect(result).not.toContain('undefined');
      expect(result).not.toContain('null');
    });

    it('should handle boolean values', () => {
      const result = cn('class1', false && 'hidden', true && 'visible');
      expect(result).toContain('class1');
      expect(result).toContain('visible');
      expect(result).not.toContain('false');
    });

    it('should handle conditional class names', () => {
      const isActive = true;
      const result = cn('base', isActive && 'active');
      expect(result).toContain('base');
      expect(result).toContain('active');
    });

    it('should handle conditional class names when false', () => {
      const isActive = false;
      const result = cn('base', isActive && 'active');
      expect(result).toContain('base');
      expect(result).not.toContain('active');
    });

    it('should merge Tailwind classes correctly', () => {
      // twMerge should handle conflicting classes
      const result = cn('p-4', 'p-2');
      expect(result).toBe('p-2');
    });

    it('should handle array of class names', () => {
      const result = cn(['class1', 'class2']);
      expect(result).toContain('class1');
      expect(result).toContain('class2');
    });

    it('should handle object syntax', () => {
      const result = cn({
        'class-true': true,
        'class-false': false,
      });
      expect(result).toContain('class-true');
      expect(result).not.toContain('class-false');
    });

    it('should handle mixed inputs', () => {
      const result = cn(
        'base',
        ['array-class'],
        { 'object-class': true },
        undefined
      );
      expect(result).toContain('base');
      expect(result).toContain('array-class');
      expect(result).toContain('object-class');
    });

    it('should handle Tailwind responsive classes', () => {
      const result = cn('text-sm', 'md:text-base', 'lg:text-lg');
      expect(result).toContain('text-sm');
      expect(result).toContain('md:text-base');
      expect(result).toContain('lg:text-lg');
    });

    it('should handle Tailwind variant classes', () => {
      const result = cn('bg-blue-500', 'hover:bg-blue-600', 'focus:ring-2');
      expect(result).toContain('bg-blue-500');
      expect(result).toContain('hover:bg-blue-600');
      expect(result).toContain('focus:ring-2');
    });

    it('should merge conflicting Tailwind margin classes', () => {
      const result = cn('m-4', 'mx-2');
      expect(result).toContain('m-4');
      expect(result).toContain('mx-2');
    });

    it('should merge conflicting Tailwind text color classes', () => {
      const result = cn('text-red-500', 'text-blue-500');
      expect(result).toBe('text-blue-500');
    });
  });
});
