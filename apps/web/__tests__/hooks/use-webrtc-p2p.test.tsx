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
    onStatusChange: jest.fn(() => () => {}),
  },
}));

// Mock WebRTC Service
const mockCreatePeerConnection = jest.fn();
const mockAddTrack = jest.fn();
const mockAddLocalMedia = jest.fn();
const mockCreateOffer = jest.fn();
const mockCreateAnswer = jest.fn();
const mockSetRemoteDescription = jest.fn();
const mockSetRemoteAnswer = jest.fn();
const mockHandleRenegotiationOffer = jest.fn();
const mockAddIceCandidate = jest.fn();
const mockGetLocalStream = jest.fn();
const mockClose = jest.fn();
const mockSetIceServers = jest.fn();
const mockSetNegotiationRole = jest.fn();
const mockEnableVideoSend = jest.fn();
const mockDisableVideoSend = jest.fn();
const mockApplyVideoEncoding = jest.fn();
const mockSetJitterBufferTargets = jest.fn();

jest.mock('@/services/webrtc-service', () => ({
  WebRTCService: jest.fn().mockImplementation((options?: any) => ({
    createPeerConnection: mockCreatePeerConnection,
    addTrack: mockAddTrack,
    addLocalMedia: mockAddLocalMedia,
    createOffer: mockCreateOffer,
    createAnswer: mockCreateAnswer,
    setRemoteDescription: mockSetRemoteDescription,
    setRemoteAnswer: mockSetRemoteAnswer,
    handleRenegotiationOffer: mockHandleRenegotiationOffer,
    addIceCandidate: mockAddIceCandidate,
    getLocalStream: mockGetLocalStream,
    setIceServers: mockSetIceServers,
    setNegotiationRole: mockSetNegotiationRole,
    enableVideoSend: mockEnableVideoSend,
    disableVideoSend: mockDisableVideoSend,
    applyVideoEncoding: mockApplyVideoEncoding,
    setJitterBufferTargets: mockSetJitterBufferTargets,
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
let mockIceServers: RTCIceServer[] | null = null;

jest.mock('@/stores/call-store', () => ({
  useCallStore: () => ({
    localStream: null,
    iceServers: mockIceServers,
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
    getAudioTracks: () => [{ kind: 'audio', id: 'audio-track', enabled: true }],
    getVideoTracks: () => [{ kind: 'video', id: 'video-track', enabled: true }],
  } as unknown as MediaStream;

  const mockPeerConnection = {
    connectionState: 'new',
    iceConnectionState: 'new',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockIceServers = null;

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
      expect(mockAddLocalMedia).toHaveBeenCalled();
      expect(mockCreateOffer).toHaveBeenCalled();
      expect(mockEmit).toHaveBeenCalledWith(
        CLIENT_EVENTS.CALL_SIGNAL,
        expect.objectContaining({
          callId: mockCallId,
          signal: expect.objectContaining({
            type: 'offer',
            from: mockUserId,
            to: mockTargetUserId,
          }),
        }),
        expect.any(Function)
      );
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

  describe('Server ICE servers (TURN)', () => {
    it('should apply server-provided ICE servers before creating the peer connection', async () => {
      mockIceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'turn:turn.meeshy.me:3478', username: '1700000000:user-456', credential: 'hmac-cred' },
      ];

      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );

      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });

      expect(mockSetIceServers).toHaveBeenCalledWith(mockIceServers);

      // The TURN servers MUST be applied before the RTCPeerConnection is built,
      // otherwise the offer carries STUN-only candidates.
      const setIceOrder = mockSetIceServers.mock.invocationCallOrder[0];
      const createPcOrder = mockCreatePeerConnection.mock.invocationCallOrder[0];
      expect(setIceOrder).toBeLessThan(createPcOrder);
    });

    it('should not call setIceServers when no server ICE servers are available', async () => {
      mockIceServers = null;

      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );

      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });

      expect(mockSetIceServers).not.toHaveBeenCalled();
    });
  });

  describe('ICE candidate buffering (offerer)', () => {
    const getSignalHandler = () => {
      const call = [...mockOn.mock.calls].reverse().find((c) => c[0] === SERVER_EVENTS.CALL_SIGNAL);
      return call?.[1] as (event: any) => void;
    };

    it('should buffer remote ICE candidates that arrive before the answer, then apply them', async () => {
      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );

      // Offerer creates the offer -> a WebRTC service now exists for the target,
      // but no remote description has been applied yet (answer not received).
      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });

      const signalHandler = getSignalHandler();

      // A remote ICE candidate arrives BEFORE the answer.
      await act(async () => {
        signalHandler({
          callId: mockCallId,
          signal: {
            type: 'ice-candidate',
            from: mockTargetUserId,
            to: mockUserId,
            candidate: 'candidate:early',
            sdpMLineIndex: 0,
            sdpMid: '0',
          },
        });
      });

      // It must be queued, not applied (would throw InvalidStateError otherwise).
      expect(mockAddIceCandidate).not.toHaveBeenCalled();

      // The answer arrives -> remote description applied -> queue drained.
      await act(async () => {
        signalHandler({
          callId: mockCallId,
          signal: { type: 'answer', from: mockTargetUserId, to: mockUserId, sdp: 'answer-sdp' },
        });
      });

      expect(mockSetRemoteDescription).toHaveBeenCalled();
      expect(mockAddIceCandidate).toHaveBeenCalledWith(
        expect.objectContaining({ candidate: 'candidate:early' })
      );
    });
  });

  describe('Renegotiation routing (A/V switch / ICE restart)', () => {
    const getSignalHandler = () => {
      const call = [...mockOn.mock.calls].reverse().find((c) => c[0] === SERVER_EVENTS.CALL_SIGNAL);
      return call?.[1] as (event: any) => void;
    };

    const establish = async (result: any) => {
      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });
      const signalHandler = getSignalHandler();
      // Initial answer establishes the connection (sets remote description).
      await act(async () => {
        signalHandler({
          callId: mockCallId,
          signal: { type: 'answer', from: mockTargetUserId, to: mockUserId, sdp: 'answer-sdp' },
        });
      });
      return signalHandler;
    };

    it('assigns a deterministic negotiation role when creating a service', async () => {
      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );
      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });
      expect(mockSetNegotiationRole).toHaveBeenCalledWith(mockUserId, mockTargetUserId);
    });

    it('routes a SECOND offer on an established connection to handleRenegotiationOffer (no rebuild)', async () => {
      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );
      const signalHandler = await establish(result);

      mockCreateAnswer.mockClear();
      await act(async () => {
        signalHandler({
          callId: mockCallId,
          signal: { type: 'offer', from: mockTargetUserId, to: mockUserId, sdp: 'reoffer-sdp' },
        });
      });

      expect(mockHandleRenegotiationOffer).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'offer', sdp: 'reoffer-sdp' })
      );
      // Must NOT tear down and rebuild via the initial-offer path.
      expect(mockCreateAnswer).not.toHaveBeenCalled();
    });

    it('routes an answer on an established connection to setRemoteAnswer', async () => {
      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );
      const signalHandler = await establish(result);

      await act(async () => {
        signalHandler({
          callId: mockCallId,
          signal: { type: 'answer', from: mockTargetUserId, to: mockUserId, sdp: 'reanswer-sdp' },
        });
      });

      expect(mockSetRemoteAnswer).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'answer', sdp: 'reanswer-sdp' })
      );
    });
  });

  describe('Mid-call A/V switch (FaceTime-style)', () => {
    it('enableVideo acquires a camera track and enables sending on the peer', async () => {
      const camTrack = { kind: 'video', id: 'cam', clone: jest.fn() };
      const camStream = { getVideoTracks: () => [camTrack] };
      (global.navigator as any).mediaDevices = {
        getUserMedia: jest.fn().mockResolvedValue(camStream),
      };

      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );
      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });
      await act(async () => {
        await result.current.enableVideo();
      });

      expect((global.navigator as any).mediaDevices.getUserMedia).toHaveBeenCalled();
      expect(mockEnableVideoSend).toHaveBeenCalledWith(camTrack);
      expect(camTrack.clone).not.toHaveBeenCalled(); // single peer → no clone
    });

    it('disableVideo stops sending on the peer', async () => {
      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );
      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });
      await act(async () => {
        await result.current.disableVideo();
      });

      expect(mockDisableVideoSend).toHaveBeenCalled();
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
