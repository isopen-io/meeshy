/**
 * Tests for usePerPeerVideoTier (Vague 143 — per-peer adaptive bitrate).
 *
 * Covers the per-peer bitrate/tier controller: each peer's OWN quality
 * reading drives its OWN encoder tier, independently of every other peer —
 * unlike the call-wide `useAdaptiveDegradation`, whose worst-of-the-call
 * input used to drag every peer's tier down to the struggling one.
 */

import { renderHook } from '@testing-library/react';
import { usePerPeerVideoTier } from '@/hooks/use-per-peer-video-tier';
import type { ConnectionQualityStats, ConnectionQualityLevel } from '@meeshy/shared/types/video-call';

function stats(level: ConnectionQualityLevel): ConnectionQualityStats {
  return {
    level,
    packetLoss: 0,
    rtt: 0,
    bitrate: { audio: 0, video: 0 },
    jitter: 0,
    timestamp: new Date(),
    bytesSent: 0,
    bytesReceived: 0,
  };
}

describe('usePerPeerVideoTier', () => {
  it('applies each peer its OWN tier — a struggling peer never drags a healthy one down', () => {
    const applyTierToPeer = jest.fn();
    renderHook(() =>
      usePerPeerVideoTier({
        perPeerStats: new Map([
          ['peer-good', stats('excellent')],
          ['peer-bad', stats('poor')],
        ]),
        userWantsVideo: true,
        applyTierToPeer,
      })
    );

    expect(applyTierToPeer).toHaveBeenCalledWith('peer-good', 'high');
    expect(applyTierToPeer).toHaveBeenCalledWith('peer-bad', 'low');
    expect(applyTierToPeer).toHaveBeenCalledTimes(2);
  });

  it('does not re-apply an unchanged tier on a later tick (avoids redundant setParameters churn)', () => {
    const applyTierToPeer = jest.fn();
    const { rerender } = renderHook(
      ({ perPeerStats }) => usePerPeerVideoTier({ perPeerStats, userWantsVideo: true, applyTierToPeer }),
      { initialProps: { perPeerStats: new Map([['peer-1', stats('good')]]) } }
    );
    expect(applyTierToPeer).toHaveBeenCalledTimes(1);

    // Same tier ('good' → 'high'), fresh object reference (mirrors a new
    // monitoring tick) — must NOT re-apply.
    rerender({ perPeerStats: new Map([['peer-1', stats('excellent')]]) });
    expect(applyTierToPeer).toHaveBeenCalledTimes(1);

    // A genuine tier change DOES re-apply.
    rerender({ perPeerStats: new Map([['peer-1', stats('poor')]]) });
    expect(applyTierToPeer).toHaveBeenCalledTimes(2);
    expect(applyTierToPeer).toHaveBeenLastCalledWith('peer-1', 'low');
  });

  it('re-applies a peer\'s tier if it rejoins after leaving (stale dedup entry must not survive departure)', () => {
    const applyTierToPeer = jest.fn();
    const { rerender } = renderHook(
      ({ perPeerStats }) => usePerPeerVideoTier({ perPeerStats, userWantsVideo: true, applyTierToPeer }),
      { initialProps: { perPeerStats: new Map([['peer-1', stats('poor')]]) } }
    );
    expect(applyTierToPeer).toHaveBeenCalledWith('peer-1', 'low');

    // peer-1 leaves.
    rerender({ perPeerStats: new Map() });
    applyTierToPeer.mockClear();

    // peer-1 rejoins at the SAME tier it had before leaving — without the
    // dedup-clear-on-departure, this would be silently swallowed.
    rerender({ perPeerStats: new Map([['peer-1', stats('poor')]]) });
    expect(applyTierToPeer).toHaveBeenCalledWith('peer-1', 'low');
  });

  it('does nothing when the user does not want video, and forgets prior tiers', () => {
    const applyTierToPeer = jest.fn();
    const { rerender } = renderHook(
      ({ perPeerStats, userWantsVideo }) =>
        usePerPeerVideoTier({ perPeerStats, userWantsVideo, applyTierToPeer }),
      {
        initialProps: {
          perPeerStats: new Map([['peer-1', stats('poor')]]),
          userWantsVideo: false,
        },
      }
    );
    expect(applyTierToPeer).not.toHaveBeenCalled();

    // Camera comes back on: same tier as what WOULD have been computed while
    // off must still apply (proves the off period cleared bookkeeping rather
    // than pre-seeding a dedup entry that swallows the first real tick).
    rerender({ perPeerStats: new Map([['peer-1', stats('poor')]]), userWantsVideo: true });
    expect(applyTierToPeer).toHaveBeenCalledWith('peer-1', 'low');
  });
});
