/**
 * Tests for hooks/use-fullscreen.ts
 */

import { renderHook, act } from '@testing-library/react';
import { useRef } from 'react';
import { useFullscreen } from '@/hooks/use-fullscreen';

const makeRef = (overrides: Record<string, unknown> = {}) => ({
  current: {
    requestFullscreen: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as HTMLDivElement,
});

const patchDocument = (patches: Record<string, unknown>) => {
  Object.entries(patches).forEach(([k, v]) => {
    Object.defineProperty(document, k, { value: v, writable: true, configurable: true });
  });
};

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('isFullscreen starts false', () => {
    const ref = makeRef();
    const { result } = renderHook(() => useFullscreen(ref));
    expect(result.current.isFullscreen).toBe(false);
  });
});

// ─── toggleFullscreen ─────────────────────────────────────────────────────────

describe('toggleFullscreen', () => {
  it('calls requestFullscreen when not fullscreen', async () => {
    const ref = makeRef();
    const { result } = renderHook(() => useFullscreen(ref));
    await act(async () => { await result.current.toggleFullscreen(); });
    expect((ref.current as any).requestFullscreen).toHaveBeenCalled();
    expect(result.current.isFullscreen).toBe(true);
  });

  it('calls document.exitFullscreen when already fullscreen', async () => {
    const exitFullscreen = jest.fn().mockResolvedValue(undefined);
    patchDocument({ exitFullscreen });

    const ref = makeRef();
    const { result } = renderHook(() => useFullscreen(ref));

    // Enter fullscreen first
    await act(async () => { await result.current.toggleFullscreen(); });
    expect(result.current.isFullscreen).toBe(true);

    // Exit fullscreen
    await act(async () => { await result.current.toggleFullscreen(); });
    expect(exitFullscreen).toHaveBeenCalled();
    expect(result.current.isFullscreen).toBe(false);
  });

  it('does nothing when ref.current is null', async () => {
    const ref = { current: null } as any;
    const { result } = renderHook(() => useFullscreen(ref));
    await expect(act(async () => {
      await result.current.toggleFullscreen();
    })).resolves.not.toThrow();
    expect(result.current.isFullscreen).toBe(false);
  });

  it('does not throw when requestFullscreen rejects', async () => {
    const ref = makeRef({
      requestFullscreen: jest.fn().mockRejectedValue(new Error('denied')),
    });
    const { result } = renderHook(() => useFullscreen(ref));
    await expect(act(async () => {
      await result.current.toggleFullscreen();
    })).resolves.not.toThrow();
  });
});

// ─── fullscreenchange event ───────────────────────────────────────────────────

describe('fullscreenchange event', () => {
  it('updates isFullscreen when fullscreenElement is set', () => {
    patchDocument({ fullscreenElement: document.createElement('div') });
    const ref = makeRef();
    const { result } = renderHook(() => useFullscreen(ref));
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(result.current.isFullscreen).toBe(true);
  });

  it('updates isFullscreen to false when fullscreenElement is cleared', () => {
    patchDocument({ fullscreenElement: null });
    const ref = makeRef();
    const { result } = renderHook(() => useFullscreen(ref));
    act(() => {
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    expect(result.current.isFullscreen).toBe(false);
  });

  it('removes event listener on unmount', () => {
    patchDocument({ fullscreenElement: null });
    const removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');
    const ref = makeRef();
    const { unmount } = renderHook(() => useFullscreen(ref));
    unmount();
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'fullscreenchange',
      expect.any(Function)
    );
    removeEventListenerSpy.mockRestore();
  });
});
