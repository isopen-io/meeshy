/**
 * Tests for useCallQuality hook and related helpers
 *
 * Covers:
 * - No peer connection: qualityStats=null, isMonitoring=false
 * - Peer connection provided: getStats called, stats parsed, qualityStats set
 * - Quality level calculation via hook output
 * - Socket CALL_QUALITY_REPORT emission every 10s
 * - Helper functions: getQualityColor, getQualityIcon, getQualityLabel
 */

import { renderHook, act } from '@testing-library/react';
import {
  useCallQuality,
  getQualityColor,
  getQualityIcon,
  getQualityLabel,
} from '@/hooks/use-call-quality';

// Mock logger to suppress output in tests
jest.mock('@/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock socket service
const mockSocketEmit = jest.fn();
const mockGetSocket = jest.fn();

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    getSocket: () => mockGetSocket(),
  },
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeStatsReport(overrides: {
  packetsLost?: number;
  packetsReceived?: number;
  jitter?: number;
  bytesReceived?: number;
  bytesSent?: number;
  rtt?: number;
  kind?: 'audio' | 'video';
}) {
  const {
    packetsLost = 0,
    packetsReceived = 100,
    jitter = 0.001,
    bytesReceived = 5000,
    bytesSent = 8000,
    rtt = 0.05,
    kind = 'audio',
  } = overrides;

  return {
    forEach: (cb: Function) => {
      cb({ type: 'inbound-rtp', kind, packetsLost, packetsReceived, jitter, bytesReceived });
      cb({ type: 'candidate-pair', state: 'succeeded', currentRoundTripTime: rtt });
      cb({ type: 'outbound-rtp', bytesSent });
    },
  };
}

function makeMockPeerConnection(statsReport = makeStatsReport({})) {
  return { getStats: jest.fn().mockResolvedValue(statsReport) };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useCallQuality', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockGetSocket.mockReturnValue({ emit: mockSocketEmit });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('with no peerConnection', () => {
    it('returns qualityStats=null and isMonitoring=false', () => {
      const { result } = renderHook(() =>
        useCallQuality({ peerConnection: null })
      );

      expect(result.current.qualityStats).toBeNull();
      expect(result.current.isMonitoring).toBe(false);
    });

    it('does not start any interval', async () => {
      renderHook(() => useCallQuality({ peerConnection: null }));

      await act(async () => {
        jest.advanceTimersByTime(5000);
      });

      expect(mockSocketEmit).not.toHaveBeenCalled();
    });
  });

  describe('with a peerConnection', () => {
    it('returns isMonitoring=true', async () => {
      const mockPC = makeMockPeerConnection();

      const { result } = renderHook(() =>
        useCallQuality({ peerConnection: mockPC as unknown as RTCPeerConnection })
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.isMonitoring).toBe(true);
    });

    it('calls getStats immediately on mount', async () => {
      const mockPC = makeMockPeerConnection();

      renderHook(() =>
        useCallQuality({ peerConnection: mockPC as unknown as RTCPeerConnection })
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(mockPC.getStats).toHaveBeenCalled();
    });

    it('sets qualityStats after first getStats call', async () => {
      const mockPC = makeMockPeerConnection();

      const { result } = renderHook(() =>
        useCallQuality({ peerConnection: mockPC as unknown as RTCPeerConnection })
      );

      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.qualityStats).not.toBeNull();
      expect(result.current.qualityStats?.level).toBeDefined();
    });

    it('polls getStats on the configured interval', async () => {
      const mockPC = makeMockPeerConnection();

      renderHook(() =>
        useCallQuality({
          peerConnection: mockPC as unknown as RTCPeerConnection,
          updateInterval: 500,
        })
      );

      // Let initial call settle
      await act(async () => { await Promise.resolve(); });
      const callsAfterMount = mockPC.getStats.mock.calls.length;

      // Advance by 500ms (one interval tick) — should fire one more
      await act(async () => {
        jest.advanceTimersByTime(500);
        await Promise.resolve();
      });

      expect(mockPC.getStats.mock.calls.length).toBeGreaterThan(callsAfterMount);
    });

    it('clears the interval when peerConnection becomes null', async () => {
      const mockPC = makeMockPeerConnection();

      const { rerender } = renderHook(
        ({ pc }) =>
          useCallQuality({ peerConnection: pc as unknown as RTCPeerConnection | null }),
        { initialProps: { pc: mockPC as unknown as RTCPeerConnection } }
      );

      await act(async () => { await Promise.resolve(); });
      const callCountAfterMount = mockPC.getStats.mock.calls.length;

      rerender({ pc: null });

      await act(async () => {
        jest.advanceTimersByTime(2000);
        await Promise.resolve();
      });

      // No additional calls after setting to null
      expect(mockPC.getStats).toHaveBeenCalledTimes(callCountAfterMount);
    });

    it('resets qualityStats to null when peerConnection becomes null', async () => {
      const mockPC = makeMockPeerConnection();

      const { result, rerender } = renderHook(
        ({ pc }) =>
          useCallQuality({ peerConnection: pc as unknown as RTCPeerConnection | null }),
        { initialProps: { pc: mockPC as unknown as RTCPeerConnection } }
      );

      await act(async () => { await Promise.resolve(); });
      expect(result.current.qualityStats).not.toBeNull();

      rerender({ pc: null });

      expect(result.current.qualityStats).toBeNull();
    });

    it('handles getStats errors gracefully', async () => {
      const mockPC = {
        getStats: jest.fn().mockRejectedValue(new Error('Stats unavailable')),
      };

      const { result } = renderHook(() =>
        useCallQuality({ peerConnection: mockPC as unknown as RTCPeerConnection })
      );

      await act(async () => { await Promise.resolve(); });

      // Should not throw; qualityStats remains null
      expect(result.current.qualityStats).toBeNull();
    });
  });

  describe('quality level calculation', () => {
    it('reports excellent quality for low packet loss and low RTT', async () => {
      const mockPC = makeMockPeerConnection(
        makeStatsReport({ packetsLost: 0, packetsReceived: 100, rtt: 0.05 })
      );

      const { result } = renderHook(() =>
        useCallQuality({ peerConnection: mockPC as unknown as RTCPeerConnection })
      );

      await act(async () => { await Promise.resolve(); });

      expect(result.current.qualityStats?.level).toBe('excellent');
    });

    it('reports good quality for moderate packet loss', async () => {
      // 2% packet loss, RTT=150ms → good (packetLoss < 3, rtt < 200)
      const mockPC = makeMockPeerConnection({
        forEach: (cb: Function) => {
          cb({ type: 'inbound-rtp', kind: 'audio', packetsLost: 2, packetsReceived: 98, jitter: 0, bytesReceived: 1000 });
          cb({ type: 'candidate-pair', state: 'succeeded', currentRoundTripTime: 0.15 });
          cb({ type: 'outbound-rtp', bytesSent: 500 });
        },
      } as any);

      const { result } = renderHook(() =>
        useCallQuality({ peerConnection: mockPC as unknown as RTCPeerConnection })
      );

      await act(async () => { await Promise.resolve(); });

      expect(result.current.qualityStats?.level).toBe('good');
    });

    it('reports fair quality for mid-range packet loss', async () => {
      // 4% packet loss, RTT=250ms → fair (packetLoss < 5, rtt < 300)
      const mockPC = {
        getStats: jest.fn().mockResolvedValue({
          forEach: (cb: Function) => {
            cb({ type: 'inbound-rtp', kind: 'audio', packetsLost: 4, packetsReceived: 96, jitter: 0.002, bytesReceived: 2000 });
            cb({ type: 'candidate-pair', state: 'succeeded', currentRoundTripTime: 0.25 });
            cb({ type: 'outbound-rtp', bytesSent: 1000 });
          },
        }),
      };

      const { result } = renderHook(() =>
        useCallQuality({ peerConnection: mockPC as unknown as RTCPeerConnection })
      );

      await act(async () => { await Promise.resolve(); });

      expect(result.current.qualityStats?.level).toBe('fair');
    });

    it('reports poor quality for high packet loss', async () => {
      // 10% packet loss, RTT=400ms → poor
      const mockPC = {
        getStats: jest.fn().mockResolvedValue({
          forEach: (cb: Function) => {
            cb({ type: 'inbound-rtp', kind: 'audio', packetsLost: 10, packetsReceived: 90, jitter: 0.01, bytesReceived: 3000 });
            cb({ type: 'candidate-pair', state: 'succeeded', currentRoundTripTime: 0.4 });
            cb({ type: 'outbound-rtp', bytesSent: 2000 });
          },
        }),
      };

      const { result } = renderHook(() =>
        useCallQuality({ peerConnection: mockPC as unknown as RTCPeerConnection })
      );

      await act(async () => { await Promise.resolve(); });

      expect(result.current.qualityStats?.level).toBe('poor');
    });

    it('uses remote-inbound-rtp roundTripTime as RTT source', async () => {
      // Very high RTT from remote-inbound-rtp → poor
      const mockPC = {
        getStats: jest.fn().mockResolvedValue({
          forEach: (cb: Function) => {
            cb({ type: 'inbound-rtp', kind: 'audio', packetsLost: 0, packetsReceived: 100, jitter: 0, bytesReceived: 1000 });
            cb({ type: 'remote-inbound-rtp', roundTripTime: 0.5 });
            cb({ type: 'outbound-rtp', bytesSent: 500 });
          },
        }),
      };

      const { result } = renderHook(() =>
        useCallQuality({ peerConnection: mockPC as unknown as RTCPeerConnection })
      );

      await act(async () => { await Promise.resolve(); });

      // 0% loss but 500ms RTT → poor
      expect(result.current.qualityStats?.level).toBe('poor');
    });

    it('computes video bitrate from video inbound-rtp report', async () => {
      const mockPC = {
        getStats: jest.fn().mockResolvedValue({
          forEach: (cb: Function) => {
            cb({ type: 'inbound-rtp', kind: 'video', packetsLost: 0, packetsReceived: 100, jitter: 0, bytesReceived: 10000 });
            cb({ type: 'candidate-pair', state: 'succeeded', currentRoundTripTime: 0.05 });
            cb({ type: 'outbound-rtp', bytesSent: 8000 });
          },
        }),
      };

      const { result } = renderHook(() =>
        useCallQuality({ peerConnection: mockPC as unknown as RTCPeerConnection })
      );

      await act(async () => { await Promise.resolve(); });

      expect(result.current.qualityStats?.bitrate.video).toBeGreaterThan(0);
      expect(result.current.qualityStats?.bitrate.audio).toBe(0);
    });

    it('ignores candidate-pair entries that are not succeeded', async () => {
      // candidate-pair not succeeded → no RTT captured → rtt stays 0
      const mockPC = {
        getStats: jest.fn().mockResolvedValue({
          forEach: (cb: Function) => {
            cb({ type: 'inbound-rtp', kind: 'audio', packetsLost: 0, packetsReceived: 100, jitter: 0, bytesReceived: 1000 });
            cb({ type: 'candidate-pair', state: 'waiting', currentRoundTripTime: 0.5 });
          },
        }),
      };

      const { result } = renderHook(() =>
        useCallQuality({ peerConnection: mockPC as unknown as RTCPeerConnection })
      );

      await act(async () => { await Promise.resolve(); });

      // RTT should be 0 (not updated), so quality depends only on packet loss
      expect(result.current.qualityStats?.rtt).toBe(0);
    });

    it('handles inbound-rtp report with zero totalPackets (no packet loss calculation)', async () => {
      const mockPC = {
        getStats: jest.fn().mockResolvedValue({
          forEach: (cb: Function) => {
            // packetsLost=0, packetsReceived=0 → totalPackets=0 → skip packet loss
            cb({ type: 'inbound-rtp', kind: 'audio', packetsLost: 0, packetsReceived: 0, jitter: 0, bytesReceived: 0 });
            cb({ type: 'candidate-pair', state: 'succeeded', currentRoundTripTime: 0.05 });
            cb({ type: 'outbound-rtp', bytesSent: 0 });
          },
        }),
      };

      const { result } = renderHook(() =>
        useCallQuality({ peerConnection: mockPC as unknown as RTCPeerConnection })
      );

      await act(async () => { await Promise.resolve(); });

      expect(result.current.qualityStats?.packetLoss).toBe(0);
    });

    it('handles inbound-rtp report without jitter field', async () => {
      const mockPC = {
        getStats: jest.fn().mockResolvedValue({
          forEach: (cb: Function) => {
            // no jitter field → branch taken (jitter !== undefined = false)
            cb({ type: 'inbound-rtp', kind: 'audio', packetsLost: 0, packetsReceived: 100, bytesReceived: 1000 });
            cb({ type: 'candidate-pair', state: 'succeeded', currentRoundTripTime: 0.05 });
            cb({ type: 'outbound-rtp', bytesSent: 500 });
          },
        }),
      };

      const { result } = renderHook(() =>
        useCallQuality({ peerConnection: mockPC as unknown as RTCPeerConnection })
      );

      await act(async () => { await Promise.resolve(); });

      // jitter defaults to 0 when not present
      expect(result.current.qualityStats?.jitter).toBe(0);
    });

    it('handles candidate-pair succeeded without currentRoundTripTime field', async () => {
      const mockPC = {
        getStats: jest.fn().mockResolvedValue({
          forEach: (cb: Function) => {
            cb({ type: 'inbound-rtp', kind: 'audio', packetsLost: 0, packetsReceived: 100, jitter: 0, bytesReceived: 1000 });
            // no currentRoundTripTime → branch taken (currentRoundTripTime !== undefined = false)
            cb({ type: 'candidate-pair', state: 'succeeded' });
            cb({ type: 'outbound-rtp', bytesSent: 500 });
          },
        }),
      };

      const { result } = renderHook(() =>
        useCallQuality({ peerConnection: mockPC as unknown as RTCPeerConnection })
      );

      await act(async () => { await Promise.resolve(); });

      expect(result.current.qualityStats?.rtt).toBe(0);
    });

    it('handles remote-inbound-rtp without roundTripTime field', async () => {
      const mockPC = {
        getStats: jest.fn().mockResolvedValue({
          forEach: (cb: Function) => {
            cb({ type: 'inbound-rtp', kind: 'audio', packetsLost: 0, packetsReceived: 100, jitter: 0, bytesReceived: 1000 });
            // remote-inbound-rtp without roundTripTime
            cb({ type: 'remote-inbound-rtp' });
            cb({ type: 'outbound-rtp', bytesSent: 500 });
          },
        }),
      };

      const { result } = renderHook(() =>
        useCallQuality({ peerConnection: mockPC as unknown as RTCPeerConnection })
      );

      await act(async () => { await Promise.resolve(); });

      expect(result.current.qualityStats?.rtt).toBe(0);
    });

    it('handles inbound-rtp with unknown kind (neither audio nor video)', async () => {
      // Covers the false-branch of `else if (report.kind === 'video')` at line 103
      const mockPC = {
        getStats: jest.fn().mockResolvedValue({
          forEach: (cb: Function) => {
            // kind not 'audio' or 'video' → both branches at lines 101-104 false
            cb({ type: 'inbound-rtp', kind: 'screen', packetsLost: 0, packetsReceived: 100, jitter: 0, bytesReceived: 2000 });
            cb({ type: 'candidate-pair', state: 'succeeded', currentRoundTripTime: 0.05 });
            cb({ type: 'outbound-rtp', bytesSent: 1000 });
          },
        }),
      };

      const { result } = renderHook(() =>
        useCallQuality({ peerConnection: mockPC as unknown as RTCPeerConnection })
      );

      await act(async () => { await Promise.resolve(); });

      // Neither audio nor video bitrate set
      expect(result.current.qualityStats?.bitrate.audio).toBe(0);
      expect(result.current.qualityStats?.bitrate.video).toBe(0);
      // bytesReceived still accumulated
      expect(result.current.qualityStats?.bytesReceived).toBeGreaterThan(0);
    });

    it('handles both audio and video inbound-rtp streams together', async () => {
      // Covers both audio (line 102) and video (line 104) bitrate branches
      const mockPC = {
        getStats: jest.fn().mockResolvedValue({
          forEach: (cb: Function) => {
            cb({ type: 'inbound-rtp', kind: 'audio', packetsLost: 0, packetsReceived: 50, jitter: 0.001, bytesReceived: 3000 });
            cb({ type: 'inbound-rtp', kind: 'video', packetsLost: 0, packetsReceived: 50, jitter: 0.002, bytesReceived: 8000 });
            cb({ type: 'candidate-pair', state: 'succeeded', currentRoundTripTime: 0.04 });
            cb({ type: 'outbound-rtp', bytesSent: 4000 });
          },
        }),
      };

      const { result } = renderHook(() =>
        useCallQuality({ peerConnection: mockPC as unknown as RTCPeerConnection })
      );

      await act(async () => { await Promise.resolve(); });

      expect(result.current.qualityStats?.bitrate.audio).toBeGreaterThan(0);
      expect(result.current.qualityStats?.bitrate.video).toBeGreaterThan(0);
    });

    it('handles inbound-rtp with missing bytesReceived and bytesSent fields', async () => {
      // Covers the `|| 0` fallback branches for missing fields
      const mockPC = {
        getStats: jest.fn().mockResolvedValue({
          forEach: (cb: Function) => {
            // No bytesReceived or bytesSent — hits the `|| 0` branches
            cb({ type: 'inbound-rtp', kind: 'audio', packetsLost: 0, packetsReceived: 100, jitter: 0 });
            cb({ type: 'inbound-rtp', kind: 'video', packetsLost: 0, packetsReceived: 100, jitter: 0 });
            cb({ type: 'candidate-pair', state: 'succeeded', currentRoundTripTime: 0.03 });
            cb({ type: 'outbound-rtp' }); // no bytesSent
          },
        }),
      };

      const { result } = renderHook(() =>
        useCallQuality({ peerConnection: mockPC as unknown as RTCPeerConnection })
      );

      await act(async () => { await Promise.resolve(); });

      expect(result.current.qualityStats?.bitrate.audio).toBe(0);
      expect(result.current.qualityStats?.bitrate.video).toBe(0);
      expect(result.current.qualityStats?.bytesSent).toBe(0);
      expect(result.current.qualityStats?.bytesReceived).toBe(0);
    });

    it('handles inbound-rtp with missing packetsLost and packetsReceived fields', async () => {
      // Covers the `|| 0` fallback branches for packetsLost/packetsReceived
      const mockPC = {
        getStats: jest.fn().mockResolvedValue({
          forEach: (cb: Function) => {
            // No packetsLost/packetsReceived → fallback to 0 via || 0
            cb({ type: 'inbound-rtp', kind: 'audio', jitter: 0.001, bytesReceived: 5000 });
            cb({ type: 'candidate-pair', state: 'succeeded', currentRoundTripTime: 0.05 });
            cb({ type: 'outbound-rtp', bytesSent: 3000 });
          },
        }),
      };

      const { result } = renderHook(() =>
        useCallQuality({ peerConnection: mockPC as unknown as RTCPeerConnection })
      );

      await act(async () => { await Promise.resolve(); });

      // totalPackets = 0 + 0 = 0, so packetLoss stays 0
      expect(result.current.qualityStats?.packetLoss).toBe(0);
    });
  });

  describe('CALL_QUALITY_REPORT socket emission', () => {
    it('emits CALL_QUALITY_REPORT every 10s when callId and qualityStats are set', async () => {
      const mockPC = makeMockPeerConnection();

      renderHook(() =>
        useCallQuality({
          peerConnection: mockPC as unknown as RTCPeerConnection,
          callId: 'call-123',
        })
      );

      // Let stats populate
      await act(async () => { await Promise.resolve(); });

      // Advance 10s
      await act(async () => {
        jest.advanceTimersByTime(10_000);
        await Promise.resolve();
      });

      expect(mockSocketEmit).toHaveBeenCalledWith(
        expect.stringContaining('quality'),
        expect.objectContaining({ callId: 'call-123' })
      );
    });

    it('does not emit when callId is null', async () => {
      const mockPC = makeMockPeerConnection();

      renderHook(() =>
        useCallQuality({
          peerConnection: mockPC as unknown as RTCPeerConnection,
          callId: null,
        })
      );

      await act(async () => { await Promise.resolve(); });

      await act(async () => {
        jest.advanceTimersByTime(10_000);
        await Promise.resolve();
      });

      expect(mockSocketEmit).not.toHaveBeenCalled();
    });

    it('still emits at 10s even though qualityStats gets a new object reference on every poll tick (regression: interval must not be re-armed by qualityStats updates)', async () => {
      // Default updateInterval (1000ms) means qualityStats is replaced with a
      // NEW object every 1s — a real render + effect flush must happen
      // between each poll tick (unlike a single jest.advanceTimersByTime(10_000)
      // call, which fires all due timers before React ever re-renders and so
      // cannot expose a dependency-array bug that only bites across separate
      // renders).
      const mockPC = makeMockPeerConnection();

      renderHook(() =>
        useCallQuality({
          peerConnection: mockPC as unknown as RTCPeerConnection,
          callId: 'call-123',
        })
      );

      await act(async () => { await Promise.resolve(); });

      for (let i = 0; i < 10; i++) {
        await act(async () => {
          jest.advanceTimersByTime(1000);
          await Promise.resolve();
        });
      }

      expect(mockSocketEmit).toHaveBeenCalledWith(
        expect.stringContaining('quality'),
        expect.objectContaining({ callId: 'call-123' })
      );
    });

    it('does not emit when socket is null', async () => {
      mockGetSocket.mockReturnValue(null);

      const mockPC = makeMockPeerConnection();

      renderHook(() =>
        useCallQuality({
          peerConnection: mockPC as unknown as RTCPeerConnection,
          callId: 'call-123',
        })
      );

      await act(async () => { await Promise.resolve(); });

      await act(async () => {
        jest.advanceTimersByTime(10_000);
        await Promise.resolve();
      });

      expect(mockSocketEmit).not.toHaveBeenCalled();
    });
  });
});

// ─── Helper function tests ───────────────────────────────────────────────────

describe('getQualityColor', () => {
  it('returns green for excellent', () => {
    expect(getQualityColor('excellent')).toBe('text-green-500');
  });

  it('returns yellow for good', () => {
    expect(getQualityColor('good')).toBe('text-yellow-500');
  });

  it('returns orange for fair', () => {
    expect(getQualityColor('fair')).toBe('text-orange-500');
  });

  it('returns red for poor', () => {
    expect(getQualityColor('poor')).toBe('text-red-500');
  });
});

describe('getQualityIcon', () => {
  it('returns green circle for excellent', () => {
    expect(getQualityIcon('excellent')).toBe('🟢');
  });

  it('returns yellow circle for good', () => {
    expect(getQualityIcon('good')).toBe('🟡');
  });

  it('returns orange circle for fair', () => {
    expect(getQualityIcon('fair')).toBe('🟠');
  });

  it('returns red circle for poor', () => {
    expect(getQualityIcon('poor')).toBe('🔴');
  });
});

describe('getQualityLabel', () => {
  it('returns Excellent for excellent', () => {
    expect(getQualityLabel('excellent')).toBe('Excellent');
  });

  it('returns Good for good', () => {
    expect(getQualityLabel('good')).toBe('Good');
  });

  it('returns Fair for fair', () => {
    expect(getQualityLabel('fair')).toBe('Fair');
  });

  it('returns Poor for poor', () => {
    expect(getQualityLabel('poor')).toBe('Poor');
  });
});
