/**
 * CallManager — call:join ack must time out instead of hanging forever
 * (Vague 88, 2026-08-10)
 *
 * `acceptOrJoinCall` (shared by handleAcceptCall, handleEndAndAnswerWaiting,
 * and the live-bubble cold-rehydration join) awaits a raw
 * `new Promise((resolve) => socket.emit(CLIENT_EVENTS.CALL_JOIN, ..., resolve))`
 * with no ack timeout. Socket.IO client 4.8 does NOT auto-reject a pending
 * ack callback when the transport drops between the emit and the response
 * unless the caller opts in via `socket.timeout(ms)` — this codebase never
 * did. A dropped ack packet (transient disconnect right after the emit,
 * gateway restart mid-request, ordinary mobile flakiness) means the
 * `await` never resolves: `handleAcceptCall`'s `finally` never runs, so
 * `acceptingCallIdRef.current` is never released (re-clicks are swallowed
 * by the re-entrancy guard), the incoming-call banner is stuck forever, and
 * the pre-authorized mic/camera stream is never stopped — with no error
 * ever surfaced to the user.
 *
 * Fix: an explicit ack timeout (mirroring the existing
 * `SOCKET_ACK_TIMEOUT_MS` pattern in use-post-mutations.ts /
 * use-comment-mutations.ts) rejects the pending join after
 * CALL_JOIN_ACK_TIMEOUT_MS, letting acceptOrJoinCall's existing
 * catch/finally machinery release the ref, stop the stream, and surface
 * the existing joinFailed toast — no other code path changes.
 */

import { render, act, fireEvent, screen } from '@testing-library/react';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, isChecking: false }),
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('@/components/video-call/CallNotification', () => ({
  CallNotification: (props: { onAccept: () => void }) => (
    <button data-testid="accept-call-btn" onClick={props.onAccept}>
      Accept
    </button>
  ),
}));

jest.mock('@/components/video-calls/VideoCallInterface', () => ({
  VideoCallInterface: () => null,
}));

const mockToastError = jest.fn();
jest.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args), success: jest.fn() },
}));

jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@/utils/ringtone', () => ({
  stopRingtone: jest.fn(),
  playRingtone: jest.fn(),
}));

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: { getSocket: jest.fn() },
}));

import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { useCallStore } from '@/stores/call-store';
import { CallManager } from '@/components/video-call/CallManager';

const CALL_ID = 'call-join-timeout-abc';
const CALL_JOIN_ACK_TIMEOUT_MS = 10_000;

type Handler = (...args: unknown[]) => void;

function makeFakeSocket() {
  const handlers: Record<string, Handler[]> = {};
  return {
    connected: true,
    id: 'fake-socket-id',
    // Intentionally NEVER invokes the ack callback — simulates a dropped
    // ack packet (transport blip right after emit).
    emit: jest.fn(),
    on: jest.fn((event: string, fn: Handler) => {
      (handlers[event] ||= []).push(fn);
    }),
    off: jest.fn((event: string, fn?: Handler) => {
      if (!fn) { handlers[event] = []; return; }
      handlers[event] = (handlers[event] || []).filter((h) => h !== fn);
    }),
    onAny: jest.fn(),
    offAny: jest.fn(),
    fire: (event: string, ...args: unknown[]) => {
      (handlers[event] || []).forEach((h) => h(...args));
    },
  };
}

function incomingCallEvent(type: 'audio' | 'video' = 'audio') {
  return {
    callId: CALL_ID,
    conversationId: 'conv-1',
    mode: 'p2p',
    type,
    initiator: { userId: 'user-2', username: 'caller' },
    participants: [],
  };
}

function makeFakeStream() {
  const tracks = [{ stop: jest.fn() }, { stop: jest.fn() }];
  return { tracks, getTracks: jest.fn(() => tracks) };
}

const mockGetUserMedia = jest.fn();

describe('CallManager — call:join ack timeout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    useCallStore.getState().reset();

    mockGetUserMedia.mockResolvedValue(makeFakeStream());
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: mockGetUserMedia },
      writable: true,
      configurable: true,
    });
    delete (window as any).__preauthorizedMediaStream;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not hang forever when the call:join ack is dropped — surfaces the joinFailed toast and stays out of "in call" state', async () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_INITIATED, incomingCallEvent());
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('accept-call-btn'));
    });

    // Ack never arrives — advance past the timeout instead of waiting forever.
    await act(async () => {
      jest.advanceTimersByTime(CALL_JOIN_ACK_TIMEOUT_MS + 1);
    });

    expect(mockToastError).toHaveBeenCalled();
    expect(useCallStore.getState().isInCall).toBe(false);
    expect(useCallStore.getState().currentCall).toBeNull();
  });

  it('stops the pre-authorized stream tracks when the call:join ack times out (no orphaned hot mic/camera)', async () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);
    const stream = makeFakeStream();
    mockGetUserMedia.mockResolvedValue(stream);

    render(<CallManager />);

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_INITIATED, incomingCallEvent());
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('accept-call-btn'));
    });

    await act(async () => {
      jest.advanceTimersByTime(CALL_JOIN_ACK_TIMEOUT_MS + 1);
    });

    stream.tracks.forEach((track) => expect(track.stop).toHaveBeenCalled());
  });

  it('releases the accept re-entrancy guard after the timeout so a retry actually re-attempts', async () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_INITIATED, incomingCallEvent());
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('accept-call-btn'));
    });

    await act(async () => {
      jest.advanceTimersByTime(CALL_JOIN_ACK_TIMEOUT_MS + 1);
    });

    expect(mockGetUserMedia).toHaveBeenCalledTimes(1);

    // Banner cleared after a failed accept — re-fire the same incoming call
    // (mirrors a fresh CALL_INITIATED re-delivery) and retry.
    act(() => {
      socket.fire(SERVER_EVENTS.CALL_INITIATED, incomingCallEvent());
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('accept-call-btn'));
    });

    expect(mockGetUserMedia).toHaveBeenCalledTimes(2);
    expect(
      socket.emit.mock.calls.filter(([event]: [string]) => event === CLIENT_EVENTS.CALL_JOIN)
    ).toHaveLength(2);
  });

  it('clears the timeout on a successful ack (no stray toast/timer firing later)', async () => {
    const socket = makeFakeSocket();
    let capturedAck: ((r: { success: boolean; data?: { iceServers?: unknown[] } }) => void) | undefined;
    socket.emit = jest.fn((event: string, _payload: unknown, ack?: (r: { success: boolean; data?: { iceServers?: unknown[] } }) => void) => {
      if (event === CLIENT_EVENTS.CALL_JOIN) capturedAck = ack;
    });
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_INITIATED, incomingCallEvent());
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('accept-call-btn'));
    });

    await act(async () => {
      capturedAck?.({ success: true, data: { iceServers: [] } });
    });

    expect(useCallStore.getState().isInCall).toBe(true);

    // Advancing well past the timeout window must NOT retroactively fail
    // the already-successful join.
    act(() => {
      jest.advanceTimersByTime(CALL_JOIN_ACK_TIMEOUT_MS + 5000);
    });

    expect(mockToastError).not.toHaveBeenCalled();
    expect(useCallStore.getState().isInCall).toBe(true);
  });
});
