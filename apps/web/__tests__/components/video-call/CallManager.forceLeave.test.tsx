/**
 * CallManager — `call:force-leave` : le serveur sort CE destinataire de
 * l'appel (cycle 75).
 *
 * Une fin d'appartenance — quitter, être banni, être retiré par un
 * modérateur, supprimer le fil pour soi — sort désormais le partant des
 * appels EN COURS du fil (`endConversationMembership` →
 * `CallEventsHandler.endCallParticipationForDepartedMember`). Les pairs
 * restants l'apprennent par `call:participant-left` et démontent leur
 * `RTCPeerConnection` ; le SORTI, lui, ne l'apprend que par
 * `call:force-leave` vers sa room personnelle — ses sockets viennent d'être
 * évincées de la room de l'appel, plus rien d'autre ne l'atteint.
 *
 * iOS portait déjà ce récepteur (`CallManager.callForcedLeave`, avec
 * clôture CallKit) ; le web ne l'avait pas, et l'onglet du sorti restait
 * indéfiniment sur un écran d'appel mort.
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

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('@/components/video-call/CallNotification', () => ({
  CallNotification: () => <div data-testid="incoming-call-card" />,
}));

jest.mock('@/components/video-call/CallWaitingBanner', () => ({
  CallWaitingBanner: () => <div data-testid="call-waiting-banner" />,
}));

jest.mock('@/components/video-calls/VideoCallInterface', () => ({
  VideoCallInterface: () => <div data-testid="active-call-ui" />,
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
  getRingtone: () => ({ play: jest.fn(), stop: jest.fn() }),
}));

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: { getSocket: jest.fn() },
}));

import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { useCallStore } from '@/stores/call-store';
import { CallManager } from '@/components/video-call/CallManager';

const CALL_ID = 'call-in-progress-1';
const OTHER_CALL_ID = 'unrelated-call-2';

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
    listenerCount: (event: string) => (handlers[event] || []).length,
    fire: (event: string, ...args: unknown[]) => {
      (handlers[event] || []).forEach((h) => h(...args));
    },
  };
}

function enterActiveCall(callId: string, conversationId: string) {
  useCallStore.getState().setCurrentCall({
    id: callId,
    conversationId,
    mode: 'p2p',
    status: 'active',
    initiatorId: 'user-1',
    startedAt: new Date(),
    participants: [],
  } as never);
  useCallStore.getState().setInCall(true);
}

describe('CallManager — call:force-leave', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useCallStore.getState().reset();
    useCallStore.getState().clearCallRetry();
  });

  it("s'abonne à call:force-leave — sans quoi le sorti n'apprend jamais qu'on l'a sorti", () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);

    expect(socket.listenerCount(SERVER_EVENTS.CALL_FORCE_LEAVE)).toBe(1);
  });

  it("referme l'écran d'appel du sorti", () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);
    render(<CallManager />);
    act(() => {
      enterActiveCall(CALL_ID, 'conv-1');
    });

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_FORCE_LEAVE, {
        callId: CALL_ID,
        reason: 'membership_ended',
      });
    });

    expect(useCallStore.getState().isInCall).toBe(false);
    expect(useCallStore.getState().currentCall).toBeNull();
  });

  it("ne propose PAS de « Réessayer » — l'appel n'est plus rejoignable", () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);
    render(<CallManager />);
    act(() => {
      enterActiveCall(CALL_ID, 'conv-1');
    });

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_FORCE_LEAVE, {
        callId: CALL_ID,
        reason: 'membership_ended',
      });
    });

    expect(useCallStore.getState().pendingRetry).toEqual({});
  });

  it("ignore un call:force-leave portant un AUTRE callId — l'appel en cours survit", () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);
    render(<CallManager />);
    act(() => {
      enterActiveCall(CALL_ID, 'conv-1');
    });

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_FORCE_LEAVE, {
        callId: OTHER_CALL_ID,
        reason: 'membership_ended',
      });
    });

    expect(useCallStore.getState().isInCall).toBe(true);
    expect(useCallStore.getState().currentCall?.id).toBe(CALL_ID);
  });

  it('survit à une charge utile sans callId', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);
    render(<CallManager />);
    act(() => {
      enterActiveCall(CALL_ID, 'conv-1');
    });

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_FORCE_LEAVE, { reason: 'membership_ended' });
    });

    expect(useCallStore.getState().isInCall).toBe(true);
  });

  it("se désabonne de call:force-leave au démontage — sans quoi la fermeture d'un onglet laisse un écouteur orphelin sur une closure périmée", () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    const { unmount } = render(<CallManager />);
    expect(socket.listenerCount(SERVER_EVENTS.CALL_FORCE_LEAVE)).toBe(1);

    unmount();

    expect(socket.listenerCount(SERVER_EVENTS.CALL_FORCE_LEAVE)).toBe(0);
  });

  it("un remontage ne double pas l'écouteur — un seul call:force-leave traité par cycle", () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    const { unmount } = render(<CallManager />);
    unmount();
    render(<CallManager />);

    expect(socket.listenerCount(SERVER_EVENTS.CALL_FORCE_LEAVE)).toBe(1);
  });
});
