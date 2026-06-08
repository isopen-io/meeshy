/**
 * Tests for the adaptive video degradation policy.
 *
 * Covers the survival state machine: shed bitrate under load, drop to
 * audio-only after sustained poor quality, and bring video back only after the
 * link has clearly recovered (hysteresis / no flapping).
 */

import {
  createDegradationState,
  reduceDegradation,
  SUSPEND_AFTER_POOR_SAMPLES,
  RESUME_AFTER_GOOD_SAMPLES,
  type DegradationState,
  type DegradationAction,
} from '@/lib/calls/adaptive-degradation';
import type { ConnectionQualityLevel as Level } from '@meeshy/shared/types/video-call';

// Drive a sequence of samples and collect emitted actions.
function run(
  levels: Level[],
  userWantsVideo = true,
  initial: DegradationState = createDegradationState()
): { state: DegradationState; actions: DegradationAction[] } {
  let state = initial;
  const actions: DegradationAction[] = [];
  for (const level of levels) {
    const result = reduceDegradation(state, { level, userWantsVideo });
    state = result.state;
    actions.push(result.action);
  }
  return { state, actions };
}

describe('reduceDegradation', () => {
  it('maps quality to a video tier and dedups unchanged tiers', () => {
    const { actions } = run(['excellent', 'good', 'fair', 'fair', 'excellent']);
    expect(actions).toEqual([
      { type: 'set-tier', tier: 'high' },
      { type: 'none' }, // good == high, unchanged
      { type: 'set-tier', tier: 'medium' },
      { type: 'none' }, // fair == medium, unchanged
      { type: 'set-tier', tier: 'high' },
    ]);
  });

  it('sheds to the low tier on the first poor sample before suspending', () => {
    const { actions, state } = run(['good', 'poor']);
    expect(actions[1]).toEqual({ type: 'set-tier', tier: 'low' });
    expect(state.sending).toBe(true);
    expect(state.poorStreak).toBe(1);
  });

  it('drops to audio-only after sustained poor quality', () => {
    const poorRun = Array(SUSPEND_AFTER_POOR_SAMPLES).fill('poor') as Level[];
    const { actions, state } = run(poorRun);
    expect(actions[actions.length - 1]).toEqual({ type: 'suspend-video' });
    expect(state.sending).toBe(false);
  });

  it('does NOT suspend if a non-poor sample breaks the streak', () => {
    const { actions, state } = run(['poor', 'poor', 'fair', 'poor', 'poor']);
    expect(actions).not.toContainEqual({ type: 'suspend-video' });
    expect(state.sending).toBe(true);
  });

  it('resumes video only after a sustained good streak (hysteresis)', () => {
    // First force suspension.
    const suspended = run(Array(SUSPEND_AFTER_POOR_SAMPLES).fill('poor') as Level[]);
    expect(suspended.state.sending).toBe(false);

    // Not enough good samples yet → stay suspended.
    const almost = run(
      Array(RESUME_AFTER_GOOD_SAMPLES - 1).fill('good') as Level[],
      true,
      suspended.state
    );
    expect(almost.actions).not.toContainEqual({ type: 'resume-video' });
    expect(almost.state.sending).toBe(false);

    // One more good sample crosses the threshold → resume.
    const resumed = run(['good'], true, almost.state);
    expect(resumed.actions[0]).toEqual({ type: 'resume-video' });
    expect(resumed.state.sending).toBe(true);
  });

  it('a poor sample resets the good streak while suspended (no flap)', () => {
    const suspended = run(Array(SUSPEND_AFTER_POOR_SAMPLES).fill('poor') as Level[]);
    // good x(threshold-1), then poor wipes the streak, then good x(threshold-1)
    const seq: Level[] = [
      ...(Array(RESUME_AFTER_GOOD_SAMPLES - 1).fill('good') as Level[]),
      'poor',
      ...(Array(RESUME_AFTER_GOOD_SAMPLES - 1).fill('good') as Level[]),
    ];
    const { actions, state } = run(seq, true, suspended.state);
    expect(actions).not.toContainEqual({ type: 'resume-video' });
    expect(state.sending).toBe(false);
  });

  it('is fully idle and resets when the user does not want video', () => {
    const { actions, state } = run(['poor', 'poor', 'poor', 'good'], false);
    expect(actions.every((a) => a.type === 'none')).toBe(true);
    expect(state).toEqual(createDegradationState());
  });

  it('forgets survival state when the user turns video off mid-suspension', () => {
    const suspended = run(Array(SUSPEND_AFTER_POOR_SAMPLES).fill('poor') as Level[]);
    expect(suspended.state.sending).toBe(false);

    // User turns camera off: state resets, no action.
    const off = reduceDegradation(suspended.state, { level: 'good', userWantsVideo: false });
    expect(off.action).toEqual({ type: 'none' });
    expect(off.state).toEqual(createDegradationState());
  });
});
