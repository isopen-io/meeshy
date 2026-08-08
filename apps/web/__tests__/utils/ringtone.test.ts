/**
 * Tests for ringtone.ts
 *
 * `Ringtone.playRingPattern()` self-schedules its next cycle via a recursive
 * `setTimeout`, gated only by the flat `isPlaying` boolean. `stop()` never
 * stored or cancelled that timer id, so:
 *   1. a timer scheduled by one ring session could still fire after `stop()`
 *      if a NEW session started before the original 2.3s delay elapsed
 *      (rapid consecutive incoming calls on the shared `getRingtone()`
 *      singleton), stacking a second, unwanted `playRingPattern()` call on
 *      top of the new session's own chain — doubled/overlapping tones.
 *
 * Same pattern as `notification-sound.test.ts`: a hand-rolled AudioContext
 * mock + `jest.resetModules()` so each test gets a fresh module instance.
 */

function makeMockRingtoneAudioContext() {
  const oscillators: Array<{ start: jest.Mock; stop: jest.Mock; connect: jest.Mock }> = [];
  const audioContext = {
    currentTime: 0,
    state: 'running' as AudioContextState,
    destination: {},
    createOscillator: jest.fn(() => {
      const osc = {
        type: 'sine',
        frequency: { value: 0 },
        connect: jest.fn(),
        start: jest.fn(),
        stop: jest.fn(),
        disconnect: jest.fn(),
      };
      oscillators.push(osc);
      return osc;
    }),
    createGain: jest.fn(() => ({
      connect: jest.fn(),
      gain: { value: 0 },
    })),
    resume: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  };
  return { audioContext, oscillators };
}

function installMockAudioContext() {
  const { audioContext, oscillators } = makeMockRingtoneAudioContext();
  const MockAudioContext = jest.fn().mockReturnValue(audioContext);
  Object.defineProperty(window, 'AudioContext', { value: MockAudioContext, configurable: true, writable: true });
  return { oscillators };
}

describe('Ringtone — recursive ring-pattern timer lifecycle', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates no further oscillators once stopped, even after the scheduled recursive delay elapses', async () => {
    jest.useFakeTimers();
    const { oscillators } = installMockAudioContext();

    jest.resetModules();
    const { Ringtone } = await import('@/utils/ringtone');
    const ringtone = new Ringtone();

    await ringtone.play();
    expect(oscillators.length).toBe(2); // first two-tone ring

    ringtone.stop();
    jest.advanceTimersByTime(3000); // past the 2300ms recursive delay

    expect(oscillators.length).toBe(2); // no extra cycle after stop()
  });

  it('does not layer a stale timer from a stopped session onto a new session started within the same 2.3s window', async () => {
    jest.useFakeTimers();
    const { oscillators } = installMockAudioContext();

    jest.resetModules();
    const { Ringtone } = await import('@/utils/ringtone');
    const ringtone = new Ringtone();

    // Session 1: rings, then stops immediately — well before its own
    // 2300ms recursive timer would fire.
    await ringtone.play();
    expect(oscillators.length).toBe(2);
    ringtone.stop();

    // Session 2 starts right away (e.g. a second incoming call), inside the
    // window session 1's stale timer is still pending in.
    await ringtone.play();
    expect(oscillators.length).toBe(4);

    // Advance to session 1's original 2300ms mark. Only session 2's own
    // recursive cycle may fire — session 1's cancelled timer must not.
    jest.advanceTimersByTime(2300);

    expect(oscillators.length).toBe(6); // one extra cycle (session 2's own), not two
    ringtone.stop();
  });
});
