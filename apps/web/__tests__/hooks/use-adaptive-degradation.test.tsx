/**
 * Integration tests for the adaptive degradation hook — specifically that the
 * controller accumulates samples across monitoring ticks (NOT level transitions)
 * so the audio-only fallback actually fires under a sustained poor link.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useAdaptiveDegradation,
  type AdaptiveDegradationActions,
} from '@/hooks/use-adaptive-degradation';
import {
  SUSPEND_AFTER_POOR_SAMPLES,
  RESUME_AFTER_GOOD_SAMPLES,
} from '@/lib/calls/adaptive-degradation';
import type {
  ConnectionQualityStats,
  ConnectionQualityLevel,
} from '@meeshy/shared/types/video-call';

// Each call yields a DISTINCT object (new reference) — mirrors useCallQuality
// emitting a fresh stats object every tick even when the level is unchanged.
function sample(level: ConnectionQualityLevel): ConnectionQualityStats {
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

function makeActions(): AdaptiveDegradationActions & {
  applyTier: jest.Mock;
  suspend: jest.Mock;
  resume: jest.Mock;
} {
  return {
    applyTier: jest.fn(),
    suspend: jest.fn().mockResolvedValue(undefined),
    resume: jest.fn().mockResolvedValue(undefined),
  };
}

describe('useAdaptiveDegradation', () => {
  it('drops to audio-only after sustained poor across ticks (the real-world bug)', async () => {
    const actions = makeActions();
    const { rerender } = renderHook(
      ({ qualityStats }) =>
        useAdaptiveDegradation({ qualityStats, userWantsVideo: true, actions }),
      { initialProps: { qualityStats: sample('good') as ConnectionQualityStats } }
    );

    // Feed N distinct 'poor' samples (same level, new object each tick).
    for (let i = 0; i < SUSPEND_AFTER_POOR_SAMPLES; i++) {
      rerender({ qualityStats: sample('poor') });
    }

    await waitFor(() => expect(actions.suspend).toHaveBeenCalledTimes(1));
    expect(actions.resume).not.toHaveBeenCalled();
  });

  it('processes each sample once even if re-rendered with the same object', () => {
    const actions = makeActions();
    const poor = sample('poor');
    const { rerender } = renderHook(
      ({ qualityStats }) =>
        useAdaptiveDegradation({ qualityStats, userWantsVideo: true, actions }),
      { initialProps: { qualityStats: poor as ConnectionQualityStats } }
    );

    // Re-render repeatedly with the SAME object reference → must not re-count.
    rerender({ qualityStats: poor });
    rerender({ qualityStats: poor });

    // Only the first poor was counted → not enough to suspend.
    expect(actions.suspend).not.toHaveBeenCalled();
  });

  it('resumes video only after a sustained good streak post-suspension', async () => {
    const actions = makeActions();
    const { rerender, result } = renderHook(
      ({ qualityStats }) =>
        useAdaptiveDegradation({ qualityStats, userWantsVideo: true, actions }),
      { initialProps: { qualityStats: sample('good') as ConnectionQualityStats } }
    );

    for (let i = 0; i < SUSPEND_AFTER_POOR_SAMPLES; i++) {
      rerender({ qualityStats: sample('poor') });
    }
    await waitFor(() => expect(result.current.videoSuspended).toBe(true));

    // Not enough good samples yet.
    for (let i = 0; i < RESUME_AFTER_GOOD_SAMPLES - 1; i++) {
      rerender({ qualityStats: sample('good') });
    }
    expect(actions.resume).not.toHaveBeenCalled();

    // One more crosses the threshold.
    rerender({ qualityStats: sample('good') });
    await waitFor(() => expect(actions.resume).toHaveBeenCalledTimes(1));
  });

  it('never suspends and resets when the user does not want video', () => {
    const actions = makeActions();
    const { rerender } = renderHook(
      ({ qualityStats, userWantsVideo }) =>
        useAdaptiveDegradation({ qualityStats, userWantsVideo, actions }),
      {
        initialProps: {
          qualityStats: sample('poor') as ConnectionQualityStats,
          userWantsVideo: false,
        },
      }
    );

    for (let i = 0; i < SUSPEND_AFTER_POOR_SAMPLES + 2; i++) {
      rerender({ qualityStats: sample('poor'), userWantsVideo: false });
    }

    expect(actions.suspend).not.toHaveBeenCalled();
    expect(actions.applyTier).not.toHaveBeenCalled();
  });

  it('clears the suspended indicator when the user turns video off', async () => {
    const actions = makeActions();
    const { rerender, result } = renderHook(
      ({ qualityStats, userWantsVideo }) =>
        useAdaptiveDegradation({ qualityStats, userWantsVideo, actions }),
      {
        initialProps: {
          qualityStats: sample('good') as ConnectionQualityStats,
          userWantsVideo: true,
        },
      }
    );

    for (let i = 0; i < SUSPEND_AFTER_POOR_SAMPLES; i++) {
      rerender({ qualityStats: sample('poor'), userWantsVideo: true });
    }
    await waitFor(() => expect(result.current.videoSuspended).toBe(true));

    act(() => {
      rerender({ qualityStats: sample('poor'), userWantsVideo: false });
    });
    expect(result.current.videoSuspended).toBe(false);
  });
});
