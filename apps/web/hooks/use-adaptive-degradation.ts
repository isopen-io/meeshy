'use client';

import { useEffect, useRef, useState } from 'react';
import type { ConnectionQualityStats } from '@meeshy/shared/types/video-call';
import {
  createDegradationState,
  reduceDegradation,
  type DegradationState,
  type VideoSendTier,
} from '@/lib/calls/adaptive-degradation';

/**
 * Side-effecting actions the call UI provides to the degradation controller.
 * Kept opaque so the hook stays orchestration-only (no WebRTC/socket details).
 */
export interface AdaptiveDegradationActions {
  /** Apply a video encoding tier (high/medium/low). */
  readonly applyTier: (tier: VideoSendTier) => void;
  /** Drop outbound video to audio-only (stop sending + notify peer). */
  readonly suspend: () => Promise<void>;
  /** Re-acquire the camera and resume sending video. */
  readonly resume: () => Promise<void>;
}

export interface UseAdaptiveDegradationParams {
  /** Latest quality sample. A NEW object reference is expected per monitoring tick. */
  readonly qualityStats: ConnectionQualityStats | null;
  /** The user's camera intent (authoritative — controller never overrides an off camera). */
  readonly userWantsVideo: boolean;
  readonly actions: AdaptiveDegradationActions;
}

/**
 * Drives the pure {@link reduceDegradation} state machine from the live quality
 * monitor and applies the resulting actions.
 *
 * CRITICAL: the controller must see ONE sample per monitoring tick, not per
 * `level` transition. `useCallQuality` emits a fresh `qualityStats` object every
 * interval, so we key on that object reference (and guard against reprocessing
 * the same reference) — keying on `qualityStats.level` would only fire on level
 * CHANGES, so a sustained 'poor' link would never accumulate enough samples to
 * trip the audio-only fallback.
 *
 * Returns whether outbound video is currently auto-suspended (for a discreet UI
 * indicator). This is distinct from the user's camera intent.
 */
export function useAdaptiveDegradation({
  qualityStats,
  userWantsVideo,
  actions,
}: UseAdaptiveDegradationParams): { readonly videoSuspended: boolean } {
  const [videoSuspended, setVideoSuspended] = useState(false);
  const stateRef = useRef<DegradationState>(createDegradationState());
  const lastSampleRef = useRef<ConnectionQualityStats | null>(null);

  // Keep actions in a ref so a new sample is always handled with the latest
  // callbacks without making them a dependency of the sampling effect (which
  // must run exactly once per quality tick).
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  // User turned the camera off: forget survival state so we never re-enable
  // video against the user's intent, and clear the suspended indicator.
  useEffect(() => {
    if (!userWantsVideo) {
      stateRef.current = createDegradationState();
      setVideoSuspended(false);
    }
  }, [userWantsVideo]);

  // Process exactly one degradation sample per new quality reading.
  useEffect(() => {
    if (!qualityStats || !userWantsVideo) return;
    if (lastSampleRef.current === qualityStats) return; // already handled this tick
    lastSampleRef.current = qualityStats;

    const { state, action } = reduceDegradation(stateRef.current, {
      level: qualityStats.level,
      timestamp: qualityStats.timestamp.getTime(),
      userWantsVideo: true,
    });
    stateRef.current = state;

    switch (action.type) {
      case 'set-tier':
        actionsRef.current.applyTier(action.tier);
        break;
      case 'suspend-video':
        actionsRef.current
          .suspend()
          .then(() => setVideoSuspended(true))
          // Suspend failed: revert to sending so adaptive tiers keep working and
          // a later poor streak retries the fallback.
          .catch(() => {
            stateRef.current = { ...stateRef.current, sending: true, poorSince: null };
          });
        break;
      case 'resume-video':
        actionsRef.current
          .resume()
          .then(() => setVideoSuspended(false))
          // Re-acquire failed: stay in survival so a later good streak retries.
          .catch(() => {
            stateRef.current = { ...stateRef.current, sending: false, goodSince: null };
          });
        break;
    }
  }, [qualityStats, userWantsVideo]);

  return { videoSuspended };
}
