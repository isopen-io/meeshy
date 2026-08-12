/**
 * CallManager — the caller's live call-duration clock must anchor on
 * `answeredAt` (when the call was actually picked up), never `startedAt`
 * (when the callee's phone started ringing).
 *
 * Root cause (Vague 110, 2026-08-12): `use-video-call.ts`'s `startCall`
 * stamps `currentCall.startedAt = new Date()` the instant the caller's own
 * `call:initiate` ack succeeds — i.e. when the callee's device starts
 * ringing, not when they pick up. `VideoCallInterface` feeds that same
 * `startedAt` straight into `useCallDuration()` with no gate on call status,
 * so the caller's on-screen clock starts ticking immediately: if the callee
 * rings for 12s before answering, the caller's clock already reads "0:12"
 * the instant the call connects, and every subsequent second inherits that
 * offset for the rest of the call.
 *
 * `CallSession.answeredAt` (packages/shared/types/video-call.ts) exists
 * precisely for this — it's what the gateway anchors terminal-call
 * `duration` on server-side (Vagues 25/27/30/105/106) — but nothing under
 * apps/web ever populated it. This suite pins the callee's own
 * `acceptOrJoinCall` (they just answered).
 *
 * The CALLER side (originally stamped here too, in `handleParticipantJoined`
 * on `call:participant-joined`) was moved in Vague 113 (2026-08-12) to
 * `useWebRTCP2P`'s `handleAnswer` — see
 * `__tests__/hooks/use-webrtc-p2p.test.tsx`, "Handle Answer stamps the
 * caller's answeredAt/active". Root cause: iOS deliberately auto-early-joins
 * the call room the instant it receives an incoming call, to receive the
 * SDP offer while still ringing — so `call:participant-joined` fires long
 * before a human answers, and Vague 110's own fix was silently defeated for
 * every call to an iOS callee. The genuine pickup signal is the SDP
 * *answer*, which only a real Accept sends.
 */

import { render, act, fireEvent, screen } from '@testing-library/react';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, isChecking: false }),
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('@/components/video-call/CallNotification', () => ({
  CallNotification: (props: { onAccept: () => void }) => (
    <button data-testid="accept-call-btn" onClick={props.onAccept}>
      Accept
    </button>
  ),
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

const CALL_ID = 'call-answered-at-abc';

type Handler = (...args: unknown[]) => void;
type JoinAck = { success: boolean; data?: { iceServers?: unknown[] }; error?: unknown };

function makeFakeSocket() {
  const handlers: Record<string, Handler[]> = {};
  let capturedJoinAck: ((response: JoinAck) => void) | undefined;
  return {
    connected: true,
    id: 'fake-socket-id',
    emit: jest.fn((event: string, _payload: unknown, ack?: (r: JoinAck) => void) => {
      if (event === CLIENT_EVENTS.CALL_JOIN) capturedJoinAck = ack;
    }),
    on: jest.fn((event: string, fn: Handler) => {
      (handlers[event] ||= []).push(fn);
    }),
    off: jest.fn((event: string, fn?: Handler) => {
      if (!fn) { handlers[event] = []; return; }
      handlers[event] = (handlers[event] || []).filter((h) => h !== fn);
    }),
    onAny: jest.fn(),
    offAny: jest.fn(),
    fire: (event: string, ...args: unknown[]) => {
      (handlers[event] || []).forEach((h) => h(...args));
    },
    resolveJoin: (response: JoinAck) => capturedJoinAck?.(response),
  };
}

function incomingCallEvent(type: 'audio' | 'video' = 'audio') {
  return {
    callId: CALL_ID,
    conversationId: 'conv-1',
    mode: 'p2p',
    type,
    initiator: { userId: 'user-2', username: 'caller' },
    participants: [],
  };
}

function makeFakeStream() {
  return { getTracks: jest.fn(() => [{ stop: jest.fn() }, { stop: jest.fn() }]) };
}

const mockGetUserMedia = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  useCallStore.getState().reset();

  mockGetUserMedia.mockResolvedValue(makeFakeStream());
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: mockGetUserMedia },
    writable: true,
    configurable: true,
  });
  delete (window as any).__preauthorizedMediaStream;
});

describe('CallManager — callee: acceptOrJoinCall stamps answeredAt', () => {
  it('sets currentCall.answeredAt the moment the callee answers', async () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_INITIATED, incomingCallEvent());
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('accept-call-btn'));
    });

    await act(async () => {
      socket.resolveJoin({ success: true, data: { iceServers: [] } });
    });

    const { currentCall } = useCallStore.getState();
    expect(currentCall?.status).toBe('active');
    expect(currentCall?.answeredAt).toBeInstanceOf(Date);
  });
});

describe('CallManager — caller: call:participant-joined never stamps answeredAt/active (Vague 113)', () => {
  it('leaves status "initiated" and answeredAt unset on room-join — a real answer, not a room-join, must stamp it', async () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);

    // CallManager's own isInitiator branch is unreachable on web (the
    // gateway never re-emits call:initiated to the initiator's own socket —
    // see use-video-call.ts). Seed the ringing call the same way
    // use-video-call.ts's ack handler does: status 'initiated', no
    // answeredAt yet.
    act(() => {
      useCallStore.getState().setCurrentCall({
        id: CALL_ID,
        conversationId: 'conv-1',
        mode: 'p2p',
        status: 'initiated',
        initiatorId: 'user-1',
        startedAt: new Date(),
        participants: [],
      } as any);
      useCallStore.getState().setInCall(true);
    });

    expect(useCallStore.getState().currentCall?.answeredAt).toBeUndefined();

    // A room-join (iOS auto-early-joins to receive the offer while ringing,
    // or any other participant entering the call room) must NOT be treated
    // as a real answer on its own — only `useWebRTCP2P`'s `handleAnswer`
    // (the genuine SDP answer) may flip status/answeredAt. See
    // __tests__/hooks/use-webrtc-p2p.test.tsx for that contract.
    act(() => {
      socket.fire(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, {
        callId: CALL_ID,
        participant: { id: 'user-2', userId: 'user-2', joinedAt: new Date() },
      });
    });

    const { currentCall } = useCallStore.getState();
    expect(currentCall?.status).toBe('initiated');
    expect(currentCall?.answeredAt).toBeUndefined();
  });
});
