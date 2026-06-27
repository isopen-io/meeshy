/**
 * Tests for utils/pwa-badge.ts
 */

const mockIsBadgeEnabled = jest.fn(() => false);
const mockIsAvailable = jest.fn(() => false);

jest.mock('@/utils/firebase-availability-checker', () => ({
  firebaseChecker: {
    isAvailable: () => mockIsAvailable(),
    isBadgeEnabled: () => mockIsBadgeEnabled(),
    isPushEnabled: jest.fn(() => false),
  },
}));

import {
  getBadgeManager,
  resetBadgeManager,
  pwaBadge,
} from '@/utils/pwa-badge';

const mockSetAppBadge = jest.fn().mockResolvedValue(undefined);
const mockClearAppBadge = jest.fn().mockResolvedValue(undefined);

beforeEach(() => {
  jest.clearAllMocks();
  // Reset implementations so previous test mockRejectedValue doesn't leak
  mockSetAppBadge.mockResolvedValue(undefined);
  mockClearAppBadge.mockResolvedValue(undefined);
  resetBadgeManager();
  mockIsBadgeEnabled.mockReturnValue(true);

  // Install Badging API on navigator
  Object.defineProperty(navigator, 'setAppBadge', {
    value: mockSetAppBadge,
    writable: true,
    configurable: true,
  });
  Object.defineProperty(navigator, 'clearAppBadge', {
    value: mockClearAppBadge,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  resetBadgeManager();
});

// ─── isBadgingSupported ───────────────────────────────────────────────────────

describe('isBadgingSupported', () => {
  it('returns true when setAppBadge and clearAppBadge are on navigator', () => {
    expect(getBadgeManager().isBadgingSupported()).toBe(true);
  });

  it('returns false when Badging API is absent', () => {
    delete (navigator as unknown as Record<string, unknown>).setAppBadge;
    delete (navigator as unknown as Record<string, unknown>).clearAppBadge;
    expect(getBadgeManager().isBadgingSupported()).toBe(false);
  });
});

// ─── setBadgeCount ────────────────────────────────────────────────────────────

describe('setBadgeCount', () => {
  it('returns false when firebaseChecker.isBadgeEnabled() = false', async () => {
    mockIsBadgeEnabled.mockReturnValue(false);
    const result = await getBadgeManager().setBadgeCount(5);
    expect(result).toBe(false);
    expect(mockSetAppBadge).not.toHaveBeenCalled();
  });

  it('calls navigator.setAppBadge with count', async () => {
    const result = await getBadgeManager().setBadgeCount(3);
    expect(result).toBe(true);
    expect(mockSetAppBadge).toHaveBeenCalledWith(3);
  });

  it('clears badge when count is 0', async () => {
    await getBadgeManager().setBadgeCount(0);
    expect(mockClearAppBadge).toHaveBeenCalled();
    expect(mockSetAppBadge).not.toHaveBeenCalled();
  });

  it('clears badge when count is undefined', async () => {
    await getBadgeManager().setBadgeCount(undefined);
    expect(mockClearAppBadge).toHaveBeenCalled();
  });

  it('returns false when Badge API not supported', async () => {
    delete (navigator as unknown as Record<string, unknown>).setAppBadge;
    delete (navigator as unknown as Record<string, unknown>).clearAppBadge;
    const result = await getBadgeManager().setBadgeCount(5);
    expect(result).toBe(false);
  });

  it('returns false when setAppBadge throws', async () => {
    mockSetAppBadge.mockRejectedValue(new Error('denied'));
    const result = await getBadgeManager().setBadgeCount(5);
    expect(result).toBe(false);
  });

  it('updates getCurrentCount after success', async () => {
    await getBadgeManager().setBadgeCount(7);
    expect(getBadgeManager().getCurrentCount()).toBe(7);
  });
});

// ─── setBadge (no count) ──────────────────────────────────────────────────────

describe('setBadge', () => {
  it('calls setAppBadge() with no argument', async () => {
    const result = await getBadgeManager().setBadge();
    expect(result).toBe(true);
    expect(mockSetAppBadge).toHaveBeenCalledWith();
  });

  it('returns false when firebase badge disabled', async () => {
    mockIsBadgeEnabled.mockReturnValue(false);
    const result = await getBadgeManager().setBadge();
    expect(result).toBe(false);
  });

  it('returns false when Badge API not supported', async () => {
    delete (navigator as unknown as Record<string, unknown>).setAppBadge;
    delete (navigator as unknown as Record<string, unknown>).clearAppBadge;
    const result = await getBadgeManager().setBadge();
    expect(result).toBe(false);
  });

  it('sets currentCount to -1 on success', async () => {
    await getBadgeManager().setBadge();
    expect(getBadgeManager().getCurrentCount()).toBe(-1);
  });
});

// ─── clearBadge ───────────────────────────────────────────────────────────────

describe('clearBadge', () => {
  it('calls navigator.clearAppBadge', async () => {
    const result = await getBadgeManager().clearBadge();
    expect(result).toBe(true);
    expect(mockClearAppBadge).toHaveBeenCalled();
  });

  it('returns false when Badge API not supported', async () => {
    delete (navigator as unknown as Record<string, unknown>).setAppBadge;
    delete (navigator as unknown as Record<string, unknown>).clearAppBadge;
    const result = await getBadgeManager().clearBadge();
    expect(result).toBe(false);
  });

  it('resets currentCount to 0', async () => {
    await getBadgeManager().setBadgeCount(5);
    await getBadgeManager().clearBadge();
    expect(getBadgeManager().getCurrentCount()).toBe(0);
  });

  it('returns false when clearAppBadge throws', async () => {
    mockClearAppBadge.mockRejectedValue(new Error('denied'));
    const result = await getBadgeManager().clearBadge();
    expect(result).toBe(false);
  });
});

// ─── incrementBadge / decrementBadge ─────────────────────────────────────────

describe('incrementBadge', () => {
  it('increments count by 1 by default', async () => {
    await getBadgeManager().setBadgeCount(2);
    await getBadgeManager().incrementBadge();
    expect(mockSetAppBadge).toHaveBeenLastCalledWith(3);
  });

  it('increments by custom amount', async () => {
    await getBadgeManager().setBadgeCount(5);
    await getBadgeManager().incrementBadge(3);
    expect(mockSetAppBadge).toHaveBeenLastCalledWith(8);
  });

  it('returns false when Badge API not supported', async () => {
    delete (navigator as unknown as Record<string, unknown>).setAppBadge;
    delete (navigator as unknown as Record<string, unknown>).clearAppBadge;
    const result = await getBadgeManager().incrementBadge();
    expect(result).toBe(false);
  });

  it('returns false when currentCount is -1 (badge without count)', async () => {
    await getBadgeManager().setBadge();
    const result = await getBadgeManager().incrementBadge();
    expect(result).toBe(false);
  });
});

describe('decrementBadge', () => {
  it('decrements count by 1 by default', async () => {
    await getBadgeManager().setBadgeCount(5);
    await getBadgeManager().decrementBadge();
    expect(mockSetAppBadge).toHaveBeenLastCalledWith(4);
  });

  it('does not go below 0', async () => {
    await getBadgeManager().setBadgeCount(1);
    await getBadgeManager().decrementBadge(5);
    expect(mockClearAppBadge).toHaveBeenCalled();
  });
});

// ─── syncWithServiceWorker ────────────────────────────────────────────────────

describe('syncWithServiceWorker', () => {
  it('does nothing when Badge API not supported', async () => {
    delete (navigator as unknown as Record<string, unknown>).setAppBadge;
    delete (navigator as unknown as Record<string, unknown>).clearAppBadge;
    // Should not throw
    await expect(getBadgeManager().syncWithServiceWorker()).resolves.toBeUndefined();
  });

  it('posts SET_BADGE to service worker controller when available', async () => {
    const postMessage = jest.fn();
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { controller: { postMessage }, register: jest.fn() },
      writable: true,
      configurable: true,
    });

    await getBadgeManager().setBadgeCount(3);
    await getBadgeManager().syncWithServiceWorker();
    expect(postMessage).toHaveBeenCalledWith({ type: 'SET_BADGE', count: 3 });
  });

  it('does nothing when no serviceWorker controller', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { controller: null },
      writable: true,
      configurable: true,
    });
    await expect(getBadgeManager().syncWithServiceWorker()).resolves.toBeUndefined();
  });
});

// ─── onSupportCheck callback ──────────────────────────────────────────────────

describe('onSupportCheck callback', () => {
  it('calls onSupportCheck(true) when API is available', () => {
    const onSupportCheck = jest.fn();
    new (getBadgeManager().constructor as unknown as new (opts: object) => object)({ onSupportCheck });
  });

  it('calls onSupportCheck during construction', () => {
    const onSupportCheck = jest.fn();
    resetBadgeManager();
    getBadgeManager({ onSupportCheck });
    expect(onSupportCheck).toHaveBeenCalledWith(true);
  });
});

// ─── onError callback ─────────────────────────────────────────────────────────

describe('onError callback', () => {
  it('calls onError when setAppBadge throws', async () => {
    const onError = jest.fn();
    resetBadgeManager();
    const mgr = getBadgeManager({ onError });
    mockSetAppBadge.mockRejectedValue(new Error('crash'));
    await mgr.setBadgeCount(5);
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ─── pwaBadge facade ──────────────────────────────────────────────────────────

describe('pwaBadge facade', () => {
  it('isSupported delegates to getBadgeManager().isBadgingSupported()', () => {
    expect(pwaBadge.isSupported()).toBe(true);
  });

  it('setCount delegates to setBadgeCount', async () => {
    const result = await pwaBadge.setCount(4);
    expect(result).toBe(true);
    expect(mockSetAppBadge).toHaveBeenCalledWith(4);
  });

  it('set delegates to setBadge', async () => {
    const result = await pwaBadge.set();
    expect(result).toBe(true);
    expect(mockSetAppBadge).toHaveBeenCalledWith();
  });

  it('clear delegates to clearBadge', async () => {
    const result = await pwaBadge.clear();
    expect(result).toBe(true);
    expect(mockClearAppBadge).toHaveBeenCalled();
  });

  it('getCount returns currentCount', async () => {
    await pwaBadge.setCount(9);
    expect(pwaBadge.getCount()).toBe(9);
  });

  it('increment increments the badge', async () => {
    await pwaBadge.setCount(2);
    await pwaBadge.increment();
    expect(mockSetAppBadge).toHaveBeenLastCalledWith(3);
  });

  it('decrement decrements the badge', async () => {
    await pwaBadge.setCount(3);
    await pwaBadge.decrement();
    expect(mockSetAppBadge).toHaveBeenLastCalledWith(2);
  });
});
