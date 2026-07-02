/**
 * useCallSignaling — reconnect re-join (CALL-RESILIENCE)
 *
 * A voice/video call's media is direct peer-to-peer; a transient loss of the
 * signaling socket (network blip, gateway restart) does NOT sever it. On
 * reconnect the web client must re-enter the call room so relayed signaling
 * flows again — WITHOUT recreating the RTCPeerConnection. These tests pin:
 *   - a reconnect (2nd `connect`) re-emits `call:join` for the current call
 *   - the initial `connect` does NOT re-join (nothing to recover yet)
 *   - a re-join rejected with CALL_ENDED tears the call down (onCallEnded)
 */

import { renderHook } from '@testing-library/react';
import { useCallSignaling } from '@/components/video-calls/hooks/useCallSignaling';
import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: { getSocket: jest.fn() },
}));

jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { meeshySocketIOService } from '@/services/meeshy-socketio.service';

const CALL_ID = 'call-reconnect-123';

type Handler = (...args: unknown[]) => void;

function makeFakeSocket(connected: boolean) {
  const handlers: Record<string, Handler[]> = {};
  return {
    connected,
    emit: jest.fn(),
    on: jest.fn((event: string, fn: Handler) => {
      (handlers[event] ||= []).push(fn);
    }),
    off: jest.fn((event: string, fn: Handler) => {
      handlers[event] = (handlers[event] || []).filter((h) => h !== fn);
    }),
    fire: (event: string, ...args: unknown[]) => {
      (handlers[event] || []).forEach((h) => h(...args));
    },
  };
}

function lastJoinEmit(socket: ReturnType<typeof makeFakeSocket>) {
  return socket.emit.mock.calls.find((c) => c[0] === CLIENT_EVENTS.CALL_JOIN);
}

describe('useCallSignaling — reconnect re-join', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('re-emits call:join on a reconnect (connect after the initial one)', () => {
    const socket = makeFakeSocket(true); // already connected at mount → initial seen
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    renderHook(() => useCallSignaling({ callId: CALL_ID, userId: 'u1' }));

    expect(lastJoinEmit(socket)).toBeUndefined(); // no join yet

    socket.fire('connect'); // reconnect

    const joinCall = lastJoinEmit(socket);
    expect(joinCall).toBeDefined();
    expect(joinCall![1]).toMatchObject({ callId: CALL_ID });
  });

  it('does NOT re-join on the very first connect (socket not yet connected at mount)', () => {
    const socket = makeFakeSocket(false); // not connected at mount
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    renderHook(() => useCallSignaling({ callId: CALL_ID, userId: 'u1' }));

    socket.fire('connect'); // initial connect — must be ignored

    expect(lastJoinEmit(socket)).toBeUndefined();
  });

  it('tears the call down when the re-join is rejected with CALL_ENDED', () => {
    const socket = makeFakeSocket(true);
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);
    const onCallEnded = jest.fn();

    renderHook(() => useCallSignaling({ callId: CALL_ID, userId: 'u1', onCallEnded }));

    socket.fire('connect'); // reconnect → emits call:join

    const joinCall = lastJoinEmit(socket);
    expect(joinCall).toBeDefined();
    const ack = joinCall![2] as (r: unknown) => void;
    ack({ success: false, error: { code: 'CALL_ENDED', message: 'ended' } });

    expect(onCallEnded).toHaveBeenCalledWith(
      expect.objectContaining({ callId: CALL_ID })
    );
  });
});
