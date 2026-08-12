/**
 * CallManager — VideoCallInterface must be wrapped in CallErrorBoundary
 * (2026-08-09)
 *
 * `VideoCallInterface` (768 lines, a dozen effects: WebRTC callbacks, the
 * audio-effects pipeline, adaptive degradation, watchdog timers) was mounted
 * directly by CallManager with no error boundary, even though a purpose-built
 * one (`CallErrorBoundary`) already exists and is exported from the
 * `video-calls` barrel specifically for this. apps/web/CLAUDE.md states
 * "Each feature MUST have its own ErrorBoundary. A crash in message list
 * MUST NOT crash the conversation list." — the same rule applies to calls:
 * an uncaught render error anywhere in VideoCallInterface's tree propagated
 * past CallManager to whatever ancestor boundary the app happens to have,
 * instead of being contained to a "Call Error" screen the user can retry
 * from without losing the rest of the app.
 */

import { render } from '@testing-library/react';

jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'user-1' }, isChecking: false }),
}));

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('@/components/video-call/CallNotification', () => ({
  CallNotification: () => null,
}));

jest.mock('@/components/video-call/CallWaitingBanner', () => ({
  CallWaitingBanner: () => null,
}));

jest.mock('@/components/video-calls/VideoCallInterface', () => ({
  VideoCallInterface: () => {
    throw new Error('boom: simulated VideoCallInterface render crash');
  },
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

const ACTIVE_CALL_ID = 'active-call-error-boundary-1';

function makeFakeSocket() {
  return {
    connected: true,
    id: 'fake-socket-id',
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    onAny: jest.fn(),
    offAny: jest.fn(),
  };
}

function enterActiveCall() {
  useCallStore.getState().setCurrentCall({
    id: ACTIVE_CALL_ID,
    conversationId: 'conv-active',
    mode: 'p2p',
    status: 'active',
    initiatorId: 'user-1',
    startedAt: new Date(),
    participants: [],
  } as never);
  useCallStore.getState().setInCall(true);
}

describe('CallManager — VideoCallInterface is wrapped in CallErrorBoundary', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    useCallStore.getState().reset();
    useCallStore.getState().clearCallRetry();
    // React logs the caught error to console.error even when a boundary
    // catches it — suppress that expected noise for this test only.
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('does not crash the whole component tree when VideoCallInterface throws during render', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);
    enterActiveCall();

    // Without a CallErrorBoundary around VideoCallInterface, this render()
    // itself throws (no boundary anywhere in the tree to catch it).
    expect(() => render(<CallManager />)).not.toThrow();
  });

  it('shows the call error fallback instead of an unhandled crash', () => {
    const socket = makeFakeSocket();
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);
    enterActiveCall();

    const { getByText } = render(<CallManager />);

    expect(getByText('error.title')).toBeInTheDocument();
  });
});
