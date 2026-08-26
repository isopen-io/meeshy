'use client';

import { useEffect, useRef } from 'react';
import type { ConnectionQualityStats } from '@meeshy/shared/types/video-call';
import { deriveVideoTier, type VideoSendTier } from '@/lib/calls/adaptive-degradation';

/** A per-peer applied tier: the quality ladder plus the network-survival floor. */
export type AppliedPeerVideoTier = VideoSendTier | 'frozen';

export interface UsePerPeerVideoTierParams {
  /** Latest per-peer quality samples (fresh Map reference expected per monitoring tick). */
  readonly perPeerStats: ReadonlyMap<string, ConnectionQualityStats>;
  /** The user's camera intent — the controller is fully idle when this is false. */
  readonly userWantsVideo: boolean;
  /**
   * True while the call-wide network-survival freeze (L6-3) is active. While
   * frozen, every peer is pinned to the 'frozen' encoder floor regardless of
   * its own quality reading; `deriveVideoTier` is not consulted at all.
   */
  readonly frozen: boolean;
  /** Apply a video encoding tier to ONE peer only. */
  readonly applyTierToPeer: (peerId: string, tier: AppliedPeerVideoTier) => void;
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
 * Also the sole actuator of the call-wide network-survival freeze (L6-3).
 * That freeze used to be actuated call-wide via `disableVideoSend()`/
 * `enableVideoSend()` — a track-removal + renegotiation cutoff indistinguishable
 * from the user's manual camera-off, which destroyed the peer's last frame
 * instead of merely slowing it down. Folding it in here (rather than as a
 * parallel call-wide `applyVideoEncoding('frozen')`) is deliberate: applying
 * a tier call-wide would immediately be fought/overridden by this hook's own
 * next per-peer tick the moment any one peer's reading changes (see the
 * warning in `VideoCallInterface.tsx` about call-wide tiers fighting
 * per-peer ones). The `frozen` flag short-circuits `deriveVideoTier` for
 * every peer while true. No explicit freeze-transition bookkeeping is
 * needed: `'frozen'` and the quality ladder (`'high' | 'medium' | 'low'`)
 * are disjoint values, so the per-peer dedup below already force-applies on
 * BOTH the freeze-entry and freeze-exit tick — a peer previously at `'low'`
 * reads `'frozen'` as a change, and vice versa on thaw.
 *
 * No time-based hysteresis here (unlike the suspend/resume state machine):
 * a tier change is a cheap, renegotiation-free parameter update, so each
 * peer reacts to its own latest sample immediately. Only the LAST-APPLIED
 * tier per peer is tracked, purely to dedupe redundant `setParameters`
 * calls when a peer's level (or the freeze) is unchanged tick-to-tick.
 */
export function usePerPeerVideoTier({
  perPeerStats,
  userWantsVideo,
  frozen,
  applyTierToPeer,
}: UsePerPeerVideoTierParams): void {
  const lastTierRef = useRef<Map<string, AppliedPeerVideoTier>>(new Map());

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
      const tier = frozen ? 'frozen' : deriveVideoTier(stats.level);
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
  }, [perPeerStats, userWantsVideo, frozen]);
}
