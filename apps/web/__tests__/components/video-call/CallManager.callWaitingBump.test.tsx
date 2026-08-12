/**
 * CallManager — third-caller busy-path bump (2026-08-06, Vague 59)
 *
 * A THIRD `call:initiated` arriving while a SECOND is already showing in the
 * compact `CallWaitingBanner` must not silently replace it in local state —
 * that would orphan the second caller's ring with no decline signal at all
 * until its own client-side timeout eventually gives up. The bumped call
 * must receive the same explicit `call:end reason=rejected` the Decline
 * button and the 45s auto-timeout already send (Vague 58's "reste ouvert").
 */

import { render, act, screen } from '@testing-library/react';
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

const ACTIVE_CALL_ID = 'active-call-1';
const SECOND_CALL_ID = 'waiting-call-2';
const THIRD_CALL_ID = 'waiting-call-3';

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

function incomingCallEvent(callId: string, initiatorUserId: string) {
  return {
    callId,
    conversationId: 'conv-other-' + callId,
    mode: 'p2p',
    type: 'audio',
    initiator: { userId: initiatorUserId, username: 'caller-' + callId },
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

describe('CallManager — third caller bumps the call-waiting banner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useCallStore.getState().reset();
    useCallStore.getState().clearCallRetry();
    mockGetUserMedia.mockResolvedValue({ getTracks: () => [{ stop: jest.fn() }] });
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: mockGetUserMedia }, writable: true, configurable: true,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).__preauthorizedMediaStream;
  });

  it('explicitly declines the bumped SECOND caller (call:end reason=rejected) when a THIRD caller arrives', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);
    render(<CallManager />);
    act(() => { enterActiveCall(); });

    act(() => { socket.fire(SERVER_EVENTS.CALL_INITIATED, incomingCallEvent(SECOND_CALL_ID, 'user-2')); });
    expect(screen.queryByTestId('call-waiting-banner')?.getAttribute('data-call-id')).toBe(SECOND_CALL_ID);
    expect(socket.emit.mock.calls.find(([e]: [string]) => e === CLIENT_EVENTS.CALL_END)).toBeUndefined();

    act(() => { socket.fire(SERVER_EVENTS.CALL_INITIATED, incomingCallEvent(THIRD_CALL_ID, 'user-3')); });

    const endCall = socket.emit.mock.calls.find(([e]: [string]) => e === CLIENT_EVENTS.CALL_END);
    expect(endCall?.[1]).toEqual(expect.objectContaining({ callId: SECOND_CALL_ID, reason: 'rejected' }));

    expect(screen.queryByTestId('call-waiting-banner')?.getAttribute('data-call-id')).toBe(THIRD_CALL_ID);
    expect(useCallStore.getState().isInCall).toBe(true);
    expect(useCallStore.getState().currentCall?.id).toBe(ACTIVE_CALL_ID);
  });

  it('does not re-decline the same waiting call when it re-fires call:initiated for itself', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);
    render(<CallManager />);
    act(() => { enterActiveCall(); });

    act(() => { socket.fire(SERVER_EVENTS.CALL_INITIATED, incomingCallEvent(SECOND_CALL_ID, 'user-2')); });
    act(() => { socket.fire(SERVER_EVENTS.CALL_INITIATED, incomingCallEvent(SECOND_CALL_ID, 'user-2')); });

    expect(socket.emit.mock.calls.find(([e]: [string]) => e === CLIENT_EVENTS.CALL_END)).toBeUndefined();
    expect(screen.queryByTestId('call-waiting-banner')?.getAttribute('data-call-id')).toBe(SECOND_CALL_ID);
  });
});
