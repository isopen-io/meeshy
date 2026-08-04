/**
 * CallManager — `call:ended` for a stale/unrelated callId must not tear
 * down the current session (audit finding, 2026-08-04).
 *
 * `CallService.initiateCall` reaps stale "phantom" call sessions before
 * creating a new one, and fires their `call:ended` broadcast fire-and-forget
 * (`notifyReapedCallEnded`, not awaited). That async broadcast can land on
 * the client AFTER it has already moved on to a brand-new call — the ack for
 * the new call typically arrives first. `handleCallEnded`'s teardown
 * (`reset()`, and the waiting-call promotion) was callId-agnostic beyond the
 * single `waitingCall` special case, so a `call:ended` for the old, unrelated
 * call destroyed the new, healthy one.
 */

import { render } from '@testing-library/react';
import { act } from 'react';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

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
  CallNotification: () => null,
}));

jest.mock('@/components/video-call/CallWaitingBanner', () => ({
  CallWaitingBanner: () => <div data-testid="call-waiting-banner" />,
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

const NEW_CALL_ID = 'new-call-1';
const REAPED_CALL_ID = 'reaped-phantom-call-2';
const WAITING_CALL_ID = 'waiting-call-3';

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
      if (!fn) {
        handlers[event] = [];
        return;
      }
      handlers[event] = (handlers[event] || []).filter((h) => h !== fn);
    }),
    onAny: jest.fn(),
    offAny: jest.fn(),
    fire: (event: string, ...args: unknown[]) => {
      (handlers[event] || []).forEach((h) => h(...args));
    },
  };
}

function enterActiveCall(callId: string, conversationId: string) {
  useCallStore.getState().setCurrentCall({
    id: callId,
    conversationId,
    mode: 'p2p',
    status: 'active',
    initiatorId: 'user-1',
    startedAt: new Date(),
    participants: [],
  } as never);
  useCallStore.getState().setInCall(true);
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

describe('CallManager — call:ended stale-callId guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useCallStore.getState().reset();
    useCallStore.getState().clearCallRetry();
  });

  it('ignores a call:ended for an unrelated stale callId and leaves the new active call untouched', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);
    render(<CallManager />);
    act(() => {
      enterActiveCall(NEW_CALL_ID, 'conv-new');
    });

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_ENDED, {
        callId: REAPED_CALL_ID,
        duration: 0,
        endedBy: 'user-1',
        reason: 'garbageCollected',
      });
    });

    expect(useCallStore.getState().isInCall).toBe(true);
    expect(useCallStore.getState().currentCall?.id).toBe(NEW_CALL_ID);
  });

  it('does not stack a retry offer for the new call from a stale-callId call:ended', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);
    render(<CallManager />);
    act(() => {
      enterActiveCall(NEW_CALL_ID, 'conv-new');
    });

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_ENDED, {
        callId: REAPED_CALL_ID,
        duration: 0,
        endedBy: 'user-1',
        reason: 'failed',
      });
    });

    expect(useCallStore.getState().pendingRetry).toEqual({});
  });

  it('does not promote an unrelated waiting call when a stale-callId call:ended arrives (not the tracked active call)', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);
    render(<CallManager />);
    act(() => {
      enterActiveCall(NEW_CALL_ID, 'conv-new');
    });
    act(() => {
      socket.fire(SERVER_EVENTS.CALL_INITIATED, waitingIncomingCallEvent());
    });

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_ENDED, {
        callId: REAPED_CALL_ID,
        duration: 0,
        endedBy: 'user-1',
        reason: 'garbageCollected',
      });
    });

    // The active call must survive and the waiting call must still be waiting
    // (not promoted to a normal incoming ring) — the stale event was for
    // neither of them.
    expect(useCallStore.getState().isInCall).toBe(true);
    expect(useCallStore.getState().currentCall?.id).toBe(NEW_CALL_ID);
  });

  it('still tears down and clears the incoming-call banner when call:ended matches the ringing (not-yet-answered) call', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);
    render(<CallManager />);

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_INITIATED, waitingIncomingCallEvent());
    });
    act(() => {
      socket.fire(SERVER_EVENTS.CALL_ENDED, {
        callId: WAITING_CALL_ID,
        duration: 0,
        endedBy: 'user-3',
        reason: 'rejected',
      });
    });

    expect(useCallStore.getState().currentCall).toBeNull();
    expect(useCallStore.getState().isInCall).toBe(false);
  });
});
