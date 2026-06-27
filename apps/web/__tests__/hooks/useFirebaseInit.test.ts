/**
 * Tests for hooks/use-firebase-init.ts
 */

jest.mock('@/utils/firebase-availability-checker', () => ({
  firebaseChecker: {
    check: jest.fn(),
    getDebugReport: jest.fn(() => ({ available: false })),
  },
  FirebaseStatus: {},
}));

import { renderHook, waitFor } from '@testing-library/react';
import { useFirebaseInit, useIsFirebaseAvailable } from '@/hooks/use-firebase-init';
import { firebaseChecker } from '@/utils/firebase-availability-checker';

const mockCheck = firebaseChecker.check as jest.MockedFunction<typeof firebaseChecker.check>;
const mockGetDebugReport = firebaseChecker.getDebugReport as jest.MockedFunction<
  typeof firebaseChecker.getDebugReport
>;

const makeStatus = (overrides = {}) => ({
  available: true,
  pushEnabled: true,
  badgeEnabled: false,
  ...overrides,
});

describe('useFirebaseInit', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts with loading:true and unavailable status', () => {
    mockCheck.mockReturnValue(new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useFirebaseInit());

    expect(result.current.loading).toBe(true);
    expect(result.current.isAvailable).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets status when check resolves', async () => {
    const status = makeStatus({ available: true, pushEnabled: true, badgeEnabled: false });
    mockCheck.mockResolvedValue(status);

    const { result } = renderHook(() => useFirebaseInit());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isAvailable).toBe(true);
    expect(result.current.isPushEnabled).toBe(true);
    expect(result.current.isBadgeEnabled).toBe(false);
  });

  it('sets error and unavailable when check throws', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockCheck.mockRejectedValue(new Error('Firebase blocked'));

    const { result } = renderHook(() => useFirebaseInit());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isAvailable).toBe(false);
    expect(result.current.error).toBe('Firebase blocked');

    consoleSpy.mockRestore();
  });

  it('sets generic error message for non-Error exceptions', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockCheck.mockRejectedValue('string error');

    const { result } = renderHook(() => useFirebaseInit());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Unknown error');

    consoleSpy.mockRestore();
  });

  it('times out after 5 seconds and sets error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockCheck.mockReturnValue(new Promise(() => {})); // never resolves

    const { result } = renderHook(() => useFirebaseInit());

    jest.advanceTimersByTime(5000);

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.isAvailable).toBe(false);
    expect(result.current.error).toContain('timeout');

    consoleSpy.mockRestore();
  });

  it('exposes getDebugReport function', async () => {
    mockCheck.mockResolvedValue(makeStatus());

    const { result } = renderHook(() => useFirebaseInit());

    await waitFor(() => expect(result.current.loading).toBe(false));

    result.current.getDebugReport();
    expect(mockGetDebugReport).toHaveBeenCalled();
  });

  it('returns status fields directly', async () => {
    const status = makeStatus({ available: false, pushEnabled: false, badgeEnabled: false });
    mockCheck.mockResolvedValue(status);

    const { result } = renderHook(() => useFirebaseInit());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.status).toEqual(status);
  });
});

describe('useIsFirebaseAvailable', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns true when Firebase is available', async () => {
    mockCheck.mockResolvedValue(makeStatus({ available: true }));

    const { result } = renderHook(() => useIsFirebaseAvailable());

    await waitFor(() => expect(result.current).toBe(true));
  });

  it('returns false when Firebase is not available', async () => {
    mockCheck.mockResolvedValue(makeStatus({ available: false }));

    const { result } = renderHook(() => useIsFirebaseAvailable());

    await waitFor(() => expect(result.current).toBe(false));
  });

  it('starts as false before check completes', () => {
    mockCheck.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useIsFirebaseAvailable());

    expect(result.current).toBe(false);
  });
});
