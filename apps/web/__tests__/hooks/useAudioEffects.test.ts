/**
 * Tests for hooks/use-audio-effects.ts
 * Note: inputStream=null prevents audio pipeline initialization (no Tone.js needed)
 */

jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('@/utils/audio-effect-presets', () => ({
  BACK_SOUNDS: [{ id: 'rain', url: '/sounds/rain.mp3', name: 'Rain' }],
  VOICE_CODER_PRESETS: {
    'correction-subtile': {
      name: 'Subtle Correction',
      description: 'Subtle pitch correction',
      params: { pitch: 0, harmonization: false, strength: 0.2, retuneSpeed: 400, scale: 'chromatic', key: 'C', naturalVibrato: 0 },
    },
    'effet-robotique': {
      name: 'Robot',
      description: 'Robot voice',
      params: { pitch: 0, harmonization: true, strength: 0.9, retuneSpeed: 0, scale: 'chromatic', key: 'C', naturalVibrato: 0 },
    },
    'custom': null,
  },
}));

jest.mock('@meeshy/shared/types/video-call', () => ({
  AudioEffectType: {},
}));

import { renderHook, act } from '@testing-library/react';
import { useAudioEffects } from '@/hooks/use-audio-effects';

const makeOptions = (overrides: Record<string, unknown> = {}) => ({
  inputStream: null,
  ...overrides,
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('outputStream is null initially', () => {
    const { result } = renderHook(() => useAudioEffects(makeOptions()));
    expect(result.current.outputStream).toBeNull();
  });

  it('all effects start disabled', () => {
    const { result } = renderHook(() => useAudioEffects(makeOptions()));
    const { effectsState } = result.current;
    expect(effectsState.voiceCoder.enabled).toBe(false);
    expect(effectsState.babyVoice.enabled).toBe(false);
    expect(effectsState.demonVoice.enabled).toBe(false);
    expect(effectsState.backSound.enabled).toBe(false);
  });

  it('starts with currentPreset=correction-subtile', () => {
    const { result } = renderHook(() => useAudioEffects(makeOptions()));
    expect(result.current.currentPreset).toBe('correction-subtile');
  });

  it('exposes availableBackSounds', () => {
    const { result } = renderHook(() => useAudioEffects(makeOptions()));
    expect(result.current.availableBackSounds.length).toBeGreaterThan(0);
    expect(result.current.availableBackSounds[0].id).toBe('rain');
  });

  it('exposes availablePresets', () => {
    const { result } = renderHook(() => useAudioEffects(makeOptions()));
    expect(result.current.availablePresets).toBeDefined();
    expect('correction-subtile' in result.current.availablePresets).toBe(true);
  });
});

// ─── toggleEffect ─────────────────────────────────────────────────────────────

describe('toggleEffect', () => {
  it('enables voiceCoder when toggled', () => {
    const { result } = renderHook(() => useAudioEffects(makeOptions()));

    act(() => { result.current.toggleEffect('voice-coder'); });

    expect(result.current.effectsState.voiceCoder.enabled).toBe(true);
  });

  it('disables voiceCoder when toggled twice', () => {
    const { result } = renderHook(() => useAudioEffects(makeOptions()));

    act(() => { result.current.toggleEffect('voice-coder'); });
    act(() => { result.current.toggleEffect('voice-coder'); });

    expect(result.current.effectsState.voiceCoder.enabled).toBe(false);
  });

  it('mutual exclusion: enabling babyVoice disables voiceCoder', () => {
    const { result } = renderHook(() => useAudioEffects(makeOptions()));

    act(() => { result.current.toggleEffect('voice-coder'); });
    expect(result.current.effectsState.voiceCoder.enabled).toBe(true);

    act(() => { result.current.toggleEffect('baby-voice'); });

    expect(result.current.effectsState.babyVoice.enabled).toBe(true);
    expect(result.current.effectsState.voiceCoder.enabled).toBe(false);
  });

  it('mutual exclusion: enabling demonVoice disables babyVoice', () => {
    const { result } = renderHook(() => useAudioEffects(makeOptions()));

    act(() => { result.current.toggleEffect('baby-voice'); });
    act(() => { result.current.toggleEffect('demon-voice'); });

    expect(result.current.effectsState.demonVoice.enabled).toBe(true);
    expect(result.current.effectsState.babyVoice.enabled).toBe(false);
  });

  it('backSound toggle does not disable voice effects', () => {
    const { result } = renderHook(() => useAudioEffects(makeOptions()));

    act(() => { result.current.toggleEffect('voice-coder'); });
    act(() => { result.current.toggleEffect('back-sound'); });

    expect(result.current.effectsState.voiceCoder.enabled).toBe(true);
    expect(result.current.effectsState.backSound.enabled).toBe(true);
  });

  it('enables backSound independently', () => {
    const { result } = renderHook(() => useAudioEffects(makeOptions()));

    act(() => { result.current.toggleEffect('back-sound'); });

    expect(result.current.effectsState.backSound.enabled).toBe(true);
  });
});

// ─── updateEffectParams ───────────────────────────────────────────────────────

describe('updateEffectParams', () => {
  it('merges partial params for babyVoice', () => {
    const { result } = renderHook(() => useAudioEffects(makeOptions()));

    act(() => {
      result.current.updateEffectParams('baby-voice', { pitch: 5, breathiness: 0.3 });
    });

    expect(result.current.effectsState.babyVoice.params.pitch).toBe(5);
    expect(result.current.effectsState.babyVoice.params.breathiness).toBe(0.3);
    expect(result.current.effectsState.babyVoice.params.formant).toBe(1.0);
  });

  it('merges partial params for demonVoice', () => {
    const { result } = renderHook(() => useAudioEffects(makeOptions()));

    act(() => {
      result.current.updateEffectParams('demon-voice', { distortion: 0.8 });
    });

    expect(result.current.effectsState.demonVoice.params.distortion).toBe(0.8);
    expect(result.current.effectsState.demonVoice.params.pitch).toBe(0);
  });

  it('sets currentPreset to custom when voiceCoder params updated', () => {
    const { result } = renderHook(() => useAudioEffects(makeOptions()));

    act(() => {
      result.current.updateEffectParams('voice-coder', { pitch: 3 });
    });

    expect(result.current.currentPreset).toBe('custom');
  });

  it('does not change currentPreset when non-voiceCoder params updated', () => {
    const { result } = renderHook(() => useAudioEffects(makeOptions()));

    act(() => {
      result.current.updateEffectParams('baby-voice', { pitch: 2 });
    });

    expect(result.current.currentPreset).toBe('correction-subtile');
  });
});

// ─── loadPreset ───────────────────────────────────────────────────────────────

describe('loadPreset', () => {
  it('applies preset params to voiceCoder', () => {
    const { result } = renderHook(() => useAudioEffects(makeOptions()));

    act(() => { result.current.loadPreset('effet-robotique'); });

    expect(result.current.currentPreset).toBe('effet-robotique');
    expect(result.current.effectsState.voiceCoder.params.harmonization).toBe(true);
    expect(result.current.effectsState.voiceCoder.params.strength).toBe(0.9);
  });

  it('updates currentPreset to the loaded preset name', () => {
    const { result } = renderHook(() => useAudioEffects(makeOptions()));

    act(() => { result.current.loadPreset('correction-subtile'); });

    expect(result.current.currentPreset).toBe('correction-subtile');
  });

  it('ignores custom preset (no-op)', () => {
    const { result } = renderHook(() => useAudioEffects(makeOptions()));

    act(() => { result.current.updateEffectParams('voice-coder', { pitch: 5 }); });
    const stateBefore = result.current.effectsState.voiceCoder.params;

    act(() => { result.current.loadPreset('custom'); });

    expect(result.current.effectsState.voiceCoder.params).toEqual(stateBefore);
  });
});
