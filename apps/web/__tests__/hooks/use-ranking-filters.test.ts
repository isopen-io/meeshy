/**
 * Tests for hooks/use-ranking-filters.ts
 */

import { renderHook, act } from '@testing-library/react';
import { useRankingFilters } from '@/hooks/use-ranking-filters';

describe('useRankingFilters', () => {
  it('starts with entityType=users', () => {
    const { result } = renderHook(() => useRankingFilters());
    expect(result.current.entityType).toBe('users');
  });

  it('starts with criterion=messages_sent (default for users)', () => {
    const { result } = renderHook(() => useRankingFilters());
    expect(result.current.criterion).toBe('messages_sent');
  });

  it('starts with period=7d', () => {
    const { result } = renderHook(() => useRankingFilters());
    expect(result.current.period).toBe('7d');
  });

  it('starts with limit=50', () => {
    const { result } = renderHook(() => useRankingFilters());
    expect(result.current.limit).toBe(50);
  });

  it('starts with criteriaSearch empty', () => {
    const { result } = renderHook(() => useRankingFilters());
    expect(result.current.criteriaSearch).toBe('');
  });

  it('updates criterion to message_count when entityType set to conversations', () => {
    const { result } = renderHook(() => useRankingFilters());
    act(() => { result.current.setEntityType('conversations'); });
    expect(result.current.entityType).toBe('conversations');
    expect(result.current.criterion).toBe('message_count');
  });

  it('updates criterion to most_reactions when entityType set to messages', () => {
    const { result } = renderHook(() => useRankingFilters());
    act(() => { result.current.setEntityType('messages'); });
    expect(result.current.criterion).toBe('most_reactions');
  });

  it('updates criterion to tracking_links_most_visited when entityType set to links', () => {
    const { result } = renderHook(() => useRankingFilters());
    act(() => { result.current.setEntityType('links'); });
    expect(result.current.criterion).toBe('tracking_links_most_visited');
  });

  it('resets criteriaSearch when entityType changes', () => {
    const { result } = renderHook(() => useRankingFilters());
    act(() => { result.current.setCriteriaSearch('some query'); });
    expect(result.current.criteriaSearch).toBe('some query');
    act(() => { result.current.setEntityType('messages'); });
    expect(result.current.criteriaSearch).toBe('');
  });

  it('allows manual criterion update', () => {
    const { result } = renderHook(() => useRankingFilters());
    act(() => { result.current.setCriterion('custom_metric'); });
    expect(result.current.criterion).toBe('custom_metric');
  });

  it('allows period update', () => {
    const { result } = renderHook(() => useRankingFilters());
    act(() => { result.current.setPeriod('30d'); });
    expect(result.current.period).toBe('30d');
  });

  it('allows limit update', () => {
    const { result } = renderHook(() => useRankingFilters());
    act(() => { result.current.setLimit(100); });
    expect(result.current.limit).toBe(100);
  });
});
