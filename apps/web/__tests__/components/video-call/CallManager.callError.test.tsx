/**
 * CallManager — call:error handling (sibling-drift fix, 2026-07-05)
 *
 * iOS's call:error subscriber (CallManager.swift ~3480-3510) whitelists
 * RATE_LIMIT_EXCEEDED, TARGET_NOT_FOUND and INVALID_SIGNAL as transient/
 * non-fatal — each backed by a real production incident where surfacing them
 * as a fatal error killed a healthy call. The gateway emits these to web the
 * exact same way it does to iOS (CallEventsHandler.ts), but web's
 * handleCallError showed every call:error as a toast regardless of code.
 * See tasks/calls-fonctionnel-todo.md Vague 14.
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

const toastError = jest.fn();
jest.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastError(...args), success: jest.fn() },
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

function fireCallError(socket: ReturnType<typeof makeFakeSocket>, error: unknown) {
  act(() => {
    socket.fire(SERVER_EVENTS.CALL_ERROR, error);
  });
}

describe('CallManager — call:error', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useCallStore.getState().reset();
  });

  it.each(['RATE_LIMIT_EXCEEDED', 'TARGET_NOT_FOUND', 'INVALID_SIGNAL'])(
    'silently drops a transient %s error (no toast)',
    (code) => {
      const socket = makeFakeSocket();
      (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

      render(<CallManager />);
      fireCallError(socket, { code, message: 'transient relay hiccup' });

      expect(toastError).not.toHaveBeenCalled();
    }
  );

  it('surfaces a toast for an unrecognized/fatal error code', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);
    fireCallError(socket, { code: 'CALL_NOT_FOUND', message: 'Call session not found' });

    expect(toastError).toHaveBeenCalledWith('Call session not found');
  });

  it('still ignores the pre-existing "not in this call" message regardless of code', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);
    fireCallError(socket, { code: 'NOT_A_PARTICIPANT', message: 'You are not in this call' });

    expect(toastError).not.toHaveBeenCalled();
  });
});
