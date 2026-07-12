/**
 * CallManager — busy-path parity (2026-07-12)
 *
 * A second `call:initiated` arriving while the user is ALREADY in a different
 * active call must not naively `setIncomingCall`. The render shows
 * `CallNotification` and `VideoCallInterface` independently (they are NOT
 * mutually exclusive), so an ungated incoming notification renders OVER the
 * live call, and tapping Accept runs `setCurrentCall(secondCall)` — clobbering
 * the active call's state and orphaning its RTCPeerConnection.
 *
 * iOS (`CallManager` busy-path) and Android (`CallViewModel.onIncomingOffer`)
 * both handle this deliberately. Web had no guard at all. The minimal, correct
 * parity is to AUTO-DECLINE the second call (`call:end` reason=rejected): the
 * active call is left untouched and the second caller is freed immediately
 * instead of ringing into a notification that would break the ongoing call.
 */

import { render, act, screen } from '@testing-library/react';
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
}));

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: { getSocket: jest.fn() },
}));

import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { useCallStore } from '@/stores/call-store';
import { CallManager } from '@/components/video-call/CallManager';

const ACTIVE_CALL_ID = 'active-call-1';
const SECOND_CALL_ID = 'second-call-2';

type Handler = (...args: unknown[]) => void;

function makeFakeSocket() {
  const handlers: Record<string, Handler[]> = {};
  return {
    connected: true,
    id: 'fake-socket-id',
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

function secondIncomingCallEvent() {
  return {
    callId: SECOND_CALL_ID,
    conversationId: 'conv-other',
    mode: 'p2p',
    type: 'audio',
    initiator: { userId: 'user-3', username: 'other-caller' },
    participants: [],
  };
}

function enterActiveCall() {
  // setCurrentCall flips isInCall=true (call-store.ts) — the user is now busy
  // in a live call with someone else.
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

describe('CallManager — busy-path auto-declines a second incoming call', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useCallStore.getState().reset();
  });

  it('does NOT show an incoming-call notification while already in a different call', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);
    act(() => { enterActiveCall(); });

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_INITIATED, secondIncomingCallEvent());
    });

    expect(screen.queryByTestId('accept-call-btn')).toBeNull();
  });

  it('leaves the active call untouched (no clobber of currentCall)', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);
    act(() => { enterActiveCall(); });

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_INITIATED, secondIncomingCallEvent());
    });

    expect(useCallStore.getState().isInCall).toBe(true);
    expect(useCallStore.getState().currentCall?.id).toBe(ACTIVE_CALL_ID);
  });

  it('auto-declines the second call via call:end reason=rejected (frees the caller)', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);
    act(() => { enterActiveCall(); });

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_INITIATED, secondIncomingCallEvent());
    });

    const endCall = socket.emit.mock.calls.find(
      ([event]: [string]) => event === CLIENT_EVENTS.CALL_END
    );
    expect(endCall).toBeDefined();
    expect(endCall?.[1]).toEqual(
      expect.objectContaining({ callId: SECOND_CALL_ID, reason: 'rejected' })
    );
  });

  it('still shows the notification for an incoming call when NOT busy', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />); // fresh store: isInCall=false

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_INITIATED, secondIncomingCallEvent());
    });

    expect(screen.queryByTestId('accept-call-btn')).not.toBeNull();
    expect(
      socket.emit.mock.calls.find(([event]: [string]) => event === CLIENT_EVENTS.CALL_END)
    ).toBeUndefined();
  });
});
