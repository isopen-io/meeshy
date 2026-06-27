const mockSocketOn = jest.fn();
const mockSocketOff = jest.fn();
const mockSocketEmit = jest.fn();

const mockSocket = {
  on: mockSocketOn,
  off: mockSocketOff,
  emit: mockSocketEmit,
};
const mockGetSocket = jest.fn(() => mockSocket as unknown as typeof mockSocket | null);

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: { getSocket: (...args: unknown[]) => mockGetSocket(...args) },
}));
jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));
jest.mock('@meeshy/shared/types/socketio-events', () => ({
  CLIENT_EVENTS: {
    CALL_SIGNAL: 'call:signal',
    CALL_INITIATE: 'call:initiate',
    CALL_JOIN: 'call:join',
    CALL_LEAVE: 'call:leave',
    CALL_TOGGLE_AUDIO: 'call:toggle-audio',
    CALL_TOGGLE_VIDEO: 'call:toggle-video',
  },
  SERVER_EVENTS: {
    CALL_SIGNAL: 'call:signal',
    CALL_INITIATED: 'call:initiated',
    CALL_PARTICIPANT_JOINED: 'call:participant-joined',
    CALL_PARTICIPANT_LEFT: 'call:participant-left',
    CALL_ENDED: 'call:ended',
    CALL_MEDIA_TOGGLED: 'call:media-toggled',
    CALL_ERROR: 'call:error',
  },
}));

import { renderHook, act } from '@testing-library/react';
import { useCallSignaling } from '../hooks/useCallSignaling';

const ALL_SERVER_EVENTS = [
  'call:signal',
  'call:initiated',
  'call:participant-joined',
  'call:participant-left',
  'call:ended',
  'call:media-toggled',
  'call:error',
];

function captureListeners(): Record<string, (...args: unknown[]) => void> {
  const listeners: Record<string, (...args: unknown[]) => void> = {};
  mockSocketOn.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
    listeners[event] = handler;
  });
  return listeners;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSocket.mockReturnValue(mockSocket as unknown as ReturnType<typeof mockGetSocket>);
});

describe('useCallSignaling', () => {
  describe('sendSignal', () => {
    it('no-ops when userId is not provided', () => {
      const { result } = renderHook(() =>
        useCallSignaling({ callId: 'call-1' })
      );

      act(() => {
        result.current.sendSignal({ type: 'offer', to: 'user-2', sdp: 'sdp-data' } as Parameters<typeof result.current.sendSignal>[0]);
      });

      expect(mockSocketEmit).not.toHaveBeenCalled();
    });

    it('no-ops when socket is null', () => {
      mockGetSocket.mockReturnValue(null);

      const { result } = renderHook(() =>
        useCallSignaling({ callId: 'call-1', userId: 'user-1' })
      );

      act(() => {
        result.current.sendSignal({ type: 'offer', to: 'user-2', sdp: 'sdp-data' } as Parameters<typeof result.current.sendSignal>[0]);
      });

      expect(mockSocketEmit).not.toHaveBeenCalled();
    });

    it('emits signal event with correct data when userId and socket are available', () => {
      const { result } = renderHook(() =>
        useCallSignaling({ callId: 'call-1', userId: 'user-1' })
      );

      act(() => {
        result.current.sendSignal({ type: 'offer', to: 'user-2', sdp: 'sdp-data' } as Parameters<typeof result.current.sendSignal>[0]);
      });

      expect(mockSocketEmit).toHaveBeenCalledWith(
        'call:signal',
        expect.objectContaining({
          callId: 'call-1',
          signal: expect.objectContaining({
            type: 'offer',
            to: 'user-2',
            sdp: 'sdp-data',
            from: 'user-1',
          }),
        }),
        expect.any(Function)
      );
    });
  });

  describe('toggleAudio', () => {
    it('emits the correct socket event with callId and enabled flag', () => {
      const { result } = renderHook(() =>
        useCallSignaling({ callId: 'call-1', userId: 'user-1' })
      );

      act(() => {
        result.current.toggleAudio(false);
      });

      expect(mockSocketEmit).toHaveBeenCalledWith(
        'call:toggle-audio',
        { callId: 'call-1', enabled: false },
        expect.any(Function)
      );
    });

    it('no-ops when socket is null', () => {
      mockGetSocket.mockReturnValue(null);

      const { result } = renderHook(() =>
        useCallSignaling({ callId: 'call-1', userId: 'user-1' })
      );

      act(() => {
        result.current.toggleAudio(true);
      });

      expect(mockSocketEmit).not.toHaveBeenCalledWith('call:toggle-audio', expect.anything(), expect.anything());
    });
  });

  describe('toggleVideo', () => {
    it('emits the correct socket event with callId and enabled flag', () => {
      const { result } = renderHook(() =>
        useCallSignaling({ callId: 'call-1', userId: 'user-1' })
      );

      act(() => {
        result.current.toggleVideo(true);
      });

      expect(mockSocketEmit).toHaveBeenCalledWith(
        'call:toggle-video',
        { callId: 'call-1', enabled: true },
        expect.any(Function)
      );
    });

    it('no-ops when socket is null', () => {
      mockGetSocket.mockReturnValue(null);

      const { result } = renderHook(() =>
        useCallSignaling({ callId: 'call-1', userId: 'user-1' })
      );

      act(() => {
        result.current.toggleVideo(false);
      });

      expect(mockSocketEmit).not.toHaveBeenCalledWith('call:toggle-video', expect.anything(), expect.anything());
    });
  });

  describe('leaveCall', () => {
    it('emits CALL_LEAVE event with callId', () => {
      const { result } = renderHook(() =>
        useCallSignaling({ callId: 'call-1', userId: 'user-1' })
      );

      act(() => {
        result.current.leaveCall();
      });

      expect(mockSocketEmit).toHaveBeenCalledWith('call:leave', { callId: 'call-1' });
    });

    it('no-ops when socket is null', () => {
      mockGetSocket.mockReturnValue(null);

      const { result } = renderHook(() =>
        useCallSignaling({ callId: 'call-1', userId: 'user-1' })
      );

      act(() => {
        result.current.leaveCall();
      });

      expect(mockSocketEmit).not.toHaveBeenCalled();
    });
  });

  describe('initiateCall', () => {
    it('resolves with ack data on success', async () => {
      mockSocketEmit.mockImplementation((_event: string, _data: unknown, ack: (r: unknown) => void) => {
        ack({ success: true, data: { callId: 'call-1', mode: 'p2p' } });
      });

      const { result } = renderHook(() =>
        useCallSignaling({ callId: 'call-1', userId: 'user-1' })
      );

      let resolved: { callId: string; mode: string } | undefined;
      await act(async () => {
        resolved = await result.current.initiateCall({ conversationId: 'conv-1', callType: 'video' } as Parameters<typeof result.current.initiateCall>[0]);
      });

      expect(resolved).toEqual({ callId: 'call-1', mode: 'p2p' });
      expect(mockSocketEmit).toHaveBeenCalledWith(
        'call:initiate',
        expect.objectContaining({ conversationId: 'conv-1' }),
        expect.any(Function)
      );
    });

    it('rejects and calls onError when ack indicates failure', async () => {
      mockSocketEmit.mockImplementation((_event: string, _data: unknown, ack: (r: unknown) => void) => {
        ack({ success: false, error: { message: 'Server refused' } });
      });

      const onError = jest.fn();
      const { result } = renderHook(() =>
        useCallSignaling({ callId: 'call-1', userId: 'user-1', onError })
      );

      await act(async () => {
        await expect(
          result.current.initiateCall({ conversationId: 'conv-1', callType: 'video' } as Parameters<typeof result.current.initiateCall>[0])
        ).rejects.toThrow('Server refused');
      });

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('throws and calls onError when socket is null', async () => {
      mockGetSocket.mockReturnValue(null);

      const onError = jest.fn();
      const { result } = renderHook(() =>
        useCallSignaling({ callId: 'call-1', userId: 'user-1', onError })
      );

      await act(async () => {
        await expect(
          result.current.initiateCall({ conversationId: 'conv-1', callType: 'video' } as Parameters<typeof result.current.initiateCall>[0])
        ).rejects.toThrow('Socket not available');
      });

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('joinCall', () => {
    it('resolves with callSession and iceServers on success', async () => {
      const fakeSession = { id: 'session-1', callId: 'call-1' };
      const fakeIceServers = [{ urls: 'stun:stun.example.com' }];

      mockSocketEmit.mockImplementation((_event: string, _data: unknown, ack: (r: unknown) => void) => {
        ack({ success: true, data: { callSession: fakeSession, iceServers: fakeIceServers } });
      });

      const { result } = renderHook(() =>
        useCallSignaling({ callId: 'call-1', userId: 'user-1' })
      );

      let resolved: { callSession: unknown; iceServers: unknown } | undefined;
      await act(async () => {
        resolved = await result.current.joinCall({ audioEnabled: true, videoEnabled: false });
      });

      expect(resolved?.callSession).toEqual(fakeSession);
      expect(resolved?.iceServers).toEqual(fakeIceServers);
      expect(mockSocketEmit).toHaveBeenCalledWith(
        'call:join',
        { callId: 'call-1', settings: { audioEnabled: true, videoEnabled: false } },
        expect.any(Function)
      );
    });

    it('uses default settings when none provided', async () => {
      mockSocketEmit.mockImplementation((_event: string, _data: unknown, ack: (r: unknown) => void) => {
        ack({ success: true, data: { callSession: {}, iceServers: [] } });
      });

      const { result } = renderHook(() =>
        useCallSignaling({ callId: 'call-1', userId: 'user-1' })
      );

      await act(async () => {
        await result.current.joinCall();
      });

      expect(mockSocketEmit).toHaveBeenCalledWith(
        'call:join',
        { callId: 'call-1', settings: { audioEnabled: true, videoEnabled: true } },
        expect.any(Function)
      );
    });

    it('rejects and calls onError when ack indicates failure', async () => {
      mockSocketEmit.mockImplementation((_event: string, _data: unknown, ack: (r: unknown) => void) => {
        ack({ success: false, error: { message: 'Call not found' } });
      });

      const onError = jest.fn();
      const { result } = renderHook(() =>
        useCallSignaling({ callId: 'call-1', userId: 'user-1', onError })
      );

      await act(async () => {
        await expect(result.current.joinCall()).rejects.toThrow('Call not found');
      });

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('throws and calls onError when socket is null', async () => {
      mockGetSocket.mockReturnValue(null);

      const onError = jest.fn();
      const { result } = renderHook(() =>
        useCallSignaling({ callId: 'call-1', userId: 'user-1', onError })
      );

      await act(async () => {
        await expect(result.current.joinCall()).rejects.toThrow('Socket not available');
      });

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('socket listeners', () => {
    it('onCallInitiated fires when event.callId matches', () => {
      const listeners = captureListeners();
      const onCallInitiated = jest.fn();

      renderHook(() =>
        useCallSignaling({ callId: 'call-1', userId: 'user-1', onCallInitiated })
      );

      act(() => {
        listeners['call:initiated']?.({ callId: 'call-1', initiatorId: 'user-1' });
      });

      expect(onCallInitiated).toHaveBeenCalledWith(
        expect.objectContaining({ callId: 'call-1' })
      );
    });

    it('onCallInitiated NOT fired when event.callId does not match', () => {
      const listeners = captureListeners();
      const onCallInitiated = jest.fn();

      renderHook(() =>
        useCallSignaling({ callId: 'call-1', userId: 'user-1', onCallInitiated })
      );

      act(() => {
        listeners['call:initiated']?.({ callId: 'call-999', initiatorId: 'user-1' });
      });

      expect(onCallInitiated).not.toHaveBeenCalled();
    });

    it('onParticipantJoined fires when callId matches', () => {
      const listeners = captureListeners();
      const onParticipantJoined = jest.fn();

      renderHook(() =>
        useCallSignaling({ callId: 'call-1', userId: 'user-1', onParticipantJoined })
      );

      act(() => {
        listeners['call:participant-joined']?.({
          callId: 'call-1',
          participant: { id: 'user-2', userId: 'user-2' },
        });
      });

      expect(onParticipantJoined).toHaveBeenCalledWith(
        expect.objectContaining({ callId: 'call-1' })
      );
    });

    it('onParticipantLeft fires when callId matches', () => {
      const listeners = captureListeners();
      const onParticipantLeft = jest.fn();

      renderHook(() =>
        useCallSignaling({ callId: 'call-1', userId: 'user-1', onParticipantLeft })
      );

      act(() => {
        listeners['call:participant-left']?.({
          callId: 'call-1',
          participantId: 'user-2',
          reason: 'left',
        });
      });

      expect(onParticipantLeft).toHaveBeenCalledWith(
        expect.objectContaining({ callId: 'call-1' })
      );
    });

    it('onCallEnded fires when callId matches', () => {
      const listeners = captureListeners();
      const onCallEnded = jest.fn();

      renderHook(() =>
        useCallSignaling({ callId: 'call-1', userId: 'user-1', onCallEnded })
      );

      act(() => {
        listeners['call:ended']?.({ callId: 'call-1', reason: 'ended' });
      });

      expect(onCallEnded).toHaveBeenCalledWith(
        expect.objectContaining({ callId: 'call-1' })
      );
    });

    it('onSignal fires when callId matches', () => {
      const listeners = captureListeners();
      const onSignal = jest.fn();

      renderHook(() =>
        useCallSignaling({ callId: 'call-1', userId: 'user-1', onSignal })
      );

      const signal = { type: 'offer', to: 'user-1', from: 'user-2', sdp: 'sdp-data' };
      act(() => {
        listeners['call:signal']?.({ callId: 'call-1', signal });
      });

      expect(onSignal).toHaveBeenCalledWith(signal);
    });

    it('onSignal NOT fired when callId does not match', () => {
      const listeners = captureListeners();
      const onSignal = jest.fn();

      renderHook(() =>
        useCallSignaling({ callId: 'call-1', userId: 'user-1', onSignal })
      );

      act(() => {
        listeners['call:signal']?.({
          callId: 'call-999',
          signal: { type: 'offer', to: 'user-1', from: 'user-2', sdp: 'sdp-data' },
        });
      });

      expect(onSignal).not.toHaveBeenCalled();
    });

    it('listeners are removed on unmount', () => {
      const { unmount } = renderHook(() =>
        useCallSignaling({ callId: 'call-1', userId: 'user-1' })
      );

      unmount();

      const offEvents = mockSocketOff.mock.calls.map((call) => call[0] as string);
      for (const event of ALL_SERVER_EVENTS) {
        expect(offEvents).toContain(event);
      }
    });

    it('warns when socket not available', () => {
      const { logger } = jest.requireMock('@/utils/logger') as { logger: { warn: jest.Mock } };
      mockGetSocket.mockReturnValue(null);

      renderHook(() =>
        useCallSignaling({ callId: 'call-1', userId: 'user-1' })
      );

      expect(logger.warn).toHaveBeenCalledWith(
        '[useCallSignaling]',
        'Socket not available for listeners'
      );
    });
  });

  describe('waitForParticipantJoined', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('resolves when participant-joined event fires with matching callId', async () => {
      let capturedHandler: ((event: unknown) => void) | null = null;
      mockSocketOn.mockImplementation((event: string, handler: (event: unknown) => void) => {
        if (event === 'call:participant-joined') {
          capturedHandler = handler;
        }
      });

      const { result } = renderHook(() =>
        useCallSignaling({ callId: 'call-1', userId: 'user-1' })
      );

      const joinedEvent = {
        callId: 'call-1',
        participant: { id: 'user-2', userId: 'user-2' },
      };

      let resolved: unknown;
      act(() => {
        result.current.waitForParticipantJoined().then((e) => { resolved = e; });
      });

      act(() => {
        capturedHandler?.(joinedEvent);
      });

      await act(async () => { await Promise.resolve(); });

      expect(resolved).toEqual(joinedEvent);
    });

    it('rejects on timeout', async () => {
      const { result } = renderHook(() =>
        useCallSignaling({ callId: 'call-1', userId: 'user-1' })
      );

      let rejected: Error | undefined;
      act(() => {
        result.current.waitForParticipantJoined(100).catch((e: Error) => { rejected = e; });
      });

      await act(async () => {
        jest.advanceTimersByTime(200);
        await Promise.resolve();
      });

      expect(rejected?.message).toMatch(/timed out/i);
    });

    it('rejects immediately when socket is null', async () => {
      mockGetSocket.mockReturnValue(null);

      const { result } = renderHook(() =>
        useCallSignaling({ callId: 'call-1', userId: 'user-1' })
      );

      await act(async () => {
        await expect(result.current.waitForParticipantJoined()).rejects.toThrow('Socket not available');
      });
    });
  });
});
