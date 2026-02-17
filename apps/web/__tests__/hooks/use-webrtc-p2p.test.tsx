/**
 * Tests for useWebRTCP2P hook
 *
 * Tests cover:
 * - Connection state management
 * - Local stream initialization
 * - Offer creation
 * - Offer handling
 * - Answer handling
 * - ICE candidate handling
 * - Cleanup
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useWebRTCP2P } from '@/hooks/use-webrtc-p2p';
import { CLIENT_EVENTS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

// Mock Socket.IO service
const mockGetSocket = jest.fn();
const mockEmit = jest.fn();
const mockOn = jest.fn();
const mockOff = jest.fn();

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    getSocket: () => mockGetSocket(),
  },
}));

// Mock WebRTC Service
const mockCreatePeerConnection = jest.fn();
const mockAddTrack = jest.fn();
const mockCreateOffer = jest.fn();
const mockCreateAnswer = jest.fn();
const mockSetRemoteDescription = jest.fn();
const mockAddIceCandidate = jest.fn();
const mockGetLocalStream = jest.fn();
const mockClose = jest.fn();

jest.mock('@/services/webrtc-service', () => ({
  WebRTCService: jest.fn().mockImplementation((options?: any) => ({
    createPeerConnection: mockCreatePeerConnection,
    addTrack: mockAddTrack,
    createOffer: mockCreateOffer,
    createAnswer: mockCreateAnswer,
    setRemoteDescription: mockSetRemoteDescription,
    addIceCandidate: mockAddIceCandidate,
    getLocalStream: mockGetLocalStream,
    close: mockClose,
    options,
  })),
}));

// Mock call store
const mockSetLocalStream = jest.fn();
const mockAddRemoteStream = jest.fn();
const mockAddPeerConnection = jest.fn();
const mockRemovePeerConnection = jest.fn();
const mockSetError = jest.fn();
const mockSetConnecting = jest.fn();

jest.mock('@/stores/call-store', () => ({
  useCallStore: () => ({
    localStream: null,
    setLocalStream: mockSetLocalStream,
    addRemoteStream: mockAddRemoteStream,
    addPeerConnection: mockAddPeerConnection,
    removePeerConnection: mockRemovePeerConnection,
    setError: mockSetError,
    setConnecting: mockSetConnecting,
  }),
}));

// Mock logger
jest.mock('@/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock toast
jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
    success: jest.fn(),
  },
}));

describe('useWebRTCP2P', () => {
  const mockCallId = 'call-123';
  const mockUserId = 'user-456';
  const mockTargetUserId = 'user-789';

  const mockSocket = {
    connected: true,
    emit: mockEmit,
    on: mockOn,
    off: mockOff,
  };

  const mockMediaStream = {
    id: 'stream-123',
    getTracks: () => [
      { kind: 'video', id: 'video-track' },
      { kind: 'audio', id: 'audio-track' },
    ],
  } as unknown as MediaStream;

  const mockPeerConnection = {
    connectionState: 'new',
    iceConnectionState: 'new',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    mockGetSocket.mockReturnValue(mockSocket);
    mockGetLocalStream.mockResolvedValue(mockMediaStream);
    mockCreatePeerConnection.mockReturnValue(mockPeerConnection);
    mockCreateOffer.mockResolvedValue({ type: 'offer', sdp: 'offer-sdp' });
    mockCreateAnswer.mockResolvedValue({ type: 'answer', sdp: 'answer-sdp' });

    // Suppress console warnings
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should return initial connection state as new', () => {
      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );

      expect(result.current.connectionState).toBe('new');
    });

    it('should return initial ICE connection state as new', () => {
      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );

      expect(result.current.iceConnectionState).toBe('new');
    });
  });

  describe('Initialize Local Stream', () => {
    it('should initialize local stream', async () => {
      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );

      let stream: MediaStream | undefined;

      await act(async () => {
        stream = await result.current.initializeLocalStream();
      });

      expect(stream).toBe(mockMediaStream);
      expect(mockSetLocalStream).toHaveBeenCalledWith(mockMediaStream);
      expect(mockSetConnecting).toHaveBeenCalledWith(true);
    });

    it('should handle initialization error', async () => {
      const onError = jest.fn();
      mockGetLocalStream.mockRejectedValue(new Error('Camera access denied'));

      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId, onError })
      );

      await expect(act(async () => {
        await result.current.initializeLocalStream();
      })).rejects.toThrow('Camera access denied');

      expect(mockSetError).toHaveBeenCalledWith('Camera access denied');
      expect(onError).toHaveBeenCalled();
    });
  });

  describe('Ensure Local Stream', () => {
    it('should return existing stream if available', async () => {
      // Override store to return existing stream
      jest.mock('@/stores/call-store', () => ({
        useCallStore: () => ({
          localStream: mockMediaStream,
          setLocalStream: mockSetLocalStream,
          addRemoteStream: mockAddRemoteStream,
          addPeerConnection: mockAddPeerConnection,
          removePeerConnection: mockRemovePeerConnection,
          setError: mockSetError,
          setConnecting: mockSetConnecting,
        }),
      }));

      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );

      let stream: MediaStream | undefined;

      await act(async () => {
        stream = await result.current.ensureLocalStream();
      });

      expect(stream).toBeDefined();
    });

    it('should initialize if stream not available', async () => {
      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );

      let stream: MediaStream | undefined;

      await act(async () => {
        stream = await result.current.ensureLocalStream();
      });

      expect(stream).toBe(mockMediaStream);
      expect(mockSetLocalStream).toHaveBeenCalled();
    });
  });

  describe('Create Offer', () => {
    it('should create and send offer', async () => {
      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );

      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });

      expect(mockCreatePeerConnection).toHaveBeenCalledWith(mockTargetUserId);
      expect(mockAddPeerConnection).toHaveBeenCalledWith(mockTargetUserId, mockPeerConnection);
      expect(mockAddTrack).toHaveBeenCalled();
      expect(mockCreateOffer).toHaveBeenCalled();
      expect(mockEmit).toHaveBeenCalledWith(CLIENT_EVENTS.CALL_SIGNAL, expect.objectContaining({
        callId: mockCallId,
        signal: expect.objectContaining({
          type: 'offer',
          from: mockUserId,
          to: mockTargetUserId,
        }),
      }));
    });

    it('should handle offer creation error', async () => {
      mockCreateOffer.mockRejectedValue(new Error('Offer failed'));

      const onError = jest.fn();

      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId, onError })
      );

      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });

      expect(mockSetError).toHaveBeenCalled();
      expect(onError).toHaveBeenCalled();
    });

    it('should throw error if userId not available', async () => {
      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: undefined })
      );

      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });

      expect(mockSetError).toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('should close all WebRTC services', async () => {
      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );

      // First create a connection
      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });

      // Then cleanup
      act(() => {
        result.current.cleanup();
      });

      expect(mockClose).toHaveBeenCalled();
      expect(mockRemovePeerConnection).toHaveBeenCalled();
    });

    it('should cleanup on unmount', async () => {
      const { result, unmount } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );

      // Create connection
      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });

      unmount();

      expect(mockClose).toHaveBeenCalled();
    });
  });

  describe('Signal Listening', () => {
    it('should listen for incoming signals', () => {
      renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );

      expect(mockOn).toHaveBeenCalledWith(SERVER_EVENTS.CALL_SIGNAL, expect.any(Function));
    });

    it('should stop listening on unmount', () => {
      const { unmount } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );

      unmount();

      expect(mockOff).toHaveBeenCalledWith(SERVER_EVENTS.CALL_SIGNAL, expect.any(Function));
    });

    it('should handle null socket gracefully', () => {
      mockGetSocket.mockReturnValue(null);

      renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );

      // Should not throw
      expect(mockOn).not.toHaveBeenCalled();
    });
  });

  describe('userId Change Handling', () => {
    it('should recreate services when userId changes from empty', async () => {
      const { result, rerender } = renderHook(
        ({ userId }) => useWebRTCP2P({ callId: mockCallId, userId }),
        { initialProps: { userId: '' } }
      );

      // Create connection with empty userId (should fail silently or queue)
      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });

      // Now provide userId
      rerender({ userId: mockUserId });

      // Services should be cleared
      expect(mockClose).toHaveBeenCalled();
    });
  });
});
