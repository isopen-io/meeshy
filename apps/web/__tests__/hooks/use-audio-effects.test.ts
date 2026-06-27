/**
 * Tests for hooks/use-audio-effects.ts
 */

jest.mock('@meeshy/shared/types/video-call', () => ({}), { virtual: true });

jest.mock('@/utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

jest.mock('@/utils/audio-effects', () => ({
  createAudioEffectProcessor: jest.fn(() => ({
    inputNode: {},
    outputNode: {},
    disconnect: jest.fn(),
    destroy: jest.fn(),
    updateParams: jest.fn(),
  })),
}));

jest.mock('@/utils/audio-effect-presets', () => ({
  BACK_SOUNDS: [
    { id: 'rain', url: '/sounds/rain.mp3', label: 'Rain' },
  ],
  VOICE_CODER_PRESETS: {
    'correction-subtile': { params: { pitch: 0.1, harmonization: true, strength: 0.2, retuneSpeed: 1, scale: 'chromatic', key: 'C', naturalVibrato: 0 } },
    'transformateur': { params: { pitch: 5, harmonization: true, strength: 0.8, retuneSpeed: 0.5, scale: 'major', key: 'C', naturalVibrato: 0.1 } },
    'custom': { params: {} },
  },
}));

import { renderHook, act } from '@testing-library/react';
import { useAudioEffects } from '@/hooks/use-audio-effects';

const makeProps = (overrides: Record<string, unknown> = {}) => ({
  inputStream: null,
  onOutputStreamReady: jest.fn(),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('outputStream starts null', () => {
    const { result } = renderHook(() => useAudioEffects(makeProps()));
    expect(result.current.outputStream).toBeNull();
  });

  it('currentPreset starts as correction-subtile', () => {
    const { result } = renderHook(() => useAudioEffects(makeProps()));
    expect(result.current.currentPreset).toBe('correction-subtile');
  });

  it('effectsState has all four effects disabled', () => {
    const { result } = renderHook(() => useAudioEffects(makeProps()));
    expect(result.current.effectsState.voiceCoder.enabled).toBe(false);
    expect(result.current.effectsState.babyVoice.enabled).toBe(false);
    expect(result.current.effectsState.demonVoice.enabled).toBe(false);
    expect(result.current.effectsState.backSound.enabled).toBe(false);
  });

  it('effectsState has correct types', () => {
    const { result } = renderHook(() => useAudioEffects(makeProps()));
    expect(result.current.effectsState.voiceCoder.type).toBe('voice-coder');
    expect(result.current.effectsState.babyVoice.type).toBe('baby-voice');
    expect(result.current.effectsState.demonVoice.type).toBe('demon-voice');
    expect(result.current.effectsState.backSound.type).toBe('back-sound');
  });

  it('availableBackSounds is exposed', () => {
    const { result } = renderHook(() => useAudioEffects(makeProps()));
    expect(Array.isArray(result.current.availableBackSounds)).toBe(true);
    expect(result.current.availableBackSounds.length).toBeGreaterThan(0);
  });

  it('availablePresets is exposed', () => {
    const { result } = renderHook(() => useAudioEffects(makeProps()));
    expect(result.current.availablePresets).toBeDefined();
  });
});

// ─── toggleEffect ─────────────────────────────────────────────────────────────

describe('toggleEffect', () => {
  it('enables voiceCoder when toggled off→on', () => {
    const { result } = renderHook(() => useAudioEffects(makeProps()));
    act(() => { result.current.toggleEffect('voice-coder'); });
    expect(result.current.effectsState.voiceCoder.enabled).toBe(true);
  });

  it('disables voiceCoder when toggled on→off', () => {
    const { result } = renderHook(() => useAudioEffects(makeProps()));
    act(() => { result.current.toggleEffect('voice-coder'); });
    act(() => { result.current.toggleEffect('voice-coder'); });
    expect(result.current.effectsState.voiceCoder.enabled).toBe(false);
  });

  it('enables backSound independently of voice effects', () => {
    const { result } = renderHook(() => useAudioEffects(makeProps()));
    act(() => { result.current.toggleEffect('back-sound'); });
    expect(result.current.effectsState.backSound.enabled).toBe(true);
    expect(result.current.effectsState.voiceCoder.enabled).toBe(false);
  });

  it('disables other voice effects when enabling voiceCoder (mutual exclusion)', () => {
    const { result } = renderHook(() => useAudioEffects(makeProps()));
    act(() => { result.current.toggleEffect('baby-voice'); });
    expect(result.current.effectsState.babyVoice.enabled).toBe(true);

    act(() => { result.current.toggleEffect('voice-coder'); });
    expect(result.current.effectsState.voiceCoder.enabled).toBe(true);
    expect(result.current.effectsState.babyVoice.enabled).toBe(false);
  });

  it('disables demonVoice when enabling babyVoice', () => {
    const { result } = renderHook(() => useAudioEffects(makeProps()));
    act(() => { result.current.toggleEffect('demon-voice'); });
    act(() => { result.current.toggleEffect('baby-voice'); });
    expect(result.current.effectsState.babyVoice.enabled).toBe(true);
    expect(result.current.effectsState.demonVoice.enabled).toBe(false);
  });

  it('does not disable backSound when toggling voice effects', () => {
    const { result } = renderHook(() => useAudioEffects(makeProps()));
    act(() => { result.current.toggleEffect('back-sound'); });
    act(() => { result.current.toggleEffect('voice-coder'); });
    expect(result.current.effectsState.backSound.enabled).toBe(true);
    expect(result.current.effectsState.voiceCoder.enabled).toBe(true);
  });
});

// ─── updateEffectParams ───────────────────────────────────────────────────────

describe('updateEffectParams', () => {
  it('merges params into voiceCoder effect', () => {
    const { result } = renderHook(() => useAudioEffects(makeProps()));
    act(() => {
      result.current.updateEffectParams('voice-coder', { pitch: 5 } as any);
    });
    expect(result.current.effectsState.voiceCoder.params.pitch).toBe(5);
  });

  it('sets currentPreset to custom when updating voiceCoder params', () => {
    const { result } = renderHook(() => useAudioEffects(makeProps()));
    act(() => {
      result.current.updateEffectParams('voice-coder', { pitch: 3 } as any);
    });
    expect(result.current.currentPreset).toBe('custom');
  });

  it('does not change currentPreset when updating non-voiceCoder params', () => {
    const { result } = renderHook(() => useAudioEffects(makeProps()));
    act(() => {
      result.current.updateEffectParams('baby-voice', { pitch: 2 } as any);
    });
    expect(result.current.currentPreset).toBe('correction-subtile');
  });

  it('merges partial params without clearing existing ones', () => {
    const { result } = renderHook(() => useAudioEffects(makeProps()));
    const originalFormant = result.current.effectsState.babyVoice.params.formant;
    act(() => {
      result.current.updateEffectParams('baby-voice', { pitch: 10 } as any);
    });
    expect((result.current.effectsState.babyVoice.params as any).pitch).toBe(10);
    expect(result.current.effectsState.babyVoice.params.formant).toBe(originalFormant);
  });
});

// ─── loadPreset ───────────────────────────────────────────────────────────────

describe('loadPreset', () => {
  it('sets currentPreset to the loaded preset', () => {
    const { result } = renderHook(() => useAudioEffects(makeProps()));
    act(() => { result.current.loadPreset('transformateur'); });
    expect(result.current.currentPreset).toBe('transformateur');
  });

  it('updates voiceCoder params from preset config', () => {
    const { result } = renderHook(() => useAudioEffects(makeProps()));
    act(() => { result.current.loadPreset('transformateur'); });
    expect(result.current.effectsState.voiceCoder.params.pitch).toBe(5);
  });

  it('does not change currentPreset when loading "custom"', () => {
    const { result } = renderHook(() => useAudioEffects(makeProps()));
    act(() => { result.current.loadPreset('custom'); });
    expect(result.current.currentPreset).toBe('correction-subtile');
  });

  it('does not update params when loading "custom"', () => {
    const { result } = renderHook(() => useAudioEffects(makeProps()));
    const originalParams = { ...result.current.effectsState.voiceCoder.params };
    act(() => { result.current.loadPreset('custom'); });
    expect(result.current.effectsState.voiceCoder.params).toEqual(originalParams);
  });
});
