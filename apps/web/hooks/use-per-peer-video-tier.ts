'use client';

import { useEffect, useRef } from 'react';
import type { ConnectionQualityStats } from '@meeshy/shared/types/video-call';
import { deriveVideoTier, type VideoSendTier } from '@/lib/calls/adaptive-degradation';

export interface UsePerPeerVideoTierParams {
  /** Latest per-peer quality samples (fresh Map reference expected per monitoring tick). */
  readonly perPeerStats: ReadonlyMap<string, ConnectionQualityStats>;
  /** The user's camera intent — the controller is fully idle when this is false. */
  readonly userWantsVideo: boolean;
  /** Apply a video encoding tier to ONE peer only. */
  readonly applyTierToPeer: (peerId: string, tier: VideoSendTier) => void;
}

/**
 * Per-peer bitrate/tier shedding (Vague 143, follow-up to W5's aggregate
 * quality monitoring and to PR #3182's noted "per-peer adaptive bitrate
 * degradation, call-wide today" gap). Each peer's own quality reading now
 * drives its own outbound encoder tier directly via
 * `RTCPeerConnection.applyVideoEncoding`/`setParameters()` — no
 * renegotiation, no track mutation — so a single struggling peer in a group
 * call no longer drags every other (healthy) peer's video down to the same
 * tier.
 *
 * Deliberately NOT responsible for the audio-only survival fallback — that
 * decision stays call-wide, driven by the worst-of-the-call aggregate
 * (`useAdaptiveDegradation`): if the link genuinely cannot sustain even
 * minimal video for one peer, whether to keep sending degraded video to the
 * OTHERS is a judgment call with real UX/complexity tradeoffs (re-deriving
 * the camera-track ownership/renegotiation semantics that `enableVideoSend`/
 * `disableVideoSend` and the manual-toggle/camera-switch mutual-exclusion
 * guards in `VideoCallInterface.tsx`, Vagues 76/82/92, were built around) —
 * left for a dedicated follow-up rather than folded into this change.
 *
 * No time-based hysteresis here (unlike the suspend/resume state machine):
 * a tier change is a cheap, renegotiation-free parameter update, so each
 * peer reacts to its own latest sample immediately. Only the LAST-APPLIED
 * tier per peer is tracked, purely to dedupe redundant `setParameters`
 * calls when a peer's level is unchanged tick-to-tick.
 */
export function usePerPeerVideoTier({
  perPeerStats,
  userWantsVideo,
  applyTierToPeer,
}: UsePerPeerVideoTierParams): void {
  const lastTierRef = useRef<Map<string, VideoSendTier>>(new Map());

  // Keep the callback in a ref so a new sample is always handled with the
  // latest closure without making it a dependency of the sampling effect.
  const applyTierToPeerRef = useRef(applyTierToPeer);
  applyTierToPeerRef.current = applyTierToPeer;

  useEffect(() => {
    if (!userWantsVideo) {
      // Forget every peer's last-applied tier so a camera-back-on tick
      // re-applies from scratch instead of being swallowed by a stale dedup
      // entry seeded before the camera went off.
      lastTierRef.current.clear();
      return;
    }

    perPeerStats.forEach((stats, peerId) => {
      const tier = deriveVideoTier(stats.level);
      if (lastTierRef.current.get(peerId) === tier) return;
      lastTierRef.current.set(peerId, tier);
      applyTierToPeerRef.current(peerId, tier);
    });

    // Drop bookkeeping for peers no longer present, so a peer that leaves
    // and later rejoins (same id) re-applies its tier instead of being
    // deduped against an entry from before it left.
    const activeIds = new Set(perPeerStats.keys());
    Array.from(lastTierRef.current.keys()).forEach((peerId) => {
      if (!activeIds.has(peerId)) lastTierRef.current.delete(peerId);
    });
  }, [perPeerStats, userWantsVideo]);
}
