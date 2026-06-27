/**
 * Tests for hooks/use-audio-effects-analysis.ts
 */

jest.mock('@meeshy/shared/types/video-call', () => ({}), { virtual: true });
jest.mock('@meeshy/shared/types/audio-effects-timeline', () => ({}), { virtual: true });
jest.mock('@meeshy/shared/types/attachment', () => ({}), { virtual: true });

import { renderHook, act } from '@testing-library/react';
import { useAudioEffectsAnalysis } from '@/hooks/use-audio-effects-analysis';

const makeAttachment = (timeline?: object) => ({
  id: 'att-1',
  metadata: timeline ? { audioEffectsTimeline: timeline } : undefined,
} as any);

const makeTimeline = (events: object[] = {}, duration = 5000) => ({
  events,
  duration,
  metadata: {},
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('appliedEffects is empty when attachment has no timeline', () => {
    const { result } = renderHook(() =>
      useAudioEffectsAnalysis({ attachment: makeAttachment(), duration: 5 })
    );
    expect(result.current.appliedEffects).toEqual([]);
  });

  it('effectsTimeline is empty when attachment has no timeline', () => {
    const { result } = renderHook(() =>
      useAudioEffectsAnalysis({ attachment: makeAttachment(), duration: 5 })
    );
    expect(result.current.effectsTimeline).toEqual([]);
  });

  it('effectsConfigurations is empty when attachment has no timeline', () => {
    const { result } = renderHook(() =>
      useAudioEffectsAnalysis({ attachment: makeAttachment(), duration: 5 })
    );
    expect(result.current.effectsConfigurations).toEqual({});
  });

  it('selectedEffectTab starts as "overview"', () => {
    const { result } = renderHook(() =>
      useAudioEffectsAnalysis({ attachment: makeAttachment(), duration: 5 })
    );
    expect(result.current.selectedEffectTab).toBe('overview');
  });

  it('visibleCurves starts empty', () => {
    const { result } = renderHook(() =>
      useAudioEffectsAnalysis({ attachment: makeAttachment(), duration: 5 })
    );
    expect(result.current.visibleCurves).toEqual({});
  });

  it('visibleOverviewCurves starts empty', () => {
    const { result } = renderHook(() =>
      useAudioEffectsAnalysis({ attachment: makeAttachment(), duration: 5 })
    );
    expect(result.current.visibleOverviewCurves).toEqual({});
  });
});

// ─── setSelectedEffectTab ─────────────────────────────────────────────────────

describe('setSelectedEffectTab', () => {
  it('updates selectedEffectTab', () => {
    const { result } = renderHook(() =>
      useAudioEffectsAnalysis({ attachment: makeAttachment(), duration: 5 })
    );
    act(() => { result.current.setSelectedEffectTab('reverb' as any); });
    expect(result.current.selectedEffectTab).toBe('reverb');
  });
});

// ─── setVisibleCurves ─────────────────────────────────────────────────────────

describe('setVisibleCurves', () => {
  it('updates visibleCurves state', () => {
    const { result } = renderHook(() =>
      useAudioEffectsAnalysis({ attachment: makeAttachment(), duration: 5 })
    );
    act(() => {
      result.current.setVisibleCurves({ reverb: { frequency: true } } as any);
    });
    expect(result.current.visibleCurves).toEqual({ reverb: { frequency: true } });
  });
});

// ─── appliedEffects with timeline ─────────────────────────────────────────────

describe('appliedEffects with timeline', () => {
  it('extracts effects from activate events', () => {
    const timeline = makeTimeline([
      { action: 'activate', effectType: 'reverb', timestamp: 0 },
      { action: 'activate', effectType: 'echo', timestamp: 1000 },
    ]);
    const { result } = renderHook(() =>
      useAudioEffectsAnalysis({ attachment: makeAttachment(timeline), duration: 5 })
    );
    expect(result.current.appliedEffects).toContain('reverb');
    expect(result.current.appliedEffects).toContain('echo');
  });

  it('deduplicates effects that appear multiple times', () => {
    const timeline = makeTimeline([
      { action: 'activate', effectType: 'reverb', timestamp: 0 },
      { action: 'deactivate', effectType: 'reverb', timestamp: 2000 },
      { action: 'activate', effectType: 'reverb', timestamp: 3000 },
    ]);
    const { result } = renderHook(() =>
      useAudioEffectsAnalysis({ attachment: makeAttachment(timeline), duration: 5 })
    );
    const reverbOccurrences = result.current.appliedEffects.filter(e => e === 'reverb');
    expect(reverbOccurrences.length).toBe(1);
  });

  it('uses finalActiveEffects from metadata when present', () => {
    const timeline = {
      ...makeTimeline([{ action: 'activate', effectType: 'echo', timestamp: 0 }]),
      metadata: { finalActiveEffects: ['reverb', 'echo'] },
    };
    const { result } = renderHook(() =>
      useAudioEffectsAnalysis({ attachment: makeAttachment(timeline), duration: 5 })
    );
    expect(result.current.appliedEffects).toContain('reverb');
    expect(result.current.appliedEffects).toContain('echo');
  });
});

// ─── effectsTimeline segments ─────────────────────────────────────────────────

describe('effectsTimeline segments', () => {
  it('builds segments from activate/deactivate pairs', () => {
    const timeline = makeTimeline([
      { action: 'activate', effectType: 'reverb', timestamp: 0 },
      { action: 'deactivate', effectType: 'reverb', timestamp: 2000 },
    ]);
    const { result } = renderHook(() =>
      useAudioEffectsAnalysis({ attachment: makeAttachment(timeline), duration: 5 })
    );
    const seg = result.current.effectsTimeline.find(s => s.effectType === 'reverb');
    expect(seg).toBeDefined();
    expect(seg?.startTime).toBe(0);
    expect(seg?.endTime).toBe(2000);
  });

  it('closes open segment at total duration', () => {
    const timeline = makeTimeline([
      { action: 'activate', effectType: 'echo', timestamp: 1000 },
    ], 5000);
    const { result } = renderHook(() =>
      useAudioEffectsAnalysis({ attachment: makeAttachment(timeline), duration: 5 })
    );
    const seg = result.current.effectsTimeline.find(s => s.effectType === 'echo');
    expect(seg?.endTime).toBe(5000);
  });
});

// ─── effectsConfigurations ────────────────────────────────────────────────────

describe('effectsConfigurations', () => {
  it('captures parameter configs from activate events', () => {
    const timeline = makeTimeline([
      {
        action: 'activate',
        effectType: 'reverb',
        timestamp: 0,
        params: { roomSize: 0.8, decay: 2.0 },
      },
    ]);
    const { result } = renderHook(() =>
      useAudioEffectsAnalysis({ attachment: makeAttachment(timeline), duration: 5 })
    );
    const configs = result.current.effectsConfigurations['reverb' as any];
    expect(configs).toBeDefined();
    expect(configs[0].config.roomSize).toBe(0.8);
    expect(configs[0].config.decay).toBe(2.0);
  });

  it('ignores non-numeric params', () => {
    const timeline = makeTimeline([
      {
        action: 'activate',
        effectType: 'echo',
        timestamp: 0,
        params: { delay: 0.5, label: 'test' },
      },
    ]);
    const { result } = renderHook(() =>
      useAudioEffectsAnalysis({ attachment: makeAttachment(timeline), duration: 5 })
    );
    const configs = result.current.effectsConfigurations['echo' as any];
    expect(configs[0].config.delay).toBe(0.5);
    expect(configs[0].config.label).toBeUndefined();
  });
});
