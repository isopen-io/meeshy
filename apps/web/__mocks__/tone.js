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
    dispose: jest.fn(),
    pitch: 0,
  })),
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
