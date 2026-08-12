/**
 * CallManager — second caller bumps an unanswered incoming call (2026-08-07, Vague 60)
 *
 * A SECOND `call:initiated` arriving while the FIRST is still unanswered and
 * the user is NOT in any active call (isInCall stays false throughout, so the
 * busy-path branch never runs) used to fall straight through to
 * setIncomingCall, silently overwriting `incomingCall` and its shared
 * `callTimeoutRef` with zero decline signal for the first caller — the same
 * class of bug Vague 59 closed on the busy-path sibling (third caller bumping
 * the call-waiting banner), left open here.
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

const FIRST_CALL_ID = 'incoming-call-1';
const SECOND_CALL_ID = 'incoming-call-2';

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

const mockGetUserMedia = jest.fn();

describe('CallManager — second caller bumps an unanswered incoming call', () => {
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

  it('explicitly declines the bumped FIRST caller (call:end reason=rejected) when a SECOND caller arrives while not in any call', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);
    render(<CallManager />);

    act(() => { socket.fire(SERVER_EVENTS.CALL_INITIATED, incomingCallEvent(FIRST_CALL_ID, 'user-2')); });
    expect(screen.queryByTestId('incoming-call-notification')?.getAttribute('data-call-id')).toBe(FIRST_CALL_ID);
    expect(socket.emit.mock.calls.find(([e]: [string]) => e === CLIENT_EVENTS.CALL_END)).toBeUndefined();
    expect(useCallStore.getState().isInCall).toBe(false);

    act(() => { socket.fire(SERVER_EVENTS.CALL_INITIATED, incomingCallEvent(SECOND_CALL_ID, 'user-3')); });

    const endCall = socket.emit.mock.calls.find(([e]: [string]) => e === CLIENT_EVENTS.CALL_END);
    expect(endCall?.[1]).toEqual(expect.objectContaining({ callId: FIRST_CALL_ID, reason: 'rejected' }));

    expect(screen.queryByTestId('incoming-call-notification')?.getAttribute('data-call-id')).toBe(SECOND_CALL_ID);
    expect(useCallStore.getState().isInCall).toBe(false);
  });

  it('does not re-decline the same incoming call when it re-fires call:initiated for itself', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);
    render(<CallManager />);

    act(() => { socket.fire(SERVER_EVENTS.CALL_INITIATED, incomingCallEvent(FIRST_CALL_ID, 'user-2')); });
    act(() => { socket.fire(SERVER_EVENTS.CALL_INITIATED, incomingCallEvent(FIRST_CALL_ID, 'user-2')); });

    expect(socket.emit.mock.calls.find(([e]: [string]) => e === CLIENT_EVENTS.CALL_END)).toBeUndefined();
    expect(screen.queryByTestId('incoming-call-notification')?.getAttribute('data-call-id')).toBe(FIRST_CALL_ID);
  });
});
