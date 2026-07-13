/**
 * useCallAnalyticsReporter — emits ONE `call:analytics` at teardown, closing
 * the web emission gap (parité iOS/Android). Accumulation is the pure
 * `call-analytics` unit; this spec pins the emit-once wiring.
 */

import { renderHook } from '@testing-library/react';
import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';

const emit = jest.fn();
jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: { getSocket: jest.fn(() => ({ emit })) },
}));

import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { useCallAnalyticsReporter } from '@/hooks/use-call-analytics-reporter';

type Params = Parameters<typeof useCallAnalyticsReporter>[0];

function baseProps(overrides: Partial<Params> = {}): Params {
  return {
    callId: 'call-1',
    connectionState: 'connected',
    qualityStats: null,
    isVideo: false,
    ...overrides,
  };
}

describe('useCallAnalyticsReporter', () => {
  beforeEach(() => jest.clearAllMocks());

  it('emits exactly one call:analytics at unmount', () => {
    const { unmount } = renderHook((p: Params) => useCallAnalyticsReporter(p), {
      initialProps: baseProps(),
    });

    expect(emit).not.toHaveBeenCalled();
    unmount();

    expect(emit).toHaveBeenCalledTimes(1);
    const [event, payload] = emit.mock.calls[0];
    expect(event).toBe(CLIENT_EVENTS.CALL_ANALYTICS);
    expect(payload.callId).toBe('call-1');
    expect(payload.platform).toBe('web');
  });

  it('marks a connected call as a local hangup', () => {
    const { unmount } = renderHook((p: Params) => useCallAnalyticsReporter(p), {
      initialProps: baseProps({ connectionState: 'connected' }),
    });
    unmount();

    expect(emit.mock.calls[0][1].endReason).toBe('local');
    expect(emit.mock.calls[0][1].setupTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('marks a call that never connected as missed with the -1 setup sentinel', () => {
    const { unmount } = renderHook((p: Params) => useCallAnalyticsReporter(p), {
      initialProps: baseProps({ connectionState: 'connecting' }),
    });
    unmount();

    expect(emit.mock.calls[0][1].endReason).toBe('missed');
    expect(emit.mock.calls[0][1].setupTimeMs).toBe(-1);
  });

  it('does not emit when there is no callId', () => {
    const { unmount } = renderHook((p: Params) => useCallAnalyticsReporter(p), {
      initialProps: baseProps({ callId: null }),
    });
    unmount();

    expect(emit).not.toHaveBeenCalled();
  });

  it('accumulates a reconnection and a quality sample into the payload', () => {
    const { rerender, unmount } = renderHook((p: Params) => useCallAnalyticsReporter(p), {
      initialProps: baseProps({ connectionState: 'connected', qualityStats: null }),
    });

    rerender(baseProps({ connectionState: 'reconnecting', qualityStats: null }));
    rerender(baseProps({
      connectionState: 'connected',
      qualityStats: { level: 'good', rtt: 120, packetLoss: 2 } as never,
    }));
    unmount();

    const payload = emit.mock.calls[0][1];
    expect(payload.reconnectionCount).toBe(1);
    expect(payload.averageRtt).toBe(120);
    expect(payload.qualityDistribution.good).toBe(1);
  });

  it('no socket = no throw', () => {
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValueOnce(undefined);
    const { unmount } = renderHook((p: Params) => useCallAnalyticsReporter(p), {
      initialProps: baseProps(),
    });
    expect(() => unmount()).not.toThrow();
  });
});
