/**
 * Tests for PWA Badge Manager
 */

import { getBadgeManager, resetBadgeManager, pwaBadge } from '../pwa-badge';

describe('PWABadgeManager', () => {
  beforeEach(() => {
    // Reset pour chaque test
    resetBadgeManager();

    // Mock navigator.setAppBadge et clearAppBadge
    Object.defineProperty(navigator, 'setAppBadge', {
      writable: true,
      value: jest.fn().mockResolvedValue(undefined),
    });

    Object.defineProperty(navigator, 'clearAppBadge', {
      writable: true,
      value: jest.fn().mockResolvedValue(undefined),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isSupported', () => {
    it('should detect support when Badging API is available', () => {
      expect(pwaBadge.isSupported()).toBe(true);
    });

    it('should detect no support when Badging API is not available', () => {
      // @ts-ignore
      delete navigator.setAppBadge;
      resetBadgeManager();

      expect(pwaBadge.isSupported()).toBe(false);
    });
  });

  describe('setCount', () => {
    it('should set badge count', async () => {
      const result = await pwaBadge.setCount(5);

      expect(result).toBe(true);
      expect(navigator.setAppBadge).toHaveBeenCalledWith(5);
    });

    it('should clear badge when count is 0', async () => {
      const result = await pwaBadge.setCount(0);

      expect(result).toBe(true);
      expect(navigator.clearAppBadge).toHaveBeenCalled();
    });

    it('should clear badge when count is undefined', async () => {
      const result = await pwaBadge.setCount(undefined);

      expect(result).toBe(true);
      expect(navigator.clearAppBadge).toHaveBeenCalled();
    });

    it('should return false if API not supported', async () => {
      // @ts-ignore
      delete navigator.setAppBadge;
      resetBadgeManager();

      const result = await pwaBadge.setCount(5);

      expect(result).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear the badge', async () => {
      const result = await pwaBadge.clear();

      expect(result).toBe(true);
      expect(navigator.clearAppBadge).toHaveBeenCalled();
    });

    it('should return false if API not supported', async () => {
      // @ts-ignore
      delete navigator.clearAppBadge;
      resetBadgeManager();

      const result = await pwaBadge.clear();

      expect(result).toBe(false);
    });
  });

  describe('increment', () => {
    it('should increment badge count', async () => {
      // Set initial count
      await pwaBadge.setCount(5);

      // Increment
      const result = await pwaBadge.increment(3);

      expect(result).toBe(true);
      expect(navigator.setAppBadge).toHaveBeenLastCalledWith(8);
    });

    it('should increment by 1 by default', async () => {
      await pwaBadge.setCount(5);
      await pwaBadge.increment();

      expect(navigator.setAppBadge).toHaveBeenLastCalledWith(6);
    });
  });

  describe('decrement', () => {
    it('should decrement badge count', async () => {
      await pwaBadge.setCount(5);

      const result = await pwaBadge.decrement(2);

      expect(result).toBe(true);
      expect(navigator.setAppBadge).toHaveBeenLastCalledWith(3);
    });

    it('should not go below 0', async () => {
      await pwaBadge.setCount(3);
      await pwaBadge.decrement(5);

      // Should clear badge instead of setting negative
      expect(navigator.clearAppBadge).toHaveBeenCalled();
    });
  });

  describe('getCount', () => {
    it('should return current count', async () => {
      await pwaBadge.setCount(5);

      expect(pwaBadge.getCount()).toBe(5);
    });

    it('should return 0 initially', () => {
      expect(pwaBadge.getCount()).toBe(0);
    });
  });

  describe('error handling', () => {
    it('should handle setAppBadge errors gracefully', async () => {
      (navigator.setAppBadge as jest.Mock).mockRejectedValue(new Error('API Error'));

      const result = await pwaBadge.setCount(5);

      expect(result).toBe(false);
    });

    it('should handle clearAppBadge errors gracefully', async () => {
      (navigator.clearAppBadge as jest.Mock).mockRejectedValue(new Error('API Error'));

      const result = await pwaBadge.clear();

      expect(result).toBe(false);
    });
  });

  describe('singleton pattern', () => {
    it('should return same instance', () => {
      const instance1 = getBadgeManager();
      const instance2 = getBadgeManager();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      const instance1 = getBadgeManager();
      resetBadgeManager();
      const instance2 = getBadgeManager();

      expect(instance1).not.toBe(instance2);
    });
  });
});
