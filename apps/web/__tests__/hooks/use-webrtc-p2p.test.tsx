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
import type { CallSignalEvent } from '@meeshy/shared/types/video-call';
import { WebRTCService } from '@/services/webrtc-service';
import { toast } from 'sonner';

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
const mockSwitchVideoSendTrack = jest.fn();
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
    switchVideoSendTrack: mockSwitchVideoSendTrack,
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
const mockSetCurrentCall = jest.fn();
let mockIceServers: RTCIceServer[] | null = null;
// Vague 113: `currentCall` as read by `useCallStore.getState()` inside
// `handleAnswer` — mutable per-test so the "first real answer" guard
// (`status === 'initiated'`) can be exercised in both directions.
let mockCurrentCall: { status: string; answeredAt?: Date; [key: string]: unknown } | null = null;

jest.mock('@/stores/call-store', () => {
  const buildState = () => ({
    localStream: null,
    iceServers: mockIceServers,
    currentCall: mockCurrentCall,
    setLocalStream: mockSetLocalStream,
    addRemoteStream: mockAddRemoteStream,
    addPeerConnection: mockAddPeerConnection,
    removePeerConnection: mockRemovePeerConnection,
    setError: mockSetError,
    setConnecting: mockSetConnecting,
    setIceServers: mockSetIceServersStore,
    setCurrentCall: mockSetCurrentCall,
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
    mockCurrentCall = null;

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

    // Vague 148: `handleAnswer` is the third negotiation-completing function
    // alongside `createOffer` and `handleOffer` above — a peer connection is
    // already created + registered (via the earlier `createOffer` call) by
    // the time `service.setRemoteDescription(answer)` throws. Unlike its two
    // siblings, `handleAnswer`'s catch block never called `removeParticipant`,
    // leaving the failed peer connection open and registered forever, and its
    // stale `WebRTCService` cached in `webrtcServicesRef` for any retry offer
    // to reuse instead of a fresh instance.
    it('closes and deregisters the orphaned peer connection when handling an answer fails', async () => {
      mockSetRemoteDescription.mockRejectedValueOnce(new Error('setRemoteDescription failed'));

      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );

      // The offerer's peer connection is created + registered here.
      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });
      mockClose.mockClear();
      mockRemovePeerConnection.mockClear();

      const signalHandler = getSignalHandler();

      await act(async () => {
        signalHandler({
          callId: mockCallId,
          signal: { type: 'answer', from: mockTargetUserId, to: mockUserId, sdp: 'answer-sdp' },
        });
      });

      expect(mockClose).toHaveBeenCalled();
      expect(mockRemovePeerConnection).toHaveBeenCalledWith(mockTargetUserId);
    });
  });

  describe('Handle Answer stamps the caller\'s answeredAt/active (Vague 113)', () => {
    // Root cause: iOS deliberately auto-early-joins the call room the
    // instant an incoming call is received (CallManager.swift
    // `joinCallRoomReliably`, fired from `reportIncomingVoIPCall` /
    // foreground incoming-call handling — "emit call:join IMMEDIATELY...
    // so the SDP offer can be received while ringing"), long before the
    // human answers. `CallManager.tsx`'s `handleParticipantJoined` used to
    // treat that room-join as the caller's "answered" signal, so a web
    // caller ringing an iOS callee saw its clock start (and status flip to
    // 'active') the instant that device started ringing — defeating the
    // ring-time-vs-talk-time fix Vague 110 made. The genuine pickup signal
    // is the SDP *answer*, which only a real Accept sends.
    const getSignalHandler = () => {
      const call = [...mockOn.mock.calls].reverse().find((c) => c[0] === SERVER_EVENTS.CALL_SIGNAL);
      return call?.[1] as (event: any) => void;
    };

    const fireAnswer = async (signalHandler: (event: any) => void, sdp = 'answer-sdp') => {
      await act(async () => {
        signalHandler({
          callId: mockCallId,
          signal: { type: 'answer', from: mockTargetUserId, to: mockUserId, sdp },
        });
      });
    };

    it('stamps status "active" and answeredAt the moment the real SDP answer is processed', async () => {
      mockCurrentCall = { id: mockCallId, status: 'initiated' };

      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );
      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });

      await fireAnswer(getSignalHandler());

      expect(mockSetCurrentCall).toHaveBeenCalledWith(
        expect.objectContaining({ id: mockCallId, status: 'active', answeredAt: expect.any(Date) })
      );
    });

    it('does not re-stamp answeredAt once the call is already active (renegotiation/ICE-restart answer)', async () => {
      mockCurrentCall = { id: mockCallId, status: 'active', answeredAt: new Date('2026-08-12T00:00:00Z') };

      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );
      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });

      await fireAnswer(getSignalHandler());

      expect(mockSetCurrentCall).not.toHaveBeenCalled();
    });

    it('does not throw when no currentCall is present', async () => {
      mockCurrentCall = null;

      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );
      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });

      await fireAnswer(getSignalHandler());

      expect(mockSetCurrentCall).not.toHaveBeenCalled();
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

    // Vague 86: no peer connection has been created yet (call still ringing —
    // the caller's own createOffer hasn't run, or the callee hasn't received
    // an offer signal). Silently resolving here means handleToggleVideo
    // (VideoCallInterface) treats it as a success and flips controls.videoEnabled
    // to true — the UI reports video as active while no camera track was ever
    // acquired or attached to anything.
    it('enableVideo rejects without touching the camera when no peer connection exists yet', async () => {
      const getUserMedia = jest.fn();
      (global.navigator as any).mediaDevices = { getUserMedia };

      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );

      await expect(result.current.enableVideo()).rejects.toThrow();
      expect(getUserMedia).not.toHaveBeenCalled();
    });

    // Vague 97: enableVideo() used to snapshot the connected peers BEFORE
    // awaiting getUserMedia (the camera permission prompt), then distribute
    // the acquired track over that stale snapshot. A peer joining the group
    // call DURING that window (an ordinary sequence — camera permission can
    // take human-scale time) was silently excluded forever: its video
    // transceiver stays recvonly, with no later event ever re-triggering
    // enableVideoSend for it.
    it('also enables sending on a peer that joins the group call while getUserMedia is still pending', async () => {
      const camTrack = { kind: 'video', id: 'cam', clone: jest.fn(() => ({ kind: 'video', id: 'clone' })) };
      const camStream = { getVideoTracks: () => [camTrack] };
      let resolveGetUserMedia: (value: unknown) => void = () => {};
      const pendingGetUserMedia = new Promise((resolve) => {
        resolveGetUserMedia = resolve;
      });
      (global.navigator as any).mediaDevices = {
        getUserMedia: jest.fn().mockReturnValue(pendingGetUserMedia),
      };

      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );
      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });

      let enableVideoPromise!: Promise<void>;
      act(() => {
        enableVideoPromise = result.current.enableVideo();
      });

      // A second peer joins the group call while the camera prompt is still
      // pending — an ordinary group-call sequence, no adversarial timing.
      await act(async () => {
        await result.current.createOffer(`${mockTargetUserId}-2`);
      });

      await act(async () => {
        resolveGetUserMedia(camStream);
        await enableVideoPromise;
      });

      expect(mockEnableVideoSend).toHaveBeenCalledTimes(2);
      expect(mockEnableVideoSend).toHaveBeenCalledWith(camTrack);
      expect(mockEnableVideoSend).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'clone' })
      );
    });

    // Same window, opposite edge: every peer leaves before getUserMedia
    // resolves. Resolving silently would leave a live, unattached camera
    // capture running — release it and fail loudly instead (mirrors the
    // zero-peer guard above, and the leak-avoidance pattern of every other
    // track-acquiring path in this file).
    it('releases the acquired camera and rejects when every peer leaves before getUserMedia resolves', async () => {
      const stoppedTracks: string[] = [];
      const camTrack = { kind: 'video', id: 'cam', stop: () => stoppedTracks.push('cam') };
      const camStream = { getVideoTracks: () => [camTrack], getTracks: () => [camTrack] };
      let resolveGetUserMedia: (value: unknown) => void = () => {};
      const pendingGetUserMedia = new Promise((resolve) => {
        resolveGetUserMedia = resolve;
      });
      (global.navigator as any).mediaDevices = {
        getUserMedia: jest.fn().mockReturnValue(pendingGetUserMedia),
      };

      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );
      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });

      let enableVideoPromise!: Promise<void>;
      act(() => {
        enableVideoPromise = result.current.enableVideo();
      });

      await act(async () => {
        result.current.removeParticipant(mockTargetUserId);
      });

      resolveGetUserMedia(camStream);
      await expect(enableVideoPromise).rejects.toThrow();
      expect(stoppedTracks).toEqual(['cam']);
      expect(mockEnableVideoSend).not.toHaveBeenCalled();
    });
  });

  describe('applyQualityTierToPeer (Vague 143 — per-peer adaptive bitrate)', () => {
    it('applies the tier to the named peer only', async () => {
      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );
      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });

      await act(async () => {
        await result.current.applyQualityTierToPeer(mockTargetUserId, 'low');
      });

      expect(mockApplyVideoEncoding).toHaveBeenCalledWith('low');
    });

    it('is a silent no-op for a peerId with no live service (already left / stale sample)', async () => {
      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );
      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });
      mockApplyVideoEncoding.mockClear();

      await act(async () => {
        await result.current.applyQualityTierToPeer('unknown-peer', 'low');
      });

      expect(mockApplyVideoEncoding).not.toHaveBeenCalled();
    });
  });

  describe('switchCamera (Vague 95 — front/back camera flip)', () => {
    it('acquires a new track and swaps it on the single peer (no clone needed)', async () => {
      const camTrack = { kind: 'video', id: 'cam-back', clone: jest.fn() };
      const camStream = { getVideoTracks: () => [camTrack] };
      const getUserMedia = jest.fn().mockResolvedValue(camStream);
      (global.navigator as any).mediaDevices = { getUserMedia };

      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );
      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });
      await act(async () => {
        await result.current.switchCamera('environment');
      });

      expect(getUserMedia).toHaveBeenCalledWith(
        expect.objectContaining({ video: expect.objectContaining({ facingMode: 'environment' }) })
      );
      expect(mockSwitchVideoSendTrack).toHaveBeenCalledWith(camTrack);
      expect(camTrack.clone).not.toHaveBeenCalled(); // single peer → no clone
    });

    it('gives the first peer the literal track and every other peer a clone (group call)', async () => {
      const camTrack = { kind: 'video', id: 'cam-front', clone: jest.fn(() => ({ kind: 'video', id: 'clone' })) };
      const camStream = { getVideoTracks: () => [camTrack] };
      (global.navigator as any).mediaDevices = {
        getUserMedia: jest.fn().mockResolvedValue(camStream),
      };

      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );
      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
        await result.current.createOffer(`${mockTargetUserId}-2`);
      });
      mockSwitchVideoSendTrack.mockClear();

      await act(async () => {
        await result.current.switchCamera('user');
      });

      expect(mockSwitchVideoSendTrack).toHaveBeenCalledTimes(2);
      expect(mockSwitchVideoSendTrack).toHaveBeenCalledWith(camTrack);
      expect(camTrack.clone).toHaveBeenCalledTimes(1);
      expect(mockSwitchVideoSendTrack).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'clone' })
      );
    });

    it('rejects without touching the camera when no peer connection exists yet', async () => {
      const getUserMedia = jest.fn();
      (global.navigator as any).mediaDevices = { getUserMedia };

      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );

      await expect(result.current.switchCamera('environment')).rejects.toThrow();
      expect(getUserMedia).not.toHaveBeenCalled();
    });

    // Vague 97: same stale-snapshot-before-await defect as enableVideo — a
    // peer joining while the camera prompt for the flip is still pending was
    // silently excluded from switchVideoSendTrack.
    it('also swaps the track on a peer that joins the group call while getUserMedia is still pending', async () => {
      const camTrack = { kind: 'video', id: 'cam-back', clone: jest.fn(() => ({ kind: 'video', id: 'clone' })) };
      const camStream = { getVideoTracks: () => [camTrack] };
      let resolveGetUserMedia: (value: unknown) => void = () => {};
      const pendingGetUserMedia = new Promise((resolve) => {
        resolveGetUserMedia = resolve;
      });
      (global.navigator as any).mediaDevices = {
        getUserMedia: jest.fn().mockReturnValue(pendingGetUserMedia),
      };

      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );
      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });

      let switchCameraPromise!: Promise<void>;
      act(() => {
        switchCameraPromise = result.current.switchCamera('environment');
      });

      await act(async () => {
        await result.current.createOffer(`${mockTargetUserId}-2`);
      });

      await act(async () => {
        resolveGetUserMedia(camStream);
        await switchCameraPromise;
      });

      expect(mockSwitchVideoSendTrack).toHaveBeenCalledTimes(2);
      expect(mockSwitchVideoSendTrack).toHaveBeenCalledWith(camTrack);
      expect(mockSwitchVideoSendTrack).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'clone' })
      );
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

    // --- call:reconnecting / call:reconnected — le serveur suit le restart ---
    // (parité iOS/Android : sans ces emits, un restart ICE web laissait le
    // statut serveur `active` et l'analytics aveugle à la reconnexion)

    const driveIce = async (states: string[]) => {
      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );
      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });
      mockEmit.mockClear();
      const lastCallOptions = (WebRTCService as unknown as jest.Mock).mock.calls.at(-1)![0];
      act(() => {
        for (const state of states) lastCallOptions.onIceConnectionStateChange(state);
      });
      return result;
    };

    it('émet call:reconnecting une seule fois par stall mid-call', async () => {
      await driveIce(['connected', 'disconnected', 'disconnected', 'failed']);

      const reconnecting = mockEmit.mock.calls.filter(
        ([event]) => event === CLIENT_EVENTS.CALL_RECONNECTING
      );
      expect(reconnecting).toHaveLength(1);
      expect(reconnecting[0][1]).toEqual({
        callId: mockCallId,
        participantId: mockUserId,
        attempt: 1,
      });
    });

    it('émet call:reconnected quand le média revient après un stall', async () => {
      await driveIce(['connected', 'disconnected', 'connected']);

      expect(mockEmit).toHaveBeenCalledWith(CLIENT_EVENTS.CALL_RECONNECTED, {
        callId: mockCallId,
        participantId: mockUserId,
      });
    });

    it('un flottement ICE pré-connexion n’est jamais un stall', async () => {
      await driveIce(['checking', 'disconnected']);

      const reconnectEvents = mockEmit.mock.calls.filter(
        ([event]) =>
          event === CLIENT_EVENTS.CALL_RECONNECTING || event === CLIENT_EVENTS.CALL_RECONNECTED
      );
      expect(reconnectEvents).toHaveLength(0);
    });

    // Vague 98: `isReconnecting` is the real stall signal exposed to callers
    // (e.g. call:analytics' reconnectionCount) — the connectionState value
    // it replaces never actually carries the string 'reconnecting'.
    it('expose isReconnecting=true pendant un stall mid-call, false une fois reconnecté', async () => {
      const result = await driveIce(['connected', 'disconnected']);
      expect(result.current.isReconnecting).toBe(true);

      act(() => {
        const lastCallOptions = (WebRTCService as unknown as jest.Mock).mock.calls.at(-1)![0];
        lastCallOptions.onIceConnectionStateChange('connected');
      });
      expect(result.current.isReconnecting).toBe(false);
    });

    it('isReconnecting reste false pour un flottement ICE pré-connexion', async () => {
      const result = await driveIce(['checking', 'disconnected']);
      expect(result.current.isReconnecting).toBe(false);
    });

    // Audit web-calls (2026-08-15): a stalled peer that never recovers and
    // genuinely LEAVES the call (group-call departure) must not leave
    // isReconnecting stuck true for the rest of the call.
    it('isReconnecting se réinitialise quand un pair en stall quitte définitivement l’appel', async () => {
      const result = await driveIce(['connected', 'disconnected']);
      expect(result.current.isReconnecting).toBe(true);

      act(() => {
        result.current.removeParticipant(mockTargetUserId);
      });

      expect(result.current.isReconnecting).toBe(false);
    });

    it('chaque cycle de stall porte une tentative incrémentée', async () => {
      await driveIce(['connected', 'disconnected', 'connected', 'failed']);

      const attempts = mockEmit.mock.calls
        .filter(([event]) => event === CLIENT_EVENTS.CALL_RECONNECTING)
        .map(([, payload]) => (payload as { attempt: number }).attempt);
      expect(attempts).toEqual([1, 2]);
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

  // Regression guard for W4 (group-calls gap analysis, 2026-08-13):
  // connectionState/iceConnectionState used to be bare useState scalars,
  // last-writer-wins across every participant's onConnectionStateChange —
  // now that the participant cap is lifted, one peer failing mid-call must
  // not flip the whole call to 'failed' (toast + onError) while the others
  // stay healthy, and the recovery/success side effects must fire once per
  // call, not once per participant.
  describe('Multi-peer connection state aggregation (W4)', () => {
    const secondTargetUserId = `${'user-789'}-2`;

    // `createOffer` constructs TWO `WebRTCService`s per call: one options-less
    // instance from `ensureLocalStream`/`initializeLocalStream` (the mocked
    // store's `localStream` is always `null`, so this fires every time), and
    // the real per-peer one from `getWebRTCService`, which is the only one
    // carrying the callback options this test drives. Filter down to those.
    const peerCallOptions = (index: number) =>
      (WebRTCService as unknown as jest.Mock).mock.calls.filter((call) => call[0])[index][0];

    const connectTwoPeers = async () => {
      const onError = jest.fn();
      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId, onError })
      );
      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });
      await act(async () => {
        await result.current.createOffer(secondTargetUserId);
      });
      return { result, onError, peer1: peerCallOptions(0), peer2: peerCallOptions(1) };
    };

    it('reports the call connected once ANY peer connects, and stays connected when a second peer later fails', async () => {
      const { result, onError, peer1, peer2 } = await connectTwoPeers();

      act(() => peer1.onConnectionStateChange('connected'));
      expect(result.current.connectionState).toBe('connected');

      (toast.error as jest.Mock).mockClear();
      act(() => peer2.onConnectionStateChange('failed'));

      expect(result.current.connectionState).toBe('connected');
      expect(toast.error).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });

    it('only reports the call failed once EVERY peer has failed', async () => {
      const { result, onError, peer1, peer2 } = await connectTwoPeers();

      act(() => peer1.onConnectionStateChange('failed'));
      expect(result.current.connectionState).toBe('failed');
      expect(toast.error).toHaveBeenCalledWith('Connection failed. Please try again.');
      expect(onError).toHaveBeenCalledTimes(1);

      // A second, already-failed peer must not re-fire the same global
      // error a second time — the aggregate did not change.
      (toast.error as jest.Mock).mockClear();
      onError.mockClear();
      act(() => peer2.onConnectionStateChange('failed'));
      expect(toast.error).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });

    it('recovers from failed once at least one peer connects again', async () => {
      const { result, peer1, peer2 } = await connectTwoPeers();

      act(() => peer1.onConnectionStateChange('failed'));
      act(() => peer2.onConnectionStateChange('failed'));
      expect(result.current.connectionState).toBe('failed');

      act(() => peer2.onConnectionStateChange('connected'));
      expect(result.current.connectionState).toBe('connected');
    });

    it('fires the "Connected!" toast once for the call, not once per participant', async () => {
      const { peer1, peer2 } = await connectTwoPeers();

      act(() => peer1.onConnectionStateChange('connected'));
      act(() => peer2.onConnectionStateChange('connected'));

      expect(toast.success).toHaveBeenCalledTimes(1);
    });

    it('drops a departed failed peer out of the aggregate instead of leaving the call stuck failed', async () => {
      const { result, peer1, peer2 } = await connectTwoPeers();

      act(() => peer1.onConnectionStateChange('connected'));
      act(() => peer2.onConnectionStateChange('failed'));
      expect(result.current.connectionState).toBe('connected');

      act(() => {
        result.current.removeParticipant(mockTargetUserId);
      });
      // Only the failed peer (peer2) remains registered — the call must now
      // read as failed, not silently stay 'connected' on a stale entry.
      expect(result.current.connectionState).toBe('failed');
    });

    it('same aggregation applies to iceConnectionState: one peer failing does not fail the call', async () => {
      const { result, peer1, peer2 } = await connectTwoPeers();

      act(() => peer1.onIceConnectionStateChange('connected'));
      act(() => peer2.onIceConnectionStateChange('failed'));

      expect(result.current.iceConnectionState).toBe('connected');
    });

    it('only surfaces the ICE "Connection failed. Retrying..." toast once every peer has failed', async () => {
      const { onError, peer1, peer2 } = await connectTwoPeers();

      // Both peers must be registered in the aggregate BEFORE either fails —
      // otherwise a lone peer failing while the other has never reported any
      // ICE state would trivially aggregate to 'failed' on its own, which is
      // not what this test is exercising.
      act(() => peer1.onIceConnectionStateChange('connected'));
      act(() => peer2.onIceConnectionStateChange('connected'));

      act(() => peer1.onIceConnectionStateChange('failed'));
      expect(toast.error).not.toHaveBeenCalledWith('Connection failed. Retrying...');
      expect(onError).not.toHaveBeenCalledWith(expect.objectContaining({ message: 'ICE_CONNECTION_FAILED' }));

      act(() => peer2.onIceConnectionStateChange('failed'));
      expect(toast.error).toHaveBeenCalledWith('Connection failed. Retrying...');
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'ICE_CONNECTION_FAILED' }));
    });

    it('a single peer exhausting ICE restart attempts does not escalate to a call-wide error while another peer is still connected (Vague 147)', async () => {
      const { result, onError, peer1, peer2 } = await connectTwoPeers();

      act(() => peer1.onConnectionStateChange('connected'));
      act(() => peer2.onConnectionStateChange('connected'));

      (toast.error as jest.Mock).mockClear();
      onError.mockClear();

      // scheduleIceRestart() in webrtc-service.ts raises this PER-PEER,
      // terminal signal only once ICE has already reached 'failed' for THAT
      // one peer (see its own onIceConnectionStateChange 'failed' branch
      // above, which already gates the call-wide escalation on the
      // AGGREGATE). Re-escalating it a second time here, ungated, would
      // toast/kill the whole call because one peer gave up — even though
      // peer1 is still connected and media keeps flowing for them.
      act(() => peer2.onError(new Error('ICE_RESTART_ATTEMPTS_EXHAUSTED')));

      expect(result.current.connectionState).toBe('connected');
      expect(toast.error).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });
  });

  // Bug fix (2026-07-27): iOS's CallManager enforces a per-peer negotiationId
  // high-water mark (packages/shared/types/video-call.ts,
  // WebRTCSignalBase.negotiationId) and silently drops any SDP/ICE signal
  // whose negotiationId is older than what it last sent. Web never stamped
  // this field, so an iOS caller's offer (negotiationId: 1) got an answer
  // back with no negotiationId — read by iOS as epoch 0, strictly less than
  // its own high-water mark of 1 — and iOS discarded the (valid) answer,
  // leaving the iOS caller stuck ringing until its own no-answer timeout.
  describe('Negotiation epoch (negotiationId)', () => {
    const getSignalHandler = () => {
      const call = [...mockOn.mock.calls].reverse().find((c) => c[0] === SERVER_EVENTS.CALL_SIGNAL);
      return call?.[1] as (event: any) => void;
    };

    it('stamps negotiationId=1 on the initial outgoing offer', async () => {
      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );

      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });

      expect(mockEmit).toHaveBeenCalledWith(
        CLIENT_EVENTS.CALL_SIGNAL,
        expect.objectContaining({
          signal: expect.objectContaining({ type: 'offer', negotiationId: 1 }),
        }),
        expect.any(Function)
      );
    });

    it('echoes the offer negotiationId back on the answer, so the caller does not drop it as stale', async () => {
      renderHook(() => useWebRTCP2P({ callId: mockCallId, userId: mockUserId }));
      const signalHandler = getSignalHandler();

      await act(async () => {
        signalHandler({
          callId: mockCallId,
          signal: { type: 'offer', from: mockTargetUserId, to: mockUserId, sdp: 'offer-sdp', negotiationId: 1 },
        });
      });

      expect(mockEmit).toHaveBeenCalledWith(
        CLIENT_EVENTS.CALL_SIGNAL,
        expect.objectContaining({
          signal: expect.objectContaining({ type: 'answer', negotiationId: 1 }),
        }),
        expect.any(Function)
      );
    });

    it('defaults to epoch 0 on the answer when the incoming offer carries no negotiationId (older client)', async () => {
      renderHook(() => useWebRTCP2P({ callId: mockCallId, userId: mockUserId }));
      const signalHandler = getSignalHandler();

      await act(async () => {
        signalHandler({
          callId: mockCallId,
          signal: { type: 'offer', from: mockTargetUserId, to: mockUserId, sdp: 'offer-sdp' },
        });
      });

      expect(mockEmit).toHaveBeenCalledWith(
        CLIENT_EVENTS.CALL_SIGNAL,
        expect.objectContaining({
          signal: expect.objectContaining({ type: 'answer', negotiationId: 0 }),
        }),
        expect.any(Function)
      );
    });

    it('stamps the current epoch on outgoing ICE candidates', async () => {
      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );

      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });
      mockEmit.mockClear();

      const lastCallOptions = (WebRTCService as unknown as jest.Mock).mock.calls.at(-1)![0];
      act(() => {
        lastCallOptions.onIceCandidate({ toJSON: () => ({ candidate: 'candidate:1', sdpMLineIndex: 0, sdpMid: '0' }) });
      });

      expect(mockEmit).toHaveBeenCalledWith(
        CLIENT_EVENTS.CALL_SIGNAL,
        expect.objectContaining({
          signal: expect.objectContaining({ type: 'ice-candidate', negotiationId: 1 }),
        }),
        expect.any(Function)
      );
    });

    it('bumps the epoch when web initiates a renegotiation offer', async () => {
      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );
      await act(async () => {
        await result.current.createOffer(mockTargetUserId); // epoch -> 1
      });
      mockEmit.mockClear();

      const lastCallOptions = (WebRTCService as unknown as jest.Mock).mock.calls.at(-1)![0];
      act(() => {
        lastCallOptions.onLocalDescription({ type: 'offer', sdp: 'reoffer-sdp' });
      });

      expect(mockEmit).toHaveBeenCalledWith(
        CLIENT_EVENTS.CALL_SIGNAL,
        expect.objectContaining({
          signal: expect.objectContaining({ type: 'offer', negotiationId: 2 }),
        }),
        expect.any(Function)
      );
    });

    it('echoes the tracked epoch on a renegotiation answer produced after receiving a re-offer', async () => {
      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );
      await act(async () => {
        await result.current.createOffer(mockTargetUserId); // epoch -> 1
      });
      const signalHandler = getSignalHandler();
      await act(async () => {
        signalHandler({
          callId: mockCallId,
          signal: { type: 'answer', from: mockTargetUserId, to: mockUserId, sdp: 'answer-sdp', negotiationId: 1 },
        });
      });

      // Peer re-offers with a bumped epoch (their ICE restart).
      await act(async () => {
        signalHandler({
          callId: mockCallId,
          signal: { type: 'offer', from: mockTargetUserId, to: mockUserId, sdp: 'reoffer-sdp', negotiationId: 5 },
        });
      });
      mockEmit.mockClear();

      const lastCallOptions = (WebRTCService as unknown as jest.Mock).mock.calls.at(-1)![0];
      act(() => {
        lastCallOptions.onLocalDescription({ type: 'answer', sdp: 'reanswer-sdp' });
      });

      expect(mockEmit).toHaveBeenCalledWith(
        CLIENT_EVENTS.CALL_SIGNAL,
        expect.objectContaining({
          signal: expect.objectContaining({ type: 'answer', negotiationId: 5 }),
        }),
        expect.any(Function)
      );
    });
  });

  // Security audit (2026-08-17) — `handleRenegotiationOffer`/`setRemoteAnswer`
  // apply straight to the live RTCPeerConnection with no epoch check of their
  // own; a captured older offer/answer replayed by a misbehaving participant
  // (or delivered out of order) used to be applied unconditionally. Guarded
  // by comparing against the per-peer negotiationId high-water mark BEFORE
  // it's raised — see `isStaleNegotiation` in use-webrtc-p2p.ts.
  describe('Stale/replayed renegotiation signals are dropped (replay protection)', () => {
    const getSignalHandler = () => {
      const call = [...mockOn.mock.calls].reverse().find((c) => c[0] === SERVER_EVENTS.CALL_SIGNAL);
      return call?.[1] as (event: CallSignalEvent) => void;
    };

    it('drops a replayed offer whose negotiationId is not newer than the already-applied epoch', async () => {
      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );
      await act(async () => {
        await result.current.createOffer(mockTargetUserId); // epoch -> 1
      });
      const signalHandler = getSignalHandler();
      await act(async () => {
        signalHandler({
          callId: mockCallId,
          signal: { type: 'answer', from: mockTargetUserId, to: mockUserId, sdp: 'answer-sdp', negotiationId: 1 },
        });
      });

      mockHandleRenegotiationOffer.mockClear();
      // A captured epoch-1 offer resent after the connection is established
      // at epoch 1 — not newer, must be dropped.
      await act(async () => {
        signalHandler({
          callId: mockCallId,
          signal: { type: 'offer', from: mockTargetUserId, to: mockUserId, sdp: 'replayed-offer-sdp', negotiationId: 1 },
        });
      });
      expect(mockHandleRenegotiationOffer).not.toHaveBeenCalled();

      // A genuinely newer re-offer must still go through.
      await act(async () => {
        signalHandler({
          callId: mockCallId,
          signal: { type: 'offer', from: mockTargetUserId, to: mockUserId, sdp: 'fresh-reoffer-sdp', negotiationId: 2 },
        });
      });
      expect(mockHandleRenegotiationOffer).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'offer', sdp: 'fresh-reoffer-sdp' })
      );
    });

    it('drops a replayed answer whose negotiationId is not newer than the already-applied epoch', async () => {
      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );
      await act(async () => {
        await result.current.createOffer(mockTargetUserId); // epoch -> 1
      });
      const signalHandler = getSignalHandler();
      await act(async () => {
        signalHandler({
          callId: mockCallId,
          signal: { type: 'answer', from: mockTargetUserId, to: mockUserId, sdp: 'answer-sdp', negotiationId: 1 },
        });
      });

      // Web initiates a renegotiation offer, bumping its own epoch to 2.
      const lastCallOptions = (WebRTCService as unknown as jest.Mock).mock.calls.at(-1)![0];
      act(() => {
        lastCallOptions.onLocalDescription({ type: 'offer', sdp: 'reoffer-sdp' });
      });

      mockSetRemoteAnswer.mockClear();
      // A captured epoch-1 answer resent once epoch 2 is already in flight —
      // stale, must be dropped.
      await act(async () => {
        signalHandler({
          callId: mockCallId,
          signal: { type: 'answer', from: mockTargetUserId, to: mockUserId, sdp: 'stale-answer-sdp', negotiationId: 1 },
        });
      });
      expect(mockSetRemoteAnswer).not.toHaveBeenCalled();

      // The genuine epoch-2 answer must still go through.
      await act(async () => {
        signalHandler({
          callId: mockCallId,
          signal: { type: 'answer', from: mockTargetUserId, to: mockUserId, sdp: 'fresh-answer-sdp', negotiationId: 2 },
        });
      });
      expect(mockSetRemoteAnswer).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'answer', sdp: 'fresh-answer-sdp' })
      );
    });

    it('does not treat a renegotiation signal with no negotiationId as stale (legacy/undefined stays fresh)', async () => {
      const { result } = renderHook(() =>
        useWebRTCP2P({ callId: mockCallId, userId: mockUserId })
      );
      await act(async () => {
        await result.current.createOffer(mockTargetUserId); // epoch -> 1
      });
      const signalHandler = getSignalHandler();
      await act(async () => {
        signalHandler({
          callId: mockCallId,
          signal: { type: 'answer', from: mockTargetUserId, to: mockUserId, sdp: 'answer-sdp', negotiationId: 1 },
        });
      });

      mockHandleRenegotiationOffer.mockClear();
      await act(async () => {
        signalHandler({
          callId: mockCallId,
          signal: { type: 'offer', from: mockTargetUserId, to: mockUserId, sdp: 'no-epoch-reoffer-sdp' },
        });
      });
      expect(mockHandleRenegotiationOffer).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'offer', sdp: 'no-epoch-reoffer-sdp' })
      );
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

    // Vague 141 (2026-08-17) — a userId correction mid-call (anonymous→
    // authenticated promotion, session token refresh) tears down every peer
    // connection just like the effect above proves, but a peer that had
    // already connected — or stalled — under the OLD userId left
    // `connectedPeersRef`/`stalledPeersRef`/`isReconnecting`/
    // `reconnectAttemptRef` stale, unlike `cleanup()` and `removeParticipant`
    // which both clear this same state.
    const latestPeerOptions = () =>
      (WebRTCService as unknown as jest.Mock).mock.calls.filter((call) => call[0]).at(-1)![0];

    it('clears the reconnecting/stalled state when userId changes mid-call', async () => {
      const { result, rerender } = renderHook(
        ({ userId }) => useWebRTCP2P({ callId: mockCallId, userId }),
        { initialProps: { userId: mockUserId } }
      );

      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });
      const peer = latestPeerOptions();

      // Peer connects, then genuinely stalls mid-call under the OLD userId.
      act(() => peer.onIceConnectionStateChange('connected'));
      act(() => peer.onIceConnectionStateChange('disconnected'));
      expect(result.current.isReconnecting).toBe(true);

      // userId is corrected while the call is still mid-stall.
      rerender({ userId: 'user-corrected' });

      expect(result.current.isReconnecting).toBe(false);
    });

    it('does not report a false "Reconnecting" state for a freshly recreated peer after a userId change', async () => {
      const { result, rerender } = renderHook(
        ({ userId }) => useWebRTCP2P({ callId: mockCallId, userId }),
        { initialProps: { userId: mockUserId } }
      );

      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });
      act(() => latestPeerOptions().onIceConnectionStateChange('connected'));

      rerender({ userId: 'user-corrected' });

      // Recreate the connection under the corrected userId — same participant
      // identity, brand-new WebRTCService/RTCPeerConnection.
      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });
      const freshPeer = latestPeerOptions();

      // The FIRST ever ICE state for the fresh service — a normal
      // pre-connection blip, never a mid-call stall.
      act(() => freshPeer.onIceConnectionStateChange('disconnected'));

      expect(result.current.isReconnecting).toBe(false);
    });

    it('resets the reconnect attempt counter when userId changes mid-call', async () => {
      const { result, rerender } = renderHook(
        ({ userId }) => useWebRTCP2P({ callId: mockCallId, userId }),
        { initialProps: { userId: mockUserId } }
      );

      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });
      act(() => latestPeerOptions().onIceConnectionStateChange('connected'));
      act(() => latestPeerOptions().onIceConnectionStateChange('disconnected'));
      expect(mockEmit).toHaveBeenCalledWith(
        CLIENT_EVENTS.CALL_RECONNECTING,
        expect.objectContaining({ attempt: 1 }),
      );

      rerender({ userId: 'user-corrected' });

      await act(async () => {
        await result.current.createOffer(mockTargetUserId);
      });
      const freshPeer = latestPeerOptions();
      act(() => freshPeer.onIceConnectionStateChange('connected'));
      mockEmit.mockClear();
      act(() => freshPeer.onIceConnectionStateChange('disconnected'));

      // A genuinely fresh first stall under the corrected userId must count
      // as attempt 1, not a leaked attempt 2 from the pre-correction stall.
      expect(mockEmit).toHaveBeenCalledWith(
        CLIENT_EVENTS.CALL_RECONNECTING,
        expect.objectContaining({ attempt: 1 }),
      );
    });
  });
});
