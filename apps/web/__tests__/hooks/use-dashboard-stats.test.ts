/**
 * Tests for hooks/use-dashboard-stats.ts
 */

import { renderHook } from '@testing-library/react';
import { useDashboardStats } from '@/hooks/use-dashboard-stats';
import type { DashboardData } from '@/services/dashboard.service';

const makeStats = () => ({
  totalConversations: 5,
  totalCommunities: 2,
  totalMessages: 100,
  activeConversations: 3,
  translationsToday: 50,
  totalLinks: 10,
  lastUpdated: new Date('2024-01-01'),
});

const makeDashboardData = (overrides: Partial<DashboardData> = {}): DashboardData => ({
  stats: makeStats(),
  recentConversations: [],
  recentCommunities: [],
  ...overrides,
});

// ─── null input ───────────────────────────────────────────────────────────────

describe('when dashboardData is null', () => {
  it('returns zero stats', () => {
    const { result } = renderHook(() => useDashboardStats(null));
    expect(result.current.stats.totalConversations).toBe(0);
    expect(result.current.stats.totalMessages).toBe(0);
    expect(result.current.stats.totalCommunities).toBe(0);
    expect(result.current.stats.activeConversations).toBe(0);
    expect(result.current.stats.translationsToday).toBe(0);
    expect(result.current.stats.totalLinks).toBe(0);
  });

  it('returns empty recentConversations', () => {
    const { result } = renderHook(() => useDashboardStats(null));
    expect(result.current.recentConversations).toEqual([]);
  });

  it('returns empty recentCommunities', () => {
    const { result } = renderHook(() => useDashboardStats(null));
    expect(result.current.recentCommunities).toEqual([]);
  });
});

// ─── with data ────────────────────────────────────────────────────────────────

describe('when dashboardData is provided', () => {
  it('returns the provided stats', () => {
    const stats = makeStats();
    const data = makeDashboardData({ stats });
    const { result } = renderHook(() => useDashboardStats(data));
    expect(result.current.stats.totalConversations).toBe(stats.totalConversations);
    expect(result.current.stats.totalMessages).toBe(stats.totalMessages);
    expect(result.current.stats.translationsToday).toBe(stats.translationsToday);
  });

  it('returns the provided recentConversations', () => {
    const conv = { id: 'c1' } as any;
    const data = makeDashboardData({ recentConversations: [conv] });
    const { result } = renderHook(() => useDashboardStats(data));
    expect(result.current.recentConversations).toHaveLength(1);
    expect(result.current.recentConversations[0].id).toBe('c1');
  });

  it('returns the provided recentCommunities', () => {
    const community = { id: 'com1', name: 'Test', members: [], memberCount: 1 };
    const data = makeDashboardData({ recentCommunities: [community] });
    const { result } = renderHook(() => useDashboardStats(data));
    expect(result.current.recentCommunities).toHaveLength(1);
    expect(result.current.recentCommunities[0].name).toBe('Test');
  });
});

// ─── memoization ──────────────────────────────────────────────────────────────

describe('memoization', () => {
  it('returns stable references when data does not change', () => {
    const data = makeDashboardData();
    const { result, rerender } = renderHook(() => useDashboardStats(data));
    const firstStats = result.current.stats;
    rerender();
    expect(result.current.stats).toBe(firstStats);
  });

  it('updates stats when dashboardData changes', () => {
    const { result, rerender } = renderHook(
      ({ data }: { data: DashboardData | null }) => useDashboardStats(data),
      { initialProps: { data: null } }
    );
    expect(result.current.stats.totalConversations).toBe(0);

    rerender({ data: makeDashboardData() });
    expect(result.current.stats.totalConversations).toBe(5);
  });
});
