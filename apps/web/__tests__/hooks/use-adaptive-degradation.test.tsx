/**
 * Integration tests for the adaptive degradation hook — specifically that the
 * controller accumulates samples across monitoring ticks (NOT level transitions)
 * so the audio-only fallback actually fires under a sustained poor link, and
 * that the time-based thresholds are honoured via each sample's timestamp.
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import {
  useAdaptiveDegradation,
  type AdaptiveDegradationActions,
} from '@/hooks/use-adaptive-degradation';
import {
  SUSPEND_AFTER_POOR_MS,
  RESUME_AFTER_GOOD_MS,
} from '@/lib/calls/adaptive-degradation';
import type {
  ConnectionQualityStats,
  ConnectionQualityLevel,
} from '@meeshy/shared/types/video-call';

// Each call yields a DISTINCT object (new reference) with an explicit timestamp,
// mirroring useCallQuality emitting a fresh stats object every tick.
function sample(level: ConnectionQualityLevel, atMs: number): ConnectionQualityStats {
  return {
    level,
    packetLoss: 0,
    rtt: 0,
    bitrate: { audio: 0, video: 0 },
    jitter: 0,
    timestamp: new Date(atMs),
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

const TICK = 2000;
const POOR_TICKS = SUSPEND_AFTER_POOR_MS / TICK + 1; // enough ticks to cross the duration
const GOOD_TICKS = RESUME_AFTER_GOOD_MS / TICK + 1;

describe('useAdaptiveDegradation', () => {
  it('drops to audio-only after sustained poor across ticks (the real-world bug)', async () => {
    const actions = makeActions();
    const { rerender } = renderHook(
      ({ qualityStats }) =>
        useAdaptiveDegradation({ qualityStats, userWantsVideo: true, actions }),
      { initialProps: { qualityStats: sample('good', 0) as ConnectionQualityStats } }
    );

    for (let i = 1; i <= POOR_TICKS; i++) {
      rerender({ qualityStats: sample('poor', i * TICK) });
    }

    await waitFor(() => expect(actions.suspend).toHaveBeenCalledTimes(1));
    expect(actions.resume).not.toHaveBeenCalled();
  });

  it('processes each sample once even if re-rendered with the same object', () => {
    const actions = makeActions();
    const poor = sample('poor', 1000);
    const { rerender } = renderHook(
      ({ qualityStats }) =>
        useAdaptiveDegradation({ qualityStats, userWantsVideo: true, actions }),
      { initialProps: { qualityStats: poor as ConnectionQualityStats } }
    );

    // Re-render repeatedly with the SAME object reference → must not re-count.
    rerender({ qualityStats: poor });
    rerender({ qualityStats: poor });

    expect(actions.suspend).not.toHaveBeenCalled();
  });

  it('resumes video only after a sustained good streak post-suspension', async () => {
    const actions = makeActions();
    const { rerender, result } = renderHook(
      ({ qualityStats }) =>
        useAdaptiveDegradation({ qualityStats, userWantsVideo: true, actions }),
      { initialProps: { qualityStats: sample('good', 0) as ConnectionQualityStats } }
    );

    let t = TICK;
    for (let i = 0; i < POOR_TICKS; i++, t += TICK) {
      rerender({ qualityStats: sample('poor', t) });
    }
    await waitFor(() => expect(result.current.videoSuspended).toBe(true));

    // Good but not long enough yet.
    const goodStart = t;
    for (let i = 0; i < GOOD_TICKS - 1; i++, t += TICK) {
      rerender({ qualityStats: sample('good', t) });
    }
    expect(actions.resume).not.toHaveBeenCalled();

    // Cross the recovery duration.
    rerender({ qualityStats: sample('good', goodStart + RESUME_AFTER_GOOD_MS) });
    await waitFor(() => expect(actions.resume).toHaveBeenCalledTimes(1));
  });

  it('never suspends and resets when the user does not want video', () => {
    const actions = makeActions();
    const { rerender } = renderHook(
      ({ qualityStats, userWantsVideo }) =>
        useAdaptiveDegradation({ qualityStats, userWantsVideo, actions }),
      {
        initialProps: {
          qualityStats: sample('poor', 0) as ConnectionQualityStats,
          userWantsVideo: false,
        },
      }
    );

    for (let i = 1; i <= POOR_TICKS + 2; i++) {
      rerender({ qualityStats: sample('poor', i * TICK), userWantsVideo: false });
    }

    expect(actions.suspend).not.toHaveBeenCalled();
    expect(actions.applyTier).not.toHaveBeenCalled();
  });

  // Audit Vague 25 — the suspend()/resume() rejection branches previously
  // wrote to nonexistent `poorStreak`/`goodStreak` fields (TS2353 compile
  // error; `DegradationState` only has `poorSince`/`goodSince`), so the
  // catch handlers never had test coverage of their "revert + retry" intent.
  it('reverts to sending video when suspend() rejects, and retries after a fresh poor streak', async () => {
    const actions = makeActions();
    actions.suspend.mockRejectedValueOnce(new Error('stop track failed'));
    const { rerender } = renderHook(
      ({ qualityStats }) =>
        useAdaptiveDegradation({ qualityStats, userWantsVideo: true, actions }),
      { initialProps: { qualityStats: sample('good', 0) as ConnectionQualityStats } }
    );

    let t = TICK;
    for (let i = 0; i < POOR_TICKS; i++, t += TICK) {
      rerender({ qualityStats: sample('poor', t) });
    }
    await waitFor(() => expect(actions.suspend).toHaveBeenCalledTimes(1));

    // Suspend failed: a single subsequent poor sample must NOT immediately
    // re-trigger suspend — it needs a fresh sustained streak, exactly like
    // the very first attempt did.
    rerender({ qualityStats: sample('poor', t) });
    t += TICK;
    expect(actions.suspend).toHaveBeenCalledTimes(1);

    // A full fresh poor streak retries the fallback.
    for (let i = 0; i < POOR_TICKS; i++, t += TICK) {
      rerender({ qualityStats: sample('poor', t) });
    }
    await waitFor(() => expect(actions.suspend).toHaveBeenCalledTimes(2));
  });

  it('stays in audio-only survival when resume() rejects, and retries after a fresh good streak', async () => {
    const actions = makeActions();
    actions.resume.mockRejectedValueOnce(new Error('getUserMedia failed'));
    const { rerender, result } = renderHook(
      ({ qualityStats }) =>
        useAdaptiveDegradation({ qualityStats, userWantsVideo: true, actions }),
      { initialProps: { qualityStats: sample('good', 0) as ConnectionQualityStats } }
    );

    let t = TICK;
    for (let i = 0; i < POOR_TICKS; i++, t += TICK) {
      rerender({ qualityStats: sample('poor', t) });
    }
    await waitFor(() => expect(result.current.videoSuspended).toBe(true));

    for (let i = 0; i < GOOD_TICKS; i++, t += TICK) {
      rerender({ qualityStats: sample('good', t) });
    }
    await waitFor(() => expect(actions.resume).toHaveBeenCalledTimes(1));
    // resume() rejected: the suspended indicator must not have flipped off.
    expect(result.current.videoSuspended).toBe(true);

    // A single subsequent good sample must NOT immediately re-trigger resume.
    rerender({ qualityStats: sample('good', t) });
    t += TICK;
    expect(actions.resume).toHaveBeenCalledTimes(1);

    // A full fresh good streak retries the resume.
    for (let i = 0; i < GOOD_TICKS; i++, t += TICK) {
      rerender({ qualityStats: sample('good', t) });
    }
    await waitFor(() => expect(actions.resume).toHaveBeenCalledTimes(2));
  });

  it('clears the suspended indicator when the user turns video off', async () => {
    const actions = makeActions();
    const { rerender, result } = renderHook(
      ({ qualityStats, userWantsVideo }) =>
        useAdaptiveDegradation({ qualityStats, userWantsVideo, actions }),
      {
        initialProps: {
          qualityStats: sample('good', 0) as ConnectionQualityStats,
          userWantsVideo: true,
        },
      }
    );

    let t = TICK;
    for (let i = 0; i < POOR_TICKS; i++, t += TICK) {
      rerender({ qualityStats: sample('poor', t), userWantsVideo: true });
    }
    await waitFor(() => expect(result.current.videoSuspended).toBe(true));

    act(() => {
      rerender({ qualityStats: sample('poor', t), userWantsVideo: false });
    });
    expect(result.current.videoSuspended).toBe(false);
  });
});
