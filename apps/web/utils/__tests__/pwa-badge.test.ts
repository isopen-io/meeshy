/**
 * Tests for PWA Badge Manager
 */

// Mock firebase-availability-checker BEFORE importing pwa-badge
jest.mock('../firebase-availability-checker', () => ({
  firebaseChecker: {
    isBadgeEnabled: jest.fn().mockReturnValue(true),
    getStatus: jest.fn().mockReturnValue({
      available: true,
      pushEnabled: true,
      badgeEnabled: true,
      checked: true
    }),
    check: jest.fn().mockResolvedValue(true),
  }
}));

import { getBadgeManager, resetBadgeManager, pwaBadge } from '../pwa-badge';

// Mock setAppBadge and clearAppBadge on navigator
let mockSetAppBadge: jest.Mock;
let mockClearAppBadge: jest.Mock;

describe('PWABadgeManager', () => {
  beforeEach(() => {
    // Reset pour chaque test
    resetBadgeManager();

    // Create fresh mocks
    mockSetAppBadge = jest.fn().mockResolvedValue(undefined);
    mockClearAppBadge = jest.fn().mockResolvedValue(undefined);

    // Mock navigator.setAppBadge et clearAppBadge using configurable properties
    Object.defineProperty(navigator, 'setAppBadge', {
      writable: true,
      configurable: true,
      value: mockSetAppBadge,
    });

    Object.defineProperty(navigator, 'clearAppBadge', {
      writable: true,
      configurable: true,
      value: mockClearAppBadge,
    });

    // Reset manager after setting up navigator mocks
    resetBadgeManager();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isSupported', () => {
    it('should detect support when Badging API is available', () => {
      expect(pwaBadge.isSupported()).toBe(true);
    });

    it('should detect no support when Badging API is not available', () => {
      // The 'in' operator checks property existence, not value
      // So we need to mock the getBadgeManager to return unsupported
      // Create a fresh manager with mocked navigator check
      resetBadgeManager();
      const manager = getBadgeManager();

      // Directly test the isBadgingSupported method by mocking it
      const spy = jest.spyOn(manager, 'isBadgingSupported').mockReturnValue(false);

      expect(pwaBadge.isSupported()).toBe(false);

      spy.mockRestore();
    });
  });

  describe('setCount', () => {
    it('should set badge count', async () => {
      const result = await pwaBadge.setCount(5);

      expect(result).toBe(true);
      expect(mockSetAppBadge).toHaveBeenCalledWith(5);
    });

    it('should clear badge when count is 0', async () => {
      const result = await pwaBadge.setCount(0);

      expect(result).toBe(true);
      expect(mockClearAppBadge).toHaveBeenCalled();
    });

    it('should clear badge when count is undefined', async () => {
      const result = await pwaBadge.setCount(undefined);

      expect(result).toBe(true);
      expect(mockClearAppBadge).toHaveBeenCalled();
    });

    it('should return false if API not supported', async () => {
      // Set to undefined instead of deleting (delete doesn't work in jsdom)
      Object.defineProperty(navigator, 'setAppBadge', {
        writable: true,
        configurable: true,
        value: undefined,
      });
      resetBadgeManager();

      const result = await pwaBadge.setCount(5);

      expect(result).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear the badge', async () => {
      const result = await pwaBadge.clear();

      expect(result).toBe(true);
      expect(mockClearAppBadge).toHaveBeenCalled();
    });

    it('should return false if API not supported', async () => {
      // Set to undefined instead of deleting (delete doesn't work in jsdom)
      Object.defineProperty(navigator, 'clearAppBadge', {
        writable: true,
        configurable: true,
        value: undefined,
      });
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
      expect(mockSetAppBadge).toHaveBeenLastCalledWith(8);
    });

    it('should increment by 1 by default', async () => {
      await pwaBadge.setCount(5);
      await pwaBadge.increment();

      expect(mockSetAppBadge).toHaveBeenLastCalledWith(6);
    });
  });

  describe('decrement', () => {
    it('should decrement badge count', async () => {
      await pwaBadge.setCount(5);

      const result = await pwaBadge.decrement(2);

      expect(result).toBe(true);
      expect(mockSetAppBadge).toHaveBeenLastCalledWith(3);
    });

    it('should not go below 0', async () => {
      await pwaBadge.setCount(3);
      await pwaBadge.decrement(5);

      // Should clear badge instead of setting negative
      expect(mockClearAppBadge).toHaveBeenCalled();
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
      mockSetAppBadge.mockRejectedValue(new Error('API Error'));

      const result = await pwaBadge.setCount(5);

      expect(result).toBe(false);
    });

    it('should handle clearAppBadge errors gracefully', async () => {
      mockClearAppBadge.mockRejectedValue(new Error('API Error'));

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
