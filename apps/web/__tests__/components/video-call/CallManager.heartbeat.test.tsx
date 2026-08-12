/**
 * CallManager (production call orchestrator, mounted at app/call/[callId]/page.tsx)
 * — heartbeat liveness contract (audit Vague 26, sibling drift).
 *
 * The gateway's `CallCleanupService` GC tier force-ends any call whose
 * participants show no fresh heartbeat for >120s (see CallService.ts
 * hasHeartbeatData/recordHeartbeat + CallCleanupService.ts tier 4). iOS
 * emits `call:heartbeat` every 15s via `CallManager.startHeartbeat()` for
 * every call. `stores/call-store.ts` defines the equivalent web action
 * (`startHeartbeat`/`stopHeartbeat`) but — before this fix — no mounted
 * component ever called it: a pure web↔web call had zero heartbeat entries
 * on either side, which the gateway GC's post-restart DB fallback treats
 * identically to a genuine zombie once the boot grace window passes,
 * force-ending an otherwise-healthy P2P call past ~2 minutes.
 */

import { render } from '@testing-library/react';
import { act } from 'react';
import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';

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

const CALL_ID = 'call-heartbeat-abc';
const HEARTBEAT_INTERVAL_MS = 15_000;

function makeFakeSocket(connected: boolean) {
  return {
    connected,
    id: 'fake-socket-id',
    emit: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
    onAny: jest.fn(),
    offAny: jest.fn(),
  };
}

function setActiveCall(callId: string) {
  useCallStore.getState().setCurrentCall({
    id: callId,
    conversationId: 'conv-1',
    mode: 'p2p',
    status: 'active',
    initiatorId: 'user-1',
    startedAt: new Date(),
    participants: [],
  } as never);
}

describe('CallManager — heartbeat liveness', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    useCallStore.getState().reset();
  });

  afterEach(() => {
    useCallStore.getState().reset();
    jest.useRealTimers();
  });

  it('emits call:heartbeat every 15s while a call is active', () => {
    const socket = makeFakeSocket(true);
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);
    act(() => {
      setActiveCall(CALL_ID);
    });

    act(() => {
      jest.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    });

    expect(socket.emit).toHaveBeenCalledWith(CLIENT_EVENTS.CALL_HEARTBEAT, { callId: CALL_ID });
  });

  it('does NOT emit call:heartbeat when no call is active', () => {
    const socket = makeFakeSocket(true);
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);
    // isInCall stays false — no setActiveCall() call

    act(() => {
      jest.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 2);
    });

    expect(socket.emit).not.toHaveBeenCalledWith(CLIENT_EVENTS.CALL_HEARTBEAT, expect.anything());
  });

  it('stops emitting call:heartbeat once the call ends (reset)', () => {
    const socket = makeFakeSocket(true);
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(socket);

    render(<CallManager />);
    act(() => {
      setActiveCall(CALL_ID);
    });
    act(() => {
      jest.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    });
    expect(socket.emit).toHaveBeenCalledWith(CLIENT_EVENTS.CALL_HEARTBEAT, { callId: CALL_ID });
    socket.emit.mockClear();

    act(() => {
      useCallStore.getState().reset();
    });
    act(() => {
      jest.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 2);
    });

    expect(socket.emit).not.toHaveBeenCalledWith(CLIENT_EVENTS.CALL_HEARTBEAT, expect.anything());
  });
});
