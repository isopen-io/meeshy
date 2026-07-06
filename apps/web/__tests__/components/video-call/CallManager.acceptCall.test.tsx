/**
 * CallManager — handleAcceptCall must gate "in call" UI state on the
 * call:join ack (Vague 19, 2026-07-06)
 *
 * Previously `setCurrentCall`/`setInCall(true)`/`setIncomingCall(null)` ran
 * unconditionally right after `socket.emit(CLIENT_EVENTS.CALL_JOIN, ...)`,
 * regardless of whether the gateway's ack reported success. A join rejected
 * by the gateway (caller already hung up, no longer a participant, rate
 * limited, etc.) still left the callee's UI committed to "in call" with a
 * fully-mounted VideoCallInterface and no peer connection ever formed.
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

const CALL_ID = 'call-accept-abc';

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
    resolveJoin: (response: JoinAck) => capturedJoinAck?.(response),
  };
}

function incomingCallEvent() {
  return {
    callId: CALL_ID,
    conversationId: 'conv-1',
    mode: 'p2p',
    type: 'audio',
    initiator: { userId: 'user-2', username: 'caller' },
    participants: [],
  };
}

describe('CallManager — handleAcceptCall gates UI on CALL_JOIN ack', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useCallStore.getState().reset();
  });

  it('commits to in-call state only after the ack reports success', async () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_INITIATED, incomingCallEvent());
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('accept-call-btn'));
    });

    // Ack not yet resolved: UI must NOT have committed to "in call" yet.
    expect(useCallStore.getState().isInCall).toBe(false);

    await act(async () => {
      socket.resolveJoin({ success: true, data: { iceServers: [] } });
    });

    expect(useCallStore.getState().isInCall).toBe(true);
    expect(useCallStore.getState().currentCall?.id).toBe(CALL_ID);
  });

  it('does NOT commit to in-call state when the ack reports failure', async () => {
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
      socket.resolveJoin({ success: false, error: { code: 'CALL_ENDED', message: 'Call has ended' } });
    });

    expect(useCallStore.getState().isInCall).toBe(false);
    expect(useCallStore.getState().currentCall).toBeNull();
    expect(mockToastError).toHaveBeenCalled();
  });
});
