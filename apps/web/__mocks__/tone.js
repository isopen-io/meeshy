// Mock for tone library to avoid ESM issues in Jest
module.exports = {
  getContext: jest.fn(() => ({
    state: 'running',
    resume: jest.fn().mockResolvedValue(undefined),
  })),
  setContext: jest.fn(),
  context: {
    state: 'running',
    resume: jest.fn().mockResolvedValue(undefined),
    sampleRate: 44100,
    // VoiceCoderProcessor pulls the raw Web Audio AudioContext off here to
    // build its pitch-detection AnalyserNode directly (outside Tone's own
    // node graph).
    rawContext: {
      createAnalyser: jest.fn(() => ({
        fftSize: 2048,
        connect: jest.fn(),
        disconnect: jest.fn(),
        getFloatTimeDomainData: jest.fn(),
      })),
    },
  },
  Transport: {
    start: jest.fn(),
    stop: jest.fn(),
    pause: jest.fn(),
  },
  Master: {
    volume: { value: 0 },
  },
  now: jest.fn(() => 0),
  Destination: {},
  Gain: jest.fn(() => ({
    toDestination: jest.fn(() => ({})),
    connect: jest.fn(),
    disconnect: jest.fn(),
    dispose: jest.fn(),
  })),
  Reverb: jest.fn(() => ({
    toDestination: jest.fn(() => ({})),
    connect: jest.fn(),
    dispose: jest.fn(),
  })),
  Filter: jest.fn(() => ({
    toDestination: jest.fn(() => ({})),
    connect: jest.fn(),
    dispose: jest.fn(),
  })),
  PitchShift: jest.fn(() => ({
    toDestination: jest.fn(() => ({})),
    connect: jest.fn(),
    disconnect: jest.fn(),
    dispose: jest.fn(),
    pitch: 0,
  })),
  Chorus: jest.fn(() => {
    const instance = {
      connect: jest.fn(() => instance),
      disconnect: jest.fn(() => instance),
      dispose: jest.fn(),
      start: jest.fn(() => instance),
    };
    return instance;
  }),
  CrossFade: jest.fn(() => {
    const instance = {
      fade: { value: 0 },
      connect: jest.fn(() => instance),
      disconnect: jest.fn(() => instance),
      dispose: jest.fn(),
      a: { connect: jest.fn(), disconnect: jest.fn() },
      b: { connect: jest.fn(), disconnect: jest.fn() },
    };
    return instance;
  }),
  loaded: jest.fn().mockResolvedValue(undefined),
  start: jest.fn().mockResolvedValue(undefined),
  Player: jest.fn(() => {
    const instance = {
      loaded: true,
      buffer: { duration: 1 },
      start: jest.fn(),
      stop: jest.fn(),
      dispose: jest.fn(),
      connect: jest.fn(() => instance),
      toDestination: jest.fn(() => instance),
    };
    return instance;
  }),
};
