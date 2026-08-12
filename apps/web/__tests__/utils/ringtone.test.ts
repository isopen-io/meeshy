/**
 * Ringtone — ring pattern lifecycle
 *
 * The Web Audio ring pattern re-schedules itself every 2.3s. A ringing session
 * that is stopped and restarted inside that window (two consecutive incoming
 * calls, a declined call immediately followed by another, a remount of
 * CallNotification) must still ring a SINGLE cycle — never two overlapping
 * loops out of phase on the shared getRingtone() singleton.
 */

type FakeOscillator = {
  type: string;
  frequency: { value: number };
  connect: jest.Mock;
  start: jest.Mock;
  stop: jest.Mock;
  disconnect: jest.Mock;
};

const createdOscillators: FakeOscillator[] = [];

const createFakeAudioContext = () => ({
  state: 'running' as const,
  currentTime: 0,
  destination: {},
  resume: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
  createGain: jest.fn(() => ({
    connect: jest.fn(),
    gain: { value: 0 },
  })),
  createOscillator: jest.fn((): FakeOscillator => {
    const oscillator: FakeOscillator = {
      type: '',
      frequency: { value: 0 },
      connect: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      disconnect: jest.fn(),
    };
    createdOscillators.push(oscillator);
    return oscillator;
  }),
});

const RING_CYCLE_MS = 2300;
const OSCILLATORS_PER_CYCLE = 2;

describe('Ringtone ring pattern', () => {
  let Ringtone: typeof import('@/utils/ringtone').Ringtone;

  beforeAll(() => {
    Ringtone = require('@/utils/ringtone').Ringtone;
  });

  beforeEach(() => {
    jest.useFakeTimers();
    createdOscillators.length = 0;
    (window as unknown as { AudioContext: unknown }).AudioContext =
      jest.fn(createFakeAudioContext);
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it('re-rings once per cycle while playing', async () => {
    const ringtone = new Ringtone();
    await ringtone.play();

    expect(createdOscillators).toHaveLength(OSCILLATORS_PER_CYCLE);

    jest.advanceTimersByTime(RING_CYCLE_MS);
    expect(createdOscillators).toHaveLength(OSCILLATORS_PER_CYCLE * 2);

    jest.advanceTimersByTime(RING_CYCLE_MS);
    expect(createdOscillators).toHaveLength(OSCILLATORS_PER_CYCLE * 3);

    ringtone.stop();
  });

  it('creates no further tones once stopped', async () => {
    const ringtone = new Ringtone();
    await ringtone.play();
    ringtone.stop();

    createdOscillators.length = 0;
    jest.advanceTimersByTime(RING_CYCLE_MS * 3);

    expect(createdOscillators).toHaveLength(0);
  });

  it('rings a single cycle when restarted inside the pattern window', async () => {
    const ringtone = new Ringtone();
    await ringtone.play();

    jest.advanceTimersByTime(1000);
    ringtone.stop();
    await ringtone.play();

    createdOscillators.length = 0;
    jest.advanceTimersByTime(RING_CYCLE_MS);

    expect(createdOscillators).toHaveLength(OSCILLATORS_PER_CYCLE);

    ringtone.stop();
  });

  it('keeps every scheduled tone stoppable after a restart inside the window', async () => {
    const ringtone = new Ringtone();
    await ringtone.play();

    jest.advanceTimersByTime(1000);
    ringtone.stop();

    await ringtone.play();
    createdOscillators.length = 0;
    jest.advanceTimersByTime(RING_CYCLE_MS);

    const scheduledSinceRestart = [...createdOscillators];
    ringtone.stop();

    scheduledSinceRestart.forEach((oscillator) => {
      expect(oscillator.stop).toHaveBeenCalled();
      expect(oscillator.disconnect).toHaveBeenCalled();
    });
  });
});
