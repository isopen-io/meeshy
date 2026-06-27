/**
 * Tests for hooks/use-adaptive-degradation.ts
 */

jest.mock('@meeshy/shared/types/video-call', () => ({}), { virtual: true });

const mockCreateDegradationState = jest.fn();
const mockReduceDegradation = jest.fn();
jest.mock('@/lib/calls/adaptive-degradation', () => ({
  createDegradationState: () => mockCreateDegradationState(),
  reduceDegradation: (state: unknown, sample: unknown) => mockReduceDegradation(state, sample),
}));

import { renderHook, act } from '@testing-library/react';
import { useAdaptiveDegradation } from '@/hooks/use-adaptive-degradation';
import type { AdaptiveDegradationActions } from '@/hooks/use-adaptive-degradation';

const makeState = (overrides = {}) => ({
  sending: true,
  poorSince: null,
  goodSince: null,
  lastTier: null,
  ...overrides,
});

const makeStats = (level: string = 'good', ts: number = Date.now()) => ({
  level,
  timestamp: new Date(ts),
});

const makeActions = (): AdaptiveDegradationActions & { applyTier: jest.Mock; suspend: jest.Mock; resume: jest.Mock } => ({
  applyTier: jest.fn(),
  suspend: jest.fn().mockResolvedValue(undefined),
  resume: jest.fn().mockResolvedValue(undefined),
});

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateDegradationState.mockReturnValue(makeState());
  mockReduceDegradation.mockReturnValue({ state: makeState(), action: { type: 'none' } });
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('returns videoSuspended = false initially', () => {
    const actions = makeActions();
    const { result } = renderHook(() =>
      useAdaptiveDegradation({ qualityStats: null, userWantsVideo: true, actions })
    );
    expect(result.current.videoSuspended).toBe(false);
  });

  it('does not call reduceDegradation when qualityStats is null', () => {
    const actions = makeActions();
    renderHook(() =>
      useAdaptiveDegradation({ qualityStats: null, userWantsVideo: true, actions })
    );
    expect(mockReduceDegradation).not.toHaveBeenCalled();
  });

  it('does not call reduceDegradation when userWantsVideo is false', () => {
    const actions = makeActions();
    renderHook(() =>
      useAdaptiveDegradation({ qualityStats: makeStats(), userWantsVideo: false, actions })
    );
    expect(mockReduceDegradation).not.toHaveBeenCalled();
  });
});

// ─── set-tier action ──────────────────────────────────────────────────────────

describe('set-tier action', () => {
  it('calls applyTier when action is set-tier', () => {
    const actions = makeActions();
    const stats = makeStats('poor', 1000);
    mockReduceDegradation.mockReturnValue({
      state: makeState(),
      action: { type: 'set-tier', tier: 'low' },
    });

    renderHook(() =>
      useAdaptiveDegradation({ qualityStats: stats, userWantsVideo: true, actions })
    );

    expect(actions.applyTier).toHaveBeenCalledWith('low');
  });
});

// ─── suspend-video action ─────────────────────────────────────────────────────

describe('suspend-video action', () => {
  it('calls suspend and sets videoSuspended = true', async () => {
    const actions = makeActions();
    const stats = makeStats('poor', 1000);
    mockReduceDegradation.mockReturnValue({
      state: makeState({ sending: false }),
      action: { type: 'suspend-video' },
    });

    const { result } = renderHook(() =>
      useAdaptiveDegradation({ qualityStats: stats, userWantsVideo: true, actions })
    );

    await act(async () => {});
    expect(actions.suspend).toHaveBeenCalled();
    expect(result.current.videoSuspended).toBe(true);
  });
});

// ─── resume-video action ──────────────────────────────────────────────────────

describe('resume-video action', () => {
  it('calls resume and sets videoSuspended = false', async () => {
    const actions = makeActions();
    const stats = makeStats('good', 1000);
    mockReduceDegradation.mockReturnValue({
      state: makeState({ sending: true }),
      action: { type: 'resume-video' },
    });

    const { result } = renderHook(() =>
      useAdaptiveDegradation({ qualityStats: stats, userWantsVideo: true, actions })
    );

    await act(async () => {});
    expect(actions.resume).toHaveBeenCalled();
    expect(result.current.videoSuspended).toBe(false);
  });
});

// ─── userWantsVideo = false resets state ─────────────────────────────────────

describe('userWantsVideo = false', () => {
  it('clears videoSuspended when user turns camera off', async () => {
    const actions = makeActions();
    const stats = makeStats('poor', 1000);
    mockReduceDegradation.mockReturnValue({
      state: makeState(),
      action: { type: 'suspend-video' },
    });

    const { result, rerender } = renderHook(
      ({ wantsVideo }) =>
        useAdaptiveDegradation({ qualityStats: stats, userWantsVideo: wantsVideo, actions }),
      { initialProps: { wantsVideo: true } }
    );

    await act(async () => {});
    expect(result.current.videoSuspended).toBe(true);

    rerender({ wantsVideo: false });
    expect(result.current.videoSuspended).toBe(false);
  });
});

// ─── same stats reference not reprocessed ────────────────────────────────────

describe('deduplication', () => {
  it('does not reprocess the same qualityStats reference on rerender', () => {
    const actions = makeActions();
    const stats = makeStats('poor', 1000);
    mockReduceDegradation.mockReturnValue({ state: makeState(), action: { type: 'none' } });

    const { rerender } = renderHook(
      ({ s }) => useAdaptiveDegradation({ qualityStats: s, userWantsVideo: true, actions }),
      { initialProps: { s: stats } }
    );

    const callCountAfterFirst = mockReduceDegradation.mock.calls.length;
    rerender({ s: stats });
    expect(mockReduceDegradation.mock.calls.length).toBe(callCountAfterFirst);
  });

  it('reprocesses when qualityStats reference changes', () => {
    const actions = makeActions();
    const stats1 = makeStats('poor', 1000);
    const stats2 = makeStats('good', 2000);
    mockReduceDegradation.mockReturnValue({ state: makeState(), action: { type: 'none' } });

    const { rerender } = renderHook(
      ({ s }) => useAdaptiveDegradation({ qualityStats: s, userWantsVideo: true, actions }),
      { initialProps: { s: stats1 } }
    );

    const callsAfterFirst = mockReduceDegradation.mock.calls.length;
    rerender({ s: stats2 });
    expect(mockReduceDegradation.mock.calls.length).toBeGreaterThan(callsAfterFirst);
  });
});
