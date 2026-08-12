/**
 * CallManager — call:already-answered must dismiss the ringing UI
 * (audit appels 2026-07-11, finding #1)
 *
 * Quand un AUTRE device du même utilisateur répond, le gateway transitionne
 * l'appel en `active` (jamais `ended`) et émet `call:already-answered` vers
 * les user-rooms — il n'émettra `call:ended` qu'au raccrochage final. Le web
 * n'écoutait pas cet événement : la carte d'appel entrant du tab sonnait
 * indéfiniment (sonnerie fantôme) alors que l'utilisateur avait déjà
 * décroché sur iPhone/Android.
 */

import { render, act, screen } from '@testing-library/react';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, isChecking: false }),
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('@/components/video-call/CallNotification', () => ({
  CallNotification: () => <div data-testid="incoming-call-card">ringing</div>,
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

const mockStopRingtone = jest.fn();
jest.mock('@/utils/ringtone', () => ({
  stopRingtone: (...args: unknown[]) => mockStopRingtone(...args),
  playRingtone: jest.fn(),
}));

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: { getSocket: jest.fn() },
}));

import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { useCallStore } from '@/stores/call-store';
import { CallManager } from '@/components/video-call/CallManager';

const CALL_ID = 'call-elsewhere-abc';

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
      if (!fn) { handlers[event] = []; return; }
      handlers[event] = (handlers[event] || []).filter((h) => h !== fn);
    }),
    onAny: jest.fn(),
    offAny: jest.fn(),
    fire: (event: string, ...args: unknown[]) => {
      (handlers[event] || []).forEach((h) => h(...args));
    },
  };
}

function incomingCallEvent(callId = CALL_ID) {
  return {
    callId,
    conversationId: 'conv-1',
    mode: 'p2p',
    type: 'audio',
    initiator: { userId: 'user-2', username: 'caller' },
    participants: [],
  };
}

describe('CallManager — call:already-answered dismisses the ringing UI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useCallStore.getState().reset();
  });

  it('dismisses the incoming-call card and stops the ringtone for the same callId', async () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_INITIATED, incomingCallEvent());
    });
    expect(screen.getByTestId('incoming-call-card')).toBeInTheDocument();

    await act(async () => {
      socket.fire(SERVER_EVENTS.CALL_ALREADY_ANSWERED, { callId: CALL_ID });
    });

    expect(screen.queryByTestId('incoming-call-card')).toBeNull();
    expect(mockStopRingtone).toHaveBeenCalled();
  });

  it('ignores call:already-answered for a DIFFERENT callId (keeps ringing)', async () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_INITIATED, incomingCallEvent());
    });

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_ALREADY_ANSWERED, { callId: 'some-other-call' });
    });

    expect(screen.getByTestId('incoming-call-card')).toBeInTheDocument();
  });

  it('does not reset an established in-call state (only the ringing UI is scoped)', async () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);

    act(() => {
      useCallStore.getState().setInCall(true);
    });

    act(() => {
      socket.fire(SERVER_EVENTS.CALL_ALREADY_ANSWERED, { callId: CALL_ID });
    });

    expect(useCallStore.getState().isInCall).toBe(true);
  });
});
