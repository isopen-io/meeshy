/**
 * Tests for hooks/use-lazy-image.ts
 *
 * Covers useLazyImage and useLazyImageWithPreview.
 * Uses wrapper components so refs attach to real DOM elements.
 *
 * Image onload/onerror: React's effect cleanup sets img.onload = null after the
 * component re-renders (setIsLoading causes a dependency change). The mock Image
 * preserves the most-recently-set non-null callback so tests can fire it after
 * act() flushes.
 */

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { useLazyImage, useLazyImageWithPreview } from '@/hooks/use-lazy-image';

const PLACEHOLDER_PATTERN = /^data:image\/svg\+xml/;

// ─── IntersectionObserver mock ────────────────────────────────────────────────

type IOCallback = (entries: Pick<IntersectionObserverEntry, 'isIntersecting'>[]) => void;

let ioInstance: MockIO | null = null;
let lastOptions: IntersectionObserverInit | undefined;

class MockIO {
  callback: IOCallback;
  observe = jest.fn();
  disconnect = jest.fn();
  unobserve = jest.fn();

  constructor(callback: IOCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    ioInstance = this;
    lastOptions = options;
  }

  triggerEntry(isIntersecting: boolean) {
    this.callback([{ isIntersecting }]);
  }
}

// ─── Image mock ───────────────────────────────────────────────────────────────
// The hook sets img.onload = null in its cleanup (when isLoading changes dependency).
// We preserve the last non-null assignment so tests can fire callbacks after act() flushes.

interface MockImageInstance {
  src: string;
  triggerLoad: () => void;
  triggerError: () => void;
}

let lastImage: MockImageInstance | null = null;

class MockImage implements MockImageInstance {
  src = '';
  private _latestLoad: (() => void) | null = null;
  private _latestError: (() => void) | null = null;

  set onload(fn: (() => void) | null) {
    if (fn !== null) this._latestLoad = fn;
  }
  get onload() {
    return null;
  }

  set onerror(fn: (() => void) | null) {
    if (fn !== null) this._latestError = fn;
  }
  get onerror() {
    return null;
  }

  triggerLoad() {
    this._latestLoad?.();
  }
  triggerError() {
    this._latestError?.();
  }

  constructor() {
    lastImage = this;
  }
}

// ─── Wrapper components ───────────────────────────────────────────────────────

function LazyImageHost({
  src,
  rootMargin,
  threshold,
}: {
  src: string;
  rootMargin?: string;
  threshold?: number;
}) {
  const result = useLazyImage(src, { rootMargin, threshold });
  return (
    <img
      ref={result.ref}
      src={result.src}
      data-testid="img"
      data-loaded={String(result.isLoaded)}
      data-loading={String(result.isLoading)}
      alt="test"
    />
  );
}

function LazyImageWithPreviewHost({ preview, full }: { preview: string; full: string }) {
  const result = useLazyImageWithPreview(preview, full);
  return (
    <img
      ref={result.ref}
      src={result.src}
      data-testid="img"
      data-loaded={String(result.isLoaded)}
      data-loading={String(result.isLoading)}
      data-highres={String(result.isHighResLoaded)}
      alt="test"
    />
  );
}

// ─── Setup ────────────────────────────────────────────────────────────────────

const originalIO = global.IntersectionObserver;
const originalImage = global.Image;

beforeAll(() => {
  global.IntersectionObserver = MockIO as unknown as typeof IntersectionObserver;
  global.Image = MockImage as unknown as typeof Image;
});

afterAll(() => {
  global.IntersectionObserver = originalIO;
  global.Image = originalImage;
});

beforeEach(() => {
  ioInstance = null;
  lastOptions = undefined;
  lastImage = null;
});

// ─── useLazyImage tests ───────────────────────────────────────────────────────

describe('useLazyImage', () => {
  it('renders placeholder src initially', () => {
    render(<LazyImageHost src="https://example.com/img.jpg" />);

    const img = screen.getByTestId('img');
    expect(img.getAttribute('src')).toMatch(PLACEHOLDER_PATTERN);
    expect(img.getAttribute('data-loaded')).toBe('false');
    expect(img.getAttribute('data-loading')).toBe('false');
  });

  it('creates IntersectionObserver with default rootMargin and threshold', () => {
    render(<LazyImageHost src="https://example.com/img.jpg" />);

    expect(lastOptions?.rootMargin).toBe('100px');
    expect(lastOptions?.threshold).toBe(0.01);
  });

  it('creates IntersectionObserver with custom options', () => {
    render(<LazyImageHost src="https://example.com/img.jpg" rootMargin="200px" threshold={0.5} />);

    expect(lastOptions?.rootMargin).toBe('200px');
    expect(lastOptions?.threshold).toBe(0.5);
  });

  it('calls observe on the img element', () => {
    render(<LazyImageHost src="https://example.com/img.jpg" />);

    expect(ioInstance?.observe).toHaveBeenCalledWith(screen.getByTestId('img'));
  });

  it('starts loading when element intersects', () => {
    render(<LazyImageHost src="https://example.com/img.jpg" />);

    act(() => {
      ioInstance!.triggerEntry(true);
    });

    const img = screen.getByTestId('img');
    expect(img.getAttribute('data-loading')).toBe('true');
  });

  it('creates Image with the correct src when visible', () => {
    render(<LazyImageHost src="https://example.com/img.jpg" />);

    act(() => {
      ioInstance!.triggerEntry(true);
    });

    expect(lastImage).not.toBeNull();
    expect(lastImage!.src).toBe('https://example.com/img.jpg');
  });

  it('does not start loading when not intersecting', () => {
    render(<LazyImageHost src="https://example.com/img.jpg" />);

    act(() => {
      ioInstance!.triggerEntry(false);
    });

    expect(lastImage).toBeNull();
    expect(screen.getByTestId('img').getAttribute('data-loading')).toBe('false');
  });

  it('disconnects observer when element becomes visible', () => {
    render(<LazyImageHost src="https://example.com/img.jpg" />);

    act(() => {
      ioInstance!.triggerEntry(true);
    });

    expect(ioInstance!.disconnect).toHaveBeenCalled();
  });

  it('shows real src and marks loaded after image loads', () => {
    render(<LazyImageHost src="https://example.com/img.jpg" />);

    act(() => {
      ioInstance!.triggerEntry(true);
    });

    const captured = lastImage!;

    act(() => {
      captured.triggerLoad();
    });

    const img = screen.getByTestId('img');
    expect(img.getAttribute('src')).toBe('https://example.com/img.jpg');
    expect(img.getAttribute('data-loaded')).toBe('true');
    expect(img.getAttribute('data-loading')).toBe('false');
  });

  it('marks loaded on image error to prevent retry loops', () => {
    render(<LazyImageHost src="https://example.com/bad.jpg" />);

    act(() => {
      ioInstance!.triggerEntry(true);
    });

    const captured = lastImage!;

    act(() => {
      captured.triggerError();
    });

    const img = screen.getByTestId('img');
    expect(img.getAttribute('data-loaded')).toBe('true');
    expect(img.getAttribute('data-loading')).toBe('false');
  });

  it('falls back to immediate in-view when IntersectionObserver is absent', () => {
    const orig = global.IntersectionObserver;
    delete (global as Record<string, unknown>).IntersectionObserver;

    render(<LazyImageHost src="https://example.com/img.jpg" />);

    expect(screen.getByTestId('img').getAttribute('data-loading')).toBe('true');

    global.IntersectionObserver = orig;
  });
});

// ─── useLazyImageWithPreview tests ───────────────────────────────────────────

describe('useLazyImageWithPreview', () => {
  it('shows placeholder initially', () => {
    render(<LazyImageWithPreviewHost preview="https://example.com/thumb.jpg" full="https://example.com/full.jpg" />);

    const img = screen.getByTestId('img');
    expect(img.getAttribute('src')).toMatch(PLACEHOLDER_PATTERN);
    expect(img.getAttribute('data-highres')).toBe('false');
    expect(img.getAttribute('data-loaded')).toBe('false');
  });

  it('loads preview when element enters viewport', () => {
    render(<LazyImageWithPreviewHost preview="https://example.com/thumb.jpg" full="https://example.com/full.jpg" />);

    act(() => {
      ioInstance!.triggerEntry(true);
    });

    expect(lastImage!.src).toBe('https://example.com/thumb.jpg');
  });

  it('shows preview src after preview loads', () => {
    render(<LazyImageWithPreviewHost preview="https://example.com/thumb.jpg" full="https://example.com/full.jpg" />);

    act(() => {
      ioInstance!.triggerEntry(true);
    });

    const capturedPreview = lastImage!;
    act(() => {
      capturedPreview.triggerLoad();
    });

    const img = screen.getByTestId('img');
    expect(img.getAttribute('src')).toBe('https://example.com/thumb.jpg');
    expect(img.getAttribute('data-loaded')).toBe('true');
    expect(img.getAttribute('data-highres')).toBe('false');
  });

  it('begins loading high-res after preview loads', () => {
    render(<LazyImageWithPreviewHost preview="https://example.com/thumb.jpg" full="https://example.com/full.jpg" />);

    act(() => {
      ioInstance!.triggerEntry(true);
    });

    const capturedPreview = lastImage!;
    act(() => {
      capturedPreview.triggerLoad();
    });

    // lastImage now points to the high-res Image instance
    expect(lastImage!.src).toBe('https://example.com/full.jpg');
  });

  it('shows full src and marks isHighResLoaded after high-res loads', () => {
    render(<LazyImageWithPreviewHost preview="https://example.com/thumb.jpg" full="https://example.com/full.jpg" />);

    act(() => {
      ioInstance!.triggerEntry(true);
    });

    const capturedPreview = lastImage!;
    act(() => {
      capturedPreview.triggerLoad(); // preview loads
    });

    const capturedHighRes = lastImage!;
    act(() => {
      capturedHighRes.triggerLoad(); // high-res loads
    });

    const img = screen.getByTestId('img');
    expect(img.getAttribute('src')).toBe('https://example.com/full.jpg');
    expect(img.getAttribute('data-highres')).toBe('true');
    expect(img.getAttribute('data-loaded')).toBe('true');
  });

  it('reports isLoading while in viewport and preview not yet loaded', () => {
    render(<LazyImageWithPreviewHost preview="https://example.com/thumb.jpg" full="https://example.com/full.jpg" />);

    act(() => {
      ioInstance!.triggerEntry(true);
    });

    expect(screen.getByTestId('img').getAttribute('data-loading')).toBe('true');
  });

  it('clears isLoading after preview loads', () => {
    render(<LazyImageWithPreviewHost preview="https://example.com/thumb.jpg" full="https://example.com/full.jpg" />);

    act(() => {
      ioInstance!.triggerEntry(true);
    });

    const capturedPreview = lastImage!;
    act(() => {
      capturedPreview.triggerLoad();
    });

    expect(screen.getByTestId('img').getAttribute('data-loading')).toBe('false');
  });
});
