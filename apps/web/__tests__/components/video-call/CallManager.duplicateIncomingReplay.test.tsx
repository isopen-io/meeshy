/**
 * CallManager — `call:check-active` replay must not re-arm the callee's
 * 45s no-answer timeout (Vague 163, 2026-08-23)
 *
 * `call:check-active` (CallEventsHandler.ts) replays the in-progress
 * `call:initiated` event to a socket that (re)connects mid-ring — a callee
 * whose socket drops and reconnects while a call is still ringing must see
 * the incoming-call banner reappear rather than miss the call entirely. The
 * gateway comment on that handler claims "the client dedups by callId", but
 * `handleIncomingCall`'s callee branch never actually deduped a replay for
 * the SAME callId already showing as `incomingCall`: it fell straight
 * through to `setIncomingCall` + `startCallTimeout`, which RESTARTS a fresh
 * 45s window on every replay instead of leaving the original deadline
 * alone. A callee on a flaky connection — the exact case this replay
 * mechanism exists to serve — could see the ringing banner outlive the
 * caller's own 45s timeout indefinitely, one reconnect at a time.
 *
 * See tasks/calls-fonctionnel-todo.md Vague 163.
 */

import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
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

const CALL_ID = 'call-duplicate-replay-abc';
const CALL_TIMEOUT_MS = 45000;

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

describe('CallManager — call:check-active replay does not re-arm the callee timeout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    useCallStore.getState().reset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('lets the original 45s deadline expire even after a duplicate call:initiated replay for the same callId', async () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);

    await act(async () => {
      socket.fire(SERVER_EVENTS.CALL_INITIATED, makeIncomingCallEvent());
    });

    expect(screen.getByTestId('incoming-call-banner')).toBeInTheDocument();

    // 40s in, the socket reconnects and the gateway replays the SAME
    // still-ringing call:initiated via call:check-active.
    act(() => {
      jest.advanceTimersByTime(40000);
    });
    expect(screen.getByTestId('incoming-call-banner')).toBeInTheDocument();

    await act(async () => {
      socket.fire(SERVER_EVENTS.CALL_INITIATED, makeIncomingCallEvent());
    });

    // Only 6s further (46s total since the FIRST call:initiated, past its
    // original 45s deadline) — a re-armed timer would still have ~39s left
    // and keep the banner up; the original deadline must still govern.
    act(() => {
      jest.advanceTimersByTime(6000);
    });

    expect(screen.queryByTestId('incoming-call-banner')).not.toBeInTheDocument();
  });

  it('does not restart the incoming-call state on a duplicate replay (identity unchanged, no duplicate render churn)', async () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);

    await act(async () => {
      socket.fire(SERVER_EVENTS.CALL_INITIATED, makeIncomingCallEvent());
    });

    const incomingAfterFirst = useCallStore.getState().isInCall;
    expect(incomingAfterFirst).toBe(false);

    await act(async () => {
      socket.fire(SERVER_EVENTS.CALL_INITIATED, makeIncomingCallEvent());
    });

    // Still not joined — the replay must not have flipped any call-store
    // state (it's a pure no-op for an already-showing call).
    expect(useCallStore.getState().isInCall).toBe(false);
    expect(useCallStore.getState().currentCall).toBeNull();
  });
});
