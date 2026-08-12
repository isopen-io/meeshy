/**
 * CallManager — the caller's 45s no-answer timeout was disarmed by an
 * iOS early room-join, not by a real answer (Vague 114, 2026-08-12)
 *
 * Vague 113 moved the "answered" stamp (`status: 'active'` / `answeredAt`)
 * off `call:participant-joined` and onto `useWebRTCP2P`'s `handleAnswer` —
 * because iOS deliberately auto-joins the call room the instant it RECEIVES
 * an incoming call (`CallManager.swift` `joinCallRoomReliably`, fired while
 * still ringing, to receive the SDP offer early), long before a human taps
 * Accept.
 *
 * `handleParticipantJoined`'s `clearCallTimeout()` call was left behind and
 * never moved with it: the caller's 45s no-answer auto-hangup timer
 * (`startCallTimeout`) was still disarmed the instant that same early-join
 * event arrived — i.e. the moment an iOS callee's phone started ringing,
 * not when they picked up. An iOS callee who never answers therefore left
 * the caller ringing forever (no local auto-cleanup; only the gateway's own
 * 60s server-side ringing timeout would eventually intervene).
 *
 * See tasks/calls-fonctionnel-todo.md Vague 114.
 */

import { render } from '@testing-library/react';
import { act } from 'react';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { CallParticipantJoinedEvent } from '@meeshy/shared/types/video-call';

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

const CALL_ID = 'call-early-join-abc';
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

// Mirrors what use-video-call.ts's `startCall` ack handler sets directly on
// the store — the initiator's own `currentCall` never comes from a socket
// event (see CallManager.initiatorTimeout.test.tsx).
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

function makeParticipantJoinedEvent(): CallParticipantJoinedEvent {
  return {
    callId: CALL_ID,
    mode: 'p2p',
    participant: {
      id: 'participant-callee-1',
      callSessionId: CALL_ID,
      userId: 'user-callee-1',
      role: 'callee',
      joinedAt: new Date(),
      isAudioEnabled: true,
      isVideoEnabled: false,
    } as never,
  };
}

describe('CallManager — no-answer timeout survives an early room-join', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    useCallStore.getState().reset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('still auto-hangs-up after 45s when a participant-joined event fires but the call never actually answers (iOS early-join, no real Accept)', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);

    act(() => {
      setInitiatorOwnCall(CALL_ID);
    });

    act(() => {
      // Simulates iOS's early room-join, fired while the callee's phone is
      // still ringing — NOT a real answer. Vague 113 stopped this event from
      // stamping `status: 'active'`, so the call correctly stays 'initiated'.
      socket.fire(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, makeParticipantJoinedEvent());
    });

    expect(useCallStore.getState().currentCall?.status).toBe('initiated');

    act(() => {
      jest.advanceTimersByTime(CALL_TIMEOUT_MS + 1);
    });

    const leaveEmit = socket.emit.mock.calls.find((c) => c[0] === CLIENT_EVENTS.CALL_LEAVE);
    expect(leaveEmit).toBeDefined();
    expect(leaveEmit?.[1]).toMatchObject({ callId: CALL_ID });
    expect(useCallStore.getState().isInCall).toBe(false);
  });

  it('does not auto-hang-up once the call genuinely answers after an early join (status flips to active)', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);

    act(() => {
      setInitiatorOwnCall(CALL_ID);
    });

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, makeParticipantJoinedEvent());
    });

    act(() => {
      // Mirrors useWebRTCP2P's handleAnswer (Vague 113) — the real answer
      // signal, arriving some time after the early join.
      useCallStore.getState().updateCallStatus('active');
    });

    act(() => {
      jest.advanceTimersByTime(CALL_TIMEOUT_MS + 1);
    });

    const leaveEmit = socket.emit.mock.calls.find((c) => c[0] === CLIENT_EVENTS.CALL_LEAVE);
    expect(leaveEmit).toBeUndefined();
  });

  it('still adds the early-joined participant to the call (no regression on the room-join handling itself)', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);

    act(() => {
      setInitiatorOwnCall(CALL_ID);
    });

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, makeParticipantJoinedEvent());
    });

    expect(useCallStore.getState().currentCall?.participants).toHaveLength(1);
    expect(useCallStore.getState().currentCall?.participants[0]?.id).toBe('participant-callee-1');
  });
});
