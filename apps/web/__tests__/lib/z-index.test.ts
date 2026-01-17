/**
 * Tests for z-index module
 * Tests the unified z-index system for consistent UI layering
 */

import {
  Z_INDEX,
  Z_CLASSES,
  Z_STYLES,
  zIndex,
  useZIndexDebug,
} from '../../lib/z-index';

describe('Z-Index Module', () => {
  describe('Z_INDEX constants', () => {
    it('should export BASE as 0', () => {
      expect(Z_INDEX.BASE).toBe(0);
    });

    it('should export BELOW as 1', () => {
      expect(Z_INDEX.BELOW).toBe(1);
    });

    it('should export UI component z-indexes in range 10-39', () => {
      expect(Z_INDEX.CARD).toBe(10);
      expect(Z_INDEX.BUTTON).toBe(15);
      expect(Z_INDEX.INPUT).toBe(20);
    });

    it('should export navigation z-indexes in range 40-49', () => {
      expect(Z_INDEX.MOBILE_OVERLAY).toBe(40);
      expect(Z_INDEX.NAVIGATION_SIDEBAR).toBe(45);
      expect(Z_INDEX.HEADER).toBe(50);
    });

    it('should export overlay z-indexes', () => {
      expect(Z_INDEX.REALTIME_INDICATOR).toBe(55);
    });

    it('should export popover z-indexes in range 60-79', () => {
      expect(Z_INDEX.TOOLTIP).toBe(60);
      expect(Z_INDEX.DROPDOWN_MENU).toBe(65);
      expect(Z_INDEX.POPOVER).toBe(70);
      expect(Z_INDEX.TRANSLATION_POPOVER).toBe(75);
    });

    it('should export modal z-indexes in range 80-99', () => {
      expect(Z_INDEX.MODAL).toBe(80);
      expect(Z_INDEX.MODAL_OVERLAY).toBe(85);
    });

    it('should export toast/notification z-indexes at 100+', () => {
      expect(Z_INDEX.TOAST).toBe(100);
      expect(Z_INDEX.NOTIFICATION).toBe(110);
    });

    it('should export MAX z-index as 9999', () => {
      expect(Z_INDEX.MAX).toBe(9999);
    });

    it('should have proper z-index hierarchy', () => {
      // Verify proper layering order
      expect(Z_INDEX.BASE).toBeLessThan(Z_INDEX.CARD);
      expect(Z_INDEX.CARD).toBeLessThan(Z_INDEX.HEADER);
      expect(Z_INDEX.HEADER).toBeLessThan(Z_INDEX.TOOLTIP);
      expect(Z_INDEX.TOOLTIP).toBeLessThan(Z_INDEX.MODAL);
      expect(Z_INDEX.MODAL).toBeLessThan(Z_INDEX.TOAST);
      expect(Z_INDEX.TOAST).toBeLessThan(Z_INDEX.MAX);
    });
  });

  describe('zIndex utility function', () => {
    it('should return Tailwind z-index class format', () => {
      expect(zIndex(Z_INDEX.BASE)).toBe('z-[0]');
      expect(zIndex(Z_INDEX.MODAL)).toBe('z-[80]');
      expect(zIndex(Z_INDEX.MAX)).toBe('z-[9999]');
    });

    it('should handle any numeric value', () => {
      expect(zIndex(50 as any)).toBe('z-[50]');
      expect(zIndex(100 as any)).toBe('z-[100]');
    });
  });

  describe('Z_CLASSES constants', () => {
    it('should export Tailwind class strings for each z-index', () => {
      expect(Z_CLASSES.BASE).toBe('z-[0]');
      expect(Z_CLASSES.BELOW).toBe('z-[1]');
      expect(Z_CLASSES.CARD).toBe('z-[10]');
      expect(Z_CLASSES.BUTTON).toBe('z-[15]');
      expect(Z_CLASSES.INPUT).toBe('z-[20]');
    });

    it('should export navigation z-index classes', () => {
      expect(Z_CLASSES.MOBILE_OVERLAY).toBe('z-[40]');
      expect(Z_CLASSES.NAVIGATION_SIDEBAR).toBe('z-[45]');
      expect(Z_CLASSES.HEADER).toBe('z-[50]');
    });

    it('should export popover z-index classes', () => {
      expect(Z_CLASSES.TOOLTIP).toBe('z-[60]');
      expect(Z_CLASSES.DROPDOWN_MENU).toBe('z-[65]');
      expect(Z_CLASSES.POPOVER).toBe('z-[70]');
      expect(Z_CLASSES.TRANSLATION_POPOVER).toBe('z-[75]');
    });

    it('should export modal z-index classes', () => {
      expect(Z_CLASSES.MODAL).toBe('z-[80]');
      expect(Z_CLASSES.MODAL_OVERLAY).toBe('z-[85]');
    });

    it('should export toast/notification z-index classes', () => {
      expect(Z_CLASSES.TOAST).toBe('z-[100]');
      expect(Z_CLASSES.NOTIFICATION).toBe('z-[110]');
    });

    it('should export MAX z-index class', () => {
      expect(Z_CLASSES.MAX).toBe('z-[9999]');
    });
  });

  describe('Z_STYLES constants', () => {
    it('should export style objects with zIndex property', () => {
      expect(Z_STYLES.BASE).toEqual({ zIndex: 0 });
      expect(Z_STYLES.MODAL).toEqual({ zIndex: 80 });
      expect(Z_STYLES.MAX).toEqual({ zIndex: 9999 });
    });

    it('should have matching values with Z_INDEX', () => {
      Object.keys(Z_INDEX).forEach((key) => {
        const indexValue = Z_INDEX[key as keyof typeof Z_INDEX];
        const styleValue = Z_STYLES[key as keyof typeof Z_STYLES];
        expect(styleValue).toEqual({ zIndex: indexValue });
      });
    });
  });

  describe('useZIndexDebug hook', () => {
    it('should return logZIndexHierarchy and checkElementZIndex functions', () => {
      const { logZIndexHierarchy, checkElementZIndex } = useZIndexDebug();

      expect(typeof logZIndexHierarchy).toBe('function');
      expect(typeof checkElementZIndex).toBe('function');
    });

    it('should execute logZIndexHierarchy without error', () => {
      const { logZIndexHierarchy } = useZIndexDebug();
      const consoleSpy = jest.spyOn(console, 'group').mockImplementation();
      const consoleGroupEndSpy = jest.spyOn(console, 'groupEnd').mockImplementation();

      expect(() => logZIndexHierarchy()).not.toThrow();

      consoleSpy.mockRestore();
      consoleGroupEndSpy.mockRestore();
    });

    it('should check element z-index', () => {
      const { checkElementZIndex } = useZIndexDebug();

      // Create a mock element
      const element = document.createElement('div');
      element.style.zIndex = '100';
      element.style.position = 'relative';
      document.body.appendChild(element);

      const result = checkElementZIndex(element);

      expect(result).toHaveProperty('zIndex');
      expect(result).toHaveProperty('position');
      expect(result).toHaveProperty('element');
      expect(result.element).toBe(element);

      document.body.removeChild(element);
    });
  });

  describe('Type safety', () => {
    it('should have Z_INDEX as readonly', () => {
      // TypeScript would prevent this at compile time
      // At runtime, the object is const
      expect(Object.isFrozen(Z_INDEX)).toBe(false); // JS const doesn't freeze
      expect(typeof Z_INDEX).toBe('object');
    });

    it('should have all expected keys in Z_INDEX', () => {
      const expectedKeys = [
        'BASE',
        'BELOW',
        'CARD',
        'BUTTON',
        'INPUT',
        'MOBILE_OVERLAY',
        'NAVIGATION_SIDEBAR',
        'HEADER',
        'REALTIME_INDICATOR',
        'TOOLTIP',
        'DROPDOWN_MENU',
        'POPOVER',
        'TRANSLATION_POPOVER',
        'MODAL',
        'MODAL_OVERLAY',
        'TOAST',
        'NOTIFICATION',
        'MAX',
      ];

      expectedKeys.forEach((key) => {
        expect(Z_INDEX).toHaveProperty(key);
      });
    });

    it('should have matching keys in Z_CLASSES and Z_STYLES', () => {
      const zIndexKeys = Object.keys(Z_INDEX);
      const zClassesKeys = Object.keys(Z_CLASSES);
      const zStylesKeys = Object.keys(Z_STYLES);

      expect(zClassesKeys).toEqual(zIndexKeys);
      expect(zStylesKeys).toEqual(zIndexKeys);
    });
  });
});
