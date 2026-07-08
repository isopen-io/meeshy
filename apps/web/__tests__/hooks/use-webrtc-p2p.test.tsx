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
import { WebRTCService } from '@/services/webrtc-service';

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
const mockSetIceServersStore = jest.fn();
let mockIceServers: RTCIceServer[] | null = null;

jest.mock('@/stores/call-store', () => {
  const buildState = () => ({
    localStream: null,
    iceServers: mockIceServers,
    setLocalStream: mockSetLocalStream,
    addRemoteStream: mockAddRemoteStream,
    addPeerConnection: mockAddPeerConnection,
    removePeerConnection: mockRemovePeerConnection,
    setError: mockSetError,
    setConnecting: mockSetConnecting,
    setIceServers: mockSetIceServersStore,
  });
  const useCallStore = Object.assign(buildState, { getState: buildState });
  return { useCallStore };
});

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
    mockHandleRenegotiationOffer.mockResolvedValue(undefined);
    mockSetRemoteAnswer.mockResolvedValue(undefined);

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

    // P1 leak fix: the peer connection was already created + registered
    // (createPeerConnection/addPeerConnection above) by the time
    // service.createOffer() throws — without cleanup it stays open and
    // registered forever.
    it('closes and deregisters the orphaned peer connection when offer creation fails', async () => {
      mockCreateOffer.mockRejectedValue(new Error('Offer failed'));

      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );

      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });

      expect(mockClose).toHaveBeenCalled();
      expect(mockRemovePeerConnection).toHaveBeenCalledWith(mockTargetUserId);
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

    // P1 leak fix: handleOffer's peer connection is already created +
    // registered (createPeerConnection/addPeerConnection) by the time
    // service.createAnswer() throws.
    it('closes and deregisters the orphaned peer connection when answering an incoming offer fails', async () => {
      mockCreateAnswer.mockRejectedValue(new Error('Answer failed'));

      renderHook(() => useWebRTCP2P({ callId: mockCallId, userId: mockUserId }));

      const signalHandler = getSignalHandler();

      await act(async () => {
        signalHandler({
          callId: mockCallId,
          signal: { type: 'offer', from: mockTargetUserId, to: mockUserId, sdp: 'offer-sdp' },
        });
      });

      expect(mockClose).toHaveBeenCalled();
      expect(mockRemovePeerConnection).toHaveBeenCalledWith(mockTargetUserId);
    });
  });

  describe('Participant cleanup on rejoin (removeParticipant)', () => {
    const getSignalHandler = () => {
      const call = [...mockOn.mock.calls].reverse().find((c) => c[0] === SERVER_EVENTS.CALL_SIGNAL);
      return call?.[1] as (event: any) => void;
    };

    it('closes the service, clears buffered ICE candidates/remote-description state, and deregisters the peer connection', async () => {
      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );

      // Establish a real connection + buffer a candidate before the answer,
      // so there is queued/established state to actually verify gets cleared.
      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });
      const signalHandler = getSignalHandler();
      await act(async () => {
        signalHandler({
          callId: mockCallId,
          signal: {
            type: 'ice-candidate', from: mockTargetUserId, to: mockUserId,
            candidate: 'candidate:queued', sdpMLineIndex: 0, sdpMid: '0',
          },
        });
      });
      expect(mockAddIceCandidate).not.toHaveBeenCalled(); // confirms it's queued, not yet applied

      act(() => {
        result.current.removeParticipant(mockTargetUserId);
      });

      expect(mockClose).toHaveBeenCalled();
      expect(mockRemovePeerConnection).toHaveBeenCalledWith(mockTargetUserId);

      // A rejoin's answer must NOT drain the old queue against the fresh
      // service — the candidate above must have been dropped, not carried
      // over to whatever connection gets created next for this participant.
      mockAddIceCandidate.mockClear();
      await act(async () => {
        signalHandler({
          callId: mockCallId,
          signal: { type: 'answer', from: mockTargetUserId, to: mockUserId, sdp: 'answer-sdp' },
        });
      });
      expect(mockAddIceCandidate).not.toHaveBeenCalled();
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

  describe('Duplicate initial offer (reconnect-replay race)', () => {
    const getSignalHandler = () => {
      const call = [...mockOn.mock.calls].reverse().find((c) => c[0] === SERVER_EVENTS.CALL_SIGNAL);
      return call?.[1] as (event: any) => void;
    };

    it('drops a second initial offer from the same peer that arrives while the first is still awaiting local media', async () => {
      // The gateway relays an offer live AND buffers it for replay on the
      // sender's next call:join (socket-churn reconnect recovery) — the same
      // tab can receive the same initial offer twice. Simulate that by
      // holding getLocalStream pending so handleOffer hasn't yet reached
      // createPeerConnection when the duplicate arrives.
      let resolveStream: (stream: MediaStream) => void = () => {};
      mockGetLocalStream.mockReturnValue(
        new Promise<MediaStream>((resolve) => {
          resolveStream = resolve;
        })
      );

      renderHook(() => useWebRTCP2P({ callId: mockCallId, userId: mockUserId }));
      const signalHandler = getSignalHandler();

      act(() => {
        signalHandler({
          callId: mockCallId,
          signal: { type: 'offer', from: mockTargetUserId, to: mockUserId, sdp: 'offer-sdp' },
        });
        signalHandler({
          callId: mockCallId,
          signal: { type: 'offer', from: mockTargetUserId, to: mockUserId, sdp: 'offer-sdp-dup' },
        });
      });

      await act(async () => {
        resolveStream(mockMediaStream);
        await Promise.resolve();
        await Promise.resolve();
      });

      // Only one RTCPeerConnection must ever be created for this peer — a
      // second call would silently orphan the first (never-closed) one.
      expect(mockCreatePeerConnection).toHaveBeenCalledTimes(1);
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

  // Gap fix (2026-07-07): web never had a call site for
  // call:request-ice-servers/call:ice-servers-refreshed — a call outliving
  // the TURN credential TTL had no way to get fresh ones.
  describe('TURN credential refresh', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('listens for call:ice-servers-refreshed and arms a periodic refresh timer on mount', () => {
      jest.useFakeTimers();
      renderHook(() => useWebRTCP2P({ callId: mockCallId, userId: mockUserId }));

      expect(mockOn).toHaveBeenCalledWith(SERVER_EVENTS.CALL_ICE_SERVERS_REFRESHED, expect.any(Function));

      // Default fallback TTL is 3600s, refreshed at 80% = 2880s.
      act(() => {
        jest.advanceTimersByTime(2880 * 1000);
      });

      expect(mockEmit).toHaveBeenCalledWith(
        CLIENT_EVENTS.CALL_REQUEST_ICE_SERVERS,
        { callId: mockCallId }
      );
    });

    it('requests fresh TURN credentials immediately when ICE connection state becomes disconnected', async () => {
      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );

      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });
      mockEmit.mockClear();

      const lastCallOptions = (WebRTCService as unknown as jest.Mock).mock.calls.at(-1)![0];
      act(() => {
        lastCallOptions.onIceConnectionStateChange('disconnected');
      });

      expect(mockEmit).toHaveBeenCalledWith(
        CLIENT_EVENTS.CALL_REQUEST_ICE_SERVERS,
        { callId: mockCallId }
      );
    });

    it('applies a refreshed ICE server list to the store and every existing peer connection, then reschedules using the real TTL', async () => {
      jest.useFakeTimers();
      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );

      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });

      const refreshedHandler = mockOn.mock.calls.find(
        (c) => c[0] === SERVER_EVENTS.CALL_ICE_SERVERS_REFRESHED
      )![1];

      const freshServers = [{ urls: 'turn:fresh.example.com', username: 'u', credential: 'c' }];
      act(() => {
        refreshedHandler({ callId: mockCallId, iceServers: freshServers, ttl: 600 });
      });

      expect(mockSetIceServersStore).toHaveBeenCalledWith(freshServers);
      expect(mockSetIceServers).toHaveBeenCalledWith(freshServers);

      // Rescheduled at 80% of the REAL ttl (600s), not the 3600s default.
      mockEmit.mockClear();
      act(() => {
        jest.advanceTimersByTime(480 * 1000);
      });
      expect(mockEmit).toHaveBeenCalledWith(
        CLIENT_EVENTS.CALL_REQUEST_ICE_SERVERS,
        { callId: mockCallId }
      );
    });

    it('ignores a refresh event for a different callId', async () => {
      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );

      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });

      const refreshedHandler = mockOn.mock.calls.find(
        (c) => c[0] === SERVER_EVENTS.CALL_ICE_SERVERS_REFRESHED
      )![1];

      act(() => {
        refreshedHandler({ callId: 'some-other-call', iceServers: [{ urls: 'turn:x' }], ttl: 600 });
      });

      expect(mockSetIceServersStore).not.toHaveBeenCalled();
    });

    it('clears the refresh timer on unmount', () => {
      jest.useFakeTimers();
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
      const { unmount } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );

      unmount();

      expect(clearTimeoutSpy).toHaveBeenCalled();
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
