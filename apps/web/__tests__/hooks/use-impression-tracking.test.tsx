import { renderHook, act } from '@testing-library/react';
import { useImpressionTracking } from '@/hooks/use-impression-tracking';
import { postsService } from '@/services/posts.service';

jest.mock('@/services/posts.service', () => ({
  postsService: {
    recordImpressions: jest.fn().mockResolvedValue(undefined),
  },
}));

const mockRecord = postsService.recordImpressions as jest.Mock;

// Controllable IntersectionObserver double: jsdom's built-in mock never fires
// the callback, so we capture it and trigger intersections from the test.
type IOEntry = { target: Element; isIntersecting: boolean };
let ioInstances: MockIntersectionObserver[] = [];

class MockIntersectionObserver {
  readonly callback: (entries: IOEntry[]) => void;
  readonly options?: IntersectionObserverInit;
  readonly observed = new Set<Element>();

  constructor(callback: (entries: IOEntry[]) => void, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    ioInstances.push(this);
  }
  observe(el: Element) { this.observed.add(el); }
  unobserve(el: Element) { this.observed.delete(el); }
  disconnect() { this.observed.clear(); }
  takeRecords(): IOEntry[] { return []; }

  /** Test helper — simulate `el` entering the viewport. */
  enter(el: Element) {
    this.callback([{ target: el, isIntersecting: true }]);
  }
}

function makeEl(): Element {
  return document.createElement('div');
}

describe('useImpressionTracking', () => {
  const originalIO = global.IntersectionObserver;

  beforeEach(() => {
    jest.useFakeTimers();
    ioInstances = [];
    mockRecord.mockReset();
    mockRecord.mockResolvedValue(undefined);
    global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    jest.useRealTimers();
    global.IntersectionObserver = originalIO;
  });

  it('records a post once it crosses the threshold, batched after the debounce', () => {
    const { result } = renderHook(() => useImpressionTracking({ source: 'feed', flushDelayMs: 1000 }));
    const el = makeEl();

    act(() => result.current.observe(el, 'p1'));
    const io = ioInstances[0];
    expect(io.observed.has(el)).toBe(true);

    act(() => io.enter(el));
    // Pending — not yet flushed before the debounce elapses.
    expect(mockRecord).not.toHaveBeenCalled();

    act(() => { jest.advanceTimersByTime(1000); });
    expect(mockRecord).toHaveBeenCalledTimes(1);
    expect(mockRecord).toHaveBeenCalledWith(['p1'], 'feed');
  });

  it('coalesces multiple visible posts into a single batch', () => {
    const { result } = renderHook(() => useImpressionTracking({ source: 'feed', flushDelayMs: 1000 }));
    const a = makeEl();
    const b = makeEl();

    act(() => {
      result.current.observe(a, 'p1');
      result.current.observe(b, 'p2');
    });
    const io = ioInstances[0];
    act(() => {
      io.enter(a);
      io.enter(b);
    });
    act(() => { jest.advanceTimersByTime(1000); });

    expect(mockRecord).toHaveBeenCalledTimes(1);
    expect(mockRecord).toHaveBeenCalledWith(['p1', 'p2'], 'feed');
  });

  it('never records the same post twice in a session', () => {
    const { result } = renderHook(() => useImpressionTracking({ source: 'feed', flushDelayMs: 1000 }));
    const el = makeEl();

    act(() => result.current.observe(el, 'p1'));
    const io = ioInstances[0];
    act(() => io.enter(el));
    act(() => { jest.advanceTimersByTime(1000); });
    expect(mockRecord).toHaveBeenCalledTimes(1);

    // Re-observe the same id with a fresh element → ignored (already recorded).
    const el2 = makeEl();
    act(() => result.current.observe(el2, 'p1'));
    expect(io.observed.has(el2)).toBe(false);
    act(() => { jest.advanceTimersByTime(1000); });
    expect(mockRecord).toHaveBeenCalledTimes(1);
  });

  it('record() enqueues a single visible post (reels) and batches it', () => {
    const { result } = renderHook(() => useImpressionTracking({ source: 'feed', flushDelayMs: 1000 }));

    act(() => result.current.record('r1'));
    expect(mockRecord).not.toHaveBeenCalled();

    act(() => { jest.advanceTimersByTime(1000); });
    expect(mockRecord).toHaveBeenCalledWith(['r1'], 'feed');
  });

  it('flushes pending impressions immediately on unmount', () => {
    const { result, unmount } = renderHook(() =>
      useImpressionTracking({ source: 'profile', flushDelayMs: 5000 }),
    );

    act(() => result.current.record('r1'));
    expect(mockRecord).not.toHaveBeenCalled();

    act(() => unmount());
    expect(mockRecord).toHaveBeenCalledWith(['r1'], 'profile');
  });

  it('does nothing when disabled', () => {
    const { result } = renderHook(() =>
      useImpressionTracking({ source: 'feed', enabled: false, flushDelayMs: 1000 }),
    );
    const el = makeEl();

    act(() => {
      result.current.observe(el, 'p1');
      result.current.record('p2');
    });
    act(() => { jest.advanceTimersByTime(1000); });

    expect(mockRecord).not.toHaveBeenCalled();
    expect(ioInstances.length).toBe(0);
  });

  it('flushes pending impressions when the tab is hidden', () => {
    const { result } = renderHook(() => useImpressionTracking({ source: 'feed', flushDelayMs: 5000 }));

    act(() => result.current.record('r1'));

    act(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(mockRecord).toHaveBeenCalledWith(['r1'], 'feed');

    // Restore for sibling tests.
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  });
});
