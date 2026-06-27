/**
 * Tests for hooks/use-dashboard-data.ts
 */

const mockUseUser = jest.fn();

jest.mock('@/stores', () => ({
  useUser: () => mockUseUser(),
}));

const mockGetDashboardData = jest.fn();

jest.mock('@/services/dashboard.service', () => ({
  dashboardService: {
    getDashboardData: () => mockGetDashboardData(),
  },
}));

jest.mock('@/utils/logger', () => ({
  logger: { error: jest.fn() },
}));

import { renderHook, waitFor } from '@testing-library/react';
import { useDashboardData } from '@/hooks/use-dashboard-data';

const FAKE_USER = { id: 'user-1', username: 'alice' };
const FAKE_DATA = { conversations: [], stats: {} };

beforeEach(() => {
  jest.clearAllMocks();
  mockUseUser.mockReturnValue(FAKE_USER);
  mockGetDashboardData.mockResolvedValue({ data: FAKE_DATA });
});

// ─── no user ──────────────────────────────────────────────────────────────────

describe('when user is not logged in', () => {
  it('sets isLoading=false immediately without fetching', async () => {
    mockUseUser.mockReturnValue(null);
    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockGetDashboardData).not.toHaveBeenCalled();
  });

  it('data remains null when no user', async () => {
    mockUseUser.mockReturnValue(null);
    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeNull();
  });
});

// ─── successful fetch ─────────────────────────────────────────────────────────

describe('successful fetch', () => {
  it('calls getDashboardData on mount', async () => {
    renderHook(() => useDashboardData());
    await waitFor(() => expect(mockGetDashboardData).toHaveBeenCalledTimes(1));
  });

  it('sets data on success', async () => {
    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.data).toEqual(FAKE_DATA));
  });

  it('isLoading becomes false after data loads', async () => {
    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('error is null on success', async () => {
    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.data).toBeTruthy());
    expect(result.current.error).toBeNull();
  });

  it('isPending is true before data arrives', () => {
    mockGetDashboardData.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useDashboardData());
    expect(result.current.isPending).toBe(true);
  });

  it('isPending becomes false after data arrives', async () => {
    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.isPending).toBe(false));
  });

  it('isFetching is false on cold start (no cached data)', async () => {
    const { result } = renderHook(() => useDashboardData());
    // Initially no data yet, so isFetching = isLoading && !!data = false
    expect(result.current.isFetching).toBe(false);
  });
});

// ─── error handling ───────────────────────────────────────────────────────────

describe('error handling', () => {
  it('sets error when getDashboardData throws', async () => {
    mockGetDashboardData.mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.error).toBeTruthy());
    expect(result.current.error?.message).toBe('network error');
  });

  it('isLoading becomes false after error', async () => {
    mockGetDashboardData.mockRejectedValue(new Error('oops'));
    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('sets error when response has no data', async () => {
    mockGetDashboardData.mockResolvedValue({ data: null });
    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.error).toBeTruthy());
  });
});

// ─── refetch ──────────────────────────────────────────────────────────────────

describe('refetch', () => {
  it('calls getDashboardData again when refetch is called', async () => {
    const { result } = renderHook(() => useDashboardData());
    await waitFor(() => expect(result.current.data).toBeTruthy());
    mockGetDashboardData.mockClear();
    await result.current.refetch();
    expect(mockGetDashboardData).toHaveBeenCalledTimes(1);
  });
});
