/**
 * Tests for components/video-calls/hooks/useVideoFilters.ts
 */

import { renderHook, act } from '@testing-library/react';
import { useVideoFilters, FILTER_PRESETS } from '@/components/video-calls/hooks/useVideoFilters';
import type { VideoFilterConfig } from '@/components/video-calls/hooks/useVideoFilters';

const makeStream = (videoTracks: unknown[] = []) => ({
  getVideoTracks: () => videoTracks,
  getAudioTracks: () => [],
}) as unknown as MediaStream;

// ─── FILTER_PRESETS ───────────────────────────────────────────────────────────

describe('FILTER_PRESETS', () => {
  it('exposes expected preset names', () => {
    expect(Object.keys(FILTER_PRESETS)).toEqual(
      expect.arrayContaining(['natural', 'warm', 'cool', 'vivid', 'muted'])
    );
  });

  it('all presets have enabled=true', () => {
    for (const preset of Object.values(FILTER_PRESETS)) {
      expect(preset.enabled).toBe(true);
    }
  });
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('starts with default config', () => {
    const { result } = renderHook(() => useVideoFilters());
    expect(result.current.config.enabled).toBe(false);
    expect(result.current.config.temperature).toBe(0.5);
    expect(result.current.config.brightness).toBe(0);
    expect(result.current.config.contrast).toBe(1);
    expect(result.current.config.saturation).toBe(1);
    expect(result.current.config.exposure).toBe(0);
  });

  it('outputStream is null initially', () => {
    const { result } = renderHook(() => useVideoFilters());
    expect(result.current.outputStream).toBeNull();
  });
});

// ─── updateConfig ─────────────────────────────────────────────────────────────

describe('updateConfig', () => {
  it('merges partial updates into config', () => {
    const { result } = renderHook(() => useVideoFilters());

    act(() => { result.current.updateConfig({ brightness: 0.2, enabled: true }); });

    expect(result.current.config.brightness).toBe(0.2);
    expect(result.current.config.enabled).toBe(true);
    expect(result.current.config.contrast).toBe(1);
  });

  it('allows multiple sequential updates', () => {
    const { result } = renderHook(() => useVideoFilters());

    act(() => { result.current.updateConfig({ temperature: 0.7 }); });
    act(() => { result.current.updateConfig({ saturation: 1.5 }); });

    expect(result.current.config.temperature).toBe(0.7);
    expect(result.current.config.saturation).toBe(1.5);
  });
});

// ─── resetConfig ─────────────────────────────────────────────────────────────

describe('resetConfig', () => {
  it('restores default config after changes', () => {
    const { result } = renderHook(() => useVideoFilters());

    act(() => { result.current.updateConfig({ brightness: 0.4, enabled: true, saturation: 2 }); });
    act(() => { result.current.resetConfig(); });

    expect(result.current.config.brightness).toBe(0);
    expect(result.current.config.enabled).toBe(false);
    expect(result.current.config.saturation).toBe(1);
  });
});

// ─── applyPreset ──────────────────────────────────────────────────────────────

describe('applyPreset', () => {
  it('applies warm preset', () => {
    const { result } = renderHook(() => useVideoFilters());

    act(() => { result.current.applyPreset('warm'); });

    expect(result.current.config).toEqual(FILTER_PRESETS.warm);
  });

  it('applies cool preset', () => {
    const { result } = renderHook(() => useVideoFilters());

    act(() => { result.current.applyPreset('cool'); });

    expect(result.current.config.temperature).toBeLessThan(0.5);
    expect(result.current.config.enabled).toBe(true);
  });

  it('applies vivid preset', () => {
    const { result } = renderHook(() => useVideoFilters());

    act(() => { result.current.applyPreset('vivid'); });

    expect(result.current.config.saturation).toBeGreaterThan(1);
  });

  it('can switch between presets', () => {
    const { result } = renderHook(() => useVideoFilters());

    act(() => { result.current.applyPreset('warm'); });
    act(() => { result.current.applyPreset('cool'); });

    expect(result.current.config).toEqual(FILTER_PRESETS.cool);
  });
});

// ─── processStream ────────────────────────────────────────────────────────────

describe('processStream', () => {
  it('returns null when input stream has no video tracks', () => {
    const { result } = renderHook(() => useVideoFilters());
    const emptyStream = makeStream([]);

    let output: MediaStream | null = null;
    act(() => {
      output = result.current.processStream(emptyStream);
    });

    expect(output).toBeNull();
  });
});

// ─── getFilteredVideoTrack ────────────────────────────────────────────────────

describe('getFilteredVideoTrack', () => {
  it('returns null when no output stream', () => {
    const { result } = renderHook(() => useVideoFilters());
    expect(result.current.getFilteredVideoTrack()).toBeNull();
  });
});

// ─── stopProcessing ───────────────────────────────────────────────────────────

describe('stopProcessing', () => {
  it('does not throw when called with nothing processing', () => {
    const { result } = renderHook(() => useVideoFilters());
    expect(() => {
      act(() => { result.current.stopProcessing(); });
    }).not.toThrow();
  });
});

// ─── config type completeness ─────────────────────────────────────────────────

describe('config type completeness', () => {
  it('config has all VideoFilterConfig keys', () => {
    const { result } = renderHook(() => useVideoFilters());
    const config: VideoFilterConfig = result.current.config;
    expect(typeof config.temperature).toBe('number');
    expect(typeof config.brightness).toBe('number');
    expect(typeof config.contrast).toBe('number');
    expect(typeof config.saturation).toBe('number');
    expect(typeof config.exposure).toBe('number');
    expect(typeof config.enabled).toBe('boolean');
  });
});
