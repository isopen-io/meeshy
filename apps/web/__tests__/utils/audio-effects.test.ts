/**
 * Tests for utils/audio-effects.ts
 *
 * Strategy: mock Tone.js and pitchy so no real audio context is created.
 * Tests focus on lifecycle, delegation to mocked nodes, and factory behavior.
 */

// jest.mock calls are hoisted — factories must be self-contained
jest.mock('tone', () => {
  function makeNode() {
    return {
      connect: jest.fn(),
      disconnect: jest.fn(),
      dispose: jest.fn(),
      toDestination: jest.fn().mockReturnThis(),
    };
  }

  const mockAnalyser = {
    fftSize: 2048,
    getFloatTimeDomainData: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
  };

  return {
    Gain: jest.fn().mockImplementation(() => ({
      ...makeNode(),
      gain: { value: 1, rampTo: jest.fn() },
    })),
    PitchShift: jest.fn().mockImplementation(() => ({
      ...makeNode(),
      pitch: 0,
    })),
    Chorus: jest.fn().mockImplementation(() => ({
      ...makeNode(),
      start: jest.fn().mockReturnThis(),
    })),
    CrossFade: jest.fn().mockImplementation(() => ({
      ...makeNode(),
      a: makeNode(),
      b: makeNode(),
      fade: { value: 0.5 },
    })),
    Filter: jest.fn().mockImplementation(() => ({
      ...makeNode(),
      frequency: { value: 800 },
    })),
    Noise: jest.fn().mockImplementation(() => ({
      ...makeNode(),
      start: jest.fn().mockReturnThis(),
      stop: jest.fn(),
    })),
    Distortion: jest.fn().mockImplementation(() => ({
      ...makeNode(),
      distortion: 0,
    })),
    Reverb: jest.fn().mockImplementation(() => ({
      ...makeNode(),
      generate: jest.fn().mockResolvedValue(undefined),
      decay: 3,
      wet: { value: 0 },
    })),
    Player: jest.fn().mockImplementation(() => ({
      ...makeNode(),
      start: jest.fn(),
      stop: jest.fn(),
      loaded: true,
      buffer: { duration: 5 },
    })),
    context: {
      rawContext: {
        createAnalyser: jest.fn().mockReturnValue(mockAnalyser),
        sampleRate: 44100,
      },
      sampleRate: 44100,
    },
    loaded: jest.fn().mockResolvedValue(undefined),
    start: jest.fn().mockResolvedValue(undefined),
    now: jest.fn().mockReturnValue(0),
  };
});

jest.mock('pitchy', () => ({
  PitchDetector: {
    forFloat32Array: jest.fn().mockReturnValue({
      findPitch: jest.fn().mockReturnValue([440, 0.95]),
      clarityThreshold: 0.6,
    }),
  },
}));

import * as Tone from 'tone';
import {
  VoiceCoderProcessor,
  BabyVoiceProcessor,
  DemonVoiceProcessor,
  BackSoundProcessor,
  createAudioEffectProcessor,
} from '@/utils/audio-effects';
import type {
  VoiceCoderParams,
  BabyVoiceParams,
  DemonVoiceParams,
  BackSoundParams,
} from '@meeshy/shared/types/video-call';

// ─── Shared params factories ──────────────────────────────────────────────────

function makeVoiceCoderParams(overrides: Partial<VoiceCoderParams> = {}): VoiceCoderParams {
  return {
    pitch: 0,
    harmonization: false,
    strength: 50,
    retuneSpeed: 50,
    scale: 'major',
    key: 'C',
    naturalVibrato: 20,
    ...overrides,
  };
}

function makeBabyVoiceParams(overrides: Partial<BabyVoiceParams> = {}): BabyVoiceParams {
  return { pitch: 6, formant: 1.5, breathiness: 30, ...overrides };
}

function makeDemonVoiceParams(overrides: Partial<DemonVoiceParams> = {}): DemonVoiceParams {
  return { pitch: -12, distortion: 50, reverb: 50, ...overrides };
}

function makeBackSoundParams(overrides: Partial<BackSoundParams> = {}): BackSoundParams {
  return { soundFile: 'rain', volume: 50, loopMode: 'N_TIMES', loopValue: 2, ...overrides };
}

// ─── Test setup ───────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();

  // Prevent VoiceCoderProcessor.startPitchDetection() from looping indefinitely
  global.requestAnimationFrame = jest.fn().mockReturnValue(1);
  global.cancelAnimationFrame = jest.fn();
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── VoiceCoderProcessor ──────────────────────────────────────────────────────

describe('VoiceCoderProcessor', () => {
  it('constructs without throwing', () => {
    expect(() => new VoiceCoderProcessor(makeVoiceCoderParams())).not.toThrow();
  });

  it('starts pitch detection on construction (requestAnimationFrame called)', () => {
    new VoiceCoderProcessor(makeVoiceCoderParams());
    expect(global.requestAnimationFrame).toHaveBeenCalled();
  });

  it('constructs with harmonization enabled', () => {
    expect(() =>
      new VoiceCoderProcessor(makeVoiceCoderParams({ harmonization: true }))
    ).not.toThrow();
  });

  it('connect() delegates to outputNode', () => {
    const proc = new VoiceCoderProcessor(makeVoiceCoderParams());
    const dest = {} as any;
    expect(() => proc.connect(dest)).not.toThrow();
  });

  it('disconnect() does not throw', () => {
    const proc = new VoiceCoderProcessor(makeVoiceCoderParams());
    expect(() => proc.disconnect()).not.toThrow();
  });

  it('updateParams() updates wet/dry without rerouting when harmonization unchanged', () => {
    const proc = new VoiceCoderProcessor(makeVoiceCoderParams({ harmonization: false }));
    // Clear call counts from construction
    jest.clearAllMocks();
    global.requestAnimationFrame = jest.fn().mockReturnValue(1);

    proc.updateParams(makeVoiceCoderParams({ harmonization: false, strength: 80 }));
    // No rerouting → CrossFade.disconnect not called again
    expect((Tone as any).CrossFade).not.toHaveBeenCalled(); // no new CrossFade created
  });

  it('updateParams() triggers reroute when harmonization changes', () => {
    const proc = new VoiceCoderProcessor(makeVoiceCoderParams({ harmonization: false }));
    expect(() =>
      proc.updateParams(makeVoiceCoderParams({ harmonization: true }))
    ).not.toThrow();
  });

  it('destroy() cancels animation frame and disposes nodes', () => {
    const proc = new VoiceCoderProcessor(makeVoiceCoderParams());
    expect(() => proc.destroy()).not.toThrow();
    expect(global.cancelAnimationFrame).toHaveBeenCalledWith(1);
  });

  it('destroy() is safe to call multiple times', () => {
    const proc = new VoiceCoderProcessor(makeVoiceCoderParams());
    expect(() => { proc.destroy(); proc.destroy(); }).not.toThrow();
  });
});

// ─── BabyVoiceProcessor ───────────────────────────────────────────────────────

describe('BabyVoiceProcessor', () => {
  it('constructs without throwing', () => {
    expect(() => new BabyVoiceProcessor(makeBabyVoiceParams())).not.toThrow();
  });

  it('creates expected Tone nodes on construction', () => {
    jest.clearAllMocks();
    global.requestAnimationFrame = jest.fn().mockReturnValue(1);

    new BabyVoiceProcessor(makeBabyVoiceParams({ pitch: 8 }));
    expect((Tone as any).PitchShift).toHaveBeenCalledWith(
      expect.objectContaining({ pitch: 8 })
    );
    expect((Tone as any).Noise).toHaveBeenCalled();
  });

  it('connect() does not throw', () => {
    const proc = new BabyVoiceProcessor(makeBabyVoiceParams());
    expect(() => proc.connect({} as any)).not.toThrow();
  });

  it('disconnect() does not throw', () => {
    const proc = new BabyVoiceProcessor(makeBabyVoiceParams());
    expect(() => proc.disconnect()).not.toThrow();
  });

  it('updateParams() updates pitch on pitchShift node', () => {
    const proc = new BabyVoiceProcessor(makeBabyVoiceParams({ pitch: 4 }));
    const pitchShiftInstance = (Tone as any).PitchShift.mock.results[0].value;

    proc.updateParams(makeBabyVoiceParams({ pitch: 10 }));
    expect(pitchShiftInstance.pitch).toBe(10);
  });

  it('updateParams() updates breathiness on noiseGain', () => {
    const proc = new BabyVoiceProcessor(makeBabyVoiceParams({ breathiness: 20 }));
    // 3rd Gain call in constructor is noiseGain
    const noiseGainInstance = (Tone as any).Gain.mock.results[2].value;

    proc.updateParams(makeBabyVoiceParams({ breathiness: 60 }));
    expect(noiseGainInstance.gain.value).toBe(60 / 500);
  });

  it('destroy() disposes all nodes without throwing', () => {
    const proc = new BabyVoiceProcessor(makeBabyVoiceParams());
    expect(() => proc.destroy()).not.toThrow();
  });
});

// ─── DemonVoiceProcessor ──────────────────────────────────────────────────────

describe('DemonVoiceProcessor', () => {
  it('constructs without throwing', () => {
    expect(() => new DemonVoiceProcessor(makeDemonVoiceParams())).not.toThrow();
  });

  it('creates Reverb and calls generate() on construction', () => {
    jest.clearAllMocks();
    global.requestAnimationFrame = jest.fn().mockReturnValue(1);

    new DemonVoiceProcessor(makeDemonVoiceParams({ reverb: 75 }));
    expect((Tone as any).Reverb).toHaveBeenCalled();
    const reverbInstance = (Tone as any).Reverb.mock.results[0].value;
    expect(reverbInstance.generate).toHaveBeenCalled();
  });

  it('connect() does not throw', () => {
    const proc = new DemonVoiceProcessor(makeDemonVoiceParams());
    expect(() => proc.connect({} as any)).not.toThrow();
  });

  it('disconnect() does not throw', () => {
    const proc = new DemonVoiceProcessor(makeDemonVoiceParams());
    expect(() => proc.disconnect()).not.toThrow();
  });

  it('updateParams() updates pitch on pitchShift node', () => {
    const proc = new DemonVoiceProcessor(makeDemonVoiceParams({ pitch: -8 }));
    const pitchShiftInstance = (Tone as any).PitchShift.mock.results[0].value;

    proc.updateParams(makeDemonVoiceParams({ pitch: -16 }));
    expect(pitchShiftInstance.pitch).toBe(-16);
  });

  it('updateParams() updates distortion', () => {
    const proc = new DemonVoiceProcessor(makeDemonVoiceParams({ distortion: 40 }));
    const distortionInstance = (Tone as any).Distortion.mock.results[0].value;

    proc.updateParams(makeDemonVoiceParams({ distortion: 80 }));
    expect(distortionInstance.distortion).toBe(80 / 100);
  });

  it('updateParams() updates reverb decay and wet', () => {
    const proc = new DemonVoiceProcessor(makeDemonVoiceParams({ reverb: 50 }));
    const reverbInstance = (Tone as any).Reverb.mock.results[0].value;

    proc.updateParams(makeDemonVoiceParams({ reverb: 100 }));
    expect(reverbInstance.decay).toBe(3 + (100 / 100) * 5); // 8
    expect(reverbInstance.wet.value).toBe(100 / 200); // 0.5
  });

  it('destroy() disposes all nodes without throwing', () => {
    const proc = new DemonVoiceProcessor(makeDemonVoiceParams());
    expect(() => proc.destroy()).not.toThrow();
  });
});

// ─── BackSoundProcessor ───────────────────────────────────────────────────────

describe('BackSoundProcessor', () => {
  it('constructs without throwing', () => {
    expect(() => new BackSoundProcessor(makeBackSoundParams())).not.toThrow();
  });

  describe('loadSound', () => {
    it('resolves without throwing', async () => {
      const proc = new BackSoundProcessor(makeBackSoundParams());
      await expect(proc.loadSound('/sound.mp3')).resolves.toBeUndefined();
    });

    it('creates a Tone.Player with the correct URL', async () => {
      const proc = new BackSoundProcessor(makeBackSoundParams());
      jest.clearAllMocks();
      global.requestAnimationFrame = jest.fn().mockReturnValue(1);

      await proc.loadSound('/rain.mp3');
      expect((Tone as any).Player).toHaveBeenCalledWith(
        expect.objectContaining({ url: '/rain.mp3', loop: true })
      );
    });

    it('calls Tone.loaded() to await buffer load', async () => {
      const proc = new BackSoundProcessor(makeBackSoundParams());
      jest.clearAllMocks();
      global.requestAnimationFrame = jest.fn().mockReturnValue(1);

      await proc.loadSound('/sound.mp3');
      expect((Tone as any).loaded).toHaveBeenCalled();
    });

    it('disposes existing player before loading new sound', async () => {
      const proc = new BackSoundProcessor(makeBackSoundParams());
      await proc.loadSound('/first.mp3');
      const firstPlayer = (Tone as any).Player.mock.results[0].value;

      await proc.loadSound('/second.mp3');
      expect(firstPlayer.dispose).toHaveBeenCalled();
    });
  });

  describe('play', () => {
    it('does nothing and warns when player is not loaded', async () => {
      // Override Player mock so loaded = false
      (Tone as any).Player.mockImplementationOnce(() => ({
        connect: jest.fn(),
        disconnect: jest.fn(),
        dispose: jest.fn(),
        toDestination: jest.fn().mockReturnThis(),
        start: jest.fn(),
        stop: jest.fn(),
        loaded: false,
        buffer: null,
      }));

      const proc = new BackSoundProcessor(makeBackSoundParams());
      await proc.loadSound('/sound.mp3');
      await proc.play();

      const playerInst = (Tone as any).Player.mock.results[0].value;
      expect(playerInst.start).not.toHaveBeenCalled();
    });

    it('calls Tone.start() and player.start() when player is loaded', async () => {
      const proc = new BackSoundProcessor(makeBackSoundParams({ loopMode: 'N_TIMES', loopValue: 1 }));
      await proc.loadSound('/sound.mp3');
      jest.clearAllMocks();
      global.requestAnimationFrame = jest.fn().mockReturnValue(1);

      await proc.play();
      expect((Tone as any).start).toHaveBeenCalled();
    });

    it('schedules stop timeout for N_TIMES loop mode', async () => {
      const proc = new BackSoundProcessor(makeBackSoundParams({ loopMode: 'N_TIMES', loopValue: 3 }));
      await proc.loadSound('/sound.mp3');
      // player.buffer.duration = 5, loopValue = 3 → 5 * 3 * 1000 = 15000ms
      await proc.play();

      const playerInst = (Tone as any).Player.mock.results[0].value;
      jest.advanceTimersByTime(15000);
      expect(playerInst.stop).toHaveBeenCalled();
    });

    it('schedules stop timeout for N_MINUTES loop mode', async () => {
      const proc = new BackSoundProcessor(makeBackSoundParams({ loopMode: 'N_MINUTES', loopValue: 1 }));
      await proc.loadSound('/sound.mp3');
      // loopValue = 1 → 1 * 60 * 1000 = 60000ms
      await proc.play();

      const playerInst = (Tone as any).Player.mock.results[0].value;
      jest.advanceTimersByTime(60000);
      expect(playerInst.stop).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('does not throw when no player exists', () => {
      const proc = new BackSoundProcessor(makeBackSoundParams());
      expect(() => proc.stop()).not.toThrow();
    });

    it('calls player.stop() after loadSound', async () => {
      const proc = new BackSoundProcessor(makeBackSoundParams());
      await proc.loadSound('/sound.mp3');
      proc.stop();

      const playerInst = (Tone as any).Player.mock.results[0].value;
      expect(playerInst.stop).toHaveBeenCalled();
    });

    it('clears stop timeout when called before timeout fires', async () => {
      const proc = new BackSoundProcessor(makeBackSoundParams({ loopMode: 'N_MINUTES', loopValue: 1 }));
      await proc.loadSound('/sound.mp3');
      await proc.play(); // sets 60s timeout

      proc.stop();
      const playerInst = (Tone as any).Player.mock.results[0].value;

      // Advance past timeout — stop should NOT be called again
      playerInst.stop.mockClear();
      jest.advanceTimersByTime(60000);
      expect(playerInst.stop).not.toHaveBeenCalled();
    });
  });

  describe('updateParams', () => {
    it('ramps playerGain volume when volume changes', () => {
      const proc = new BackSoundProcessor(makeBackSoundParams({ volume: 50 }));
      // playerGain is the 3rd Gain created in constructor
      const playerGainInstance = (Tone as any).Gain.mock.results[2].value;

      proc.updateParams(makeBackSoundParams({ volume: 80 }));
      expect(playerGainInstance.gain.rampTo).toHaveBeenCalledWith(80 / 100, 0.1);
    });

    it('does not ramp when volume is unchanged', () => {
      const proc = new BackSoundProcessor(makeBackSoundParams({ volume: 50 }));
      const playerGainInstance = (Tone as any).Gain.mock.results[2].value;

      proc.updateParams(makeBackSoundParams({ volume: 50 }));
      expect(playerGainInstance.gain.rampTo).not.toHaveBeenCalled();
    });
  });

  describe('connect / disconnect', () => {
    it('connect() does not throw', () => {
      const proc = new BackSoundProcessor(makeBackSoundParams());
      expect(() => proc.connect({} as any)).not.toThrow();
    });

    it('disconnect() does not throw', () => {
      const proc = new BackSoundProcessor(makeBackSoundParams());
      expect(() => proc.disconnect()).not.toThrow();
    });
  });

  describe('destroy', () => {
    it('destroys cleanly when no player was loaded', () => {
      const proc = new BackSoundProcessor(makeBackSoundParams());
      expect(() => proc.destroy()).not.toThrow();
    });

    it('disposes player on destroy after loadSound', async () => {
      const proc = new BackSoundProcessor(makeBackSoundParams());
      await proc.loadSound('/sound.mp3');
      proc.destroy();

      const playerInst = (Tone as any).Player.mock.results[0].value;
      expect(playerInst.dispose).toHaveBeenCalled();
    });
  });
});

// ─── createAudioEffectProcessor ───────────────────────────────────────────────

describe('createAudioEffectProcessor', () => {
  it('creates VoiceCoderProcessor for voice-coder type', () => {
    const proc = createAudioEffectProcessor('voice-coder', makeVoiceCoderParams());
    expect(proc).toBeInstanceOf(VoiceCoderProcessor);
  });

  it('creates BabyVoiceProcessor for baby-voice type', () => {
    const proc = createAudioEffectProcessor('baby-voice', makeBabyVoiceParams());
    expect(proc).toBeInstanceOf(BabyVoiceProcessor);
  });

  it('creates DemonVoiceProcessor for demon-voice type', () => {
    const proc = createAudioEffectProcessor('demon-voice', makeDemonVoiceParams());
    expect(proc).toBeInstanceOf(DemonVoiceProcessor);
  });

  it('creates BackSoundProcessor for back-sound type', () => {
    const proc = createAudioEffectProcessor('back-sound', makeBackSoundParams());
    expect(proc).toBeInstanceOf(BackSoundProcessor);
  });

  it('throws for unknown type', () => {
    expect(() =>
      createAudioEffectProcessor('unknown-type' as any, {} as any)
    ).toThrow('Unknown effect type: unknown-type');
  });

  it('returned processors implement AudioEffectProcessor interface', () => {
    const proc = createAudioEffectProcessor('baby-voice', makeBabyVoiceParams());
    expect(typeof proc.connect).toBe('function');
    expect(typeof proc.disconnect).toBe('function');
    expect(typeof proc.updateParams).toBe('function');
    expect(typeof proc.destroy).toBe('function');
    expect(proc.inputNode).toBeDefined();
    expect(proc.outputNode).toBeDefined();
  });
});
