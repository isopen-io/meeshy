/**
 * useRemoteTranscriptionActive — signal de présence transcription
 * (`call:transcription-active`, estampillé gateway). Pilote l'indicateur
 * d'invitation sur le bouton sous-titres : un pair a activé son panneau,
 * invitez l'utilisateur à activer le sien. JAMAIS gâté par la visibilité du
 * panneau local — c'est précisément l'invitation à l'ouvrir.
 */

import { renderHook, act } from '@testing-library/react';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: { getSocket: jest.fn() },
}));

import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { useRemoteTranscriptionActive } from '@/hooks/use-remote-transcription-active';

const CALL_ID = 'call-presence-1';

type Handler = (...args: unknown[]) => void;

function makeFakeSocket() {
  const handlers: Record<string, Handler[]> = {};
  return {
    connected: true,
    on: jest.fn((event: string, fn: Handler) => {
      (handlers[event] ||= []).push(fn);
    }),
    off: jest.fn((event: string, fn?: Handler) => {
      if (!fn) { handlers[event] = []; return; }
      handlers[event] = (handlers[event] || []).filter((h) => h !== fn);
    }),
    fire: (event: string, ...args: unknown[]) => {
      (handlers[event] || []).forEach((h) => h(...args));
    },
  };
}

describe('useRemoteTranscriptionActive', () => {
  let socket: ReturnType<typeof makeFakeSocket>;

  beforeEach(() => {
    socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);
  });

  it('reports a peer activation', () => {
    const { result } = renderHook(() => useRemoteTranscriptionActive(CALL_ID));
    expect(result.current.peerTranscribing).toBe(false);

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_TRANSCRIPTION_ACTIVE, {
        callId: CALL_ID, speakerId: 'peer-1', active: true,
      });
    });

    expect(result.current.peerTranscribing).toBe(true);
  });

  it('clears when the peer deactivates', () => {
    const { result } = renderHook(() => useRemoteTranscriptionActive(CALL_ID));

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_TRANSCRIPTION_ACTIVE, { callId: CALL_ID, speakerId: 'peer-1', active: true });
      socket.fire(SERVER_EVENTS.CALL_TRANSCRIPTION_ACTIVE, { callId: CALL_ID, speakerId: 'peer-1', active: false });
    });

    expect(result.current.peerTranscribing).toBe(false);
  });

  it('stays active while at least one peer still transcribes (group-safe)', () => {
    const { result } = renderHook(() => useRemoteTranscriptionActive(CALL_ID));

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_TRANSCRIPTION_ACTIVE, { callId: CALL_ID, speakerId: 'peer-1', active: true });
      socket.fire(SERVER_EVENTS.CALL_TRANSCRIPTION_ACTIVE, { callId: CALL_ID, speakerId: 'peer-2', active: true });
      socket.fire(SERVER_EVENTS.CALL_TRANSCRIPTION_ACTIVE, { callId: CALL_ID, speakerId: 'peer-1', active: false });
    });

    expect(result.current.peerTranscribing).toBe(true);
  });

  it('ignores signals from another call', () => {
    const { result } = renderHook(() => useRemoteTranscriptionActive(CALL_ID));

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_TRANSCRIPTION_ACTIVE, { callId: 'other-call', speakerId: 'peer-1', active: true });
    });

    expect(result.current.peerTranscribing).toBe(false);
  });

  it('resets when the call changes', () => {
    const { result, rerender } = renderHook(
      ({ callId }: { callId: string | null }) => useRemoteTranscriptionActive(callId),
      { initialProps: { callId: CALL_ID } }
    );

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_TRANSCRIPTION_ACTIVE, { callId: CALL_ID, speakerId: 'peer-1', active: true });
    });
    expect(result.current.peerTranscribing).toBe(true);

    rerender({ callId: 'call-presence-2' });
    expect(result.current.peerTranscribing).toBe(false);
  });

  // --- participant-left cleanup (Vague 134) ---------------------------
  // A peer with the transcript panel open can leave the call (hangup,
  // crash, network drop) without ever emitting `active: false` — the
  // sibling `useRemoteCallAlerts` hook already guards its own per-peer
  // Set against exactly this hazard (see its `handleParticipantLeft`).
  // Without the same cleanup here, the invitation badge stays lit for
  // the rest of the call even though nobody is transcribing anymore.

  describe('participant-left cleanup (group-safe, Vague 134)', () => {
    it('a peer that leaves without a stop transition clears the invitation', () => {
      const { result } = renderHook(() => useRemoteTranscriptionActive(CALL_ID));

      act(() => {
        socket.fire(SERVER_EVENTS.CALL_TRANSCRIPTION_ACTIVE, { callId: CALL_ID, speakerId: 'peer-1', active: true });
      });
      expect(result.current.peerTranscribing).toBe(true);

      act(() => {
        socket.fire(SERVER_EVENTS.CALL_PARTICIPANT_LEFT, {
          callId: CALL_ID, userId: 'peer-1', participantId: 'cp-1', mode: 'p2p',
        });
      });

      expect(result.current.peerTranscribing).toBe(false);
    });

    it('stays active while another peer is still transcribing (group-safe)', () => {
      const { result } = renderHook(() => useRemoteTranscriptionActive(CALL_ID));

      act(() => {
        socket.fire(SERVER_EVENTS.CALL_TRANSCRIPTION_ACTIVE, { callId: CALL_ID, speakerId: 'peer-1', active: true });
        socket.fire(SERVER_EVENTS.CALL_TRANSCRIPTION_ACTIVE, { callId: CALL_ID, speakerId: 'peer-2', active: true });
        socket.fire(SERVER_EVENTS.CALL_PARTICIPANT_LEFT, {
          callId: CALL_ID, userId: 'peer-1', participantId: 'cp-1', mode: 'p2p',
        });
      });

      expect(result.current.peerTranscribing).toBe(true);

      act(() => {
        socket.fire(SERVER_EVENTS.CALL_PARTICIPANT_LEFT, {
          callId: CALL_ID, userId: 'peer-2', participantId: 'cp-2', mode: 'p2p',
        });
      });

      expect(result.current.peerTranscribing).toBe(false);
    });

    it('falls back to participantId when userId is absent (older gateway build)', () => {
      const { result } = renderHook(() => useRemoteTranscriptionActive(CALL_ID));

      act(() => {
        socket.fire(SERVER_EVENTS.CALL_TRANSCRIPTION_ACTIVE, { callId: CALL_ID, speakerId: 'peer-1', active: true });
      });

      act(() => {
        socket.fire(SERVER_EVENTS.CALL_PARTICIPANT_LEFT, {
          callId: CALL_ID, participantId: 'peer-1', mode: 'p2p',
        });
      });

      expect(result.current.peerTranscribing).toBe(false);
    });

    it('a participant-left from another call is inert', () => {
      const { result } = renderHook(() => useRemoteTranscriptionActive(CALL_ID));

      act(() => {
        socket.fire(SERVER_EVENTS.CALL_TRANSCRIPTION_ACTIVE, { callId: CALL_ID, speakerId: 'peer-1', active: true });
        socket.fire(SERVER_EVENTS.CALL_PARTICIPANT_LEFT, {
          callId: 'other-call', userId: 'peer-1', participantId: 'cp-1', mode: 'p2p',
        });
      });

      expect(result.current.peerTranscribing).toBe(true);
    });

    it('unmount unsubscribes the participant-left listener too', () => {
      const { unmount } = renderHook(() => useRemoteTranscriptionActive(CALL_ID));

      unmount();

      expect(socket.off).toHaveBeenCalledWith(SERVER_EVENTS.CALL_PARTICIPANT_LEFT, expect.any(Function));
    });
  });
});
