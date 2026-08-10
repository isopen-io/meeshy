/**
 * Tests for useVideoCall hook
 *
 * The hook only exposes `startCall` (see hook JSDoc — Vague 57 removed
 * answerCall/rejectCall/endCall/toggleAudio/toggleVideo/isCallSupported/error,
 * none of which had a production caller).
 *
 * Tests cover:
 * - startCall functionality
 * - Media permissions handling
 * - Socket.IO integration
 * - Error handling for various media errors
 * - Cleanup of media streams on error
 */

import { renderHook, act } from '@testing-library/react';
import { useVideoCall } from '@/hooks/conversations/use-video-call';
import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import type { Conversation } from '@meeshy/shared/types';

// Mock toast
const mockToastError = jest.fn();
const mockToastSuccess = jest.fn();

jest.mock('sonner', () => ({
  toast: {
    error: (msg: string) => mockToastError(msg),
    success: (msg: string) => mockToastSuccess(msg),
  },
}));

// Mock auth — startCall's ack handler reads the current user id to build the
// initiator's CallSession (P0 fix, 2026-07-06). The user object/return value
// must be a STABLE reference across renders (matching the real hook's
// selector-based memoization) — recreating it per call would make
// `startCall`'s useCallback identity churn every render.
const mockAuthUser = { id: 'user-caller-1' };
const mockAuthReturn = { user: mockAuthUser, isChecking: false };
jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => mockAuthReturn,
}));

// Mock socket service
const mockGetSocket = jest.fn();
const mockEmit = jest.fn();

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    getSocket: () => mockGetSocket(),
    onStatusChange: jest.fn(() => () => {}),
  },
}));

// Mock navigator.mediaDevices
const mockGetUserMedia = jest.fn();

describe('useVideoCall', () => {
  const mockDirectConversation: Conversation = {
    id: 'conv-123',
    title: 'Direct Chat',
    type: 'direct',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Conversation;

  const mockGroupConversation: Conversation = {
    id: 'conv-456',
    title: 'Group Chat',
    type: 'group',
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Conversation;

  const mockMediaStream = {
    getTracks: jest.fn(() => [
      { stop: jest.fn() },
      { stop: jest.fn() },
    ]),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup navigator.mediaDevices mock
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: mockGetUserMedia,
      },
      writable: true,
      configurable: true,
    });

    mockGetUserMedia.mockResolvedValue(mockMediaStream);

    // Setup socket mock
    mockGetSocket.mockReturnValue({
      connected: true,
      emit: mockEmit,
    });

    // Default: resolve the call:initiate ack synchronously with success.
    // Vague 89 made startCall() genuinely await this ack (with a timeout
    // fallback) instead of firing emit and returning without waiting for
    // the callback — tests that only care about getUserMedia/emit args
    // (not the ack outcome) need SOME callback invocation or they'd hang
    // for the full CALL_INITIATE_ACK_TIMEOUT_MS. Tests that care about a
    // specific ack shape override this per-test as before.
    mockEmit.mockImplementation((_event: string, _data: unknown, cb?: Function) => {
      cb?.({ success: true, data: { callId: 'call-default-ack', mode: 'p2p', iceServers: [] } });
    });

    // Clean up window storage
    delete (window as any).__preauthorizedMediaStream;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('startCall', () => {
    it('should show error when conversation is null', async () => {
      const { result } = renderHook(() =>
        useVideoCall({ conversation: null })
      );

      await act(async () => {
        await result.current.startCall();
      });

      expect(mockToastError).toHaveBeenCalledWith('Please select a conversation first');
      expect(mockGetUserMedia).not.toHaveBeenCalled();
    });

    it('should show error for non-direct conversations', async () => {
      const { result } = renderHook(() =>
        useVideoCall({ conversation: mockGroupConversation })
      );

      await act(async () => {
        await result.current.startCall();
      });

      expect(mockToastError).toHaveBeenCalledWith(
        'Calls are only available for direct conversations'
      );
      expect(mockGetUserMedia).not.toHaveBeenCalled();
    });

    it('should request media permissions', async () => {
      const { result } = renderHook(() =>
        useVideoCall({ conversation: mockDirectConversation })
      );

      await act(async () => {
        await result.current.startCall();
      });

      expect(mockGetUserMedia).toHaveBeenCalledWith({
        audio: expect.objectContaining({
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }),
        video: expect.objectContaining({
          width: expect.any(Object),
          height: expect.any(Object),
          frameRate: expect.any(Object),
          facingMode: 'user',
        }),
      });
    });

    it('should store media stream on window', async () => {
      const { result } = renderHook(() =>
        useVideoCall({ conversation: mockDirectConversation })
      );

      await act(async () => {
        await result.current.startCall();
      });

      expect((window as any).__preauthorizedMediaStream).toBe(mockMediaStream);
    });

    it('should emit call:initiate event', async () => {
      const { result } = renderHook(() =>
        useVideoCall({ conversation: mockDirectConversation })
      );

      await act(async () => {
        await result.current.startCall();
      });

      expect(mockEmit).toHaveBeenCalledWith(
        CLIENT_EVENTS.CALL_INITIATE,
        {
          conversationId: mockDirectConversation.id,
          type: 'video',
          settings: {
            screenShareEnabled: true,
            translationEnabled: true,
          },
        },
        expect.any(Function)
      );
    });

    it('should show success toast after initiating call', async () => {
      mockEmit.mockImplementation((_event: string, _data: unknown, cb: Function) => {
        cb({ success: true, data: { callId: 'call-111', mode: 'p2p', iceServers: [] } });
      });

      const { result } = renderHook(() =>
        useVideoCall({ conversation: mockDirectConversation })
      );

      await act(async () => {
        await result.current.startCall();
      });

      expect(mockToastSuccess).toHaveBeenCalledWith('Starting call...');
    });

    it('should not show success toast when the ack is unsuccessful', async () => {
      mockEmit.mockImplementation((_event: string, _data: unknown, cb: Function) => {
        cb({ success: false });
      });

      const { result } = renderHook(() =>
        useVideoCall({ conversation: mockDirectConversation })
      );

      await act(async () => {
        await result.current.startCall();
      });

      expect(mockToastSuccess).not.toHaveBeenCalled();
    });

    it('should stop the pre-authorized stream and show an error toast when the ack is unsuccessful', async () => {
      const stopMock1 = jest.fn();
      const stopMock2 = jest.fn();
      mockGetUserMedia.mockResolvedValue({
        getTracks: () => [{ stop: stopMock1 }, { stop: stopMock2 }],
      });
      mockEmit.mockImplementation((_event: string, _data: unknown, cb: Function) => {
        cb({ success: false, error: { code: 'CALLEE_BUSY', message: 'User is busy' } });
      });

      const { result } = renderHook(() =>
        useVideoCall({ conversation: mockDirectConversation })
      );

      await act(async () => {
        await result.current.startCall();
      });

      expect(stopMock1).toHaveBeenCalled();
      expect(stopMock2).toHaveBeenCalled();
      expect((window as any).__preauthorizedMediaStream).toBeUndefined();
      expect(mockToastError).toHaveBeenCalledWith('User is busy');
    });

    it('should show a generic error toast when the ack fails without an error message', async () => {
      mockEmit.mockImplementation((_event: string, _data: unknown, cb: Function) => {
        cb({ success: false });
      });

      const { result } = renderHook(() =>
        useVideoCall({ conversation: mockDirectConversation })
      );

      await act(async () => {
        await result.current.startCall();
      });

      expect(mockToastError).toHaveBeenCalledWith('Failed to start call. Please try again.');
    });

    it('should handle disconnected socket', async () => {
      mockGetSocket.mockReturnValue({
        connected: false,
        emit: mockEmit,
      });

      const { result } = renderHook(() =>
        useVideoCall({ conversation: mockDirectConversation })
      );

      await act(async () => {
        await result.current.startCall();
      });

      expect(mockToastError).toHaveBeenCalledWith('Connection error. Please try again.');
      expect(mockEmit).not.toHaveBeenCalled();
    });

    it('should handle null socket', async () => {
      mockGetSocket.mockReturnValue(null);

      const { result } = renderHook(() =>
        useVideoCall({ conversation: mockDirectConversation })
      );

      await act(async () => {
        await result.current.startCall();
      });

      expect(mockToastError).toHaveBeenCalledWith('Connection error. Please try again.');
      expect(mockEmit).not.toHaveBeenCalled();
    });

    it('should cleanup stream on socket error', async () => {
      mockGetSocket.mockReturnValue(null);

      const stopMock1 = jest.fn();
      const stopMock2 = jest.fn();
      mockGetUserMedia.mockResolvedValue({
        getTracks: () => [
          { stop: stopMock1 },
          { stop: stopMock2 },
        ],
      });

      const { result } = renderHook(() =>
        useVideoCall({ conversation: mockDirectConversation })
      );

      await act(async () => {
        await result.current.startCall();
      });

      expect(stopMock1).toHaveBeenCalled();
      expect(stopMock2).toHaveBeenCalled();
      expect((window as any).__preauthorizedMediaStream).toBeUndefined();
    });
  });

  describe('Media Error Handling', () => {
    it('should handle NotAllowedError (permission denied)', async () => {
      const error = new Error('Permission denied');
      error.name = 'NotAllowedError';
      mockGetUserMedia.mockRejectedValue(error);

      const { result } = renderHook(() =>
        useVideoCall({ conversation: mockDirectConversation })
      );

      await act(async () => {
        await result.current.startCall();
      });

      expect(mockToastError).toHaveBeenCalledWith('Camera/microphone permission denied.');
    });

    it('should handle NotFoundError (no device)', async () => {
      const error = new Error('No device found');
      error.name = 'NotFoundError';
      mockGetUserMedia.mockRejectedValue(error);

      const { result } = renderHook(() =>
        useVideoCall({ conversation: mockDirectConversation })
      );

      await act(async () => {
        await result.current.startCall();
      });

      expect(mockToastError).toHaveBeenCalledWith('No camera or microphone found.');
    });

    it('should handle generic Error with message', async () => {
      const error = new Error('Device busy');
      error.name = 'DeviceBusyError';
      mockGetUserMedia.mockRejectedValue(error);

      const { result } = renderHook(() =>
        useVideoCall({ conversation: mockDirectConversation })
      );

      await act(async () => {
        await result.current.startCall();
      });

      expect(mockToastError).toHaveBeenCalledWith(
        'Failed to access camera/microphone: Device busy'
      );
    });

    it('should handle non-Error thrown value', async () => {
      mockGetUserMedia.mockRejectedValue('Unknown error string');

      const { result } = renderHook(() =>
        useVideoCall({ conversation: mockDirectConversation })
      );

      await act(async () => {
        await result.current.startCall();
      });

      expect(mockToastError).toHaveBeenCalledWith('Failed to access camera/microphone');
    });

    it('should cleanup stream on media error', async () => {
      const stopMock = jest.fn();

      // First call succeeds to get stream, then we simulate error after
      mockGetUserMedia.mockRejectedValue(new Error('Test error'));

      const { result } = renderHook(() =>
        useVideoCall({ conversation: mockDirectConversation })
      );

      await act(async () => {
        await result.current.startCall();
      });

      // Stream should not be stored on error
      expect((window as any).__preauthorizedMediaStream).toBeUndefined();
    });
  });

  describe('Handler Stability', () => {
    it('should return stable startCall reference', () => {
      const { result, rerender } = renderHook(() =>
        useVideoCall({ conversation: mockDirectConversation })
      );

      const firstStartCall = result.current.startCall;

      rerender();

      expect(result.current.startCall).toBe(firstStartCall);
    });

    it('should update startCall when conversation changes', () => {
      const { result, rerender } = renderHook(
        ({ conversation }) => useVideoCall({ conversation }),
        { initialProps: { conversation: mockDirectConversation } }
      );

      const firstStartCall = result.current.startCall;

      rerender({ conversation: mockGroupConversation });

      // Callback should be different because conversation changed
      expect(result.current.startCall).not.toBe(firstStartCall);
    });
  });

  describe('Video Constraints', () => {
    it('should request reasonable video quality', async () => {
      const { result } = renderHook(() =>
        useVideoCall({ conversation: mockDirectConversation })
      );

      await act(async () => {
        await result.current.startCall();
      });

      const callArgs = mockGetUserMedia.mock.calls[0][0];

      expect(callArgs.video.width.ideal).toBe(640);
      expect(callArgs.video.width.max).toBe(1280);
      expect(callArgs.video.height.ideal).toBe(480);
      expect(callArgs.video.height.max).toBe(720);
      expect(callArgs.video.frameRate.ideal).toBe(24);
      expect(callArgs.video.frameRate.max).toBe(30);
    });
  });

  describe('Edge Cases', () => {
    it('should ignore rapid re-invocations while a call is already starting', async () => {
      // Regression test — before the startCallInFlightRef guard, three rapid
      // invocations (double-click, or a re-render firing the handler twice)
      // acquired THREE separate camera/mic streams and the last getUserMedia
      // to resolve overwrote window.__preauthorizedMediaStream, silently
      // orphaning the earlier streams (nothing ever called stop() on them —
      // the camera/mic indicator stayed lit for the rest of the session).
      const { result } = renderHook(() =>
        useVideoCall({ conversation: mockDirectConversation })
      );

      // Start multiple calls rapidly, before the first getUserMedia call
      // (an unresolved promise here) settles.
      await act(async () => {
        const p1 = result.current.startCall();
        const p2 = result.current.startCall();
        const p3 = result.current.startCall();
        await Promise.all([p1, p2, p3]);
      });

      // Only the first invocation should reach getUserMedia/call:initiate —
      // the other two are dropped by the in-flight guard.
      expect(mockGetUserMedia).toHaveBeenCalledTimes(1);
      expect(mockEmit).toHaveBeenCalledTimes(1);
    });

    it('should allow a new startCall once the previous one has resolved via its ack', async () => {
      mockEmit.mockImplementation((_event: string, _data: unknown, cb: Function) => {
        cb({ success: true, data: { callId: 'call-222', mode: 'p2p', iceServers: [] } });
      });

      const { result } = renderHook(() =>
        useVideoCall({ conversation: mockDirectConversation })
      );

      await act(async () => {
        await result.current.startCall();
      });

      await act(async () => {
        await result.current.startCall();
      });

      expect(mockGetUserMedia).toHaveBeenCalledTimes(2);
      expect(mockEmit).toHaveBeenCalledTimes(2);
    });

    it('should allow a new startCall after the previous one failed on getUserMedia', async () => {
      mockGetUserMedia.mockRejectedValueOnce(new Error('boom'));

      const { result } = renderHook(() =>
        useVideoCall({ conversation: mockDirectConversation })
      );

      await act(async () => {
        await result.current.startCall();
      });

      mockGetUserMedia.mockResolvedValueOnce(mockMediaStream);

      await act(async () => {
        await result.current.startCall();
      });

      expect(mockGetUserMedia).toHaveBeenCalledTimes(2);
      expect(mockEmit).toHaveBeenCalledTimes(1);
    });

    it('should handle conversation change during call initiation', async () => {
      const { result, rerender } = renderHook(
        ({ conversation }) => useVideoCall({ conversation }),
        { initialProps: { conversation: mockDirectConversation } }
      );

      // Start call
      const callPromise = result.current.startCall();

      // Change conversation
      rerender({ conversation: mockGroupConversation });

      await act(async () => {
        await callPromise;
      });

      // Call should still complete based on original conversation
      expect(mockEmit).toHaveBeenCalledWith(
        CLIENT_EVENTS.CALL_INITIATE,
        {
          conversationId: mockDirectConversation.id,
          type: 'video',
          settings: expect.any(Object),
        },
        expect.any(Function)
      );
    });
  });

  describe('startCall ICE servers', () => {
    it('should call setIceServers when ack has iceServers with content', async () => {
      const iceServers = [
        { urls: 'stun:stun.example.com' },
        { urls: 'turn:turn.example.com', username: 'u', credential: 'p' },
      ];
      mockEmit.mockImplementation((_event: string, _data: unknown, cb: Function) => {
        cb({ success: true, data: { iceServers } });
      });

      const { result } = renderHook(() =>
        useVideoCall({ conversation: mockDirectConversation })
      );

      await act(async () => {
        await result.current.startCall('video');
      });

      const { useCallStore: storeModule } = await import('@/stores/call-store');
      expect(storeModule.getState().iceServers).toEqual(iceServers);
    });

    it('should not call setIceServers when ack has empty iceServers', async () => {
      mockEmit.mockImplementation((_event: string, _data: unknown, cb: Function) => {
        cb({ success: true, data: { iceServers: [] } });
      });

      const { result } = renderHook(() =>
        useVideoCall({ conversation: mockDirectConversation })
      );

      const { useCallStore: storeModule } = await import('@/stores/call-store');
      // ensure null before call
      storeModule.setState({ iceServers: null });

      await act(async () => {
        await result.current.startCall('video');
      });

      // Still null — not overwritten with empty array
      expect(storeModule.getState().iceServers).toBeNull();
    });

    it('should not call setIceServers when ack is unsuccessful', async () => {
      mockEmit.mockImplementation((_event: string, _data: unknown, cb: Function) => {
        cb({ success: false });
      });

      const { result } = renderHook(() =>
        useVideoCall({ conversation: mockDirectConversation })
      );

      const { useCallStore: storeModule } = await import('@/stores/call-store');
      storeModule.setState({ iceServers: null });

      await act(async () => {
        await result.current.startCall('video');
      });

      expect(storeModule.getState().iceServers).toBeNull();
    });
  });

  describe('call:initiate ack timeout (Vague 89)', () => {
    // Sibling of Vague 88's CallManager.tsx `acceptOrJoinCall` fix — same
    // Socket.IO-4.8-does-not-auto-reject-a-dropped-ack root cause, this time
    // on the CALL_INITIATE outbound-call path. Without a timeout, a dropped
    // ack leaves `startCallInFlightRef` stuck `true` forever (every future
    // Call button click silently swallowed by the guard at the top of
    // `startCall`) and the pre-authorized camera/mic stream never released.
    const CALL_INITIATE_ACK_TIMEOUT_MS = 10_000;

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('does not hang forever when the call:initiate ack is dropped — surfaces the failure toast', async () => {
      // emit intentionally never invokes its ack callback — simulates a
      // dropped ack packet (transport blip right after emit).
      mockEmit.mockImplementation(() => {});

      const { result } = renderHook(() =>
        useVideoCall({ conversation: mockDirectConversation })
      );

      let startPromise: Promise<void> | undefined;
      await act(async () => {
        startPromise = result.current.startCall();
      });

      await act(async () => {
        jest.advanceTimersByTime(CALL_INITIATE_ACK_TIMEOUT_MS + 1);
      });

      await startPromise;

      expect(mockToastError).toHaveBeenCalledWith('Failed to start call. Please try again.');
    });

    it('stops the pre-authorized stream tracks when the call:initiate ack times out (no orphaned hot mic/camera)', async () => {
      const stopMock1 = jest.fn();
      const stopMock2 = jest.fn();
      mockGetUserMedia.mockResolvedValue({
        getTracks: () => [{ stop: stopMock1 }, { stop: stopMock2 }],
      });
      mockEmit.mockImplementation(() => {});

      const { result } = renderHook(() =>
        useVideoCall({ conversation: mockDirectConversation })
      );

      let startPromise: Promise<void> | undefined;
      await act(async () => {
        startPromise = result.current.startCall();
      });

      await act(async () => {
        jest.advanceTimersByTime(CALL_INITIATE_ACK_TIMEOUT_MS + 1);
      });

      await startPromise;

      expect(stopMock1).toHaveBeenCalled();
      expect(stopMock2).toHaveBeenCalled();
      expect((window as any).__preauthorizedMediaStream).toBeUndefined();
    });

    it('releases the in-flight guard after the timeout so a retry actually re-attempts', async () => {
      mockEmit.mockImplementation(() => {}); // first attempt: drop the ack

      const { result } = renderHook(() =>
        useVideoCall({ conversation: mockDirectConversation })
      );

      let startPromise: Promise<void> | undefined;
      await act(async () => {
        startPromise = result.current.startCall();
      });

      await act(async () => {
        jest.advanceTimersByTime(CALL_INITIATE_ACK_TIMEOUT_MS + 1);
      });

      await startPromise;

      expect(mockGetUserMedia).toHaveBeenCalledTimes(1);

      // Retry now succeeds — proves startCallInFlightRef was released, not
      // left stuck true by the timed-out attempt.
      mockEmit.mockImplementation((_event: string, _data: unknown, cb: Function) => {
        cb({ success: true, data: { callId: 'call-retry', mode: 'p2p', iceServers: [] } });
      });

      await act(async () => {
        await result.current.startCall();
      });

      expect(mockGetUserMedia).toHaveBeenCalledTimes(2);
      expect(mockEmit).toHaveBeenCalledTimes(2);
    });

    it('does not retroactively fail an already-successful call:initiate once the timeout window later elapses', async () => {
      let capturedAck: ((response: unknown) => void) | undefined;
      mockEmit.mockImplementation((_event: string, _data: unknown, cb: Function) => {
        capturedAck = cb as (response: unknown) => void;
      });

      const { result } = renderHook(() =>
        useVideoCall({ conversation: mockDirectConversation })
      );

      let startPromise: Promise<void> | undefined;
      await act(async () => {
        startPromise = result.current.startCall();
      });

      await act(async () => {
        capturedAck?.({ success: true, data: { callId: 'call-ok', mode: 'p2p', iceServers: [] } });
      });

      await startPromise;

      expect(mockToastSuccess).toHaveBeenCalledWith('Starting call...');

      await act(async () => {
        jest.advanceTimersByTime(CALL_INITIATE_ACK_TIMEOUT_MS + 5000);
      });

      expect(mockToastError).not.toHaveBeenCalled();
    });
  });

  describe('startCall sets currentCall for the initiator (P0 fix, 2026-07-06)', () => {
    beforeEach(async () => {
      const { useCallStore: storeModule } = await import('@/stores/call-store');
      storeModule.setState({ currentCall: null, isInCall: false });
    });

    it('sets currentCall + isInCall from the ack — gateway never re-emits call:initiated to the initiator', async () => {
      mockEmit.mockImplementation((_event: string, _data: unknown, cb: Function) => {
        cb({ success: true, data: { callId: 'call-999', mode: 'p2p', iceServers: [] } });
      });

      const { result } = renderHook(() =>
        useVideoCall({ conversation: mockDirectConversation })
      );

      await act(async () => {
        await result.current.startCall('video');
      });

      const { useCallStore: storeModule } = await import('@/stores/call-store');
      const { currentCall, isInCall } = storeModule.getState();
      expect(isInCall).toBe(true);
      expect(currentCall).toMatchObject({
        id: 'call-999',
        conversationId: mockDirectConversation.id,
        mode: 'p2p',
        status: 'initiated',
        initiatorId: 'user-caller-1',
        participants: [],
      });
    });

    it('does not set currentCall when the ack is unsuccessful', async () => {
      mockEmit.mockImplementation((_event: string, _data: unknown, cb: Function) => {
        cb({ success: false });
      });

      const { result } = renderHook(() =>
        useVideoCall({ conversation: mockDirectConversation })
      );

      await act(async () => {
        await result.current.startCall('video');
      });

      const { useCallStore: storeModule } = await import('@/stores/call-store');
      expect(storeModule.getState().currentCall).toBeNull();
      expect(storeModule.getState().isInCall).toBe(false);
    });

    it('does not set currentCall when the ack carries no callId', async () => {
      mockEmit.mockImplementation((_event: string, _data: unknown, cb: Function) => {
        cb({ success: true, data: { iceServers: [] } });
      });

      const { result } = renderHook(() =>
        useVideoCall({ conversation: mockDirectConversation })
      );

      await act(async () => {
        await result.current.startCall('video');
      });

      const { useCallStore: storeModule } = await import('@/stores/call-store');
      expect(storeModule.getState().currentCall).toBeNull();
    });
  });
});
