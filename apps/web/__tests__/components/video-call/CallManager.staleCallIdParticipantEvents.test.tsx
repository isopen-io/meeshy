/**
 * CallManager — `call:participant-joined` / `call:participant-left` /
 * `call:media-toggled` for a stale/unrelated callId must not mutate the
 * CURRENT call's roster (continuous-improvement audit, Vague 160).
 *
 * `handleCallEnded` already guards itself against a stale callId (see
 * `CallManager.callEndedStaleGuard.test.tsx`, Vague ~80): a `call:ended` for
 * a callId this client isn't tracking as `currentCall` is ignored rather than
 * torn down. `handleParticipantJoined`/`handleParticipantLeft`/
 * `handleMediaToggle` never received that same guard, even though all three
 * events carry a `callId` field for exactly this purpose
 * (`CallParticipantJoinedEvent`/`CallParticipantLeftEvent`/
 * `CallMediaToggleEvent`, packages/shared/types/video-call.ts) and every
 * other call-scoped socket listener in the app enforces it
 * (`use-webrtc-p2p.ts`'s CALL_SIGNAL/CALL_ICE_SERVERS_REFRESHED,
 * use-call-captions.ts, use-remote-call-alerts.ts,
 * VideoCallInterface.tsx's own CALL_PARTICIPANT_LEFT listener).
 *
 * The call-waiting "End & Answer" swap (`handleEndAndAnswerWaiting`) emits
 * `CALL_LEAVE` for the outgoing call WITHOUT awaiting an ack, then
 * synchronously moves `currentCall` to the waiting call. The left call
 * keeps running for its other participants (group call) until the server
 * processes the leave — an ordinary race lets a `call:participant-joined` /
 * `-left` / `-toggled` broadcast for the OLD call reach this socket after
 * `currentCall` already points at the NEW call, silently splicing the old
 * call's roster changes into the new call.
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

const CURRENT_CALL_ID = 'current-call-abc';
const STALE_CALL_ID = 'stale-old-call-xyz';
const CURRENT_PARTICIPANT_ID = 'db-participant-current-1';
const CURRENT_PEER_USER_ID = 'peer-current-1';

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

function setCurrentCallWithPeer() {
  useCallStore.getState().setCurrentCall({
    id: CURRENT_CALL_ID,
    conversationId: 'conv-current',
    mode: 'p2p',
    status: 'active',
    initiatorId: 'user-1',
    startedAt: new Date(),
    participants: [
      {
        id: CURRENT_PARTICIPANT_ID,
        callSessionId: CURRENT_CALL_ID,
        userId: CURRENT_PEER_USER_ID,
        participantId: CURRENT_PEER_USER_ID,
        role: 'callee',
        joinedAt: new Date(),
        isAudioEnabled: true,
        isVideoEnabled: true,
      },
    ],
  } as never);
}

describe('CallManager — stale-callId guard on participant-joined/left/media-toggled', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useCallStore.getState().reset();
  });

  it('does not add a stale call’s joining participant to the current call roster', () => {
    const socket = makeFakeSocket(true);
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);
    setCurrentCallWithPeer();

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_PARTICIPANT_JOINED, {
        callId: STALE_CALL_ID,
        mode: 'p2p',
        participant: {
          id: 'db-participant-intruder',
          callSessionId: STALE_CALL_ID,
          userId: 'peer-intruder',
          participantId: 'peer-intruder',
          role: 'callee',
          joinedAt: new Date(),
          isAudioEnabled: true,
          isVideoEnabled: true,
        },
      });
    });

    const participants = useCallStore.getState().currentCall?.participants ?? [];
    expect(participants).toHaveLength(1);
    expect(participants[0]?.id).toBe(CURRENT_PARTICIPANT_ID);
  });

  it('does not remove a current-call participant when a stale call’s participant-left arrives with a colliding participantId', () => {
    const socket = makeFakeSocket(true);
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);
    setCurrentCallWithPeer();

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_PARTICIPANT_LEFT, {
        callId: STALE_CALL_ID,
        // Deliberately COLLIDES with the current call's own roster entry id
        // — proves the guard checks callId, not just participant identity.
        participantId: CURRENT_PARTICIPANT_ID,
        userId: CURRENT_PEER_USER_ID,
        mode: 'p2p',
      });
    });

    expect(useCallStore.getState().currentCall?.participants).toHaveLength(1);
  });

  it('does not apply a stale call’s media-toggle to the current call’s matching participant', () => {
    const socket = makeFakeSocket(true);
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);
    setCurrentCallWithPeer();

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_MEDIA_TOGGLED, {
        callId: STALE_CALL_ID,
        // Same identity as the current call's own peer — proves the guard
        // checks callId, not just participant identity resolution.
        participantId: CURRENT_PEER_USER_ID,
        userId: CURRENT_PEER_USER_ID,
        mediaType: 'audio',
        enabled: false,
      });
    });

    const participant = useCallStore.getState().currentCall?.participants.find(
      (p) => p.id === CURRENT_PARTICIPANT_ID
    );
    expect(participant?.isAudioEnabled).toBe(true);
  });

  it('still applies participant-joined/left/media-toggled when the callId matches the current call', () => {
    const socket = makeFakeSocket(true);
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);
    setCurrentCallWithPeer();

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_MEDIA_TOGGLED, {
        callId: CURRENT_CALL_ID,
        participantId: CURRENT_PEER_USER_ID,
        userId: CURRENT_PEER_USER_ID,
        mediaType: 'audio',
        enabled: false,
      });
    });

    let participant = useCallStore.getState().currentCall?.participants.find(
      (p) => p.id === CURRENT_PARTICIPANT_ID
    );
    expect(participant?.isAudioEnabled).toBe(false);

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_PARTICIPANT_LEFT, {
        callId: CURRENT_CALL_ID,
        participantId: CURRENT_PARTICIPANT_ID,
        userId: CURRENT_PEER_USER_ID,
        mode: 'p2p',
      });
    });

    expect(useCallStore.getState().currentCall?.participants).toHaveLength(0);
  });
});
