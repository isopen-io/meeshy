/**
 * ADAPTIVE VIDEO DEGRADATION — pure decision logic
 *
 * State-of-the-art graceful degradation for an unstable link: when the observed
 * connection quality stays bad despite the encoder already running at the
 * lowest video tier, the survival move is to DROP outbound video entirely and
 * keep the call alive on audio only — then bring video back once the link has
 * recovered for a sustained window. Hysteresis (asymmetric streak thresholds)
 * prevents flapping (relighting the camera + renegotiating every couple of
 * seconds).
 *
 * This module is intentionally pure (no WebRTC, no React): it maps a stream of
 * quality samples to discrete actions, so the policy is fully unit-testable.
 * The orchestration (applying tiers, suspending/resuming the camera, emitting
 * media-toggle) stays app-side in the call UI.
 */

import type { ConnectionQualityLevel } from '@meeshy/shared/types/video-call';

/** Video send tiers (audio-only is modelled as the `suspend` action, not a tier). */
export type VideoSendTier = 'high' | 'medium' | 'low';

export type DegradationAction =
  | { readonly type: 'none' }
  | { readonly type: 'set-tier'; readonly tier: VideoSendTier }
  | { readonly type: 'suspend-video' }
  | { readonly type: 'resume-video' };

export interface DegradationState {
  /** true while we are sending (or intend to send) video; false in audio-only survival. */
  readonly sending: boolean;
  readonly poorStreak: number;
  readonly goodStreak: number;
  readonly lastTier: VideoSendTier | null;
}

export interface DegradationSample {
  readonly level: ConnectionQualityLevel;
  /** The user's intent (camera button). When false the policy is fully idle. */
  readonly userWantsVideo: boolean;
}

/**
 * Consecutive 'poor' samples (at ~2s cadence ⇒ ~6s) before we drop to
 * audio-only. We only get here after already shedding to the 'low' tier, so a
 * sustained poor reading means even minimal video cannot survive the link.
 */
export const SUSPEND_AFTER_POOR_SAMPLES = 3;

/**
 * Consecutive 'good'/'excellent' samples (~10s) before we bring video back.
 * Deliberately longer than the suspend threshold: re-upgrading is expensive
 * (camera re-acquire + renegotiation), so we require the link to have clearly
 * settled to avoid oscillation.
 */
export const RESUME_AFTER_GOOD_SAMPLES = 5;

export function createDegradationState(): DegradationState {
  return { sending: true, poorStreak: 0, goodStreak: 0, lastTier: null };
}

function tierForLevel(level: ConnectionQualityLevel): VideoSendTier {
  if (level === 'excellent' || level === 'good') return 'high';
  if (level === 'fair') return 'medium';
  return 'low';
}

/**
 * Advance the policy by one quality sample. Returns the next state and the
 * action the caller must apply. Deterministic and side-effect free.
 */
export function reduceDegradation(
  state: DegradationState,
  sample: DegradationSample
): { readonly state: DegradationState; readonly action: DegradationAction } {
  // User turned their camera off: stop managing video and forget any survival
  // state, so we never re-enable video against the user's intent.
  if (!sample.userWantsVideo) {
    return { state: createDegradationState(), action: { type: 'none' } };
  }

  if (state.sending) {
    const poorStreak = sample.level === 'poor' ? state.poorStreak + 1 : 0;

    // Sustained poor while already at the lowest video tier → audio-only.
    if (poorStreak >= SUSPEND_AFTER_POOR_SAMPLES) {
      return {
        state: { sending: false, poorStreak: 0, goodStreak: 0, lastTier: null },
        action: { type: 'suspend-video' },
      };
    }

    const tier = tierForLevel(sample.level);
    const nextState: DegradationState = {
      sending: true,
      poorStreak,
      goodStreak: 0,
      lastTier: tier,
    };
    // Only emit a tier change when it actually differs — avoids redundant
    // setParameters churn every monitoring tick.
    const action: DegradationAction =
      tier === state.lastTier ? { type: 'none' } : { type: 'set-tier', tier };
    return { state: nextState, action };
  }

  // Audio-only survival: wait for a sustained good streak before resuming.
  const isGood = sample.level === 'excellent' || sample.level === 'good';
  const isPoor = sample.level === 'poor';
  const goodStreak = isGood ? state.goodStreak + 1 : isPoor ? 0 : state.goodStreak;

  if (goodStreak >= RESUME_AFTER_GOOD_SAMPLES) {
    return {
      state: { sending: true, poorStreak: 0, goodStreak: 0, lastTier: 'high' },
      action: { type: 'resume-video' },
    };
  }

  return { state: { ...state, goodStreak }, action: { type: 'none' } };
}
