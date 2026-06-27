/**
 * Tests for hooks/use-push-notifications.ts
 */

const mockSubscribeToPushNotifications = jest.fn();
const mockUnsubscribeFromPushNotifications = jest.fn();
const mockGetCurrentSubscription = jest.fn();
const mockIsPushNotificationSupported = jest.fn(() => true);
const mockCanReceivePushNotifications = jest.fn();

jest.mock('@/utils/push-notifications', () => ({
  subscribeToPushNotifications: (...args: unknown[]) => mockSubscribeToPushNotifications(...args),
  unsubscribeFromPushNotifications: () => mockUnsubscribeFromPushNotifications(),
  getCurrentSubscription: () => mockGetCurrentSubscription(),
  isPushNotificationSupported: () => mockIsPushNotificationSupported(),
  canReceivePushNotifications: () => mockCanReceivePushNotifications(),
}));

jest.mock('@/utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

import { renderHook, act, waitFor } from '@testing-library/react';
import { usePushNotifications, useCanReceivePushNotifications } from '@/hooks/use-push-notifications';

const makeSub = (endpoint = 'https://push.example.com/sub') =>
  ({ endpoint, toJSON: () => ({ endpoint }), unsubscribe: jest.fn() } as unknown as PushSubscription);

/** Wait for the mount effect (refresh) to complete */
const waitForMount = () => waitFor(() => expect(mockGetCurrentSubscription).toHaveBeenCalled());

beforeEach(() => {
  jest.clearAllMocks();
  mockIsPushNotificationSupported.mockReturnValue(true);
  mockGetCurrentSubscription.mockResolvedValue(null);
  mockSubscribeToPushNotifications.mockResolvedValue(null);
  mockUnsubscribeFromPushNotifications.mockResolvedValue(false);
  mockCanReceivePushNotifications.mockResolvedValue(false);
  mockFetch.mockResolvedValue({ ok: true });
  delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('isLoading starts false', () => {
    const { result } = renderHook(() => usePushNotifications());
    expect(result.current.isLoading).toBe(false);
  });

  it('subscription starts null after mount', async () => {
    const { result } = renderHook(() => usePushNotifications());
    await waitForMount();
    expect(result.current.subscription).toBeNull();
  });

  it('isSubscribed is false when no subscription', async () => {
    const { result } = renderHook(() => usePushNotifications());
    await waitForMount();
    expect(result.current.isSubscribed).toBe(false);
  });

  it('isSupported reflects isPushNotificationSupported()', () => {
    mockIsPushNotificationSupported.mockReturnValue(false);
    const { result } = renderHook(() => usePushNotifications());
    expect(result.current.isSupported).toBe(false);
  });
});

// ─── refresh / mount ──────────────────────────────────────────────────────────

describe('refresh', () => {
  it('loads existing subscription on mount', async () => {
    const sub = makeSub();
    mockGetCurrentSubscription.mockResolvedValue(sub);
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.subscription).toBe(sub));
    expect(result.current.isSubscribed).toBe(true);
  });

  it('does not call getCurrentSubscription when not supported', () => {
    mockIsPushNotificationSupported.mockReturnValue(false);
    renderHook(() => usePushNotifications());
    expect(mockGetCurrentSubscription).not.toHaveBeenCalled();
  });
});

// ─── subscribe ────────────────────────────────────────────────────────────────

describe('subscribe', () => {
  it('returns null when not supported', async () => {
    mockIsPushNotificationSupported.mockReturnValue(false);
    const { result } = renderHook(() => usePushNotifications());
    const sub = await act(async () => result.current.subscribe());
    expect(sub).toBeNull();
    expect(mockSubscribeToPushNotifications).not.toHaveBeenCalled();
  });

  it('returns null when VAPID key is missing', async () => {
    const { result } = renderHook(() => usePushNotifications());
    await waitForMount();
    const sub = await act(async () => result.current.subscribe());
    expect(sub).toBeNull();
  });

  it('calls subscribeToPushNotifications with VAPID key', async () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-vapid-key';
    const sub = makeSub();
    mockSubscribeToPushNotifications.mockResolvedValue(sub);
    const { result } = renderHook(() => usePushNotifications());
    await waitForMount();
    await act(async () => { await result.current.subscribe(); });
    expect(mockSubscribeToPushNotifications).toHaveBeenCalledWith('test-vapid-key');
  });

  it('sets subscription on success', async () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-vapid-key';
    const sub = makeSub();
    mockSubscribeToPushNotifications.mockResolvedValue(sub);
    const { result } = renderHook(() => usePushNotifications());
    await waitForMount();
    await act(async () => { await result.current.subscribe(); });
    expect(result.current.subscription).toBe(sub);
    expect(result.current.isSubscribed).toBe(true);
  });

  it('isSubscribed becomes true after successful subscribe', async () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'test-vapid-key';
    const sub = makeSub();
    mockSubscribeToPushNotifications.mockResolvedValue(sub);
    const { result } = renderHook(() => usePushNotifications());
    await waitForMount();
    await act(async () => { await result.current.subscribe(); });
    expect(result.current.isSubscribed).toBe(true);
  });
});

// ─── unsubscribe ──────────────────────────────────────────────────────────────

describe('unsubscribe', () => {
  it('calls unsubscribeFromPushNotifications', async () => {
    mockUnsubscribeFromPushNotifications.mockResolvedValue(true);
    const { result } = renderHook(() => usePushNotifications());
    await waitForMount();
    await act(async () => { await result.current.unsubscribe(); });
    expect(mockUnsubscribeFromPushNotifications).toHaveBeenCalled();
  });

  it('clears subscription on success', async () => {
    const sub = makeSub();
    mockGetCurrentSubscription.mockResolvedValue(sub);
    mockUnsubscribeFromPushNotifications.mockResolvedValue(true);
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.subscription).toBe(sub));
    await act(async () => { await result.current.unsubscribe(); });
    expect(result.current.subscription).toBeNull();
  });

  it('keeps subscription when unsubscribe fails', async () => {
    const sub = makeSub();
    mockGetCurrentSubscription.mockResolvedValue(sub);
    mockUnsubscribeFromPushNotifications.mockResolvedValue(false);
    const { result } = renderHook(() => usePushNotifications());
    await waitFor(() => expect(result.current.subscription).toBe(sub));
    await act(async () => { await result.current.unsubscribe(); });
    expect(result.current.subscription).toBe(sub);
  });

  it('returns the boolean result from unsubscribeFromPushNotifications', async () => {
    mockUnsubscribeFromPushNotifications.mockResolvedValue(false);
    const { result } = renderHook(() => usePushNotifications());
    await waitForMount();
    const ok = await act(async () => result.current.unsubscribe());
    expect(ok).toBe(false);
  });
});

// ─── useCanReceivePushNotifications ──────────────────────────────────────────

describe('useCanReceivePushNotifications', () => {
  it('starts false and resolves to the utility result', async () => {
    mockCanReceivePushNotifications.mockResolvedValue(true);
    const { result } = renderHook(() => useCanReceivePushNotifications());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('stays false when canReceivePushNotifications resolves false', async () => {
    mockCanReceivePushNotifications.mockResolvedValue(false);
    const { result } = renderHook(() => useCanReceivePushNotifications());
    await act(async () => {});
    expect(result.current).toBe(false);
  });
});
