const mockSetAppBadge = jest.fn().mockResolvedValue(undefined);
const mockClearAppBadge = jest.fn().mockResolvedValue(undefined);

beforeEach(() => {
  jest.resetAllMocks();
  Object.defineProperty(navigator, 'setAppBadge', { value: mockSetAppBadge, writable: true, configurable: true });
  Object.defineProperty(navigator, 'clearAppBadge', { value: mockClearAppBadge, writable: true, configurable: true });
  mockSetAppBadge.mockResolvedValue(undefined);
  mockClearAppBadge.mockResolvedValue(undefined);
});

import { isBadgingSupported, updateAppBadge, clearAppBadge } from '@/utils/badge';

describe('isBadgingSupported', () => {
  it('returns true when both setAppBadge and clearAppBadge exist on navigator', () => {
    expect(isBadgingSupported()).toBe(true);
  });

  it('returns false when setAppBadge is missing', () => {
    const nav = navigator as Record<string, unknown>;
    delete nav['setAppBadge'];
    expect(isBadgingSupported()).toBe(false);
  });

  it('returns false when clearAppBadge is missing', () => {
    const nav = navigator as Record<string, unknown>;
    delete nav['clearAppBadge'];
    expect(isBadgingSupported()).toBe(false);
  });
});

describe('updateAppBadge', () => {
  it('calls setAppBadge with count when count is a positive number', async () => {
    await updateAppBadge(5);
    expect(mockSetAppBadge).toHaveBeenCalledWith(5);
    expect(mockClearAppBadge).not.toHaveBeenCalled();
  });

  it('calls clearAppBadge when count is 0', async () => {
    await updateAppBadge(0);
    expect(mockClearAppBadge).toHaveBeenCalled();
    expect(mockSetAppBadge).not.toHaveBeenCalled();
  });

  it('calls setAppBadge with no arguments when count is undefined', async () => {
    await updateAppBadge();
    expect(mockSetAppBadge).toHaveBeenCalledWith();
    expect(mockClearAppBadge).not.toHaveBeenCalled();
  });

  it('does not call setAppBadge when badging is not supported', async () => {
    const nav = navigator as Record<string, unknown>;
    delete nav['setAppBadge'];
    delete nav['clearAppBadge'];
    await updateAppBadge(3);
    expect(mockSetAppBadge).not.toHaveBeenCalled();
  });

  it('does not throw when setAppBadge rejects', async () => {
    mockSetAppBadge.mockRejectedValueOnce(new Error('Permission denied'));
    await expect(updateAppBadge(1)).resolves.toBeUndefined();
  });
});

describe('clearAppBadge', () => {
  it('calls navigator.clearAppBadge when badging is supported', async () => {
    await clearAppBadge();
    expect(mockClearAppBadge).toHaveBeenCalled();
  });

  it('does not throw when badging is not supported', async () => {
    const nav = navigator as Record<string, unknown>;
    delete nav['setAppBadge'];
    delete nav['clearAppBadge'];
    await expect(clearAppBadge()).resolves.toBeUndefined();
  });
});
