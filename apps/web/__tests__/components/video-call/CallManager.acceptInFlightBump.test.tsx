/**
 * CallManager — a second `call:initiated` arriving while an Accept is already
 * in flight for the first call must NOT reject the call being accepted
 * (2026-08-10, Vague 90)
 *
 * `handleAcceptCall` only clears `incomingCall` (via `setIncomingCall(null)`)
 * AFTER `acceptOrJoinCall` resolves — a getUserMedia + call:join ack
 * round-trip that can take up to `CALL_JOIN_ACK_TIMEOUT_MS` (10s).
 * `isInCall`/`currentCall` don't flip either: `setInCall(true)` is the LAST
 * statement of `acceptOrJoinCall`. So for that entire window, `incomingCall`
 * is still the call being accepted and `isInCall` is still `false`.
 *
 * `handleIncomingCall`'s "second caller bumps unanswered call" branch
 * (Vague 60) decides purely from `incomingCall`/`isInCall` — it has no idea
 * an Accept is already committed. A second, unrelated `call:initiated`
 * arriving in that window used to fall into that branch and explicitly
 * REJECT (`call:end reason=rejected`) the very call the user just tapped
 * Accept on, racing it against its own pending `call:join` for the same
 * callId — the caller sees a spurious reject even though the callee is about
 * to actually join.
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
  CallNotification: (props: { call: { callId: string }; onAccept: () => void; onReject: () => void }) => (
    <div data-testid="incoming-call-notification" data-call-id={props.call.callId}>
      <button data-testid="accept-call-btn" onClick={props.onAccept}>Accept</button>
      <button data-testid="reject-call-btn" onClick={props.onReject}>Reject</button>
    </div>
  ),
}));

jest.mock('@/components/video-call/CallWaitingBanner', () => ({
  CallWaitingBanner: (props: { call: { callId: string }; onReject: () => void; onEndAndAnswer: () => void }) => (
    <div data-testid="call-waiting-banner" data-call-id={props.call.callId}>
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

const FIRST_CALL_ID = 'accept-in-flight-1';
const SECOND_CALL_ID = 'accept-in-flight-2';
const THIRD_CALL_ID = 'accept-in-flight-3';

type Handler = (...args: unknown[]) => void;
type JoinAck = { success: boolean; data?: { iceServers?: unknown[] }; error?: unknown };

function makeFakeSocket() {
  const handlers: Record<string, Handler[]> = {};
  let capturedJoinAck: ((response: JoinAck) => void) | undefined;
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
    resolveJoin: (response: JoinAck) => capturedJoinAck?.(response),
  };
}

function incomingCallEvent(callId: string, initiatorUserId: string) {
  return {
    callId,
    conversationId: 'conv-' + callId,
    mode: 'p2p',
    type: 'audio',
    initiator: { userId: initiatorUserId, username: 'caller-' + callId },
    participants: [],
  };
}

function makeFakeStream() {
  return { getTracks: jest.fn(() => [{ stop: jest.fn() }]) };
}

const mockGetUserMedia = jest.fn();

describe('CallManager — second caller arriving while Accept is in flight', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useCallStore.getState().reset();
    useCallStore.getState().clearCallRetry();
    mockGetUserMedia.mockResolvedValue(makeFakeStream());
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: mockGetUserMedia }, writable: true, configurable: true,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).__preauthorizedMediaStream;
  });

  it('does NOT reject the call being accepted — queues the new caller as waiting instead', async () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);
    render(<CallManager />);

    act(() => { socket.fire(SERVER_EVENTS.CALL_INITIATED, incomingCallEvent(FIRST_CALL_ID, 'user-2')); });

    // Tap Accept — getUserMedia resolves, call:join is emitted, but its ack
    // is deliberately NOT resolved yet: this is the in-flight window.
    await act(async () => {
      fireEvent.click(screen.getByTestId('accept-call-btn'));
    });
    expect(useCallStore.getState().isInCall).toBe(false);

    // A second, unrelated call:initiated fires while the ack is still pending.
    act(() => { socket.fire(SERVER_EVENTS.CALL_INITIATED, incomingCallEvent(SECOND_CALL_ID, 'user-3')); });

    // The call:join for FIRST_CALL_ID is not raced by a call:end for the same id.
    const endCallForFirst = socket.emit.mock.calls.find(
      ([e, d]: [string, { callId?: string }]) => e === CLIENT_EVENTS.CALL_END && d?.callId === FIRST_CALL_ID
    );
    expect(endCallForFirst).toBeUndefined();

    // The second caller is queued as waiting, not shown as a replacement incoming-call banner.
    expect(screen.queryByTestId('call-waiting-banner')?.getAttribute('data-call-id')).toBe(SECOND_CALL_ID);

    // The join for FIRST_CALL_ID can still succeed once its ack lands.
    await act(async () => {
      socket.resolveJoin({ success: true, data: { iceServers: [] } });
    });
    expect(useCallStore.getState().isInCall).toBe(true);
    expect(useCallStore.getState().currentCall?.id).toBe(FIRST_CALL_ID);
  });

  it('declines a THIRD caller bumping the queued waiting call (same accept-in-flight window)', async () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);
    render(<CallManager />);

    act(() => { socket.fire(SERVER_EVENTS.CALL_INITIATED, incomingCallEvent(FIRST_CALL_ID, 'user-2')); });
    await act(async () => {
      fireEvent.click(screen.getByTestId('accept-call-btn'));
    });

    act(() => { socket.fire(SERVER_EVENTS.CALL_INITIATED, incomingCallEvent(SECOND_CALL_ID, 'user-3')); });
    act(() => { socket.fire(SERVER_EVENTS.CALL_INITIATED, incomingCallEvent(THIRD_CALL_ID, 'user-4')); });

    const endCallForSecond = socket.emit.mock.calls.find(
      ([e, d]: [string, { callId?: string }]) => e === CLIENT_EVENTS.CALL_END && d?.callId === SECOND_CALL_ID
    );
    expect(endCallForSecond?.[1]).toEqual(expect.objectContaining({ callId: SECOND_CALL_ID, reason: 'rejected' }));
    expect(screen.queryByTestId('call-waiting-banner')?.getAttribute('data-call-id')).toBe(THIRD_CALL_ID);
  });
});
