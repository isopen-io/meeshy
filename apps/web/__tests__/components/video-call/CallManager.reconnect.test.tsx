/**
 * CallManager (production call orchestrator, mounted at app/call/[callId]/page.tsx)
 * — reconnect re-join (CALL-RESILIENCE)
 *
 * A voice/video call's media is direct peer-to-peer; a transient loss of the
 * signaling socket (network blip, gateway restart) does NOT sever it. On
 * reconnect the web client must re-enter the call room so relayed signaling
 * (and the gateway's disconnect-grace bookkeeping) survives — otherwise the
 * gateway's grace window expires and force-ends an otherwise-healthy call.
 *
 * CallManager is the component that actually ships, so the rejoin logic
 * lives here (a duplicate, never-mounted sibling hook — `useCallSignaling`,
 * `components/video-calls/hooks/` — was removed; see
 * tasks/calls-fonctionnel-todo.md wave 10).
 */

import { render } from '@testing-library/react';
import { act } from 'react';
import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, isChecking: false }),
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

const CALL_ID = 'call-reconnect-abc';

type Handler = (...args: unknown[]) => void;

function makeFakeSocket(connected: boolean) {
  const handlers: Record<string, Handler[]> = {};
  return {
    connected,
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

function lastJoinEmit(socket: ReturnType<typeof makeFakeSocket>) {
  return socket.emit.mock.calls.find((c) => c[0] === CLIENT_EVENTS.CALL_JOIN);
}

function setActiveCall(callId: string) {
  useCallStore.getState().setCurrentCall({
    id: callId,
    conversationId: 'conv-1',
    mode: 'p2p',
    status: 'active',
    initiatorId: 'user-1',
    startedAt: new Date(),
    participants: [],
  } as never);
}

describe('CallManager — reconnect re-join', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useCallStore.getState().reset();
  });

  it('re-emits call:join for the active call on a genuine reconnect (2nd connect)', () => {
    const socket = makeFakeSocket(true); // already connected at mount → initial seen
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);
    setActiveCall(CALL_ID);

    act(() => {
      socket.fire('connect'); // reconnect
    });

    const emitCall = lastJoinEmit(socket);
    expect(emitCall).toBeDefined();
    expect(emitCall?.[1]).toMatchObject({ callId: CALL_ID });
  });

  it('does NOT re-join on the very first connect (nothing to recover yet)', () => {
    const socket = makeFakeSocket(false); // not connected at mount
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);
    setActiveCall(CALL_ID);

    act(() => {
      socket.fire('connect'); // first-ever connect for this effect instance
    });

    expect(lastJoinEmit(socket)).toBeUndefined();
  });

  it('does NOT re-join when there is no active call', () => {
    const socket = makeFakeSocket(true);
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);
    // isInCall stays false — no setActiveCall() call

    act(() => {
      socket.fire('connect');
    });

    expect(lastJoinEmit(socket)).toBeUndefined();
  });

  it('tears the call down when the reconnect re-join is rejected with CALL_ENDED', () => {
    const socket = makeFakeSocket(true);
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);
    socket.emit.mockImplementation((event: string, _payload: unknown, ack?: Handler) => {
      if (event === CLIENT_EVENTS.CALL_JOIN && ack) {
        ack({ success: false, error: { code: 'CALL_ENDED', message: 'Call has ended' } });
      }
    });

    render(<CallManager />);
    setActiveCall(CALL_ID);
    expect(useCallStore.getState().isInCall).toBe(true);

    act(() => {
      socket.fire('connect');
    });

    expect(useCallStore.getState().isInCall).toBe(false);
  });
});
