/**
 * CallManager (production call orchestrator, mounted at app/call/[callId]/page.tsx)
 * — CALL_PARTICIPANT_LEFT ownership (regression, calls routine Vague 79)
 *
 * `VideoCallInterface` owns WebRTC-level teardown for a departed participant:
 * its own `CALL_PARTICIPANT_LEFT` listener (VideoCallInterface.tsx) delays
 * cleanup 2s and snapshots the peer connection at leave-time so a same-session
 * rejoin (network blip, tab reload) within that grace window is detected and
 * left alone, and it clears `useWebRTCP2P`'s per-participant maps
 * (`webrtcServicesRef`/`remoteDescriptionSetRef`/`iceCandidateQueueRef`/
 * `offerInFlightRef`) via its own `removeParticipant` — not just the peer
 * connection object.
 *
 * CallManager used to run its OWN, synchronous, ungraced teardown for the
 * exact same event — `removeRemoteStream`/`removePeerConnection` straight
 * from the store, with no rejoin awareness — racing ahead of and duplicating
 * VideoCallInterface's grace window. Since Socket.IO invokes listeners for
 * the same event in registration order and CallManager's listener is
 * attached unconditionally on mount (before any call is even active),
 * CallManager's teardown always ran FIRST, closing the RTCPeerConnection at
 * t=0 while `use-webrtc-p2p.ts`'s internal maps stayed stale for up to 2s
 * (or indefinitely across the grace window's rejoin-detection). A rejoin's
 * fresh offer arriving in that window got misrouted through the "existing
 * connection" renegotiation branch against an already-closed connection —
 * `setRemoteDescription` on a closed `RTCPeerConnection` throws, surfaced
 * only as a toast, and the reconnect silently and permanently failed until
 * the whole call was manually restarted.
 *
 * CallManager's own handler must now update ONLY the store's participant
 * list (`removeParticipant`, DB-participant-id-keyed) — never touch
 * `remoteStreams`/`peerConnections` (userId-keyed) directly.
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

const CALL_ID = 'call-participant-left-abc';
const DEPARTING_PARTICIPANT_ID = 'db-participant-1';
const DEPARTING_USER_ID = 'peer-1';

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

function setActiveCallWithParticipant() {
  useCallStore.getState().setCurrentCall({
    id: CALL_ID,
    conversationId: 'conv-1',
    mode: 'p2p',
    status: 'active',
    initiatorId: 'user-1',
    startedAt: new Date(),
    participants: [
      {
        id: DEPARTING_PARTICIPANT_ID,
        callSessionId: CALL_ID,
        userId: DEPARTING_USER_ID,
        role: 'callee',
        joinedAt: new Date(),
        isAudioEnabled: true,
        isVideoEnabled: true,
      },
    ],
  } as never);
}

function makeFakePeerConnection(): RTCPeerConnection {
  return { close: jest.fn() } as unknown as RTCPeerConnection;
}

function makeFakeRemoteStream(): MediaStream {
  return { getTracks: () => [{ stop: jest.fn() }] } as unknown as MediaStream;
}

describe('CallManager — CALL_PARTICIPANT_LEFT ownership', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useCallStore.getState().reset();
  });

  it('removes the departed participant from the call participant list', () => {
    const socket = makeFakeSocket(true);
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);
    setActiveCallWithParticipant();
    expect(useCallStore.getState().currentCall?.participants).toHaveLength(1);

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_PARTICIPANT_LEFT, {
        callId: CALL_ID,
        participantId: DEPARTING_PARTICIPANT_ID,
        userId: DEPARTING_USER_ID,
        mode: 'p2p',
      });
    });

    expect(useCallStore.getState().currentCall?.participants).toHaveLength(0);
  });

  it('does NOT close the peer connection or stop the remote stream directly — VideoCallInterface owns that, grace-windowed', () => {
    const socket = makeFakeSocket(true);
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);
    setActiveCallWithParticipant();

    const connection = makeFakePeerConnection();
    const stream = makeFakeRemoteStream();
    act(() => {
      useCallStore.getState().addPeerConnection(DEPARTING_USER_ID, connection);
      useCallStore.getState().addRemoteStream(DEPARTING_USER_ID, stream);
    });

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_PARTICIPANT_LEFT, {
        callId: CALL_ID,
        participantId: DEPARTING_PARTICIPANT_ID,
        userId: DEPARTING_USER_ID,
        mode: 'p2p',
      });
    });

    // Untouched by CallManager: still in the store, connection never closed.
    expect(useCallStore.getState().peerConnections.get(DEPARTING_USER_ID)).toBe(connection);
    expect(connection.close).not.toHaveBeenCalled();
    expect(useCallStore.getState().remoteStreams.get(DEPARTING_USER_ID)).toBe(stream);
  });
});
