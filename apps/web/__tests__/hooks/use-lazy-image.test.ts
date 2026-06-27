/**
 * Tests for hooks/use-lazy-image.ts
 *
 * Note: ref.current is null in renderHook (no DOM element attached), so
 * IntersectionObserver-dependent effects don't run. Tests cover the hook's
 * public API surface — initial state, return shape, and mount stability.
 */

import { renderHook } from '@testing-library/react';
import { useLazyImage, useLazyImageWithPreview } from '@/hooks/use-lazy-image';

beforeEach(() => {
  (global as any).IntersectionObserver = jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    disconnect: jest.fn(),
  }));
});

// ─── useLazyImage ─────────────────────────────────────────────────────────────

describe('useLazyImage', () => {
  it('returns a ref object', () => {
    const { result } = renderHook(() => useLazyImage('/img.jpg'));
    expect(result.current.ref).toBeDefined();
  });

  it('isLoaded starts false', () => {
    const { result } = renderHook(() => useLazyImage('/img.jpg'));
    expect(result.current.isLoaded).toBe(false);
  });

  it('isLoading starts false', () => {
    const { result } = renderHook(() => useLazyImage('/img.jpg'));
    expect(result.current.isLoading).toBe(false);
  });

  it('src starts as SVG placeholder', () => {
    const { result } = renderHook(() => useLazyImage('/img.jpg'));
    expect(result.current.src).toMatch(/^data:image\/svg\+xml/);
  });

  it('mounts without throwing with IntersectionObserver available', () => {
    expect(() => renderHook(() => useLazyImage('/img.jpg'))).not.toThrow();
  });

  it('mounts without throwing when IntersectionObserver is undefined', () => {
    (global as any).IntersectionObserver = undefined;
    expect(() => renderHook(() => useLazyImage('/img.jpg'))).not.toThrow();
  });

  it('unmounts without throwing', () => {
    const { unmount } = renderHook(() => useLazyImage('/img.jpg'));
    expect(() => unmount()).not.toThrow();
  });

  it('accepts custom rootMargin and threshold without throwing', () => {
    expect(() =>
      renderHook(() => useLazyImage('/img.jpg', { rootMargin: '200px', threshold: 0.5 }))
    ).not.toThrow();
  });

  it('src remains placeholder when image is not yet loaded', () => {
    const { result } = renderHook(() => useLazyImage('/custom/path/image.png'));
    expect(result.current.src).not.toBe('/custom/path/image.png');
  });
});

// ─── useLazyImageWithPreview ──────────────────────────────────────────────────

describe('useLazyImageWithPreview', () => {
  it('returns ref, src, isLoaded, isLoading, isHighResLoaded', () => {
    const { result } = renderHook(() =>
      useLazyImageWithPreview('/preview.jpg', '/full.jpg')
    );
    expect(result.current.ref).toBeDefined();
    expect(typeof result.current.src).toBe('string');
    expect(typeof result.current.isLoaded).toBe('boolean');
    expect(typeof result.current.isLoading).toBe('boolean');
    expect(typeof result.current.isHighResLoaded).toBe('boolean');
  });

  it('src starts as SVG placeholder', () => {
    const { result } = renderHook(() =>
      useLazyImageWithPreview('/preview.jpg', '/full.jpg')
    );
    expect(result.current.src).toMatch(/^data:image\/svg\+xml/);
  });

  it('isLoaded starts false', () => {
    const { result } = renderHook(() =>
      useLazyImageWithPreview('/preview.jpg', '/full.jpg')
    );
    expect(result.current.isLoaded).toBe(false);
  });

  it('isHighResLoaded starts false', () => {
    const { result } = renderHook(() =>
      useLazyImageWithPreview('/preview.jpg', '/full.jpg')
    );
    expect(result.current.isHighResLoaded).toBe(false);
  });

  it('isLoading starts false (not yet in view)', () => {
    const { result } = renderHook(() =>
      useLazyImageWithPreview('/preview.jpg', '/full.jpg')
    );
    expect(result.current.isLoading).toBe(false);
  });

  it('mounts without throwing', () => {
    expect(() =>
      renderHook(() => useLazyImageWithPreview('/preview.jpg', '/full.jpg'))
    ).not.toThrow();
  });

  it('unmounts without throwing', () => {
    const { unmount } = renderHook(() =>
      useLazyImageWithPreview('/preview.jpg', '/full.jpg')
    );
    expect(() => unmount()).not.toThrow();
  });
});
