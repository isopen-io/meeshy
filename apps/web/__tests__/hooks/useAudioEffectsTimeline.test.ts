/**
 * Tests for hooks/use-audio-effects-timeline.ts
 */

jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('@meeshy/shared/types/audio-effects-timeline', () => ({
  AUDIO_EFFECTS_TIMELINE_VERSION: '1.0',
}));

import { renderHook, act } from '@testing-library/react';
import { useAudioEffectsTimeline } from '@/hooks/use-audio-effects-timeline';

const makeStartOptions = (overrides: Record<string, unknown> = {}) => ({
  sampleRate: 48000,
  channels: 1,
  ...overrides,
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('isTracking starts false', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    expect(result.current.isTracking).toBe(false);
  });

  it('totalEvents starts at 0', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    expect(result.current.totalEvents).toBe(0);
  });

  it('activeEffects starts empty', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    expect(result.current.activeEffects).toEqual([]);
  });
});

// ─── startTracking ────────────────────────────────────────────────────────────

describe('startTracking', () => {
  it('sets isTracking to true', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());

    act(() => { result.current.startTracking(makeStartOptions()); });

    expect(result.current.isTracking).toBe(true);
  });

  it('records initial enabled effects at timestamp 0', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());

    act(() => {
      result.current.startTracking(makeStartOptions({
        initialEffects: [
          { effectType: 'voice-coder', enabled: true },
          { effectType: 'baby-voice', enabled: false },
        ],
      }));
    });

    expect(result.current.activeEffects).toContain('voice-coder');
    expect(result.current.activeEffects).not.toContain('baby-voice');
    expect(result.current.totalEvents).toBe(1);
  });

  it('does not record disabled initial effects', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());

    act(() => {
      result.current.startTracking(makeStartOptions({
        initialEffects: [{ effectType: 'demon-voice', enabled: false }],
      }));
    });

    expect(result.current.totalEvents).toBe(0);
  });

  it('resets events when started again', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());

    act(() => { result.current.startTracking(makeStartOptions()); });
    act(() => { result.current.recordActivation('voice-coder'); });
    expect(result.current.totalEvents).toBeGreaterThan(0);

    act(() => { result.current.startTracking(makeStartOptions()); });
    expect(result.current.totalEvents).toBe(0);
  });
});

// ─── stopTracking ─────────────────────────────────────────────────────────────

describe('stopTracking', () => {
  it('returns null when not tracking', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    let timeline: unknown;
    act(() => { timeline = result.current.stopTracking(); });
    expect(timeline).toBeNull();
  });

  it('sets isTracking to false after stop', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());

    act(() => { result.current.startTracking(makeStartOptions()); });
    act(() => { result.current.stopTracking(); });

    expect(result.current.isTracking).toBe(false);
  });

  it('returns timeline with sampleRate and channels', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());

    act(() => { result.current.startTracking(makeStartOptions({ sampleRate: 44100, channels: 2 })); });

    let timeline: unknown;
    act(() => { timeline = result.current.stopTracking(); });

    expect((timeline as any).sampleRate).toBe(44100);
    expect((timeline as any).channels).toBe(2);
  });

  it('auto-closes active effects at stop', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());

    act(() => { result.current.startTracking(makeStartOptions()); });
    act(() => { result.current.recordActivation('voice-coder'); });

    const eventsBefore = result.current.totalEvents;

    let timeline: any;
    act(() => { timeline = result.current.stopTracking(); });

    const deactivateEvents = timeline.events.filter((e: any) => e.action === 'deactivate');
    expect(deactivateEvents.length).toBeGreaterThan(0);
    expect(timeline.events.length).toBeGreaterThan(eventsBefore);
  });

  it('returns timeline version', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());

    act(() => { result.current.startTracking(makeStartOptions()); });
    let timeline: any;
    act(() => { timeline = result.current.stopTracking(); });

    expect(timeline.version).toBe('1.0');
  });
});

// ─── getTimeline ──────────────────────────────────────────────────────────────

describe('getTimeline', () => {
  it('returns null when not tracking', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    let timeline: unknown;
    act(() => { timeline = result.current.getTimeline(); });
    expect(timeline).toBeNull();
  });

  it('returns timeline when tracking (non-destructive)', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());

    act(() => { result.current.startTracking(makeStartOptions()); });

    let timeline: unknown;
    act(() => { timeline = result.current.getTimeline(); });

    expect(timeline).not.toBeNull();
    expect(result.current.isTracking).toBe(true);
  });
});

// ─── recordActivation ─────────────────────────────────────────────────────────

describe('recordActivation', () => {
  it('adds effect to activeEffects', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());

    act(() => { result.current.startTracking(makeStartOptions()); });
    act(() => { result.current.recordActivation('baby-voice'); });

    expect(result.current.activeEffects).toContain('baby-voice');
  });

  it('increments totalEvents', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());

    act(() => { result.current.startTracking(makeStartOptions()); });
    act(() => { result.current.recordActivation('demon-voice'); });

    expect(result.current.totalEvents).toBe(1);
  });
});

// ─── recordDeactivation ───────────────────────────────────────────────────────

describe('recordDeactivation', () => {
  it('removes effect from activeEffects', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());

    act(() => { result.current.startTracking(makeStartOptions()); });
    act(() => { result.current.recordActivation('voice-coder'); });
    act(() => { result.current.recordDeactivation('voice-coder'); });

    expect(result.current.activeEffects).not.toContain('voice-coder');
  });

  it('ignores deactivation when effect not active', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());

    act(() => { result.current.startTracking(makeStartOptions()); });
    act(() => { result.current.recordDeactivation('baby-voice'); });

    expect(result.current.totalEvents).toBe(0);
  });
});

// ─── recordUpdate ─────────────────────────────────────────────────────────────

describe('recordUpdate', () => {
  it('adds update event when effect is active', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());

    act(() => { result.current.startTracking(makeStartOptions()); });
    act(() => { result.current.recordActivation('back-sound'); });
    act(() => { result.current.recordUpdate('back-sound', { volume: 0.8 } as any); });

    expect(result.current.totalEvents).toBe(2);
  });

  it('ignores update when effect not active', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());

    act(() => { result.current.startTracking(makeStartOptions()); });
    act(() => { result.current.recordUpdate('voice-coder', { pitch: 5 } as any); });

    expect(result.current.totalEvents).toBe(0);
  });
});

// ─── isEffectActive ───────────────────────────────────────────────────────────

describe('isEffectActive', () => {
  it('returns false when effect not active', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    act(() => { result.current.startTracking(makeStartOptions()); });
    expect(result.current.isEffectActive('voice-coder')).toBe(false);
  });

  it('returns true when effect is active', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());

    act(() => { result.current.startTracking(makeStartOptions()); });
    act(() => { result.current.recordActivation('demon-voice'); });

    expect(result.current.isEffectActive('demon-voice')).toBe(true);
  });
});

// ─── reset ────────────────────────────────────────────────────────────────────

describe('reset', () => {
  it('clears all state', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());

    act(() => { result.current.startTracking(makeStartOptions()); });
    act(() => { result.current.recordActivation('voice-coder'); });
    act(() => { result.current.reset(); });

    expect(result.current.isTracking).toBe(false);
    expect(result.current.totalEvents).toBe(0);
    expect(result.current.activeEffects).toEqual([]);
  });
});
