/**
 * CallManager — call-waiting (busy-path) parity (2026-07-12)
 *
 * A second `call:initiated` arriving while the user is ALREADY in a different
 * active call must not naively `setIncomingCall` — the render mounts
 * `CallNotification` and `VideoCallInterface` independently, so an ungated
 * incoming notification renders OVER the live call and Accept clobbers the
 * active call. iOS (`showCallWaitingBanner` + `endCurrentAndAnswerPending`) and
 * Android (`onIncomingOffer` + `acceptWaitingSwap`/`rejectWaiting`) both handle
 * this deliberately with a waiting banner.
 *
 * Web now shows a compact `CallWaitingBanner` with two actions:
 *   - Decline: reject the waiting call (call:end reason=rejected), keep active.
 *   - End & answer: hang up the active call (call:leave) then answer the
 *     waiting one (call:join) — a clean swap; reset() closes the active peer
 *     connections first so nothing is orphaned.
 *
 * The waiting call's own teardown (its caller cancelled) must dismiss the
 * banner ONLY — never reset the healthy active call (handleCallEnded's reset()
 * is otherwise callId-agnostic).
 */

import { render, act, fireEvent, screen } from '@testing-library/react';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, isChecking: false }),
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('@/components/video-call/CallNotification', () => ({
  CallNotification: (props: { onAccept: () => void; onReject: () => void }) => (
    <div>
      <button data-testid="accept-call-btn" onClick={props.onAccept}>Accept</button>
      <button data-testid="reject-call-btn" onClick={props.onReject}>Reject</button>
    </div>
  ),
}));

jest.mock('@/components/video-call/CallWaitingBanner', () => ({
  CallWaitingBanner: (props: { onReject: () => void; onEndAndAnswer: () => void }) => (
    <div data-testid="call-waiting-banner">
      <button data-testid="reject-waiting-btn" onClick={props.onReject}>Decline</button>
      <button data-testid="end-answer-btn" onClick={props.onEndAndAnswer}>End &amp; answer</button>
    </div>
  ),
}));

jest.mock('@/components/video-calls/VideoCallInterface', () => ({
  VideoCallInterface: () => <div data-testid="active-call-ui" />,
}));

jest.mock('sonner', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@/utils/ringtone', () => ({
  stopRingtone: jest.fn(),
  playRingtone: jest.fn(),
  getRingtone: () => ({ play: jest.fn(), stop: jest.fn() }),
}));

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: { getSocket: jest.fn() },
}));

import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { useCallStore } from '@/stores/call-store';
import { CallManager } from '@/components/video-call/CallManager';

const ACTIVE_CALL_ID = 'active-call-1';
const WAITING_CALL_ID = 'waiting-call-2';

type Handler = (...args: unknown[]) => void;
type JoinAck = { success: boolean; data?: { iceServers?: unknown[] }; error?: unknown };

function makeFakeSocket() {
  const handlers: Record<string, Handler[]> = {};
  let capturedJoinAck: ((r: JoinAck) => void) | undefined;
  return {
    connected: true,
    id: 'fake-socket-id',
    emit: jest.fn((event: string, _payload: unknown, ack?: (r: JoinAck) => void) => {
      if (event === CLIENT_EVENTS.CALL_JOIN) capturedJoinAck = ack;
    }),
    on: jest.fn((event: string, fn: Handler) => { (handlers[event] ||= []).push(fn); }),
    off: jest.fn((event: string, fn?: Handler) => {
      if (!fn) { handlers[event] = []; return; }
      handlers[event] = (handlers[event] || []).filter((h) => h !== fn);
    }),
    onAny: jest.fn(),
    offAny: jest.fn(),
    fire: (event: string, ...args: unknown[]) => { (handlers[event] || []).forEach((h) => h(...args)); },
    resolveJoin: (r: JoinAck) => capturedJoinAck?.(r),
  };
}

function waitingIncomingCallEvent() {
  return {
    callId: WAITING_CALL_ID,
    conversationId: 'conv-other',
    mode: 'p2p',
    type: 'audio',
    initiator: { userId: 'user-3', username: 'other-caller' },
    participants: [],
  };
}

function enterActiveCall() {
  const activeCall = {
    id: ACTIVE_CALL_ID,
    conversationId: 'conv-active',
    mode: 'p2p',
    status: 'active',
    initiatorId: 'user-1',
    startedAt: new Date(),
    participants: [],
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useCallStore.getState().setCurrentCall(activeCall as any);
  useCallStore.getState().setInCall(true);
}

const mockGetUserMedia = jest.fn();

describe('CallManager — call-waiting banner (busy-path swap)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useCallStore.getState().reset();
    // `reset()` preserves `pendingRetry` (it must survive the teardown a retry
    // offer is posted during) — clear it between tests so one case's offer can't
    // leak into the next.
    useCallStore.getState().clearCallRetry();
    mockGetUserMedia.mockResolvedValue({ getTracks: () => [{ stop: jest.fn() }] });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: mockGetUserMedia }, writable: true, configurable: true,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).__preauthorizedMediaStream;
  });

  it('shows the waiting banner (not the full incoming notification) while already in a call', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);
    render(<CallManager />);
    act(() => { enterActiveCall(); });

    act(() => { socket.fire(SERVER_EVENTS.CALL_INITIATED, waitingIncomingCallEvent()); });

    expect(screen.queryByTestId('call-waiting-banner')).not.toBeNull();
    expect(screen.queryByTestId('accept-call-btn')).toBeNull();
  });

  it('does NOT auto-emit call:end just for showing the banner, and leaves the active call untouched', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);
    render(<CallManager />);
    act(() => { enterActiveCall(); });

    act(() => { socket.fire(SERVER_EVENTS.CALL_INITIATED, waitingIncomingCallEvent()); });

    expect(socket.emit.mock.calls.find(([e]: [string]) => e === CLIENT_EVENTS.CALL_END)).toBeUndefined();
    expect(useCallStore.getState().isInCall).toBe(true);
    expect(useCallStore.getState().currentCall?.id).toBe(ACTIVE_CALL_ID);
  });

  it('Decline: rejects the waiting call (call:end rejected) and keeps the active call', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);
    render(<CallManager />);
    act(() => { enterActiveCall(); });
    act(() => { socket.fire(SERVER_EVENTS.CALL_INITIATED, waitingIncomingCallEvent()); });

    act(() => { fireEvent.click(screen.getByTestId('reject-waiting-btn')); });

    const endCall = socket.emit.mock.calls.find(([e]: [string]) => e === CLIENT_EVENTS.CALL_END);
    expect(endCall?.[1]).toEqual(expect.objectContaining({ callId: WAITING_CALL_ID, reason: 'rejected' }));
    expect(screen.queryByTestId('call-waiting-banner')).toBeNull();
    expect(useCallStore.getState().isInCall).toBe(true);
    expect(useCallStore.getState().currentCall?.id).toBe(ACTIVE_CALL_ID);
  });

  it('End & answer: leaves the active call (call:leave) then joins the waiting call (call:join)', async () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);
    render(<CallManager />);
    act(() => { enterActiveCall(); });
    act(() => { socket.fire(SERVER_EVENTS.CALL_INITIATED, waitingIncomingCallEvent()); });

    await act(async () => { fireEvent.click(screen.getByTestId('end-answer-btn')); });

    const leave = socket.emit.mock.calls.find(([e]: [string]) => e === CLIENT_EVENTS.CALL_LEAVE);
    expect(leave?.[1]).toEqual(expect.objectContaining({ callId: ACTIVE_CALL_ID }));

    const join = socket.emit.mock.calls.find(([e]: [string]) => e === CLIENT_EVENTS.CALL_JOIN);
    expect(join?.[1]).toEqual(expect.objectContaining({ callId: WAITING_CALL_ID }));

    expect(screen.queryByTestId('call-waiting-banner')).toBeNull();
  });

  it('waiting caller cancels (call:ended for the waiting call) dismisses the banner without resetting the active call', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);
    render(<CallManager />);
    act(() => { enterActiveCall(); });
    act(() => { socket.fire(SERVER_EVENTS.CALL_INITIATED, waitingIncomingCallEvent()); });

    act(() => { socket.fire(SERVER_EVENTS.CALL_ENDED, { callId: WAITING_CALL_ID, duration: 0 }); });

    expect(screen.queryByTestId('call-waiting-banner')).toBeNull();
    expect(useCallStore.getState().isInCall).toBe(true);
    expect(useCallStore.getState().currentCall?.id).toBe(ACTIVE_CALL_ID);
  });

  it('active call ends while a call is waiting: promotes the waiting call to a normal incoming ring', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);
    render(<CallManager />);
    act(() => { enterActiveCall(); });
    act(() => { socket.fire(SERVER_EVENTS.CALL_INITIATED, waitingIncomingCallEvent()); });

    act(() => { socket.fire(SERVER_EVENTS.CALL_ENDED, { callId: ACTIVE_CALL_ID, duration: 30, reason: 'completed' }); });

    // Banner gone, waiting call now rings as a normal incoming call, active reset.
    expect(screen.queryByTestId('call-waiting-banner')).toBeNull();
    expect(screen.queryByTestId('accept-call-btn')).not.toBeNull();
    expect(useCallStore.getState().isInCall).toBe(false);
  });

  it('active call ends with a TRANSIENT reason while a call is waiting: promotes the waiting call and does NOT stack a retry offer', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);
    render(<CallManager />);
    act(() => { enterActiveCall(); });
    act(() => { socket.fire(SERVER_EVENTS.CALL_INITIATED, waitingIncomingCallEvent()); });

    act(() => { socket.fire(SERVER_EVENTS.CALL_ENDED, { callId: ACTIVE_CALL_ID, duration: 12, reason: 'connectionLost' }); });

    // The waiting call is promoted to a fresh incoming ring — the user's next
    // action. A « Réessayer » offer for the DROPPED active call stacked behind
    // it would be conflicting UI, so the promotion suppresses the retry offer.
    expect(screen.queryByTestId('accept-call-btn')).not.toBeNull();
    expect(useCallStore.getState().pendingRetry).toBeNull();
  });

  it('still shows the normal incoming notification (no banner) when NOT busy', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);
    render(<CallManager />); // fresh store: isInCall=false

    act(() => { socket.fire(SERVER_EVENTS.CALL_INITIATED, waitingIncomingCallEvent()); });

    expect(screen.queryByTestId('accept-call-btn')).not.toBeNull();
    expect(screen.queryByTestId('call-waiting-banner')).toBeNull();
    expect(socket.emit.mock.calls.find(([e]: [string]) => e === CLIENT_EVENTS.CALL_END)).toBeUndefined();
  });
});
