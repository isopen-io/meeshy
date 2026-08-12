/**
 * ADAPTIVE VIDEO DEGRADATION — pure decision logic
 *
 * State-of-the-art graceful degradation for an unstable link: when the observed
 * connection quality stays bad despite the encoder already running at the
 * lowest video tier, the survival move is to DROP outbound video entirely and
 * keep the call alive on audio only — then bring video back once the link has
 * recovered for a sustained window. Hysteresis (asymmetric DURATION thresholds)
 * prevents flapping (relighting the camera + renegotiating every couple of
 * seconds).
 *
 * Thresholds are expressed in WALL-CLOCK TIME (milliseconds), not in a number
 * of samples. This is deliberate: the quality monitor's cadence is an
 * implementation detail that can change (and real networks deliver stats at
 * irregular intervals). A duration-based streak ("poor for >=6s") behaves
 * identically whether stats arrive every 1s or every 4s, whereas a sample count
 * silently changes meaning with the interval. This is the standard approach for
 * congestion/quality state machines.
 *
 * This module is intentionally pure (no WebRTC, no React): it maps a stream of
 * timestamped quality samples to discrete actions, so the policy is fully
 * unit-testable. The orchestration (applying tiers, suspending/resuming the
 * camera, emitting media-toggle) stays app-side in the call UI.
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
  /** Timestamp (ms) the current sustained 'poor' streak began, while sending. */
  readonly poorSince: number | null;
  /** Timestamp (ms) the current sustained 'good' streak began, while suspended. */
  readonly goodSince: number | null;
  readonly lastTier: VideoSendTier | null;
}

export interface DegradationSample {
  readonly level: ConnectionQualityLevel;
  /** Sample time in epoch milliseconds (e.g. `stats.timestamp.getTime()`). */
  readonly timestamp: number;
  /** The user's intent (camera button). When false the policy is fully idle. */
  readonly userWantsVideo: boolean;
}

/**
 * Sustained 'poor' duration before dropping to audio-only. We only get here
 * after already shedding to the 'low' tier, so a poor link sustained this long
 * means even minimal video cannot survive.
 */
export const SUSPEND_AFTER_POOR_MS = 6000;

/**
 * Sustained 'good'/'excellent' duration before bringing video back.
 * Deliberately longer than the suspend threshold: re-upgrading is expensive
 * (camera re-acquire + renegotiation), so we require the link to have clearly
 * settled to avoid oscillation.
 */
export const RESUME_AFTER_GOOD_MS = 10000;

export function createDegradationState(): DegradationState {
  return { sending: true, poorSince: null, goodSince: null, lastTier: null };
}

function tierForLevel(level: ConnectionQualityLevel): VideoSendTier {
  if (level === 'excellent' || level === 'good') return 'high';
  if (level === 'fair') return 'medium';
  /* istanbul ignore next -- defensive fallback: tierForLevel is only called from the non-poor path in reduceDegradation, where level is always 'excellent'|'good'|'fair'; 'poor' is handled before calling this function */
  return 'low';
}

function tierAction(tier: VideoSendTier, lastTier: VideoSendTier | null): DegradationAction {
  // Only emit a tier change when it actually differs — avoids redundant
  // setParameters churn every monitoring tick.
  return tier === lastTier ? { type: 'none' } : { type: 'set-tier', tier };
}

/**
 * Advance the policy by one timestamped quality sample. Returns the next state
 * and the action the caller must apply. Deterministic and side-effect free.
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
    if (sample.level === 'poor') {
      const poorSince = state.poorSince ?? sample.timestamp;

      // Poor sustained long enough while already at the lowest tier → audio-only.
      if (sample.timestamp - poorSince >= SUSPEND_AFTER_POOR_MS) {
        return {
          state: { sending: false, poorSince: null, goodSince: null, lastTier: null },
          action: { type: 'suspend-video' },
        };
      }

      // Shed to the lowest video tier while the poor streak builds.
      return {
        state: { sending: true, poorSince, goodSince: null, lastTier: 'low' },
        action: tierAction('low', state.lastTier),
      };
    }

    // Non-poor: map level → tier and clear the poor streak.
    const tier = tierForLevel(sample.level);
    return {
      state: { sending: true, poorSince: null, goodSince: null, lastTier: tier },
      action: tierAction(tier, state.lastTier),
    };
  }

  // Audio-only survival: require a sustained good streak before resuming.
  const isGood = sample.level === 'excellent' || sample.level === 'good';
  if (isGood) {
    const goodSince = state.goodSince ?? sample.timestamp;
    if (sample.timestamp - goodSince >= RESUME_AFTER_GOOD_MS) {
      return {
        state: { sending: true, poorSince: null, goodSince: null, lastTier: 'high' },
        action: { type: 'resume-video' },
      };
    }
    return { state: { ...state, goodSince }, action: { type: 'none' } };
  }

  // A 'poor' sample wipes the recovery timer; 'fair' holds it (neither advances
  // nor resets — a brief dip shouldn't restart the whole recovery window).
  if (sample.level === 'poor') {
    return { state: { ...state, goodSince: null }, action: { type: 'none' } };
  }
  return { state, action: { type: 'none' } };
}
