/**
 * Tests for hooks/use-ranking-data.ts
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useRankingData } from '@/hooks/use-ranking-data';

jest.mock('@/services/admin.service', () => ({
  adminService: {
    getRankings: jest.fn(),
  },
}));

jest.mock('@/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

import { adminService } from '@/services/admin.service';
const mockGetRankings = adminService.getRankings as jest.Mock;

const DEFAULT_PARAMS = {
  entityType: 'users' as const,
  criterion: 'messages',
  period: '7d',
  limit: 10,
};

const ok = (rankings: unknown[]) => ({
  success: true,
  data: { rankings },
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('starts with loading true', async () => {
    mockGetRankings.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useRankingData(DEFAULT_PARAMS));
    expect(result.current.loading).toBe(true);
  });

  it('starts with empty rankings', async () => {
    mockGetRankings.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useRankingData(DEFAULT_PARAMS));
    expect(result.current.rankings).toEqual([]);
  });

  it('starts with null error', async () => {
    mockGetRankings.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useRankingData(DEFAULT_PARAMS));
    expect(result.current.error).toBeNull();
  });
});

// ─── successful fetch ─────────────────────────────────────────────────────────

describe('successful fetch', () => {
  it('sets loading to false after response', async () => {
    mockGetRankings.mockResolvedValueOnce(ok([]));
    const { result } = renderHook(() => useRankingData(DEFAULT_PARAMS));
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it('populates rankings from response', async () => {
    const raw = [
      { id: 'u1', username: 'alice', displayName: 'Alice', count: 5 },
      { id: 'u2', username: 'bob', count: 3 },
    ];
    mockGetRankings.mockResolvedValueOnce(ok(raw));
    const { result } = renderHook(() => useRankingData(DEFAULT_PARAMS));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rankings).toHaveLength(2);
  });

  it('maps displayName to name field', async () => {
    mockGetRankings.mockResolvedValueOnce(ok([
      { id: 'u1', displayName: 'Alice Display', count: 10 },
    ]));
    const { result } = renderHook(() => useRankingData(DEFAULT_PARAMS));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rankings[0].name).toBe('Alice Display');
  });

  it('falls back to username when displayName is absent', async () => {
    mockGetRankings.mockResolvedValueOnce(ok([
      { id: 'u1', username: 'bob', count: 5 },
    ]));
    const { result } = renderHook(() => useRankingData(DEFAULT_PARAMS));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rankings[0].name).toBe('bob');
  });

  it('falls back to "Sans nom" when neither displayName nor username exists', async () => {
    mockGetRankings.mockResolvedValueOnce(ok([{ id: 'u1', count: 2 }]));
    const { result } = renderHook(() => useRankingData(DEFAULT_PARAMS));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rankings[0].name).toBe('Sans nom');
  });

  it('assigns rank starting at 1', async () => {
    mockGetRankings.mockResolvedValueOnce(ok([
      { id: 'u1', count: 10 },
      { id: 'u2', count: 5 },
    ]));
    const { result } = renderHook(() => useRankingData(DEFAULT_PARAMS));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rankings[0].rank).toBe(1);
    expect(result.current.rankings[1].rank).toBe(2);
  });

  it('maps count to value field', async () => {
    mockGetRankings.mockResolvedValueOnce(ok([{ id: 'u1', count: 42 }]));
    const { result } = renderHook(() => useRankingData(DEFAULT_PARAMS));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rankings[0].value).toBe(42);
  });

  it('stores the raw item as metadata', async () => {
    const raw = { id: 'u1', username: 'alice', count: 10, extra: 'field' };
    mockGetRankings.mockResolvedValueOnce(ok([raw]));
    const { result } = renderHook(() => useRankingData(DEFAULT_PARAMS));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rankings[0].metadata).toEqual(raw);
  });
});

// ─── nested data format ───────────────────────────────────────────────────────

describe('nested data format', () => {
  it('handles data.data.rankings nesting', async () => {
    mockGetRankings.mockResolvedValueOnce({
      success: true,
      data: { data: { rankings: [{ id: 'u1', count: 7 }] } },
    });
    const { result } = renderHook(() => useRankingData(DEFAULT_PARAMS));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rankings).toHaveLength(1);
  });
});

// ─── error handling ───────────────────────────────────────────────────────────

describe('error handling', () => {
  it('sets error when response.success is false', async () => {
    mockGetRankings.mockResolvedValueOnce({
      success: false,
      message: 'Unauthorized',
    });
    const { result } = renderHook(() => useRankingData(DEFAULT_PARAMS));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Unauthorized');
  });

  it('sets a default error message when response has no message', async () => {
    mockGetRankings.mockResolvedValueOnce({ success: false });
    const { result } = renderHook(() => useRankingData(DEFAULT_PARAMS));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
  });

  it('sets error when rankings is not an array', async () => {
    mockGetRankings.mockResolvedValueOnce({
      success: true,
      data: { rankings: 'not-an-array' },
    });
    const { result } = renderHook(() => useRankingData(DEFAULT_PARAMS));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
  });

  it('sets error on network failure', async () => {
    mockGetRankings.mockRejectedValueOnce(new Error('Failed to fetch'));
    const { result } = renderHook(() => useRankingData(DEFAULT_PARAMS));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toContain('backend');
  });

  it('sets generic error message for non-network errors', async () => {
    mockGetRankings.mockRejectedValueOnce(new Error('Something else'));
    const { result } = renderHook(() => useRankingData(DEFAULT_PARAMS));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('Something else');
  });
});

// ─── refetch ─────────────────────────────────────────────────────────────────

describe('refetch', () => {
  it('exposes a refetch function', async () => {
    mockGetRankings.mockResolvedValue(ok([]));
    const { result } = renderHook(() => useRankingData(DEFAULT_PARAMS));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(typeof result.current.refetch).toBe('function');
  });

  it('calls getRankings again when refetch is invoked', async () => {
    mockGetRankings.mockResolvedValue(ok([]));
    const { result } = renderHook(() => useRankingData(DEFAULT_PARAMS));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.refetch(); });
    expect(mockGetRankings).toHaveBeenCalledTimes(2);
  });

  it('passes entityType, criterion, period, limit to the service', async () => {
    mockGetRankings.mockResolvedValue(ok([]));
    renderHook(() =>
      useRankingData({ entityType: 'conversations', criterion: 'activity', period: '30d', limit: 5 })
    );
    await waitFor(() => expect(mockGetRankings).toHaveBeenCalled());
    expect(mockGetRankings).toHaveBeenCalledWith('conversations', 'activity', '30d', 5);
  });
});
