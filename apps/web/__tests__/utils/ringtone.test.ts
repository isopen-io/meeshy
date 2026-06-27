/**
 * Tests for utils/ringtone.ts
 */

import { Ringtone, getRingtone, playRingtone, stopRingtone, unlockAudio } from '@/utils/ringtone';

const mockOscillatorStart = jest.fn();
const mockOscillatorStop = jest.fn();
const mockOscillatorConnect = jest.fn();
const mockOscillatorDisconnect = jest.fn();

function makeOscillator() {
  return {
    type: 'sine' as OscillatorType,
    frequency: { value: 0 },
    connect: mockOscillatorConnect,
    disconnect: mockOscillatorDisconnect,
    start: mockOscillatorStart,
    stop: mockOscillatorStop,
  };
}

const mockGainConnect = jest.fn();
const mockGainNode = { connect: mockGainConnect, gain: { value: 0 } };
const mockContextResume = jest.fn().mockResolvedValue(undefined);
const mockContextClose = jest.fn().mockResolvedValue(undefined);
const mockCreateOscillator = jest.fn(() => makeOscillator());
const mockCreateGain = jest.fn(() => mockGainNode);
let mockContextState: AudioContextState = 'running';

class MockAudioContext {
  get state() { return mockContextState; }
  get currentTime() { return 0; }
  get destination() { return {}; }
  resume = mockContextResume;
  close = mockContextClose;
  createOscillator = mockCreateOscillator;
  createGain = mockCreateGain;
}

const mockVibrate = jest.fn().mockReturnValue(true);
const mockAudioPlay = jest.fn().mockResolvedValue(undefined);
const mockAudioPause = jest.fn();
const mockAudioLoad = jest.fn();

// Save a bound reference to the original createElement BEFORE any spy is installed
const originalCreateElement = document.createElement.bind(document);

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();

  mockContextResume.mockResolvedValue(undefined);
  mockContextClose.mockResolvedValue(undefined);
  mockAudioPlay.mockResolvedValue(undefined);
  mockContextState = 'running';

  // Non-iOS user agent by default
  Object.defineProperty(navigator, 'userAgent', {
    value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120',
    writable: true,
    configurable: true,
  });

  (window as any).AudioContext = MockAudioContext;
  delete (window as any).webkitAudioContext;

  // Mock global Audio constructor — jsdom may not define it
  (window as any).Audio = jest.fn(() => ({
    loop: false, volume: 1, preload: '', src: '', currentTime: 0, muted: false,
    setAttribute: jest.fn(),
    load: mockAudioLoad,
    play: mockAudioPlay,
    pause: mockAudioPause,
  }));

  // Extend audio elements from document.createElement with mock play/load/pause
  jest.spyOn(document, 'createElement').mockImplementation((tag: string) => {
    const el = originalCreateElement(tag);
    if (tag === 'audio') {
      (el as unknown as Record<string, unknown>).play = mockAudioPlay;
      (el as unknown as Record<string, unknown>).pause = mockAudioPause;
      (el as unknown as Record<string, unknown>).load = mockAudioLoad;
    }
    return el;
  });

  Object.defineProperty(navigator, 'vibrate', {
    value: mockVibrate,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// ─── Ringtone construction ────────────────────────────────────────────────────

describe('Ringtone construction', () => {
  it('creates instance without throwing on desktop', () => {
    expect(() => new Ringtone()).not.toThrow();
  });

  it('stop is safe to call on a freshly constructed instance', () => {
    const ringtone = new Ringtone();
    expect(() => ringtone.stop()).not.toThrow();
  });
});

// ─── play ─────────────────────────────────────────────────────────────────────

describe('play', () => {
  it('resolves without throwing', async () => {
    const ringtone = new Ringtone();
    await expect(ringtone.play()).resolves.toBeUndefined();
  });

  it('creates AudioContext GainNode on desktop', async () => {
    const ringtone = new Ringtone();
    await ringtone.play();
    expect(mockCreateGain).toHaveBeenCalled();
    expect(mockCreateOscillator).toHaveBeenCalled();
  });

  it('starts vibration when navigator.vibrate is available', async () => {
    const ringtone = new Ringtone();
    await ringtone.play();
    expect(mockVibrate).toHaveBeenCalledWith([400, 200, 400, 1000]);
  });

  it('is a no-op when already playing', async () => {
    const ringtone = new Ringtone();
    await ringtone.play();
    const callCount = mockCreateGain.mock.calls.length;
    await ringtone.play();
    expect(mockCreateGain.mock.calls.length).toBe(callCount);
  });

  it('resumes suspended AudioContext', async () => {
    mockContextState = 'suspended';
    const ringtone = new Ringtone();
    await ringtone.play();
    expect(mockContextResume).toHaveBeenCalled();
  });

  it('handles missing navigator.vibrate gracefully', async () => {
    delete (navigator as unknown as Record<string, unknown>).vibrate;
    const ringtone = new Ringtone();
    await expect(ringtone.play()).resolves.toBeUndefined();
  });
});

// ─── stop ─────────────────────────────────────────────────────────────────────

describe('stop', () => {
  it('is a no-op when not playing', () => {
    const ringtone = new Ringtone();
    expect(() => ringtone.stop()).not.toThrow();
  });

  it('stops oscillators after play', async () => {
    const ringtone = new Ringtone();
    await ringtone.play();
    ringtone.stop();
    expect(mockOscillatorStop).toHaveBeenCalled();
  });

  it('closes AudioContext after play', async () => {
    const ringtone = new Ringtone();
    await ringtone.play();
    ringtone.stop();
    expect(mockContextClose).toHaveBeenCalled();
  });

  it('stops vibration after play', async () => {
    const ringtone = new Ringtone();
    await ringtone.play();
    jest.clearAllMocks();
    ringtone.stop();
    expect(mockVibrate).toHaveBeenCalledWith(0);
  });

  it('allows play again after stop', async () => {
    const ringtone = new Ringtone();
    await ringtone.play();
    ringtone.stop();
    jest.clearAllMocks();
    await ringtone.play();
    expect(mockCreateGain).toHaveBeenCalled();
  });
});

// ─── iOS HTML Audio fallback ──────────────────────────────────────────────────

describe('iOS Safari HTML Audio fallback', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1',
      writable: true,
      configurable: true,
    });
  });

  it('does not use Web Audio API on iOS Safari (uses HTML Audio path instead)', async () => {
    const ringtone = new Ringtone();
    await ringtone.play();
    expect(mockCreateGain).not.toHaveBeenCalled();
  });

  it('does not throw even if HTMLAudio.play() rejects', async () => {
    mockAudioPlay.mockRejectedValue(new Error('NotAllowedError'));
    const ringtone = new Ringtone();
    await expect(ringtone.play()).resolves.toBeUndefined();
  });
});

// ─── getRingtone singleton ────────────────────────────────────────────────────

describe('getRingtone', () => {
  it('returns same instance on multiple calls', () => {
    const a = getRingtone();
    const b = getRingtone();
    expect(a).toBe(b);
  });

  it('returns a Ringtone instance', () => {
    expect(getRingtone()).toBeInstanceOf(Ringtone);
  });
});

// ─── playRingtone / stopRingtone ──────────────────────────────────────────────

describe('playRingtone / stopRingtone', () => {
  it('playRingtone calls play on the singleton without throwing', () => {
    expect(() => playRingtone()).not.toThrow();
  });

  it('stopRingtone calls stop on the singleton without throwing', () => {
    expect(() => stopRingtone()).not.toThrow();
  });
});

// ─── unlockAudio ──────────────────────────────────────────────────────────────

describe('unlockAudio', () => {
  it('resolves without throwing on non-iOS', async () => {
    await expect(unlockAudio()).resolves.toBeUndefined();
  });

  it('resolves without throwing on iOS', async () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit Safari',
      writable: true,
      configurable: true,
    });
    await expect(unlockAudio()).resolves.toBeUndefined();
  });
});
