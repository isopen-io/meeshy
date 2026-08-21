/**
 * CallManager (production call orchestrator, mounted at app/call/[callId]/page.tsx)
 * — CALL_MEDIA_TOGGLED identity-space mismatch (routine calling-feature, Vague 136)
 *
 * `handleMediaToggle` used to call `updateParticipant(event.participantId, ...)`
 * straight from the wire event. The gateway resolves `event.participantId` via
 * `resolveActiveCallParticipantId` — `CallParticipant.participantId`, the FK to
 * `Participant.id` — but the store's roster keys every entry by
 * `CallParticipant.id` (its own row id, see `addParticipant`/`removeParticipant`
 * in `call-store.ts`). These are two disjoint ObjectId spaces (Prisma schema:
 * `CallParticipant.id` vs. `CallParticipant.participantId`): for a real call the
 * lookup in `updateParticipant` never matches, so a remote peer's mute/camera-off
 * state silently never updates the roster — same bug CLASS as Vague 132/133
 * (identity-space mismatch), on the media-toggle channel, which neither of those
 * waves touched.
 *
 * Fix mirrors the Vague 132 pattern exactly: the gateway now also resolves and
 * sends `userId` (a real `User.id` for a registered peer, falling back to the
 * legacy FK for an anonymous participant — `resolveActiveCallParticipant`,
 * already used by the quality/screen-capture alerts). `handleMediaToggle`
 * resolves the roster entry via `(p.userId || p.participantId) === (event.userId
 * || event.participantId)` — the same identity resolution `resolveParticipantName`
 * already uses in `VideoCallInterface.tsx` — then updates it by its OWN `.id`,
 * keeping `call-store.ts`'s `updateParticipant` contract (keyed by
 * `CallParticipant.id`) unchanged for every other caller.
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
// CallParticipant.id — the row's own id, what the roster keys on.
const PARTICIPANT_ROW_ID = 'db-participant-2';
// User.id — what a REGISTERED peer's roster entry carries as `.userId`.
const PEER_USER_ID = 'peer-2';
// CallParticipant.participantId — the legacy FK space the gateway used to send
// as the event's ONLY identity, disjoint from both ids above.
const PEER_LEGACY_FK_ID = 'participant-fk-2';

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

function setActiveCallWithParticipant(rosterUserId: string) {
  useCallStore.getState().setCurrentCall({
    id: CALL_ID,
    conversationId: 'conv-1',
    mode: 'p2p',
    status: 'active',
    initiatorId: 'user-1',
    startedAt: new Date(),
    participants: [
      {
        id: PARTICIPANT_ROW_ID,
        callSessionId: CALL_ID,
        userId: rosterUserId,
        role: 'callee',
        joinedAt: new Date(),
        isAudioEnabled: true,
        isVideoEnabled: true,
      },
    ],
  } as never);
}

describe('CallManager — CALL_MEDIA_TOGGLED identity-space (Vague 136)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useCallStore.getState().reset();
  });

  it('mutes the correct remote tile for a REGISTERED peer, resolved via userId', () => {
    const socket = makeFakeSocket(true);
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);
    setActiveCallWithParticipant(PEER_USER_ID);

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_MEDIA_TOGGLED, {
        callId: CALL_ID,
        participantId: PEER_LEGACY_FK_ID,
        userId: PEER_USER_ID,
        mediaType: 'audio',
        enabled: false,
      });
    });

    const participant = useCallStore
      .getState()
      .currentCall?.participants.find((p) => p.id === PARTICIPANT_ROW_ID);
    expect(participant?.isAudioEnabled).toBe(false);
  });

  it('flips the video-off flag for the correct remote tile, resolved via userId', () => {
    const socket = makeFakeSocket(true);
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);
    setActiveCallWithParticipant(PEER_USER_ID);

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_MEDIA_TOGGLED, {
        callId: CALL_ID,
        participantId: PEER_LEGACY_FK_ID,
        userId: PEER_USER_ID,
        mediaType: 'video',
        enabled: false,
      });
    });

    const participant = useCallStore
      .getState()
      .currentCall?.participants.find((p) => p.id === PARTICIPANT_ROW_ID);
    expect(participant?.isVideoEnabled).toBe(false);
  });

  it('falls back to participantId when the gateway omits userId (anonymous peer, legacy payload)', () => {
    const socket = makeFakeSocket(true);
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);
    // An anonymous roster entry's `.userId` already falls back to the
    // Participant FK at join time (see CallEventsHandler's joinedEvent
    // mapping) — mirror that here, and omit `userId` from the wire event
    // entirely, matching a not-yet-refreshed sender or an anonymous toggler.
    setActiveCallWithParticipant(PEER_LEGACY_FK_ID);

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_MEDIA_TOGGLED, {
        callId: CALL_ID,
        participantId: PEER_LEGACY_FK_ID,
        mediaType: 'audio',
        enabled: false,
      });
    });

    const participant = useCallStore
      .getState()
      .currentCall?.participants.find((p) => p.id === PARTICIPANT_ROW_ID);
    expect(participant?.isAudioEnabled).toBe(false);
  });

  it('is a no-op (never throws, never mutates an unrelated tile) when no roster entry matches', () => {
    const socket = makeFakeSocket(true);
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);
    setActiveCallWithParticipant(PEER_USER_ID);

    expect(() => {
      act(() => {
        socket.fire(SERVER_EVENTS.CALL_MEDIA_TOGGLED, {
          callId: CALL_ID,
          participantId: 'someone-else-entirely',
          userId: 'someone-else-entirely',
          mediaType: 'audio',
          enabled: false,
        });
      });
    }).not.toThrow();

    const participant = useCallStore
      .getState()
      .currentCall?.participants.find((p) => p.id === PARTICIPANT_ROW_ID);
    expect(participant?.isAudioEnabled).toBe(true);
  });
});
