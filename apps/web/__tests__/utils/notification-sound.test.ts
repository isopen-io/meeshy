/**
 * Tests for notification-sound.ts
 *
 * The module uses a singleton NotificationSoundManager. We reset modules per
 * test group to control AudioContext availability.
 */

// ── AudioContext mock factory ──────────────────────────────────────────────────

function makeMockAudioContext() {
  const mockOscillator = {
    connect: jest.fn(),
    type: 'sine',
    frequency: { setValueAtTime: jest.fn() },
    start: jest.fn(),
    stop: jest.fn(),
  };
  const mockGainNode = {
    connect: jest.fn(),
    gain: {
      setValueAtTime: jest.fn(),
      linearRampToValueAtTime: jest.fn(),
    },
  };
  return {
    currentTime: 0,
    destination: {},
    createOscillator: jest.fn().mockReturnValue(mockOscillator),
    createGain: jest.fn().mockReturnValue(mockGainNode),
    close: jest.fn().mockResolvedValue(undefined),
    _oscillator: mockOscillator,
    _gainNode: mockGainNode,
  };
}

// ── isNotificationSoundSupported ──────────────────────────────────────────────

describe('isNotificationSoundSupported', () => {
  it('returns true when AudioContext is defined', async () => {
    const mockCtx = makeMockAudioContext();
    const MockAudioContext = jest.fn().mockReturnValue(mockCtx);
    Object.defineProperty(window, 'AudioContext', { value: MockAudioContext, configurable: true, writable: true });

    jest.resetModules();
    const { isNotificationSoundSupported } = await import('@/utils/notification-sound');
    expect(isNotificationSoundSupported()).toBe(true);
  });

  it('returns true when webkitAudioContext is defined but AudioContext is not', async () => {
    Object.defineProperty(window, 'AudioContext', { value: undefined, configurable: true, writable: true });
    const mockCtx = makeMockAudioContext();
    (window as any).webkitAudioContext = jest.fn().mockReturnValue(mockCtx);

    jest.resetModules();
    const { isNotificationSoundSupported } = await import('@/utils/notification-sound');
    expect(isNotificationSoundSupported()).toBe(true);

    delete (window as any).webkitAudioContext;
  });

  it('returns false when neither AudioContext nor webkitAudioContext exists', async () => {
    Object.defineProperty(window, 'AudioContext', { value: undefined, configurable: true, writable: true });
    delete (window as any).webkitAudioContext;

    jest.resetModules();
    const { isNotificationSoundSupported } = await import('@/utils/notification-sound');
    expect(isNotificationSoundSupported()).toBe(false);
  });
});

// ── initializeNotificationSound ───────────────────────────────────────────────

describe('initializeNotificationSound', () => {
  it('creates an AudioContext when called', async () => {
    const mockCtx = makeMockAudioContext();
    const MockAudioContext = jest.fn().mockReturnValue(mockCtx);
    Object.defineProperty(window, 'AudioContext', { value: MockAudioContext, configurable: true, writable: true });

    jest.resetModules();
    const { initializeNotificationSound } = await import('@/utils/notification-sound');
    initializeNotificationSound();

    expect(MockAudioContext).toHaveBeenCalledTimes(1);
  });

  it('is idempotent — does not create a second AudioContext on repeated calls', async () => {
    const mockCtx = makeMockAudioContext();
    const MockAudioContext = jest.fn().mockReturnValue(mockCtx);
    Object.defineProperty(window, 'AudioContext', { value: MockAudioContext, configurable: true, writable: true });

    jest.resetModules();
    const { initializeNotificationSound } = await import('@/utils/notification-sound');
    initializeNotificationSound();
    initializeNotificationSound();

    expect(MockAudioContext).toHaveBeenCalledTimes(1);
  });

  it('does not throw when AudioContext constructor throws', async () => {
    const MockAudioContext = jest.fn().mockImplementation(() => {
      throw new Error('AudioContext blocked');
    });
    Object.defineProperty(window, 'AudioContext', { value: MockAudioContext, configurable: true, writable: true });

    jest.resetModules();
    const { initializeNotificationSound } = await import('@/utils/notification-sound');
    expect(() => initializeNotificationSound()).not.toThrow();
  });
});

// ── disposeNotificationSound ──────────────────────────────────────────────────

describe('disposeNotificationSound', () => {
  it('calls close on the AudioContext', async () => {
    const mockCtx = makeMockAudioContext();
    const MockAudioContext = jest.fn().mockReturnValue(mockCtx);
    Object.defineProperty(window, 'AudioContext', { value: MockAudioContext, configurable: true, writable: true });

    jest.resetModules();
    const { initializeNotificationSound, disposeNotificationSound } = await import('@/utils/notification-sound');
    initializeNotificationSound();
    disposeNotificationSound();

    expect(mockCtx.close).toHaveBeenCalled();
  });

  it('does not throw when called before initialization', async () => {
    Object.defineProperty(window, 'AudioContext', { value: undefined, configurable: true, writable: true });

    jest.resetModules();
    const { disposeNotificationSound } = await import('@/utils/notification-sound');
    expect(() => disposeNotificationSound()).not.toThrow();
  });
});

// ── playNotificationSound ─────────────────────────────────────────────────────

describe('playNotificationSound', () => {
  it('does not play when soundEnabled is false', async () => {
    const mockCtx = makeMockAudioContext();
    const MockAudioContext = jest.fn().mockReturnValue(mockCtx);
    Object.defineProperty(window, 'AudioContext', { value: MockAudioContext, configurable: true, writable: true });

    jest.resetModules();
    const { playNotificationSound } = await import('@/utils/notification-sound');
    await playNotificationSound({}, { soundEnabled: false });

    expect(mockCtx.createOscillator).not.toHaveBeenCalled();
  });

  it('does not play when DND is active (simple same-day window)', async () => {
    // Freeze local time to 14:00 — dndStartTime/dndEndTime compare against
    // getHours() (local wall clock), so the fake time must be constructed
    // from local components, not a UTC ISO string (which shifts per runner
    // timezone and made this test flaky outside UTC, e.g. Europe/Paris).
    jest.useFakeTimers().setSystemTime(new Date(2026, 5, 20, 14, 0, 0));

    const mockCtx = makeMockAudioContext();
    const MockAudioContext = jest.fn().mockReturnValue(mockCtx);
    Object.defineProperty(window, 'AudioContext', { value: MockAudioContext, configurable: true, writable: true });

    jest.resetModules();
    const { playNotificationSound } = await import('@/utils/notification-sound');
    await playNotificationSound(
      {},
      { dndEnabled: true, dndStartTime: '13:00', dndEndTime: '15:00' }
    );

    expect(mockCtx.createOscillator).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('plays when DND window does not cover current time', async () => {
    // Freeze local time to 10:00 (see local-vs-UTC note above)
    jest.useFakeTimers().setSystemTime(new Date(2026, 5, 20, 10, 0, 0));

    const mockCtx = makeMockAudioContext();
    const MockAudioContext = jest.fn().mockReturnValue(mockCtx);
    Object.defineProperty(window, 'AudioContext', { value: MockAudioContext, configurable: true, writable: true });

    jest.resetModules();
    const { playNotificationSound } = await import('@/utils/notification-sound');
    await playNotificationSound(
      {},
      { dndEnabled: true, dndStartTime: '22:00', dndEndTime: '08:00' }
    );

    // 10:00 is outside the 22:00–08:00 overnight DND window → sound plays
    expect(mockCtx.createOscillator).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('does not play when DND crosses midnight and current time is in window', async () => {
    // Freeze local time to 23:30 (see local-vs-UTC note above)
    jest.useFakeTimers().setSystemTime(new Date(2026, 5, 20, 23, 30, 0));

    const mockCtx = makeMockAudioContext();
    const MockAudioContext = jest.fn().mockReturnValue(mockCtx);
    Object.defineProperty(window, 'AudioContext', { value: MockAudioContext, configurable: true, writable: true });

    jest.resetModules();
    const { playNotificationSound } = await import('@/utils/notification-sound');
    await playNotificationSound(
      {},
      { dndEnabled: true, dndStartTime: '22:00', dndEndTime: '08:00' }
    );

    expect(mockCtx.createOscillator).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('does not play when AudioContext is unsupported', async () => {
    Object.defineProperty(window, 'AudioContext', { value: undefined, configurable: true, writable: true });
    delete (window as any).webkitAudioContext;

    jest.resetModules();
    const { playNotificationSound } = await import('@/utils/notification-sound');
    await expect(playNotificationSound({})).resolves.toBeUndefined();
  });

  it('plays default sound type when type not specified', async () => {
    const mockCtx = makeMockAudioContext();
    const MockAudioContext = jest.fn().mockReturnValue(mockCtx);
    Object.defineProperty(window, 'AudioContext', { value: MockAudioContext, configurable: true, writable: true });

    jest.resetModules();
    const { playNotificationSound, initializeNotificationSound } = await import('@/utils/notification-sound');
    initializeNotificationSound();
    await playNotificationSound({});

    // Default pattern has 1 bip → 1 oscillator created
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(1);
  });

  it('plays message sound type with 3-bip pattern', async () => {
    const mockCtx = makeMockAudioContext();
    const MockAudioContext = jest.fn().mockReturnValue(mockCtx);
    Object.defineProperty(window, 'AudioContext', { value: MockAudioContext, configurable: true, writable: true });

    jest.resetModules();
    const { playNotificationSound, initializeNotificationSound } = await import('@/utils/notification-sound');
    initializeNotificationSound();
    await playNotificationSound({ type: 'message' });

    // message pattern has 3 elements → 3 oscillators
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(3);
  });

  it('plays urgent sound type with 3-bip pattern', async () => {
    const mockCtx = makeMockAudioContext();
    const MockAudioContext = jest.fn().mockReturnValue(mockCtx);
    Object.defineProperty(window, 'AudioContext', { value: MockAudioContext, configurable: true, writable: true });

    jest.resetModules();
    const { playNotificationSound, initializeNotificationSound } = await import('@/utils/notification-sound');
    initializeNotificationSound();
    await playNotificationSound({ type: 'urgent' });

    // urgent pattern has 3 elements → 3 oscillators
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(3);
  });

  it('plays call sound type with triple-bip pattern (3 oscillators)', async () => {
    const mockCtx = makeMockAudioContext();
    const MockAudioContext = jest.fn().mockReturnValue(mockCtx);
    Object.defineProperty(window, 'AudioContext', { value: MockAudioContext, configurable: true, writable: true });

    jest.resetModules();
    const { playNotificationSound, initializeNotificationSound } = await import('@/utils/notification-sound');
    initializeNotificationSound();
    await playNotificationSound({ type: 'call' });

    // Call pattern has 5 elements → 5 oscillators
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(5);
  });

  it('initializes AudioContext automatically if not yet initialized', async () => {
    const mockCtx = makeMockAudioContext();
    const MockAudioContext = jest.fn().mockReturnValue(mockCtx);
    Object.defineProperty(window, 'AudioContext', { value: MockAudioContext, configurable: true, writable: true });

    jest.resetModules();
    const { playNotificationSound } = await import('@/utils/notification-sound');
    await playNotificationSound({});

    // AudioContext was created lazily inside play()
    expect(MockAudioContext).toHaveBeenCalled();
  });

  it('returns silently when play() cannot initialize AudioContext (constructor throws)', async () => {
    // AudioContext is "defined" so isSupported() is true, but construction fails
    const MockAudioContext = jest.fn().mockImplementation(() => {
      throw new Error('blocked by browser policy');
    });
    Object.defineProperty(window, 'AudioContext', { value: MockAudioContext, configurable: true, writable: true });

    jest.resetModules();
    const { playNotificationSound } = await import('@/utils/notification-sound');
    // play() will try initialize() internally, fail, and hit the early-return at lines 84-85
    await expect(playNotificationSound({})).resolves.toBeUndefined();
  });

  it('does not throw when oscillator operations fail', async () => {
    const mockCtx = makeMockAudioContext();
    mockCtx.createOscillator.mockImplementation(() => { throw new Error('oscillator error'); });
    const MockAudioContext = jest.fn().mockReturnValue(mockCtx);
    Object.defineProperty(window, 'AudioContext', { value: MockAudioContext, configurable: true, writable: true });

    jest.resetModules();
    const { playNotificationSound, initializeNotificationSound } = await import('@/utils/notification-sound');
    initializeNotificationSound();
    await expect(playNotificationSound({})).resolves.toBeUndefined();
  });
});
