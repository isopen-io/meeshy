/**
 * Tests for hooks/use-impression-tracking.ts
 */

const mockRecordImpressions = jest.fn().mockResolvedValue(undefined);
jest.mock('@/services/posts.service', () => ({
  postsService: {
    recordImpressions: (...args: unknown[]) => mockRecordImpressions(...args),
  },
}));

import { renderHook, act } from '@testing-library/react';
import { useImpressionTracking } from '@/hooks/use-impression-tracking';

// ─── IntersectionObserver mock ────────────────────────────────────────────────

type IOCallback = (entries: Partial<IntersectionObserverEntry>[]) => void;

let ioCallback: IOCallback | null = null;
let ioObserved: Element[] = [];

class MockIntersectionObserver {
  constructor(cb: IOCallback) { ioCallback = cb; }
  observe(el: Element) { ioObserved.push(el); }
  unobserve(el: Element) { ioObserved = ioObserved.filter(e => e !== el); }
  disconnect() { ioObserved = []; ioCallback = null; }
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  ioCallback = null;
  ioObserved = [];
  Object.defineProperty(global, 'IntersectionObserver', {
    writable: true,
    configurable: true,
    value: MockIntersectionObserver,
  });
  // Reset document visibility
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
});

afterEach(() => {
  jest.useRealTimers();
});

const makeElement = () => document.createElement('div');

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('returns observe and record functions', () => {
    const { result } = renderHook(() => useImpressionTracking({ source: 'feed' }));
    expect(typeof result.current.observe).toBe('function');
    expect(typeof result.current.record).toBe('function');
  });
});

// ─── record — immediate impression ───────────────────────────────────────────

describe('record', () => {
  it('schedules a flush after flushDelayMs', () => {
    const { result } = renderHook(() =>
      useImpressionTracking({ source: 'feed', flushDelayMs: 500 })
    );

    act(() => { result.current.record('post-1'); });
    expect(mockRecordImpressions).not.toHaveBeenCalled();

    act(() => { jest.advanceTimersByTime(500); });
    expect(mockRecordImpressions).toHaveBeenCalledWith(['post-1'], 'feed');
  });

  it('deduplicates — only records each post once per session', () => {
    const { result } = renderHook(() =>
      useImpressionTracking({ source: 'feed', flushDelayMs: 100 })
    );

    act(() => { result.current.record('post-1'); });
    act(() => { jest.advanceTimersByTime(100); });
    act(() => { result.current.record('post-1'); });
    act(() => { jest.advanceTimersByTime(100); });

    expect(mockRecordImpressions).toHaveBeenCalledTimes(1);
  });

  it('does not record when enabled = false', () => {
    const { result } = renderHook(() =>
      useImpressionTracking({ source: 'feed', enabled: false, flushDelayMs: 100 })
    );

    act(() => { result.current.record('post-1'); });
    act(() => { jest.advanceTimersByTime(100); });

    expect(mockRecordImpressions).not.toHaveBeenCalled();
  });

  it('ignores empty postId', () => {
    const { result } = renderHook(() =>
      useImpressionTracking({ source: 'feed', flushDelayMs: 100 })
    );

    act(() => { result.current.record(''); });
    act(() => { jest.advanceTimersByTime(100); });

    expect(mockRecordImpressions).not.toHaveBeenCalled();
  });

  it('batches multiple posts into one call', () => {
    const { result } = renderHook(() =>
      useImpressionTracking({ source: 'profile', flushDelayMs: 100 })
    );

    act(() => {
      result.current.record('post-1');
      result.current.record('post-2');
      result.current.record('post-3');
    });
    act(() => { jest.advanceTimersByTime(100); });

    expect(mockRecordImpressions).toHaveBeenCalledTimes(1);
    expect(mockRecordImpressions.mock.calls[0][0]).toEqual(
      expect.arrayContaining(['post-1', 'post-2', 'post-3'])
    );
  });
});

// ─── observe ──────────────────────────────────────────────────────────────────

describe('observe', () => {
  it('observes an element and fires impression on intersection', () => {
    const { result } = renderHook(() =>
      useImpressionTracking({ source: 'feed', flushDelayMs: 100 })
    );
    const el = makeElement();

    act(() => { result.current.observe(el, 'post-1'); });
    expect(ioObserved).toContain(el);

    act(() => {
      ioCallback?.([{ target: el, isIntersecting: true }]);
    });
    act(() => { jest.advanceTimersByTime(100); });
    expect(mockRecordImpressions).toHaveBeenCalledWith(['post-1'], 'feed');
  });

  it('ignores intersection when isIntersecting = false', () => {
    const { result } = renderHook(() =>
      useImpressionTracking({ source: 'feed', flushDelayMs: 100 })
    );
    const el = makeElement();

    act(() => { result.current.observe(el, 'post-1'); });
    act(() => { ioCallback?.([{ target: el, isIntersecting: false }]); });
    act(() => { jest.advanceTimersByTime(100); });

    expect(mockRecordImpressions).not.toHaveBeenCalled();
  });

  it('unobserves when called with null', () => {
    const { result } = renderHook(() =>
      useImpressionTracking({ source: 'feed', flushDelayMs: 100 })
    );
    const el = makeElement();

    act(() => { result.current.observe(el, 'post-1'); });
    act(() => { result.current.observe(null, 'post-1'); });

    expect(ioObserved).not.toContain(el);
  });

  it('skips already-recorded posts on re-observe', () => {
    const { result } = renderHook(() =>
      useImpressionTracking({ source: 'feed', flushDelayMs: 100 })
    );
    const el = makeElement();

    act(() => {
      result.current.observe(el, 'post-1');
      ioCallback?.([{ target: el, isIntersecting: true }]);
    });
    act(() => { jest.advanceTimersByTime(100); });

    const el2 = makeElement();
    act(() => { result.current.observe(el2, 'post-1'); });
    act(() => { ioCallback?.([{ target: el2, isIntersecting: true }]); });
    act(() => { jest.advanceTimersByTime(100); });

    expect(mockRecordImpressions).toHaveBeenCalledTimes(1);
  });
});

// ─── flush on tab hide ────────────────────────────────────────────────────────

describe('flush on visibility change', () => {
  it('flushes immediately when tab becomes hidden', () => {
    const { result } = renderHook(() =>
      useImpressionTracking({ source: 'feed', flushDelayMs: 5000 })
    );

    act(() => { result.current.record('post-1'); });
    expect(mockRecordImpressions).not.toHaveBeenCalled();

    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(mockRecordImpressions).toHaveBeenCalledWith(['post-1'], 'feed');
  });
});

// ─── flush on unmount ─────────────────────────────────────────────────────────

describe('flush on unmount', () => {
  it('flushes pending impressions on unmount', () => {
    const { result, unmount } = renderHook(() =>
      useImpressionTracking({ source: 'feed', flushDelayMs: 5000 })
    );

    act(() => {
      result.current.record('post-42');
    });
    expect(mockRecordImpressions).not.toHaveBeenCalled();

    unmount();
    expect(mockRecordImpressions).toHaveBeenCalledWith(['post-42'], 'feed');
  });
});
