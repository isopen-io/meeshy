/**
 * CallManager — initiator no-answer timeout regression (2026-07-06)
 *
 * The 682c35279 P0 fix made `use-video-call.ts`'s `startCall` ack handler set
 * `currentCall` directly (the gateway never re-emits `call:initiated` back to
 * the initiator's own socket, so `handleIncomingCall`'s `isInitiator` branch —
 * the only place that used to call `startCallTimeout` for the caller — became
 * unreachable). That silently turned the initiator's 30s no-answer
 * auto-cleanup into dead code: the caller's ringing screen depended entirely
 * on the server's 60s ringing-timeout broadcast to ever clear. See
 * tasks/calls-fonctionnel-todo.md Vague 16.
 */

import { render } from '@testing-library/react';
import { act } from 'react';
import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-caller-1' }, isChecking: false }),
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('@/components/video-call/CallNotification', () => ({
  CallNotification: () => null,
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

const CALL_ID = 'call-initiator-timeout-abc';
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

// Mirrors what use-video-call.ts's `startCall` ack handler sets directly on
// the store — the initiator's own `currentCall` never comes from a socket
// event, so tests simulate the ack by calling `setCurrentCall` the same way.
function setInitiatorOwnCall(callId: string) {
  useCallStore.getState().setCurrentCall({
    id: callId,
    conversationId: 'conv-1',
    mode: 'p2p',
    status: 'initiated',
    initiatorId: 'user-caller-1',
    startedAt: new Date(),
    participants: [],
  } as never);
}

describe('CallManager — initiator no-answer timeout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    useCallStore.getState().reset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('arms the 30s no-answer timeout for the initiator even though call:initiated never reaches its own socket', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);

    act(() => {
      setInitiatorOwnCall(CALL_ID);
    });

    act(() => {
      jest.advanceTimersByTime(CALL_TIMEOUT_MS + 1);
    });

    const leaveEmit = socket.emit.mock.calls.find((c) => c[0] === CLIENT_EVENTS.CALL_LEAVE);
    expect(leaveEmit).toBeDefined();
    expect(leaveEmit?.[1]).toMatchObject({ callId: CALL_ID });
    expect(useCallStore.getState().isInCall).toBe(false);
  });

  it('does not fire the no-answer cleanup once the callee has joined', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);

    act(() => {
      setInitiatorOwnCall(CALL_ID);
    });

    act(() => {
      // Callee joins before the 30s window elapses — status flips to 'active'.
      useCallStore.getState().updateCallStatus('active');
    });

    act(() => {
      jest.advanceTimersByTime(CALL_TIMEOUT_MS + 1);
    });

    const leaveEmit = socket.emit.mock.calls.find((c) => c[0] === CLIENT_EVENTS.CALL_LEAVE);
    expect(leaveEmit).toBeUndefined();
  });
});
