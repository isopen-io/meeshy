/**
 * useCommentTarget — lecture réactive de la cible de commentaire portée par
 * l'URL (`#comment-<id>`, `?parent=<id>`, legacy `?comment=<id>`).
 */
import { renderHook, act } from '@testing-library/react';

let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useSearchParams: () => mockSearchParams,
}));

import { useCommentTarget } from '@/hooks/use-comment-target';

function setHash(hash: string): void {
  window.location.hash = hash;
}

describe('useCommentTarget', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    setHash('');
  });

  it('returns nulls without any target in the URL', () => {
    const { result } = renderHook(() => useCommentTarget());
    expect(result.current.targetCommentId).toBeNull();
    expect(result.current.targetParentCommentId).toBeNull();
  });

  it('reads the #comment-<id> anchor on mount', () => {
    setHash('#comment-c1');
    const { result } = renderHook(() => useCommentTarget());
    expect(result.current.targetCommentId).toBe('c1');
    expect(result.current.targetParentCommentId).toBeNull();
  });

  it('combines the anchor with ?parent= for reply targets', () => {
    setHash('#comment-r2');
    mockSearchParams = new URLSearchParams('parent=c9');
    const { result } = renderHook(() => useCommentTarget());
    expect(result.current.targetCommentId).toBe('r2');
    expect(result.current.targetParentCommentId).toBe('c9');
  });

  it('falls back to the legacy ?comment= query param', () => {
    mockSearchParams = new URLSearchParams('comment=c3');
    const { result } = renderHook(() => useCommentTarget());
    expect(result.current.targetCommentId).toBe('c3');
  });

  it('ignores ?parent= without any comment target', () => {
    mockSearchParams = new URLSearchParams('parent=c9');
    const { result } = renderHook(() => useCommentTarget());
    expect(result.current.targetCommentId).toBeNull();
    expect(result.current.targetParentCommentId).toBeNull();
  });

  it('re-targets when a new hash arrives on the already-mounted page', () => {
    const { result } = renderHook(() => useCommentTarget());
    expect(result.current.targetCommentId).toBeNull();

    act(() => {
      setHash('#comment-c5');
      window.dispatchEvent(new Event('hashchange'));
    });

    expect(result.current.targetCommentId).toBe('c5');
  });

  it('re-targets on back/forward navigation (popstate)', () => {
    setHash('#comment-c6');
    const { result } = renderHook(() => useCommentTarget());
    expect(result.current.targetCommentId).toBe('c6');

    act(() => {
      setHash('');
      window.dispatchEvent(new Event('popstate'));
    });

    expect(result.current.targetCommentId).toBeNull();
  });
});
