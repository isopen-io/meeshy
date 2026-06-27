/**
 * Tests for hooks/use-volume.ts
 */

import { renderHook, act } from '@testing-library/react';
import { useRef } from 'react';
import { useVolume } from '@/hooks/use-volume';

const makeVideoRef = (overrides: Partial<HTMLVideoElement> = {}): { current: HTMLVideoElement } => ({
  current: { volume: 1, muted: false, ...overrides } as HTMLVideoElement,
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('volume starts at 1', () => {
    const ref = makeVideoRef();
    const { result } = renderHook(() => useVolume(ref as any));
    expect(result.current.volume).toBe(1);
  });

  it('isMuted starts false', () => {
    const ref = makeVideoRef();
    const { result } = renderHook(() => useVolume(ref as any));
    expect(result.current.isMuted).toBe(false);
  });
});

// ─── toggleMute ───────────────────────────────────────────────────────────────

describe('toggleMute', () => {
  it('sets isMuted to true on first toggle', () => {
    const ref = makeVideoRef();
    const { result } = renderHook(() => useVolume(ref as any));
    act(() => { result.current.toggleMute(); });
    expect(result.current.isMuted).toBe(true);
    expect(ref.current.muted).toBe(true);
  });

  it('sets isMuted back to false on second toggle', () => {
    const ref = makeVideoRef();
    const { result } = renderHook(() => useVolume(ref as any));
    act(() => { result.current.toggleMute(); });
    act(() => { result.current.toggleMute(); });
    expect(result.current.isMuted).toBe(false);
    expect(ref.current.muted).toBe(false);
  });

  it('does nothing when ref.current is null', () => {
    const ref = { current: null };
    const { result } = renderHook(() => useVolume(ref as any));
    expect(() => act(() => { result.current.toggleMute(); })).not.toThrow();
    expect(result.current.isMuted).toBe(false);
  });
});

// ─── handleVolumeChange ───────────────────────────────────────────────────────

describe('handleVolumeChange', () => {
  it('updates volume state', () => {
    const ref = makeVideoRef();
    const { result } = renderHook(() => useVolume(ref as any));
    act(() => { result.current.handleVolumeChange(0.5); });
    expect(result.current.volume).toBe(0.5);
    expect(ref.current.volume).toBe(0.5);
  });

  it('sets volume to 0 without unmuting', () => {
    const ref = makeVideoRef();
    const { result } = renderHook(() => useVolume(ref as any));
    act(() => { result.current.handleVolumeChange(0); });
    expect(result.current.volume).toBe(0);
    expect(result.current.isMuted).toBe(false);
  });

  it('unmutes when volume increases from a muted state', () => {
    const ref = makeVideoRef({ muted: true });
    const { result } = renderHook(() => useVolume(ref as any));
    act(() => { result.current.toggleMute(); });
    expect(result.current.isMuted).toBe(true);
    act(() => { result.current.handleVolumeChange(0.8); });
    expect(result.current.isMuted).toBe(false);
    expect(ref.current.muted).toBe(false);
  });

  it('does nothing when ref.current is null', () => {
    const ref = { current: null };
    const { result } = renderHook(() => useVolume(ref as any));
    expect(() => act(() => { result.current.handleVolumeChange(0.5); })).not.toThrow();
  });
});
