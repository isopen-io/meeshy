/**
 * Tests for hooks/use-ranking-sort.ts
 */

import { renderHook } from '@testing-library/react';
import { useRankingSort } from '@/hooks/use-ranking-sort';

const makeItem = (overrides: Record<string, unknown> = {}) => ({
  id: 'item-1',
  name: 'Alice',
  value: 100,
  rank: 1,
  ...overrides,
});

const DATA = [
  makeItem({ id: 'a', name: 'Charlie', value: 300, rank: 3 }),
  makeItem({ id: 'b', name: 'Alice', value: 100, rank: 1 }),
  makeItem({ id: 'c', name: 'Bob', value: 200, rank: 2 }),
];

// ─── sort by rank ─────────────────────────────────────────────────────────────

describe('sort by rank', () => {
  it('returns items sorted by rank ascending (default)', () => {
    const { result } = renderHook(() => useRankingSort({ data: DATA }));
    expect(result.current.map(i => i.id)).toEqual(['b', 'c', 'a']);
  });

  it('returns items sorted by rank descending', () => {
    const { result } = renderHook(() =>
      useRankingSort({ data: DATA, sortField: 'rank', sortDirection: 'desc' })
    );
    expect(result.current.map(i => i.id)).toEqual(['a', 'c', 'b']);
  });
});

// ─── sort by value ────────────────────────────────────────────────────────────

describe('sort by value', () => {
  it('returns items sorted by value ascending', () => {
    const { result } = renderHook(() =>
      useRankingSort({ data: DATA, sortField: 'value', sortDirection: 'asc' })
    );
    expect(result.current.map(i => i.id)).toEqual(['b', 'c', 'a']);
  });

  it('returns items sorted by value descending', () => {
    const { result } = renderHook(() =>
      useRankingSort({ data: DATA, sortField: 'value', sortDirection: 'desc' })
    );
    expect(result.current.map(i => i.id)).toEqual(['a', 'c', 'b']);
  });
});

// ─── sort by name ─────────────────────────────────────────────────────────────

describe('sort by name', () => {
  it('returns items sorted by name ascending (locale)', () => {
    const { result } = renderHook(() =>
      useRankingSort({ data: DATA, sortField: 'name', sortDirection: 'asc' })
    );
    expect(result.current.map(i => i.name)).toEqual(['Alice', 'Bob', 'Charlie']);
  });

  it('returns items sorted by name descending', () => {
    const { result } = renderHook(() =>
      useRankingSort({ data: DATA, sortField: 'name', sortDirection: 'desc' })
    );
    expect(result.current.map(i => i.name)).toEqual(['Charlie', 'Bob', 'Alice']);
  });
});

// ─── edge cases ───────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('returns empty array for empty input', () => {
    const { result } = renderHook(() => useRankingSort({ data: [] }));
    expect(result.current).toEqual([]);
  });

  it('does not mutate the original array', () => {
    const original = [...DATA];
    renderHook(() => useRankingSort({ data: DATA, sortField: 'rank', sortDirection: 'desc' }));
    expect(DATA).toEqual(original);
  });

  it('handles items with missing rank (defaults to 0)', () => {
    const items = [
      makeItem({ id: 'x', rank: undefined }),
      makeItem({ id: 'y', rank: 2 }),
    ];
    const { result } = renderHook(() => useRankingSort({ data: items as any, sortField: 'rank' }));
    expect(result.current[0].id).toBe('x');
  });
});
