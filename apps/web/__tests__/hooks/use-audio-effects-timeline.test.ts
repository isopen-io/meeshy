/**
 * Tests for hooks/use-audio-effects-timeline.ts
 */

jest.mock('@meeshy/shared/types/audio-effects-timeline', () => ({
  AUDIO_EFFECTS_TIMELINE_VERSION: '1.0',
  AudioEffectAction: {},
}), { virtual: true });

jest.mock('@meeshy/shared/types/video-call', () => ({}), { virtual: true });

jest.mock('@/utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { renderHook, act } from '@testing-library/react';
import { useAudioEffectsTimeline } from '@/hooks/use-audio-effects-timeline';

const makeOptions = (overrides: Record<string, unknown> = {}) => ({
  sampleRate: 48000,
  channels: 1,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('isTracking starts false', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    expect(result.current.isTracking).toBe(false);
  });

  it('totalEvents starts 0', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    expect(result.current.totalEvents).toBe(0);
  });

  it('activeEffects starts empty', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    expect(result.current.activeEffects).toEqual([]);
  });

  it('getTimeline returns null before tracking', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    expect(result.current.getTimeline()).toBeNull();
  });

  it('stopTracking returns null before tracking', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    let timeline: any;
    act(() => { timeline = result.current.stopTracking(); });
    expect(timeline).toBeNull();
  });
});

// ─── startTracking ────────────────────────────────────────────────────────────

describe('startTracking', () => {
  it('sets isTracking=true', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    act(() => { result.current.startTracking(makeOptions()); });
    expect(result.current.isTracking).toBe(true);
  });

  it('records initialEffects at timestamp=0 when enabled', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    act(() => {
      result.current.startTracking(makeOptions({
        initialEffects: [
          { effectType: 'voice-coder', enabled: true },
        ],
      }));
    });
    expect(result.current.totalEvents).toBe(1);
    const timeline = result.current.getTimeline();
    expect(timeline?.events[0].action).toBe('activate');
    expect(timeline?.events[0].timestamp).toBe(0);
    expect(timeline?.events[0].effectType).toBe('voice-coder');
  });

  it('does not record initialEffects that are disabled', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    act(() => {
      result.current.startTracking(makeOptions({
        initialEffects: [
          { effectType: 'baby-voice', enabled: false },
        ],
      }));
    });
    expect(result.current.totalEvents).toBe(0);
  });

  it('marks initialEffects as active', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    act(() => {
      result.current.startTracking(makeOptions({
        initialEffects: [{ effectType: 'demon-voice', enabled: true }],
      }));
    });
    expect(result.current.isEffectActive('demon-voice')).toBe(true);
  });

  it('clears previous events when starting new session', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    act(() => { result.current.startTracking(makeOptions()); });
    act(() => { result.current.recordActivation('voice-coder'); });
    act(() => { result.current.stopTracking(); });
    act(() => { result.current.startTracking(makeOptions()); });
    expect(result.current.totalEvents).toBe(0);
  });
});

// ─── stopTracking ─────────────────────────────────────────────────────────────

describe('stopTracking', () => {
  it('sets isTracking=false', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    act(() => { result.current.startTracking(makeOptions()); });
    act(() => { result.current.stopTracking(); });
    expect(result.current.isTracking).toBe(false);
  });

  it('returns timeline with sampleRate and channels from options', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    act(() => { result.current.startTracking({ sampleRate: 44100, channels: 2 }); });
    let timeline: any;
    act(() => { timeline = result.current.stopTracking(); });
    expect(timeline.sampleRate).toBe(44100);
    expect(timeline.channels).toBe(2);
  });

  it('returns timeline version', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    act(() => { result.current.startTracking(makeOptions()); });
    let timeline: any;
    act(() => { timeline = result.current.stopTracking(); });
    expect(timeline.version).toBe('1.0');
  });

  it('auto-closes still-active effects with deactivate event', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    act(() => { result.current.startTracking(makeOptions()); });
    act(() => { result.current.recordActivation('baby-voice'); });
    let timeline: any;
    act(() => { timeline = result.current.stopTracking(); });
    const deactivate = timeline.events.find((e: any) => e.action === 'deactivate' && e.effectType === 'baby-voice');
    expect(deactivate).toBeDefined();
  });

  it('resets totalEvents to 0 after stopping', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    act(() => { result.current.startTracking(makeOptions()); });
    act(() => { result.current.recordActivation('voice-coder'); });
    act(() => { result.current.stopTracking(); });
    expect(result.current.totalEvents).toBe(0);
  });

  it('clears activeEffects after stopping', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    act(() => { result.current.startTracking(makeOptions()); });
    act(() => { result.current.recordActivation('voice-coder'); });
    act(() => { result.current.stopTracking(); });
    expect(result.current.activeEffects).toEqual([]);
  });

  it('includes duration matching elapsed time', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    act(() => { result.current.startTracking(makeOptions()); });
    jest.advanceTimersByTime(3000);
    let timeline: any;
    act(() => { timeline = result.current.stopTracking(); });
    expect(timeline.duration).toBeGreaterThanOrEqual(3000);
  });
});

// ─── recordActivation ────────────────────────────────────────────────────────

describe('recordActivation', () => {
  it('adds an activate event', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    act(() => { result.current.startTracking(makeOptions()); });
    act(() => { result.current.recordActivation('voice-coder'); });
    expect(result.current.totalEvents).toBe(1);
    const tl = result.current.getTimeline();
    expect(tl?.events[0].action).toBe('activate');
    expect(tl?.events[0].effectType).toBe('voice-coder');
  });

  it('records zero params on activation', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    act(() => { result.current.startTracking(makeOptions()); });
    act(() => { result.current.recordActivation('voice-coder'); });
    const tl = result.current.getTimeline();
    expect((tl?.events[0] as any).params?.pitch).toBe(0);
  });

  it('marks effect as active after activation', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    act(() => { result.current.startTracking(makeOptions()); });
    act(() => { result.current.recordActivation('baby-voice'); });
    expect(result.current.isEffectActive('baby-voice')).toBe(true);
  });

  it('ignores duplicate activation (already active)', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    act(() => { result.current.startTracking(makeOptions()); });
    act(() => { result.current.recordActivation('voice-coder'); });
    act(() => { result.current.recordActivation('voice-coder'); });
    expect(result.current.totalEvents).toBe(1);
  });

  it('does nothing when not tracking', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    act(() => { result.current.recordActivation('voice-coder'); });
    expect(result.current.totalEvents).toBe(0);
  });
});

// ─── recordDeactivation ──────────────────────────────────────────────────────

describe('recordDeactivation', () => {
  it('adds a deactivate event', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    act(() => { result.current.startTracking(makeOptions()); });
    act(() => { result.current.recordActivation('demon-voice'); });
    act(() => { result.current.recordDeactivation('demon-voice'); });
    const tl = result.current.getTimeline();
    const deactivate = tl?.events.find((e: any) => e.action === 'deactivate');
    expect(deactivate).toBeDefined();
    expect(deactivate?.effectType).toBe('demon-voice');
  });

  it('removes effect from activeEffects', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    act(() => { result.current.startTracking(makeOptions()); });
    act(() => { result.current.recordActivation('baby-voice'); });
    act(() => { result.current.recordDeactivation('baby-voice'); });
    expect(result.current.isEffectActive('baby-voice')).toBe(false);
  });

  it('ignores deactivation of non-active effect', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    act(() => { result.current.startTracking(makeOptions()); });
    act(() => { result.current.recordDeactivation('voice-coder'); });
    expect(result.current.totalEvents).toBe(0);
  });
});

// ─── recordUpdate ─────────────────────────────────────────────────────────────

describe('recordUpdate', () => {
  it('adds an update event with provided params', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    act(() => { result.current.startTracking(makeOptions()); });
    act(() => { result.current.recordActivation('voice-coder'); });
    act(() => { result.current.recordUpdate('voice-coder', { pitch: 5 } as any); });
    const tl = result.current.getTimeline();
    const update = tl?.events.find((e: any) => e.action === 'update');
    expect(update).toBeDefined();
    expect((update as any)?.params?.pitch).toBe(5);
  });

  it('ignores update for non-active effect', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    act(() => { result.current.startTracking(makeOptions()); });
    act(() => { result.current.recordUpdate('voice-coder', { pitch: 3 } as any); });
    expect(result.current.totalEvents).toBe(0);
  });
});

// ─── getTimeline ─────────────────────────────────────────────────────────────

describe('getTimeline', () => {
  it('returns null when not tracking', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    expect(result.current.getTimeline()).toBeNull();
  });

  it('returns current events without stopping tracking', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    act(() => { result.current.startTracking(makeOptions()); });
    act(() => { result.current.recordActivation('voice-coder'); });
    expect(result.current.getTimeline()?.events).toHaveLength(1);
    expect(result.current.isTracking).toBe(true);
  });

  it('includes metadata with totalEffectsUsed', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    act(() => { result.current.startTracking(makeOptions()); });
    act(() => { result.current.recordActivation('voice-coder'); });
    const tl = result.current.getTimeline();
    expect(tl?.metadata?.totalEffectsUsed).toBe(1);
  });

  it('lists finalActiveEffects in metadata', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    act(() => { result.current.startTracking(makeOptions()); });
    act(() => { result.current.recordActivation('baby-voice'); });
    const tl = result.current.getTimeline();
    expect(tl?.metadata?.finalActiveEffects).toContain('baby-voice');
  });
});

// ─── reset ────────────────────────────────────────────────────────────────────

describe('reset', () => {
  it('clears isTracking', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    act(() => { result.current.startTracking(makeOptions()); });
    act(() => { result.current.reset(); });
    expect(result.current.isTracking).toBe(false);
  });

  it('clears totalEvents', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    act(() => { result.current.startTracking(makeOptions()); });
    act(() => { result.current.recordActivation('voice-coder'); });
    act(() => { result.current.reset(); });
    expect(result.current.totalEvents).toBe(0);
  });

  it('clears activeEffects', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    act(() => { result.current.startTracking(makeOptions()); });
    act(() => { result.current.recordActivation('baby-voice'); });
    act(() => { result.current.reset(); });
    expect(result.current.activeEffects).toEqual([]);
  });
});

// ─── isEffectActive ───────────────────────────────────────────────────────────

describe('isEffectActive', () => {
  it('returns false for inactive effect', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    act(() => { result.current.startTracking(makeOptions()); });
    expect(result.current.isEffectActive('back-sound')).toBe(false);
  });

  it('returns true after activation', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    act(() => { result.current.startTracking(makeOptions()); });
    act(() => { result.current.recordActivation('back-sound'); });
    expect(result.current.isEffectActive('back-sound')).toBe(true);
  });

  it('returns false after deactivation', () => {
    const { result } = renderHook(() => useAudioEffectsTimeline());
    act(() => { result.current.startTracking(makeOptions()); });
    act(() => { result.current.recordActivation('back-sound'); });
    act(() => { result.current.recordDeactivation('back-sound'); });
    expect(result.current.isEffectActive('back-sound')).toBe(false);
  });
});
