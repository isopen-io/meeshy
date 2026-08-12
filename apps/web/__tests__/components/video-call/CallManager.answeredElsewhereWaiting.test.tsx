/**
 * CallManager — call:already-answered must also dismiss a WAITING call
 * (routine calling-feature, Vague 55, 2026-08-05)
 *
 * `handleAnsweredElsewhere` only ever checked `incomingCall` — the full-screen
 * ring for a call with nobody else active. It never checked `waitingCall`,
 * the compact busy-path banner shown when a SECOND call arrives while the
 * user is already on a call (`CallManager.callWaiting.test.tsx`).
 *
 * Concrete failure this closes: user is on an active call on device A. A
 * second caller rings; device A shows the call-waiting banner and arms a 45s
 * auto-decline timer (`startWaitingTimeout`). The user answers that SAME
 * second call on device B instead of touching the banner on A. The gateway
 * transitions the call to `active` and broadcasts `call:already-answered` to
 * the user's rooms — but device A's `handleAnsweredElsewhere` ignored it
 * because it only compared against `incomingCall`, which is null (the
 * waiting call never becomes `incomingCall`). The banner and its timer kept
 * running unattended on device A; 45s later the orphaned timer fired
 * `rejectWaitingCall`, which emits `call:end {reason: 'rejected'}` for the
 * SAME callId the user is now actively on via device B. Because
 * `CallParticipant` authorization is scoped to the user (not the device),
 * the gateway accepts it — silently killing a call the user is live on
 * elsewhere, purely from a stale, ignored banner on a device that isn't even
 * looking at it.
 */

import { render, act, screen } from '@testing-library/react';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, isChecking: false }),
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('@/components/video-call/CallNotification', () => ({
  CallNotification: () => null,
}));

jest.mock('@/components/video-call/CallWaitingBanner', () => ({
  CallWaitingBanner: () => <div data-testid="call-waiting-banner">waiting</div>,
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
import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';

const ACTIVE_CALL_ID = 'active-call-answered-elsewhere';
const WAITING_CALL_ID = 'waiting-call-answered-elsewhere';
const CALL_TIMEOUT_MS = 45000;

type Handler = (...args: unknown[]) => void;

function makeFakeSocket() {
  const handlers: Record<string, Handler[]> = {};
  return {
    connected: true,
    id: 'fake-socket-id',
    emit: jest.fn(),
    on: jest.fn((event: string, fn: Handler) => { (handlers[event] ||= []).push(fn); }),
    off: jest.fn((event: string, fn?: Handler) => {
      if (!fn) { handlers[event] = []; return; }
      handlers[event] = (handlers[event] || []).filter((h) => h !== fn);
    }),
    onAny: jest.fn(),
    offAny: jest.fn(),
    fire: (event: string, ...args: unknown[]) => { (handlers[event] || []).forEach((h) => h(...args)); },
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
  useCallStore.getState().setCurrentCall({
    id: ACTIVE_CALL_ID,
    conversationId: 'conv-active',
    mode: 'p2p',
    status: 'active',
    initiatorId: 'user-1',
    startedAt: new Date(),
    participants: [],
  } as never);
  useCallStore.getState().setInCall(true);
}

describe('CallManager — call:already-answered dismisses a WAITING call too', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    useCallStore.getState().reset();
    useCallStore.getState().clearCallRetry();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('dismisses the call-waiting banner when the waiting call is answered on another device', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);
    act(() => { enterActiveCall(); });
    act(() => { socket.fire(SERVER_EVENTS.CALL_INITIATED, waitingIncomingCallEvent()); });
    expect(screen.getByTestId('call-waiting-banner')).toBeInTheDocument();

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_ALREADY_ANSWERED, { callId: WAITING_CALL_ID });
    });

    expect(screen.queryByTestId('call-waiting-banner')).toBeNull();
  });

  it('does not let the orphaned auto-decline timer fire call:end after the waiting call was answered elsewhere', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);
    act(() => { enterActiveCall(); });
    act(() => { socket.fire(SERVER_EVENTS.CALL_INITIATED, waitingIncomingCallEvent()); });

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_ALREADY_ANSWERED, { callId: WAITING_CALL_ID });
    });

    act(() => {
      jest.advanceTimersByTime(CALL_TIMEOUT_MS + 1);
    });

    const endCall = socket.emit.mock.calls.find(([e]: [string]) => e === CLIENT_EVENTS.CALL_END);
    expect(endCall).toBeUndefined();
  });

  it('leaves the active call untouched', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);
    act(() => { enterActiveCall(); });
    act(() => { socket.fire(SERVER_EVENTS.CALL_INITIATED, waitingIncomingCallEvent()); });

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_ALREADY_ANSWERED, { callId: WAITING_CALL_ID });
    });

    expect(useCallStore.getState().isInCall).toBe(true);
    expect(useCallStore.getState().currentCall?.id).toBe(ACTIVE_CALL_ID);
  });

  it('ignores call:already-answered for an unrelated callId (banner stays)', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);
    act(() => { enterActiveCall(); });
    act(() => { socket.fire(SERVER_EVENTS.CALL_INITIATED, waitingIncomingCallEvent()); });

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_ALREADY_ANSWERED, { callId: 'some-other-call' });
    });

    expect(screen.getByTestId('call-waiting-banner')).toBeInTheDocument();
  });
});
