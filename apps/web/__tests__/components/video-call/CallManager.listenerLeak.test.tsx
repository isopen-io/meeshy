/**
 * CallManager — unmount must remove ALL socket listeners it attached,
 * including call:already-answered (audit calling-stack 2026-08-04).
 *
 * The mount effect attaches 7 listeners (`attachListeners`) and mirrors
 * that in its "remove previous listeners on re-attach" cleanup — but the
 * effect's UNMOUNT cleanup only removed 6 of the 7, leaving
 * `call:already-answered` dangling on the module-level socket singleton
 * (which outlives the React component). Every mount/unmount cycle then
 * leaked one more `call:already-answered` listener bound to a stale
 * closure over the unmounted instance's state.
 */

import { render, act } from '@testing-library/react';
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
    handlerCountFor: (event: string) => (handlers[event] || []).length,
  };
}

describe('CallManager — unmount removes every listener it attached', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useCallStore.getState().reset();
  });

  it('removes the call:already-answered listener on unmount, same as its siblings', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    const { unmount } = render(<CallManager />);

    expect(socket.handlerCountFor(SERVER_EVENTS.CALL_ALREADY_ANSWERED)).toBe(1);
    expect(socket.handlerCountFor(SERVER_EVENTS.CALL_ENDED)).toBe(1);

    act(() => {
      unmount();
    });

    expect(socket.handlerCountFor(SERVER_EVENTS.CALL_ENDED)).toBe(0);
    expect(socket.handlerCountFor(SERVER_EVENTS.CALL_ALREADY_ANSWERED)).toBe(0);
  });

  it('does not accumulate a second call:already-answered listener across remount', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    const first = render(<CallManager />);
    act(() => {
      first.unmount();
    });

    render(<CallManager />);

    expect(socket.handlerCountFor(SERVER_EVENTS.CALL_ALREADY_ANSWERED)).toBe(1);
  });
});
