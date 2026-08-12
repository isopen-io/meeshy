/**
 * CallPage (`app/call/[callId]/page.tsx`) — the auto-join effect never
 * actually cleaned up its socket listeners or join-timeout (2026-08-09)
 *
 * The effect registered `CALL_PARTICIPANT_JOINED`/`CALL_INITIATED` listeners
 * and a 10s join-timeout from inside an `async () => {...}` closure, then
 * called that closure as a bare statement (`joinCall();`) instead of
 * `return joinCall();`. React only ever runs a cleanup function it gets
 * back SYNCHRONOUSLY from the effect callback — a Promise's eventual
 * resolution value is invisible to it. The `useEffect` therefore had no
 * return statement of its own and always registered `undefined` as its
 * cleanup, so React never removed the listeners: not on unmount, not when
 * the effect re-ran on a `callId`/`currentCall` change. Every visit to this
 * route permanently stacked two more listeners onto the shared socket
 * singleton, each closing over a stale `callId` and stale state setters.
 */

import { render, waitFor } from '@testing-library/react';
import { SERVER_EVENTS, CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, isChecking: false }),
}));

jest.mock('@/components/video-calls/VideoCallInterface', () => ({
  VideoCallInterface: () => <div data-testid="video-call-interface" />,
}));

jest.mock('sonner', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: { getSocket: jest.fn() },
}));

import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { useCallStore } from '@/stores/call-store';
import CallPage from '@/app/call/[callId]/page';

const CALL_ID = 'call-cleanup-1';

type Handler = (...args: unknown[]) => void;

function makeFakeSocket() {
  const handlers: Record<string, Handler[]> = {};
  return {
    connected: true,
    id: 'fake-socket-id',
    emit: jest.fn((_event: string, _payload: unknown, ack?: (a: unknown) => void) => {
      ack?.({ success: true, data: {} });
    }),
    on: jest.fn((event: string, fn: Handler) => { (handlers[event] ||= []).push(fn); }),
    off: jest.fn((event: string, fn?: Handler) => {
      if (!fn) { handlers[event] = []; return; }
      handlers[event] = (handlers[event] || []).filter((h) => h !== fn);
    }),
    fire: (event: string, ...args: unknown[]) => { (handlers[event] || []).forEach((h) => h(...args)); },
  };
}

function participantJoinedEvent() {
  return {
    callId: CALL_ID,
    participant: { userId: 'user-2', username: 'other' },
    mode: 'p2p',
  };
}

// `page.tsx` reads `callId` via React 19's `use(params)`. `use()` special-cases
// a thenable that already carries React's own `status`/`value` bookkeeping
// (the same shape it stamps onto a promise the first time it observes one
// resolve) and returns synchronously instead of suspending — pre-stamping it
// here keeps these tests synchronous and avoids relying on jsdom scheduling
// an act()-safe Suspense retry, which Bun's Jest-compat is not the target of.
function resolvedParams(callId: string) {
  const promise = Promise.resolve({ callId }) as Promise<{ callId: string }> & {
    status: string;
    value: { callId: string };
  };
  promise.status = 'fulfilled';
  promise.value = { callId };
  return promise;
}

function renderCallPage() {
  return render(<CallPage params={resolvedParams(CALL_ID)} />);
}

describe('CallPage — join effect cleanup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useCallStore.getState().reset();
  });

  it('stops reacting to call:participant-joined once the page has unmounted', async () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    const { unmount } = renderCallPage();
    await waitFor(() => expect(socket.on).toHaveBeenCalled());

    unmount();

    socket.fire(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, participantJoinedEvent());

    expect(useCallStore.getState().isInCall).toBe(false);
  });

  it('removes both listeners it registered on unmount', async () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    const { unmount } = renderCallPage();
    await waitFor(() => expect(socket.on).toHaveBeenCalled());

    const joinedHandler = socket.on.mock.calls.find(
      ([event]: [string]) => event === SERVER_EVENTS.CALL_PARTICIPANT_JOINED
    )?.[1];
    const initiatedHandler = socket.on.mock.calls.find(
      ([event]: [string]) => event === SERVER_EVENTS.CALL_INITIATED
    )?.[1];

    expect(joinedHandler).toBeDefined();
    expect(initiatedHandler).toBeDefined();

    unmount();

    expect(socket.off).toHaveBeenCalledWith(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, joinedHandler);
    expect(socket.off).toHaveBeenCalledWith(SERVER_EVENTS.CALL_INITIATED, initiatedHandler);
  });

  it('still joins normally: emits call:join and flips inCall when the participant-joined event arrives', async () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    renderCallPage();

    await waitFor(() =>
      expect(socket.emit).toHaveBeenCalledWith(
        CLIENT_EVENTS.CALL_JOIN,
        expect.objectContaining({ callId: CALL_ID }),
        expect.any(Function)
      )
    );

    socket.fire(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, participantJoinedEvent());

    expect(useCallStore.getState().isInCall).toBe(true);
  });
});
