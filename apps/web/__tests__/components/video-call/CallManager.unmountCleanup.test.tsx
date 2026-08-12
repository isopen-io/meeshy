/**
 * CallManager — unmount must clear the call-waiting auto-decline timeout
 * (2026-08-05)
 *
 * `startWaitingTimeout` arms `waitingTimeoutRef` (CALL_TIMEOUT_MS = 45s) the
 * moment a second `call:initiated` arrives while already in a call (see
 * CallManager.callWaiting.test.tsx). The unmount cleanup effect only ever
 * cleared `callTimeoutRef` via `clearCallTimeout()` — `waitingTimeoutRef` was
 * never torn down. If the component unmounts (route change, logout) while a
 * waiting banner is pending, the orphaned timeout still fires 45s later,
 * calling `rejectWaitingCall` — a real `call:end reason=rejected` emit on a
 * socket the app may since have used for something else — from a component
 * nothing is observing anymore.
 */

import { render, act } from '@testing-library/react';
import { SERVER_EVENTS, CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';

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
  CallWaitingBanner: () => null,
}));

jest.mock('@/components/video-calls/VideoCallInterface', () => ({
  VideoCallInterface: () => null,
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

const ACTIVE_CALL_ID = 'active-call-unmount-1';
const WAITING_CALL_ID = 'waiting-call-unmount-2';
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

describe('CallManager — unmount clears the call-waiting timeout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    useCallStore.getState().reset();
    useCallStore.getState().clearCallRetry();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not auto-decline the waiting call once the component has unmounted', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    const { unmount } = render(<CallManager />);
    act(() => { enterActiveCall(); });
    act(() => { socket.fire(SERVER_EVENTS.CALL_INITIATED, waitingIncomingCallEvent()); });

    unmount();

    act(() => {
      jest.advanceTimersByTime(CALL_TIMEOUT_MS + 1);
    });

    const endCall = socket.emit.mock.calls.find(([e]: [string]) => e === CLIENT_EVENTS.CALL_END);
    expect(endCall).toBeUndefined();
  });
});
