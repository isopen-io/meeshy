import { renderHook, act } from '@testing-library/react';
import { useReferences } from '@/hooks/composer/useReferences';

describe('useReferences', () => {
  it('poses SILENT on a single click from the picker', () => {
    const { result } = renderHook(() => useReferences());
    act(() => result.current.pick({ username: 'alice', userId: 'u-a' }, 'picker'));
    expect(result.current.references).toEqual([{ username: 'alice', userId: 'u-a', display: 'SILENT' }]);
  });

  it('poses INLINE on a single click from the @ list', () => {
    const { result } = renderHook(() => useReferences());
    act(() => result.current.pick({ username: 'alice', userId: 'u-a' }, 'textList'));
    expect(result.current.references[0].display).toBe('INLINE');
  });

  it('changes the mode without duplicating', () => {
    const { result } = renderHook(() => useReferences());
    act(() => result.current.pick({ username: 'alice', userId: 'u-a' }, 'picker'));
    act(() => result.current.pick({ username: 'alice', userId: 'u-a' }, 'picker', 'NOTE'));
    expect(result.current.references).toHaveLength(1);
    expect(result.current.references[0].display).toBe('NOTE');
  });

  it('puts only the non-INLINE into the payload', () => {
    const { result } = renderHook(() => useReferences());
    act(() => result.current.pick({ username: 'alice', userId: 'u-a' }, 'textList'));
    act(() => result.current.pick({ username: 'bob', userId: 'u-b' }, 'picker'));
    expect(result.current.payload).toEqual([{ userId: 'u-b', display: 'SILENT' }]);
  });

  it('drops a reference by username, case-insensitively', () => {
    const { result } = renderHook(() => useReferences());
    act(() => result.current.pick({ username: 'alice', userId: 'u-a' }, 'picker'));
    act(() => result.current.drop('ALICE'));
    expect(result.current.references).toEqual([]);
  });
});
