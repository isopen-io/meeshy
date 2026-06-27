/**
 * Tests for hooks/use-live-user-status.ts
 */

const mockUseUserById = jest.fn(() => null);
const mockUseUserStatusTick = jest.fn();
jest.mock('@/stores/user-store', () => ({
  useUserById: (id: string | undefined) => mockUseUserById(id),
  useUserStatusTick: () => mockUseUserStatusTick(),
}));

const mockGetUserStatus = jest.fn(() => 'offline' as const);
jest.mock('@/lib/user-status', () => ({
  getUserStatus: (user: unknown) => mockGetUserStatus(user),
}));

import { renderHook } from '@testing-library/react';
import { useLiveUserStatus } from '@/hooks/use-live-user-status';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetUserStatus.mockReturnValue('offline');
  mockUseUserById.mockReturnValue(null);
});

// ─── return value ──────────────────────────────────────────────────────────────

describe('return value', () => {
  it('returns offline when no user and no fallback', () => {
    mockGetUserStatus.mockReturnValue('offline');
    const { result } = renderHook(() => useLiveUserStatus(undefined));
    expect(result.current).toBe('offline');
  });

  it('returns online when getUserStatus returns online', () => {
    mockGetUserStatus.mockReturnValue('online');
    const { result } = renderHook(() => useLiveUserStatus('u1'));
    expect(result.current).toBe('online');
  });

  it('returns away when getUserStatus returns away', () => {
    mockGetUserStatus.mockReturnValue('away');
    const { result } = renderHook(() => useLiveUserStatus('u1'));
    expect(result.current).toBe('away');
  });
});

// ─── store user takes precedence ───────────────────────────────────────────────

describe('store user takes precedence over fallback', () => {
  it('passes store user to getUserStatus when found', () => {
    const storeUser = { id: 'u1', isOnline: true, lastActiveAt: new Date() };
    mockUseUserById.mockReturnValue(storeUser);
    renderHook(() => useLiveUserStatus('u1', { isOnline: false }));
    expect(mockGetUserStatus).toHaveBeenCalledWith(storeUser);
  });

  it('passes fallback to getUserStatus when store user is null', () => {
    const fallback = { isOnline: true, lastActiveAt: new Date() };
    mockUseUserById.mockReturnValue(null);
    renderHook(() => useLiveUserStatus('u1', fallback));
    expect(mockGetUserStatus).toHaveBeenCalledWith(fallback);
  });

  it('calls useUserById with the provided userId', () => {
    renderHook(() => useLiveUserStatus('user-42'));
    expect(mockUseUserById).toHaveBeenCalledWith('user-42');
  });

  it('calls useUserById with undefined when no userId provided', () => {
    renderHook(() => useLiveUserStatus());
    expect(mockUseUserById).toHaveBeenCalledWith(undefined);
  });
});

// ─── tick subscription ────────────────────────────────────────────────────────

describe('status tick', () => {
  it('subscribes to status tick on each render', () => {
    renderHook(() => useLiveUserStatus('u1'));
    expect(mockUseUserStatusTick).toHaveBeenCalled();
  });
});
