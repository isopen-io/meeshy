/**
 * Tests for hooks/use-dashboard-data.ts
 */

jest.mock('@/stores', () => ({
  useUser: jest.fn(),
}));

jest.mock('@/services/dashboard.service', () => ({
  dashboardService: {
    getDashboardData: jest.fn(),
  },
}));

jest.mock('@/utils/logger', () => ({
  logger: { error: jest.fn() },
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { useDashboardData } from '@/hooks/use-dashboard-data';
import { useUser } from '@/stores';
import { dashboardService } from '@/services/dashboard.service';
import type { DashboardData } from '@/services/dashboard.service';

const mockUseUser = useUser as jest.MockedFunction<typeof useUser>;
const mockGetDashboardData = dashboardService.getDashboardData as jest.MockedFunction<
  typeof dashboardService.getDashboardData
>;

const makeDashboardData = (): DashboardData =>
  ({
    totalConversations: 5,
    totalMessages: 100,
    totalUsers: 10,
    recentActivity: [],
  } as unknown as DashboardData);

const makeUser = () => ({ id: 'user-1', username: 'test' } as ReturnType<typeof useUser>);

describe('useDashboardData', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('starts loading with no data (isPending)', async () => {
    mockUseUser.mockReturnValue(makeUser());
    mockGetDashboardData.mockResolvedValue({ data: makeDashboardData(), success: true });

    const { result } = renderHook(() => useDashboardData());

    expect(result.current.isPending).toBe(true);
    expect(result.current.data).toBeNull();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('sets data on successful fetch', async () => {
    const dashData = makeDashboardData();
    mockUseUser.mockReturnValue(makeUser());
    mockGetDashboardData.mockResolvedValue({ data: dashData, success: true });

    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => expect(result.current.data).not.toBeNull());

    expect(result.current.data).toEqual(dashData);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('does not fetch when user is null', async () => {
    mockUseUser.mockReturnValue(null);

    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(mockGetDashboardData).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
  });

  it('sets error on fetch failure', async () => {
    mockUseUser.mockReturnValue(makeUser());
    mockGetDashboardData.mockRejectedValue(new Error('Server error'));

    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('Server error');
    expect(result.current.data).toBeNull();
  });

  it('sets error when response has no data', async () => {
    mockUseUser.mockReturnValue(makeUser());
    mockGetDashboardData.mockResolvedValue({ success: false, data: undefined });

    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error?.message).toBe('Failed to load dashboard data');
  });

  it('wraps non-Error exceptions in Error', async () => {
    mockUseUser.mockReturnValue(makeUser());
    mockGetDashboardData.mockRejectedValue('string error');

    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error?.message).toBe('Unknown error occurred');
  });

  it('isPending is true when loading with no data', async () => {
    mockUseUser.mockReturnValue(makeUser());
    mockGetDashboardData.mockResolvedValue({ data: makeDashboardData(), success: true });

    const { result } = renderHook(() => useDashboardData());

    expect(result.current.isPending).toBe(true);
    expect(result.current.isFetching).toBe(false);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  it('returns a refetch function', async () => {
    const dashData = makeDashboardData();
    mockUseUser.mockReturnValue(makeUser());
    mockGetDashboardData.mockResolvedValue({ data: dashData, success: true });

    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => expect(result.current.data).not.toBeNull());

    expect(typeof result.current.refetch).toBe('function');
  });

  it('refetch forces a new API call bypassing cache', async () => {
    const dashData = makeDashboardData();
    mockUseUser.mockReturnValue(makeUser());
    mockGetDashboardData.mockResolvedValue({ data: dashData, success: true });

    const { result } = renderHook(() => useDashboardData());

    await waitFor(() => expect(result.current.data).not.toBeNull());

    expect(mockGetDashboardData).toHaveBeenCalledTimes(1);

    await act(async () => {
      result.current.refetch();
    });

    await waitFor(() => expect(mockGetDashboardData).toHaveBeenCalledTimes(2));
  });
});
