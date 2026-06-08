/**
 * Tests for the adaptive video degradation policy (time-based hysteresis).
 *
 * Covers the survival state machine: shed bitrate under load, drop to
 * audio-only after a sustained-poor DURATION, and bring video back only after
 * the link has been good for a sustained DURATION (hysteresis / no flapping).
 * Thresholds are wall-clock based, so tests drive explicit timestamps.
 */

import {
  createDegradationState,
  reduceDegradation,
  SUSPEND_AFTER_POOR_MS,
  RESUME_AFTER_GOOD_MS,
  type DegradationState,
  type DegradationAction,
} from '@/lib/calls/adaptive-degradation';
import type { ConnectionQualityLevel as Level } from '@meeshy/shared/types/video-call';

// Drive a sequence of [level, timestamp] samples and collect emitted actions.
function run(
  samples: ReadonlyArray<readonly [Level, number]>,
  userWantsVideo = true,
  initial: DegradationState = createDegradationState()
): { state: DegradationState; actions: DegradationAction[] } {
  let state = initial;
  const actions: DegradationAction[] = [];
  for (const [level, timestamp] of samples) {
    const result = reduceDegradation(state, { level, timestamp, userWantsVideo });
    state = result.state;
    actions.push(result.action);
  }
  return { state, actions };
}

function poorEvery(step: number, count: number, start = 0): Array<[Level, number]> {
  return Array.from({ length: count }, (_, i) => ['poor', start + i * step] as [Level, number]);
}
function goodEvery(step: number, count: number, start = 0): Array<[Level, number]> {
  return Array.from({ length: count }, (_, i) => ['good', start + i * step] as [Level, number]);
}

describe('reduceDegradation (time-based)', () => {
  it('maps quality to a video tier and dedups unchanged tiers', () => {
    const { actions } = run([
      ['excellent', 0],
      ['good', 2000],
      ['fair', 4000],
      ['fair', 6000],
      ['excellent', 8000],
    ]);
    expect(actions).toEqual([
      { type: 'set-tier', tier: 'high' },
      { type: 'none' }, // good == high
      { type: 'set-tier', tier: 'medium' },
      { type: 'none' }, // fair == medium
      { type: 'set-tier', tier: 'high' },
    ]);
  });

  it('sheds to the low tier on the first poor sample before suspending', () => {
    const { actions, state } = run([
      ['good', 0],
      ['poor', 2000],
    ]);
    expect(actions[1]).toEqual({ type: 'set-tier', tier: 'low' });
    expect(state.sending).toBe(true);
    expect(state.poorSince).toBe(2000);
  });

  it('drops to audio-only once poor is sustained for the threshold duration', () => {
    const { actions, state } = run(poorEvery(2000, 5));
    const suspendIdx = actions.findIndex((a) => a.type === 'suspend-video');
    expect(suspendIdx).toBeGreaterThan(-1);
    // First poor at t=0; suspends at the first sample with t >= 6000 → t=6000 (index 3).
    expect(suspendIdx).toBe(SUSPEND_AFTER_POOR_MS / 2000);
    expect(state.sending).toBe(false);
  });

  it('is interval-agnostic: a slower 4s cadence still suspends after >=6s of poor', () => {
    const { actions, state } = run(poorEvery(4000, 4)); // t=0,4000,8000,12000
    expect(actions).toContainEqual({ type: 'suspend-video' });
    // Suspends at t=8000 (first sample >= 6000) → index 2, NOT after a fixed count.
    expect(actions.findIndex((a) => a.type === 'suspend-video')).toBe(2);
    expect(state.sending).toBe(false);
  });

  it('does NOT suspend if a non-poor sample breaks the streak before the threshold', () => {
    const { actions, state } = run([
      ['poor', 0],
      ['poor', 2000],
      ['fair', 4000], // resets poorSince
      ['poor', 6000],
      ['poor', 8000],
    ]);
    expect(actions).not.toContainEqual({ type: 'suspend-video' });
    expect(state.sending).toBe(true);
  });

  it('resumes video only after a sustained good duration (hysteresis)', () => {
    const suspended = run(poorEvery(2000, 5));
    expect(suspended.state.sending).toBe(false);

    // Good but not long enough yet (< RESUME_AFTER_GOOD_MS) → stay suspended.
    const almost = run(goodEvery(2000, RESUME_AFTER_GOOD_MS / 2000), true, suspended.state);
    expect(almost.actions).not.toContainEqual({ type: 'resume-video' });
    expect(almost.state.sending).toBe(false);

    // One more good sample crosses the duration threshold → resume.
    const lastGoodT = (RESUME_AFTER_GOOD_MS / 2000) * 2000;
    const resumed = run([['good', lastGoodT]], true, almost.state);
    expect(resumed.actions[0]).toEqual({ type: 'resume-video' });
    expect(resumed.state.sending).toBe(true);
  });

  it('a poor sample resets the good recovery timer while suspended (no flap)', () => {
    const suspended = run(poorEvery(2000, 5));
    const seq: Array<[Level, number]> = [
      ['good', 0],
      ['good', 2000],
      ['good', 4000],
      ['poor', 6000], // wipes recovery timer
      ['good', 8000],
      ['good', 10000],
      ['good', 12000],
    ];
    const { actions, state } = run(seq, true, suspended.state);
    expect(actions).not.toContainEqual({ type: 'resume-video' });
    expect(state.sending).toBe(false);
  });

  it('a fair sample HOLDS the recovery timer (brief dip does not restart it)', () => {
    const suspended = run(poorEvery(2000, 5));
    // good at 0, fair at 9000 (holds), good at 10000 → elapsed since 0 >= 10000 → resume.
    const { actions } = run(
      [
        ['good', 0],
        ['fair', 9000],
        ['good', 10000],
      ],
      true,
      suspended.state
    );
    expect(actions).toContainEqual({ type: 'resume-video' });
  });

  it('is fully idle and resets when the user does not want video', () => {
    const { actions, state } = run(poorEvery(2000, 5), false);
    expect(actions.every((a) => a.type === 'none')).toBe(true);
    expect(state).toEqual(createDegradationState());
  });
});
