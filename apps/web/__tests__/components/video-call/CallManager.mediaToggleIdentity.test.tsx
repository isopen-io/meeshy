/**
 * CallManager (production call orchestrator, mounted at app/call/[callId]/page.tsx)
 * — CALL_MEDIA_TOGGLED identity resolution (regression, calls routine Vague 140)
 *
 * `call:media-toggled`'s `participantId` field is `CallParticipant.participantId`
 * (the FK to `Participant.id`) — never the roster entry's own `.id`
 * (`CallParticipant.id`, its primary key), which is the ONLY field
 * `call-store.ts`'s `updateParticipant` matches against. Passing
 * `event.participantId` straight through to `updateParticipant` therefore
 * never finds the roster entry for a registered peer: the remote
 * mute/camera indicator silently never updates for the rest of the call.
 *
 * CallManager's handler must resolve the roster entry the same way every
 * other remote-peer lookup already does — `p.userId || p.participantId`
 * (VideoCallInterface.tsx / useRemoteCallAlerts, Vague 132) — using
 * `event.userId || event.participantId` as the identity, then update that
 * roster entry by its actual `.id`.
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

const CALL_ID = 'call-media-toggle-abc';
// The roster entry's OWN primary key — deliberately DIFFERENT from the
// event's `participantId` FK below, exactly like a real registered peer.
const ROSTER_ENTRY_ID = 'call-participant-row-1';
const PEER_USER_ID = 'peer-9';
const PEER_PARTICIPANT_FK = 'participant-fk-9';

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

function setActiveCallWithPeer() {
  useCallStore.getState().setCurrentCall({
    id: CALL_ID,
    conversationId: 'conv-1',
    mode: 'p2p',
    status: 'active',
    initiatorId: 'user-1',
    startedAt: new Date(),
    participants: [
      {
        id: ROSTER_ENTRY_ID,
        callSessionId: CALL_ID,
        userId: PEER_USER_ID,
        participantId: PEER_PARTICIPANT_FK,
        role: 'callee',
        joinedAt: new Date(),
        isAudioEnabled: true,
        isVideoEnabled: true,
      },
    ],
  } as never);
}

describe('CallManager — CALL_MEDIA_TOGGLED identity resolution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useCallStore.getState().reset();
  });

  it('updates the peer roster entry by userId when the event carries one', () => {
    const socket = makeFakeSocket(true);
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);
    setActiveCallWithPeer();

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_MEDIA_TOGGLED, {
        callId: CALL_ID,
        participantId: PEER_PARTICIPANT_FK,
        userId: PEER_USER_ID,
        mediaType: 'audio',
        enabled: false,
      });
    });

    const participant = useCallStore.getState().currentCall?.participants.find(
      (p) => p.id === ROSTER_ENTRY_ID
    );
    expect(participant?.isAudioEnabled).toBe(false);
  });

  it('falls back to participantId when the event carries no userId (anonymous guest, whose roster userId already equals its participantId)', () => {
    const socket = makeFakeSocket(true);
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);
    // Anonymous guest: `toCallParticipantResponse` derives `.userId` as
    // `participant.userId ?? participant.participant?.userId ?? participantId`
    // — with no linked User row, it falls back to the participantId FK
    // itself, so the roster entry's `.userId` and `.participantId` coincide.
    useCallStore.getState().setCurrentCall({
      id: CALL_ID,
      conversationId: 'conv-1',
      mode: 'p2p',
      status: 'active',
      initiatorId: 'user-1',
      startedAt: new Date(),
      participants: [
        {
          id: ROSTER_ENTRY_ID,
          callSessionId: CALL_ID,
          userId: PEER_PARTICIPANT_FK,
          participantId: PEER_PARTICIPANT_FK,
          role: 'callee',
          joinedAt: new Date(),
          isAudioEnabled: true,
          isVideoEnabled: true,
        },
      ],
    } as never);

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_MEDIA_TOGGLED, {
        callId: CALL_ID,
        participantId: PEER_PARTICIPANT_FK,
        mediaType: 'video',
        enabled: false,
      });
    });

    const participant = useCallStore.getState().currentCall?.participants.find(
      (p) => p.id === ROSTER_ENTRY_ID
    );
    expect(participant?.isVideoEnabled).toBe(false);
  });

  it('is a no-op when no roster entry matches either identity (stale/unknown peer)', () => {
    const socket = makeFakeSocket(true);
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);
    setActiveCallWithPeer();

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_MEDIA_TOGGLED, {
        callId: CALL_ID,
        participantId: 'some-other-unrelated-fk',
        userId: 'some-other-unrelated-user',
        mediaType: 'audio',
        enabled: false,
      });
    });

    const participant = useCallStore.getState().currentCall?.participants.find(
      (p) => p.id === ROSTER_ENTRY_ID
    );
    expect(participant?.isAudioEnabled).toBe(true);
  });
});
