/**
 * CallManager — `call:ended` never offered a retry (2026-07-12, Vague 40)
 *
 * The retry-on-failure feature (7e6ea5d49) added `isRetryableCallFailure` +
 * `offerCallRetry`, but its ONLY production call site was
 * VideoCallInterface's local connect watchdog (never-connected-within-45s).
 * The server-authoritative path — `call:ended` with a `reason`, handled by
 * `CallManager.handleCallEnded` — never read `event.reason` at all, so the
 * majority real-world transient-failure case (an established call dropped by
 * the network, resolved server-side to `failed`/`connectionLost`) never got
 * the « Réessayer » offer the feature was built for.
 */

import { render } from '@testing-library/react';
import { act } from 'react';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { CallEndedEvent, CallEndReason } from '@meeshy/shared/types/video-call';

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

const CALL_ID = 'call-ended-retry-abc';
const CONVERSATION_ID = 'conv-ended-retry-1';

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

function setActiveCall(videoEnabled: boolean) {
  useCallStore.getState().setCurrentCall({
    id: CALL_ID,
    conversationId: CONVERSATION_ID,
    mode: 'p2p',
    status: 'active',
    initiatorId: 'user-1',
    startedAt: new Date(),
    participants: [],
  } as never);
  useCallStore.getState().setControls({ videoEnabled });
}

function makeCallEndedEvent(reason: CallEndReason): CallEndedEvent {
  return { callId: CALL_ID, duration: 42, endedBy: 'user-2', reason };
}

describe('CallManager — call:ended retry offer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useCallStore.getState().reset();
    // `reset()` deliberately PRESERVES `pendingRetry` across calls (it must
    // survive the very teardown a retry offer is posted during) — clear it
    // explicitly between tests so one case's offer can't leak into the next.
    useCallStore.getState().clearCallRetry();
  });

  it.each<[CallEndReason, 'audio' | 'video']>([
    ['failed', 'audio'],
    ['connectionLost', 'video'],
  ])(
    'offers a retry when an active call ends with the transient reason %s',
    (reason, callType) => {
      const socket = makeFakeSocket();
      (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);
      setActiveCall(callType === 'video');

      render(<CallManager />);

      act(() => {
        socket.fire(SERVER_EVENTS.CALL_ENDED, makeCallEndedEvent(reason));
      });

      expect(useCallStore.getState().pendingRetry).toEqual({
        conversationId: CONVERSATION_ID,
        type: callType,
      });
    }
  );

  it.each<CallEndReason>(['completed', 'missed', 'rejected', 'heartbeatTimeout', 'garbageCollected'])(
    'does NOT offer a retry for the non-transient reason %s',
    (reason) => {
      const socket = makeFakeSocket();
      (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);
      setActiveCall(true);

      render(<CallManager />);

      act(() => {
        socket.fire(SERVER_EVENTS.CALL_ENDED, makeCallEndedEvent(reason));
      });

      expect(useCallStore.getState().pendingRetry).toBeNull();
    }
  );

  it('still resets call state and clears the incoming-call banner on a transient-reason end', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);
    setActiveCall(true);

    render(<CallManager />);

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_ENDED, makeCallEndedEvent('failed'));
    });

    expect(useCallStore.getState().currentCall).toBeNull();
    expect(useCallStore.getState().isInCall).toBe(false);
  });
});
