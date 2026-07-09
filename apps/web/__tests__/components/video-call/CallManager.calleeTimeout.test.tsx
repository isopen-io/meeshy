/**
 * CallManager — callee no-answer timeout dead code (2026-07-09)
 *
 * Sibling of the initiator-side bug fixed in Vague 16
 * (CallManager.initiatorTimeout.test.tsx): `startCallTimeout`'s deferred
 * cleanup guards on `useCallStore.getState().{isInCall,currentCall}`. The
 * callee branch of `handleIncomingCall` only calls `setIncomingCall` +
 * `startCallTimeout` — it never sets `currentCall`/`isInCall` (those are
 * only set by `handleAcceptCall`). So for every unanswered incoming call,
 * the store guard is always true when the 30s timer fires and the callback
 * returns before ever clearing the local `incomingCall` banner state — the
 * ringing notification (Accept/Reject) is stuck forever unless a `call:ended`
 * broadcast happens to arrive. See tasks/calls-fonctionnel-todo.md Vague 30.
 */

import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { CallInitiatedEvent } from '@meeshy/shared/types/video-call';

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-callee-1' }, isChecking: false }),
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('@/components/video-call/CallNotification', () => ({
  CallNotification: () => <div data-testid="incoming-call-banner" />,
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
}));

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: { getSocket: jest.fn() },
}));

import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { useCallStore } from '@/stores/call-store';
import { CallManager } from '@/components/video-call/CallManager';

const CALL_ID = 'call-callee-timeout-abc';
const CALL_TIMEOUT_MS = 30000;

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

function makeIncomingCallEvent(): CallInitiatedEvent {
  return {
    callId: CALL_ID,
    conversationId: 'conv-1',
    mode: 'p2p',
    type: 'audio',
    initiator: {
      userId: 'user-caller-1',
      username: 'caller',
    },
    participants: [],
  };
}

describe('CallManager — callee no-answer timeout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    useCallStore.getState().reset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('clears the stuck incoming-call banner after 30s even though the callee never joined (isInCall/currentCall stay unset)', async () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);

    await act(async () => {
      socket.fire(SERVER_EVENTS.CALL_INITIATED, makeIncomingCallEvent());
    });

    expect(screen.getByTestId('incoming-call-banner')).toBeInTheDocument();
    // The callee never joins, so the call-store guard never sees this call.
    expect(useCallStore.getState().isInCall).toBe(false);
    expect(useCallStore.getState().currentCall).toBeNull();

    act(() => {
      jest.advanceTimersByTime(CALL_TIMEOUT_MS + 1);
    });

    expect(screen.queryByTestId('incoming-call-banner')).not.toBeInTheDocument();
  });

  it('does not emit call:leave for a callee timeout (the callee never joined the call)', async () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);

    await act(async () => {
      socket.fire(SERVER_EVENTS.CALL_INITIATED, makeIncomingCallEvent());
    });

    act(() => {
      jest.advanceTimersByTime(CALL_TIMEOUT_MS + 1);
    });

    const leaveEmit = socket.emit.mock.calls.find((c) => c[0] === CLIENT_EVENTS.CALL_LEAVE);
    expect(leaveEmit).toBeUndefined();
  });
});
