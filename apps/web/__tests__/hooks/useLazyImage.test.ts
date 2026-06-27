import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { useLazyImage, useLazyImageWithPreview } from '@/hooks/use-lazy-image';

const PLACEHOLDER_PREFIX = 'data:image/svg+xml';

type ObserverCallback = IntersectionObserverCallback;

let observerCallback: ObserverCallback;
const mockObserve = jest.fn();
const mockDisconnect = jest.fn();

interface ImageInstance {
  src: string;
  triggerLoad: () => void;
  triggerError: () => void;
}

let imageInstances: ImageInstance[] = [];

const originalIntersectionObserver = global.IntersectionObserver;
const originalImage = global.Image;

beforeEach(() => {
  mockObserve.mockClear();
  mockDisconnect.mockClear();
  imageInstances = [];

  global.IntersectionObserver = jest.fn((cb: ObserverCallback) => {
    observerCallback = cb;
    return { observe: mockObserve, disconnect: mockDisconnect };
  }) as unknown as typeof IntersectionObserver;

  global.Image = jest.fn().mockImplementation(() => {
    let latestLoad: (() => void) | null = null;
    let latestError: (() => void) | null = null;
    const instance = {
      src: '',
      set onload(fn: (() => void) | null) { if (fn !== null) latestLoad = fn; },
      get onload() { return null; },
      set onerror(fn: (() => void) | null) { if (fn !== null) latestError = fn; },
      get onerror() { return null; },
      triggerLoad() { latestLoad?.(); },
      triggerError() { latestError?.(); },
    };
    imageInstances.push(instance);
    return instance;
  }) as unknown as typeof Image;
});

afterEach(() => {
  global.IntersectionObserver = originalIntersectionObserver;
  global.Image = originalImage;
});

function triggerIntersection(isIntersecting: boolean) {
  act(() => {
    observerCallback(
      [{ isIntersecting }] as IntersectionObserverEntry[],
      {} as IntersectionObserver,
    );
  });
}

type LazyImageHostProps = { src: string; rootMargin?: string; threshold?: number };

function LazyImageHost({ src, rootMargin, threshold }: LazyImageHostProps) {
  const result = useLazyImage(src, { rootMargin, threshold });
  return React.createElement('img', {
    ref: result.ref,
    src: result.src,
    'data-testid': 'img',
    'data-loaded': String(result.isLoaded),
    'data-loading': String(result.isLoading),
    alt: 'test',
  });
}

type WithPreviewHostProps = { preview: string; full: string };

function LazyImageWithPreviewHost({ preview, full }: WithPreviewHostProps) {
  const result = useLazyImageWithPreview(preview, full);
  return React.createElement('img', {
    ref: result.ref,
    src: result.src,
    'data-testid': 'img',
    'data-loaded': String(result.isLoaded),
    'data-loading': String(result.isLoading),
    'data-highres': String(result.isHighResLoaded),
    alt: 'test',
  });
}

describe('useLazyImage', () => {
  it('starts with isLoaded=false, isLoading=false, and a placeholder src', () => {
    render(React.createElement(LazyImageHost, { src: 'https://example.com/img.jpg' }));

    const img = screen.getByTestId('img');
    expect(img.getAttribute('src')).toMatch(PLACEHOLDER_PREFIX);
    expect(img.getAttribute('data-loaded')).toBe('false');
    expect(img.getAttribute('data-loading')).toBe('false');
  });

  it('returns a ref object attached to the img element', () => {
    render(React.createElement(LazyImageHost, { src: 'https://example.com/img.jpg' }));

    expect(mockObserve).toHaveBeenCalledWith(screen.getByTestId('img'));
  });

  it('does not start loading before intersection', () => {
    render(React.createElement(LazyImageHost, { src: 'https://example.com/img.jpg' }));

    expect(imageInstances).toHaveLength(0);
  });

  it('creates IntersectionObserver with default rootMargin and threshold', () => {
    render(React.createElement(LazyImageHost, { src: 'https://example.com/img.jpg' }));

    const call = (global.IntersectionObserver as jest.Mock).mock.calls[0];
    expect(call[1]).toEqual({ rootMargin: '100px', threshold: 0.01 });
  });

  it('creates IntersectionObserver with custom options', () => {
    render(
      React.createElement(LazyImageHost, {
        src: 'https://example.com/img.jpg',
        rootMargin: '200px',
        threshold: 0.5,
      }),
    );

    const call = (global.IntersectionObserver as jest.Mock).mock.calls[0];
    expect(call[1]).toEqual({ rootMargin: '200px', threshold: 0.5 });
  });

  it('sets isLoading=true when element intersects', () => {
    render(React.createElement(LazyImageHost, { src: 'https://example.com/img.jpg' }));

    triggerIntersection(true);

    expect(screen.getByTestId('img').getAttribute('data-loading')).toBe('true');
  });

  it('does not set isLoading when intersection fires with isIntersecting=false', () => {
    render(React.createElement(LazyImageHost, { src: 'https://example.com/img.jpg' }));

    triggerIntersection(false);

    expect(screen.getByTestId('img').getAttribute('data-loading')).toBe('false');
    expect(imageInstances).toHaveLength(0);
  });

  it('creates an Image with the correct src when element is visible', () => {
    render(React.createElement(LazyImageHost, { src: 'https://example.com/img.jpg' }));

    triggerIntersection(true);

    expect(imageInstances).toHaveLength(1);
    expect(imageInstances[0].src).toBe('https://example.com/img.jpg');
  });

  it('disconnects the observer after element becomes visible', () => {
    render(React.createElement(LazyImageHost, { src: 'https://example.com/img.jpg' }));

    triggerIntersection(true);

    expect(mockDisconnect).toHaveBeenCalled();
  });

  it('sets isLoaded=true, isLoading=false and src=imageSrc after image loads successfully', () => {
    render(React.createElement(LazyImageHost, { src: 'https://example.com/img.jpg' }));

    triggerIntersection(true);

    act(() => {
      imageInstances[0].triggerLoad();
    });

    const img = screen.getByTestId('img');
    expect(img.getAttribute('src')).toBe('https://example.com/img.jpg');
    expect(img.getAttribute('data-loaded')).toBe('true');
    expect(img.getAttribute('data-loading')).toBe('false');
  });

  it('sets isLoaded=true, isLoading=false on image error to prevent retry loops', () => {
    render(React.createElement(LazyImageHost, { src: 'https://example.com/broken.jpg' }));

    triggerIntersection(true);

    act(() => {
      imageInstances[0].triggerError();
    });

    const img = screen.getByTestId('img');
    expect(img.getAttribute('data-loaded')).toBe('true');
    expect(img.getAttribute('data-loading')).toBe('false');
  });

  it('immediately starts loading when IntersectionObserver is undefined', () => {
    delete (global as Record<string, unknown>).IntersectionObserver;

    render(React.createElement(LazyImageHost, { src: 'https://example.com/img.jpg' }));

    expect(screen.getByTestId('img').getAttribute('data-loading')).toBe('true');

    global.IntersectionObserver = originalIntersectionObserver;
  });
});

describe('useLazyImageWithPreview', () => {
  it('starts with a placeholder src', () => {
    render(
      React.createElement(LazyImageWithPreviewHost, {
        preview: 'https://example.com/thumb.jpg',
        full: 'https://example.com/full.jpg',
      }),
    );

    expect(screen.getByTestId('img').getAttribute('src')).toMatch(PLACEHOLDER_PREFIX);
  });

  it('starts with isHighResLoaded=false and isLoaded=false', () => {
    render(
      React.createElement(LazyImageWithPreviewHost, {
        preview: 'https://example.com/thumb.jpg',
        full: 'https://example.com/full.jpg',
      }),
    );

    const img = screen.getByTestId('img');
    expect(img.getAttribute('data-highres')).toBe('false');
    expect(img.getAttribute('data-loaded')).toBe('false');
  });

  it('loads preview image when element enters viewport', () => {
    render(
      React.createElement(LazyImageWithPreviewHost, {
        preview: 'https://example.com/thumb.jpg',
        full: 'https://example.com/full.jpg',
      }),
    );

    triggerIntersection(true);

    expect(imageInstances).toHaveLength(1);
    expect(imageInstances[0].src).toBe('https://example.com/thumb.jpg');
  });

  it('shows preview src and clears isLoading after preview image loads', () => {
    render(
      React.createElement(LazyImageWithPreviewHost, {
        preview: 'https://example.com/thumb.jpg',
        full: 'https://example.com/full.jpg',
      }),
    );

    triggerIntersection(true);

    act(() => {
      imageInstances[0].triggerLoad();
    });

    const img = screen.getByTestId('img');
    expect(img.getAttribute('src')).toBe('https://example.com/thumb.jpg');
    expect(img.getAttribute('data-loaded')).toBe('true');
    expect(img.getAttribute('data-highres')).toBe('false');
    expect(img.getAttribute('data-loading')).toBe('false');
  });

  it('begins loading high-res image after preview loads', () => {
    render(
      React.createElement(LazyImageWithPreviewHost, {
        preview: 'https://example.com/thumb.jpg',
        full: 'https://example.com/full.jpg',
      }),
    );

    triggerIntersection(true);

    act(() => {
      imageInstances[0].triggerLoad();
    });

    expect(imageInstances).toHaveLength(2);
    expect(imageInstances[1].src).toBe('https://example.com/full.jpg');
  });

  it('shows fullSrc and sets isHighResLoaded=true after high-res image loads', () => {
    render(
      React.createElement(LazyImageWithPreviewHost, {
        preview: 'https://example.com/thumb.jpg',
        full: 'https://example.com/full.jpg',
      }),
    );

    triggerIntersection(true);

    act(() => {
      imageInstances[0].triggerLoad();
    });

    act(() => {
      imageInstances[1].triggerLoad();
    });

    const img = screen.getByTestId('img');
    expect(img.getAttribute('src')).toBe('https://example.com/full.jpg');
    expect(img.getAttribute('data-highres')).toBe('true');
    expect(img.getAttribute('data-loaded')).toBe('true');
  });

  it('reports isLoading=true while in viewport and preview not yet loaded', () => {
    render(
      React.createElement(LazyImageWithPreviewHost, {
        preview: 'https://example.com/thumb.jpg',
        full: 'https://example.com/full.jpg',
      }),
    );

    triggerIntersection(true);

    expect(screen.getByTestId('img').getAttribute('data-loading')).toBe('true');
  });
});
