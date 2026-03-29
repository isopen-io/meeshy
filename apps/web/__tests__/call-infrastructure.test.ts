/**
 * Web Call Infrastructure Tests
 *
 * Tests heartbeat logic, reconnection state, quality tracking,
 * and SDP munging. Self-contained — no dependency on stores or services.
 */

describe('Heartbeat Timer Logic', () => {
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  const emittedEvents: Array<{ event: string; data: unknown }> = [];

  function emit(event: string, data: unknown) {
    emittedEvents.push({ event, data });
  }

  function startHeartbeat(callId: string) {
    stopHeartbeat();
    heartbeatInterval = setInterval(() => {
      emit('call:heartbeat', { callId });
    }, 15_000);
  }

  function stopHeartbeat() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  }

  beforeEach(() => {
    jest.useFakeTimers();
    emittedEvents.length = 0;
    stopHeartbeat();
  });

  afterEach(() => {
    stopHeartbeat();
    jest.useRealTimers();
  });

  it('emits call:heartbeat every 15s', () => {
    startHeartbeat('call-123');

    expect(emittedEvents).toHaveLength(0);

    jest.advanceTimersByTime(15_000);
    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents[0]).toEqual({ event: 'call:heartbeat', data: { callId: 'call-123' } });

    jest.advanceTimersByTime(15_000);
    expect(emittedEvents).toHaveLength(2);
  });

  it('stops emitting after stopHeartbeat', () => {
    startHeartbeat('call-123');

    jest.advanceTimersByTime(15_000);
    expect(emittedEvents).toHaveLength(1);

    stopHeartbeat();

    jest.advanceTimersByTime(30_000);
    expect(emittedEvents).toHaveLength(1);
  });

  it('replaces existing heartbeat when starting new one', () => {
    startHeartbeat('call-1');
    startHeartbeat('call-2');

    jest.advanceTimersByTime(15_000);
    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents[0].data).toEqual({ callId: 'call-2' });
  });
});

describe('Reconnection State', () => {
  interface ReconnectionState {
    reconnectAttempt: number;
    isReconnecting: boolean;
  }

  function setReconnecting(state: ReconnectionState, attempt: number): ReconnectionState {
    return {
      reconnectAttempt: attempt,
      isReconnecting: attempt > 0,
    };
  }

  it('tracks reconnection attempts', () => {
    let state: ReconnectionState = { reconnectAttempt: 0, isReconnecting: false };

    state = setReconnecting(state, 1);
    expect(state.reconnectAttempt).toBe(1);
    expect(state.isReconnecting).toBe(true);

    state = setReconnecting(state, 3);
    expect(state.reconnectAttempt).toBe(3);
    expect(state.isReconnecting).toBe(true);

    state = setReconnecting(state, 0);
    expect(state.reconnectAttempt).toBe(0);
    expect(state.isReconnecting).toBe(false);
  });
});

describe('SDP Opus Munging', () => {
  function mungeOpusSdp(sdp: string): string {
    return sdp.replace(
      /a=fmtp:(\d+) (.+)/g,
      (_match, payloadType, existingParams) => {
        const opusParams = new Map<string, string>();
        existingParams.split(';').forEach((param: string) => {
          const [key, value] = param.trim().split('=');
          if (key && value) opusParams.set(key, value);
        });

        opusParams.set('maxaveragebitrate', '128000');
        opusParams.set('stereo', '1');
        opusParams.set('useinbandfec', '1');
        opusParams.set('usedtx', '0');
        opusParams.set('maxplaybackrate', '48000');

        const params = Array.from(opusParams.entries())
          .map(([k, v]) => `${k}=${v}`)
          .join(';');
        return `a=fmtp:${payloadType} ${params}`;
      }
    );
  }

  it('adds all Opus parameters to fmtp lines', () => {
    const sdp = 'a=fmtp:111 minptime=10;useinbandfec=0';
    const munged = mungeOpusSdp(sdp);

    expect(munged).toContain('maxaveragebitrate=128000');
    expect(munged).toContain('stereo=1');
    expect(munged).toContain('useinbandfec=1');
    expect(munged).toContain('usedtx=0');
    expect(munged).toContain('maxplaybackrate=48000');
  });

  it('overwrites existing Opus parameters', () => {
    const sdp = 'a=fmtp:111 stereo=0;useinbandfec=0;maxaveragebitrate=32000';
    const munged = mungeOpusSdp(sdp);

    expect(munged).toContain('stereo=1');
    expect(munged).toContain('useinbandfec=1');
    expect(munged).toContain('maxaveragebitrate=128000');
    expect(munged).not.toContain('stereo=0');
  });

  it('preserves non-fmtp lines', () => {
    const sdp = 'v=0\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10';
    const munged = mungeOpusSdp(sdp);

    expect(munged).toContain('v=0');
    expect(munged).toContain('a=rtpmap:111 opus/48000/2');
  });

  it('preserves existing custom parameters', () => {
    const sdp = 'a=fmtp:111 minptime=10;cbr=1';
    const munged = mungeOpusSdp(sdp);

    expect(munged).toContain('minptime=10');
    expect(munged).toContain('cbr=1');
    expect(munged).toContain('stereo=1');
  });

  it('handles single param without semicolons', () => {
    const sdp = 'a=fmtp:111 minptime=10';
    const munged = mungeOpusSdp(sdp);

    expect(munged).toContain('minptime=10');
    expect(munged).toContain('maxaveragebitrate=128000');
  });
});

describe('Connection Quality Mapping', () => {
  type QualityLevel = 'excellent' | 'good' | 'fair' | 'poor';

  function computeQualityLevel(rtt: number, packetLoss: number): QualityLevel {
    if (rtt < 100 && packetLoss < 1) return 'excellent';
    if (rtt < 300 && packetLoss < 5) return 'good';
    if (rtt < 500 && packetLoss < 10) return 'fair';
    return 'poor';
  }

  it('returns excellent for low latency and no loss', () => {
    expect(computeQualityLevel(50, 0)).toBe('excellent');
    expect(computeQualityLevel(99, 0.5)).toBe('excellent');
  });

  it('returns good for moderate latency', () => {
    expect(computeQualityLevel(150, 2)).toBe('good');
    expect(computeQualityLevel(299, 4.9)).toBe('good');
  });

  it('returns fair for high latency', () => {
    expect(computeQualityLevel(400, 8)).toBe('fair');
  });

  it('returns poor for very high latency or loss', () => {
    expect(computeQualityLevel(600, 15)).toBe('poor');
    expect(computeQualityLevel(100, 12)).toBe('poor');
  });
});
