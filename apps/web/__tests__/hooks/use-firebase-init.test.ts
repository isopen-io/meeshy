/**
 * Tests for hooks/use-firebase-init.ts
 */

const mockCheck = jest.fn();
jest.mock('@/utils/firebase-availability-checker', () => ({
  firebaseChecker: {
    check: () => mockCheck(),
  },
  FirebaseStatus: {},
}));

import { renderHook, waitFor } from '@testing-library/react';
import { useFirebaseInit } from '@/hooks/use-firebase-init';

const availableStatus = { available: true, pushEnabled: true, badgeEnabled: true };
const unavailableStatus = { available: false, pushEnabled: false, badgeEnabled: false };

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockCheck.mockResolvedValue(availableStatus);
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('loading starts true', () => {
    const { result } = renderHook(() => useFirebaseInit());
    expect(result.current.loading).toBe(true);
  });

  it('status.available starts false', () => {
    const { result } = renderHook(() => useFirebaseInit());
    expect(result.current.status.available).toBe(false);
  });

  it('error starts null', () => {
    const { result } = renderHook(() => useFirebaseInit());
    expect(result.current.error).toBeNull();
  });
});

// ─── successful check ─────────────────────────────────────────────────────────

describe('successful Firebase check', () => {
  it('sets loading=false after check completes', async () => {
    mockCheck.mockResolvedValue(availableStatus);
    const { result } = renderHook(() => useFirebaseInit());
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('sets status.available=true when Firebase is available', async () => {
    mockCheck.mockResolvedValue(availableStatus);
    const { result } = renderHook(() => useFirebaseInit());
    await waitFor(() => expect(result.current.status.available).toBe(true));
  });

  it('sets pushEnabled and badgeEnabled from check result', async () => {
    mockCheck.mockResolvedValue(availableStatus);
    const { result } = renderHook(() => useFirebaseInit());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status.pushEnabled).toBe(true);
    expect(result.current.status.badgeEnabled).toBe(true);
  });

  it('sets status.available=false when Firebase is not available', async () => {
    mockCheck.mockResolvedValue(unavailableStatus);
    const { result } = renderHook(() => useFirebaseInit());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status.available).toBe(false);
  });
});

// ─── error / timeout handling ─────────────────────────────────────────────────

describe('error handling', () => {
  it('sets loading=false on check error', async () => {
    mockCheck.mockRejectedValue(new Error('firebase failed'));
    const { result } = renderHook(() => useFirebaseInit());
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('falls back to unavailable status on error', async () => {
    mockCheck.mockRejectedValue(new Error('firebase failed'));
    const { result } = renderHook(() => useFirebaseInit());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status.available).toBe(false);
  });

  it('times out after 5 seconds and falls back gracefully', async () => {
    mockCheck.mockImplementation(
      () => new Promise(resolve => setTimeout(() => resolve(availableStatus), 10000))
    );
    const { result } = renderHook(() => useFirebaseInit());
    jest.advanceTimersByTime(6000);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.status.available).toBe(false);
  });
});

// ─── unmount cleanup ──────────────────────────────────────────────────────────

describe('cleanup', () => {
  it('does not update state after unmount', async () => {
    let resolveCheck: (v: any) => void;
    mockCheck.mockImplementation(() => new Promise(resolve => { resolveCheck = resolve; }));

    const { result, unmount } = renderHook(() => useFirebaseInit());
    unmount();
    resolveCheck!(availableStatus);

    // State should remain in its initial state (loading=true) after unmount
    expect(result.current.loading).toBe(true);
    expect(result.current.status.available).toBe(false);
  });
});
