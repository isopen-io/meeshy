/**
 * Call Store Tests
 * Tests for video call state management with Zustand
 */

import { act } from '@testing-library/react';
import { useCallStore } from '../../stores/call-store';
import type { CallSession, CallParticipant, CallControls } from '@meeshy/shared/types/video-call';

// Mock socket service for heartbeat tests
const mockSocketEmit = jest.fn();
const mockGetSocket = jest.fn();

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    getSocket: () => mockGetSocket(),
  },
}));

// Mock MediaStream and RTCPeerConnection
class MockMediaStream {
  private tracks: MediaStreamTrack[] = [];

  constructor() {
    this.tracks = [];
  }

  getTracks() {
    return this.tracks;
  }

  getAudioTracks() {
    return this.tracks.filter(t => t.kind === 'audio');
  }

  getVideoTracks() {
    return this.tracks.filter(t => t.kind === 'video');
  }

  addTrack(track: MediaStreamTrack) {
    this.tracks.push(track);
  }
}

class MockMediaStreamTrack {
  kind: 'audio' | 'video';
  enabled: boolean = true;
  stopped: boolean = false;

  constructor(kind: 'audio' | 'video') {
    this.kind = kind;
  }

  stop() {
    this.stopped = true;
  }
}

class MockRTCPeerConnection {
  closed: boolean = false;

  close() {
    this.closed = true;
  }
}

// Set up global mocks
global.MediaStream = MockMediaStream as any;
global.RTCPeerConnection = MockRTCPeerConnection as any;

describe('CallStore', () => {
  const mockParticipant: CallParticipant = {
    id: 'participant-1',
    name: 'John Doe',
    isAudioEnabled: true,
    isVideoEnabled: true,
    isSpeaking: false,
    joinedAt: new Date(),
  } as any;

  const mockParticipant2: CallParticipant = {
    id: 'participant-2',
    name: 'Jane Doe',
    isAudioEnabled: true,
    isVideoEnabled: false,
    isSpeaking: false,
    joinedAt: new Date(),
  } as any;

  const mockCallSession: CallSession = {
    id: 'call-123',
    conversationId: 'conv-123',
    type: 'video',
    status: 'active',
    participants: [mockParticipant],
    initiatorId: 'user-1',
    startedAt: new Date(),
  } as any;

  beforeEach(() => {
    // Reset the store to initial state
    act(() => {
      useCallStore.setState({
        currentCall: null,
        localStream: null,
        remoteStreams: new Map(),
        peerConnections: new Map(),
        sfuDevice: null,
        sfuTransport: null,
        controls: {
          audioEnabled: true,
          videoEnabled: true,
          screenShareEnabled: false,
        },
        isConnecting: false,
        isInCall: false,
        error: null,
        transcriptions: [],
        isTranscribing: false,
        translations: new Map(),
      });
    });
    jest.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = useCallStore.getState();

      expect(state.currentCall).toBeNull();
      expect(state.localStream).toBeNull();
      expect(state.remoteStreams.size).toBe(0);
      expect(state.peerConnections.size).toBe(0);
      expect(state.controls.audioEnabled).toBe(true);
      expect(state.controls.videoEnabled).toBe(true);
      expect(state.controls.screenShareEnabled).toBe(false);
      expect(state.isConnecting).toBe(false);
      expect(state.isInCall).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('Call Management', () => {
    describe('setCurrentCall', () => {
      it('should set current call and mark as in call', () => {
        act(() => {
          useCallStore.getState().setCurrentCall(mockCallSession);
        });

        const state = useCallStore.getState();
        expect(state.currentCall).toEqual(mockCallSession);
        expect(state.isInCall).toBe(true);
        expect(state.error).toBeNull();
      });

      it('should clear current call when set to null', () => {
        act(() => {
          useCallStore.getState().setCurrentCall(mockCallSession);
          useCallStore.getState().setCurrentCall(null);
        });

        expect(useCallStore.getState().currentCall).toBeNull();
      });
    });

    describe('updateCallStatus', () => {
      it('should update call status', () => {
        act(() => {
          useCallStore.getState().setCurrentCall(mockCallSession);
          useCallStore.getState().updateCallStatus('ended');
        });

        expect(useCallStore.getState().currentCall?.status).toBe('ended');
      });

      it('should not update if no current call', () => {
        act(() => {
          useCallStore.getState().updateCallStatus('ended');
        });

        expect(useCallStore.getState().currentCall).toBeNull();
      });
    });

    describe('addParticipant', () => {
      it('should add a new participant', () => {
        act(() => {
          useCallStore.getState().setCurrentCall(mockCallSession);
          useCallStore.getState().addParticipant(mockParticipant2);
        });

        expect(useCallStore.getState().currentCall?.participants).toHaveLength(2);
      });

      it('should update existing participant', () => {
        const updatedParticipant = { ...mockParticipant, isVideoEnabled: false };

        act(() => {
          useCallStore.getState().setCurrentCall(mockCallSession);
          useCallStore.getState().addParticipant(updatedParticipant);
        });

        const state = useCallStore.getState();
        expect(state.currentCall?.participants).toHaveLength(1);
        expect(state.currentCall?.participants[0].isVideoEnabled).toBe(false);
      });

      it('should not modify state if no current call', () => {
        act(() => {
          useCallStore.getState().addParticipant(mockParticipant);
        });

        expect(useCallStore.getState().currentCall).toBeNull();
      });
    });

    describe('removeParticipant', () => {
      it('should remove a participant', () => {
        const callWithTwo = {
          ...mockCallSession,
          participants: [mockParticipant, mockParticipant2],
        };

        act(() => {
          useCallStore.getState().setCurrentCall(callWithTwo);
          useCallStore.getState().removeParticipant('participant-1');
        });

        const state = useCallStore.getState();
        expect(state.currentCall?.participants).toHaveLength(1);
        expect(state.currentCall?.participants[0].id).toBe('participant-2');
      });
    });

    describe('updateParticipant', () => {
      it('should update participant properties', () => {
        act(() => {
          useCallStore.getState().setCurrentCall(mockCallSession);
          useCallStore.getState().updateParticipant('participant-1', {
            isSpeaking: true,
            isAudioEnabled: false,
          } as any);
        });

        const participant = useCallStore.getState().currentCall?.participants[0];
        expect((participant as any)?.isSpeaking).toBe(true);
        expect(participant?.isAudioEnabled).toBe(false);
      });
    });
  });

  describe('WebRTC Streams', () => {
    describe('setLocalStream', () => {
      it('should set local stream', () => {
        const stream = new MockMediaStream() as unknown as MediaStream;

        act(() => {
          useCallStore.getState().setLocalStream(stream);
        });

        expect(useCallStore.getState().localStream).toBe(stream);
      });

      it('should stop existing tracks when replacing stream', () => {
        const oldStream = new MockMediaStream() as unknown as MediaStream;
        const oldTrack = new MockMediaStreamTrack('video');
        (oldStream as any).tracks.push(oldTrack);

        const newStream = new MockMediaStream() as unknown as MediaStream;

        act(() => {
          useCallStore.getState().setLocalStream(oldStream);
          useCallStore.getState().setLocalStream(newStream);
        });

        expect(oldTrack.stopped).toBe(true);
        expect(useCallStore.getState().localStream).toBe(newStream);
      });
    });

    describe('addRemoteStream', () => {
      it('should add remote stream for participant', () => {
        const stream = new MockMediaStream() as unknown as MediaStream;

        act(() => {
          useCallStore.getState().addRemoteStream('participant-1', stream);
        });

        expect(useCallStore.getState().remoteStreams.get('participant-1')).toBe(stream);
      });

      it('should support multiple remote streams', () => {
        const stream1 = new MockMediaStream() as unknown as MediaStream;
        const stream2 = new MockMediaStream() as unknown as MediaStream;

        act(() => {
          useCallStore.getState().addRemoteStream('participant-1', stream1);
          useCallStore.getState().addRemoteStream('participant-2', stream2);
        });

        const state = useCallStore.getState();
        expect(state.remoteStreams.size).toBe(2);
        expect(state.remoteStreams.get('participant-1')).toBe(stream1);
        expect(state.remoteStreams.get('participant-2')).toBe(stream2);
      });
    });

    describe('removeRemoteStream', () => {
      it('should remove remote stream and stop tracks', () => {
        const stream = new MockMediaStream() as unknown as MediaStream;
        const track = new MockMediaStreamTrack('video');
        (stream as any).tracks.push(track);

        act(() => {
          useCallStore.getState().addRemoteStream('participant-1', stream);
          useCallStore.getState().removeRemoteStream('participant-1');
        });

        expect(track.stopped).toBe(true);
        expect(useCallStore.getState().remoteStreams.has('participant-1')).toBe(false);
      });
    });

    describe('clearRemoteStreams', () => {
      it('should clear all remote streams and stop tracks', () => {
        const stream1 = new MockMediaStream() as unknown as MediaStream;
        const stream2 = new MockMediaStream() as unknown as MediaStream;
        const track1 = new MockMediaStreamTrack('video');
        const track2 = new MockMediaStreamTrack('audio');
        (stream1 as any).tracks.push(track1);
        (stream2 as any).tracks.push(track2);

        act(() => {
          useCallStore.getState().addRemoteStream('p1', stream1);
          useCallStore.getState().addRemoteStream('p2', stream2);
          useCallStore.getState().clearRemoteStreams();
        });

        expect(track1.stopped).toBe(true);
        expect(track2.stopped).toBe(true);
        expect(useCallStore.getState().remoteStreams.size).toBe(0);
      });
    });
  });

  describe('Peer Connections', () => {
    describe('addPeerConnection', () => {
      it('should add peer connection', () => {
        const connection = new MockRTCPeerConnection() as unknown as RTCPeerConnection;

        act(() => {
          useCallStore.getState().addPeerConnection('participant-1', connection);
        });

        expect(useCallStore.getState().peerConnections.get('participant-1')).toBe(connection);
      });
    });

    describe('removePeerConnection', () => {
      it('should remove and close peer connection', () => {
        const connection = new MockRTCPeerConnection() as unknown as RTCPeerConnection;

        act(() => {
          useCallStore.getState().addPeerConnection('participant-1', connection);
          useCallStore.getState().removePeerConnection('participant-1');
        });

        expect((connection as any).closed).toBe(true);
        expect(useCallStore.getState().peerConnections.has('participant-1')).toBe(false);
      });
    });

    describe('clearPeerConnections', () => {
      it('should close all peer connections', () => {
        const conn1 = new MockRTCPeerConnection() as unknown as RTCPeerConnection;
        const conn2 = new MockRTCPeerConnection() as unknown as RTCPeerConnection;

        act(() => {
          useCallStore.getState().addPeerConnection('p1', conn1);
          useCallStore.getState().addPeerConnection('p2', conn2);
          useCallStore.getState().clearPeerConnections();
        });

        expect((conn1 as any).closed).toBe(true);
        expect((conn2 as any).closed).toBe(true);
        expect(useCallStore.getState().peerConnections.size).toBe(0);
      });
    });
  });

  describe('Controls', () => {
    describe('toggleAudio', () => {
      it('should toggle audio enabled state', () => {
        act(() => {
          useCallStore.getState().toggleAudio();
        });

        expect(useCallStore.getState().controls.audioEnabled).toBe(false);

        act(() => {
          useCallStore.getState().toggleAudio();
        });

        expect(useCallStore.getState().controls.audioEnabled).toBe(true);
      });

      it('should toggle audio tracks on local stream', () => {
        const stream = new MockMediaStream() as unknown as MediaStream;
        const audioTrack = new MockMediaStreamTrack('audio');
        (stream as any).tracks.push(audioTrack);

        act(() => {
          useCallStore.getState().setLocalStream(stream);
          useCallStore.getState().toggleAudio();
        });

        expect(audioTrack.enabled).toBe(false);
      });
    });

    describe('toggleVideo', () => {
      it('should toggle video enabled state', () => {
        act(() => {
          useCallStore.getState().toggleVideo();
        });

        expect(useCallStore.getState().controls.videoEnabled).toBe(false);

        act(() => {
          useCallStore.getState().toggleVideo();
        });

        expect(useCallStore.getState().controls.videoEnabled).toBe(true);
      });

      it('should toggle video tracks on local stream', () => {
        const stream = new MockMediaStream() as unknown as MediaStream;
        const videoTrack = new MockMediaStreamTrack('video');
        (stream as any).tracks.push(videoTrack);

        act(() => {
          useCallStore.getState().setLocalStream(stream);
          useCallStore.getState().toggleVideo();
        });

        expect(videoTrack.enabled).toBe(false);
      });
    });

    describe('toggleScreenShare', () => {
      it('should toggle screen share state', () => {
        act(() => {
          useCallStore.getState().toggleScreenShare();
        });

        expect(useCallStore.getState().controls.screenShareEnabled).toBe(true);

        act(() => {
          useCallStore.getState().toggleScreenShare();
        });

        expect(useCallStore.getState().controls.screenShareEnabled).toBe(false);
      });
    });

    describe('setControls', () => {
      it('should update multiple controls', () => {
        act(() => {
          useCallStore.getState().setControls({
            audioEnabled: false,
            videoEnabled: false,
          });
        });

        const controls = useCallStore.getState().controls;
        expect(controls.audioEnabled).toBe(false);
        expect(controls.videoEnabled).toBe(false);
        expect(controls.screenShareEnabled).toBe(false);
      });
    });
  });

  describe('UI State', () => {
    describe('setConnecting', () => {
      it('should set connecting state', () => {
        act(() => {
          useCallStore.getState().setConnecting(true);
        });

        expect(useCallStore.getState().isConnecting).toBe(true);
      });
    });

    describe('setInCall', () => {
      it('should set in call state', () => {
        act(() => {
          useCallStore.getState().setInCall(true);
        });

        expect(useCallStore.getState().isInCall).toBe(true);
      });
    });

    describe('setError', () => {
      it('should set error message', () => {
        act(() => {
          useCallStore.getState().setError('Connection failed');
        });

        expect(useCallStore.getState().error).toBe('Connection failed');
      });

      it('should clear error when set to null', () => {
        act(() => {
          useCallStore.getState().setError('Error');
          useCallStore.getState().setError(null);
        });

        expect(useCallStore.getState().error).toBeNull();
      });
    });
  });

  describe('Reset', () => {
    it('should reset all state and clean up resources', () => {
      const localStream = new MockMediaStream() as unknown as MediaStream;
      const localTrack = new MockMediaStreamTrack('video');
      (localStream as any).tracks.push(localTrack);

      const remoteStream = new MockMediaStream() as unknown as MediaStream;
      const remoteTrack = new MockMediaStreamTrack('audio');
      (remoteStream as any).tracks.push(remoteTrack);

      const peerConnection = new MockRTCPeerConnection() as unknown as RTCPeerConnection;

      act(() => {
        useCallStore.getState().setCurrentCall(mockCallSession);
        useCallStore.getState().setLocalStream(localStream);
        useCallStore.getState().addRemoteStream('p1', remoteStream);
        useCallStore.getState().addPeerConnection('p1', peerConnection);
        useCallStore.getState().setConnecting(true);
        useCallStore.getState().setInCall(true);
        useCallStore.getState().setError('Some error');
      });

      act(() => {
        useCallStore.getState().reset();
      });

      const state = useCallStore.getState();

      // Verify resources are cleaned up
      expect(localTrack.stopped).toBe(true);
      expect(remoteTrack.stopped).toBe(true);
      expect((peerConnection as any).closed).toBe(true);

      // Verify state is reset
      expect(state.currentCall).toBeNull();
      expect(state.localStream).toBeNull();
      expect(state.remoteStreams.size).toBe(0);
      expect(state.peerConnections.size).toBe(0);
      expect(state.isConnecting).toBe(false);
      expect(state.isInCall).toBe(false);
      expect(state.error).toBeNull();
      expect(state.controls.audioEnabled).toBe(true);
      expect(state.controls.videoEnabled).toBe(true);
      expect(state.controls.screenShareEnabled).toBe(false);
    });
  });

  describe('setIceServers', () => {
    it('should store provided ICE servers', () => {
      const iceServers: RTCIceServer[] = [
        { urls: 'stun:stun.example.com' },
        { urls: 'turn:turn.example.com', username: 'user', credential: 'pass' },
      ];

      act(() => {
        useCallStore.getState().setIceServers(iceServers);
      });

      expect(useCallStore.getState().iceServers).toEqual(iceServers);
    });

    it('should replace previously stored ICE servers', () => {
      const first: RTCIceServer[] = [{ urls: 'stun:first.example.com' }];
      const second: RTCIceServer[] = [{ urls: 'stun:second.example.com' }];

      act(() => {
        useCallStore.getState().setIceServers(first);
        useCallStore.getState().setIceServers(second);
      });

      expect(useCallStore.getState().iceServers).toEqual(second);
    });
  });

  describe('setReconnecting', () => {
    it('should set isReconnecting=true and store attempt number when attempt > 0', () => {
      act(() => {
        useCallStore.getState().setReconnecting(3);
      });

      const state = useCallStore.getState();
      expect(state.isReconnecting).toBe(true);
      expect(state.reconnectAttempt).toBe(3);
    });

    it('should set isReconnecting=false when attempt is 0', () => {
      act(() => {
        useCallStore.getState().setReconnecting(2);
        useCallStore.getState().setReconnecting(0);
      });

      const state = useCallStore.getState();
      expect(state.isReconnecting).toBe(false);
      expect(state.reconnectAttempt).toBe(0);
    });
  });

  describe('setConnectionQuality', () => {
    it('should store the given connection quality level', () => {
      act(() => {
        useCallStore.getState().setConnectionQuality('good');
      });

      expect(useCallStore.getState().connectionQuality).toBe('good');
    });

    it('should update to a different quality level', () => {
      act(() => {
        useCallStore.getState().setConnectionQuality('excellent');
        useCallStore.getState().setConnectionQuality('poor');
      });

      expect(useCallStore.getState().connectionQuality).toBe('poor');
    });
  });

  describe('setCallEndReason', () => {
    it('should store the call end reason', () => {
      act(() => {
        useCallStore.getState().setCallEndReason('completed');
      });

      expect(useCallStore.getState().callEndReason).toBe('completed');
    });

    it('should store rejected reason', () => {
      act(() => {
        useCallStore.getState().setCallEndReason('rejected');
      });

      expect(useCallStore.getState().callEndReason).toBe('rejected');
    });
  });

  describe('Heartbeat', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      mockSocketEmit.mockReset();
      mockGetSocket.mockReturnValue({ connected: true, emit: mockSocketEmit });
    });

    afterEach(() => {
      // Stop any running heartbeat after each test
      act(() => {
        useCallStore.getState().stopHeartbeat();
      });
      jest.useRealTimers();
    });

    it('startHeartbeat emits CALL_HEARTBEAT on every 15-second tick', () => {
      act(() => {
        useCallStore.getState().startHeartbeat('call-abc');
      });

      // No emit before first interval
      expect(mockSocketEmit).not.toHaveBeenCalled();

      act(() => {
        jest.advanceTimersByTime(15_000);
      });

      expect(mockSocketEmit).toHaveBeenCalledTimes(1);
      expect(mockSocketEmit).toHaveBeenCalledWith(
        expect.stringContaining('heartbeat'),
        { callId: 'call-abc' }
      );

      act(() => {
        jest.advanceTimersByTime(15_000);
      });

      expect(mockSocketEmit).toHaveBeenCalledTimes(2);
    });

    it('startHeartbeat does not emit when socket is disconnected', () => {
      mockGetSocket.mockReturnValue({ connected: false, emit: mockSocketEmit });

      act(() => {
        useCallStore.getState().startHeartbeat('call-xyz');
      });

      act(() => {
        jest.advanceTimersByTime(15_000);
      });

      expect(mockSocketEmit).not.toHaveBeenCalled();
    });

    it('startHeartbeat does not emit when socket is null', () => {
      mockGetSocket.mockReturnValue(null);

      act(() => {
        useCallStore.getState().startHeartbeat('call-xyz');
      });

      act(() => {
        jest.advanceTimersByTime(15_000);
      });

      expect(mockSocketEmit).not.toHaveBeenCalled();
    });

    it('startHeartbeat clears previous interval when called again', () => {
      act(() => {
        useCallStore.getState().startHeartbeat('call-first');
      });

      act(() => {
        useCallStore.getState().startHeartbeat('call-second');
      });

      act(() => {
        jest.advanceTimersByTime(15_000);
      });

      // Only one tick should have fired, with the second callId
      expect(mockSocketEmit).toHaveBeenCalledTimes(1);
      expect(mockSocketEmit).toHaveBeenCalledWith(
        expect.anything(),
        { callId: 'call-second' }
      );
    });

    it('stopHeartbeat prevents further CALL_HEARTBEAT emissions', () => {
      act(() => {
        useCallStore.getState().startHeartbeat('call-stop');
      });

      act(() => {
        useCallStore.getState().stopHeartbeat();
      });

      act(() => {
        jest.advanceTimersByTime(15_000);
      });

      expect(mockSocketEmit).not.toHaveBeenCalled();
    });

    it('startHeartbeat registers a beforeunload handler', () => {
      const addSpy = jest.spyOn(window, 'addEventListener');

      act(() => {
        useCallStore.getState().startHeartbeat('call-unload');
      });

      expect(addSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
      addSpy.mockRestore();
    });

    it('stopHeartbeat removes the beforeunload handler', () => {
      const removeSpy = jest.spyOn(window, 'removeEventListener');

      act(() => {
        useCallStore.getState().startHeartbeat('call-unload');
        useCallStore.getState().stopHeartbeat();
      });

      expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
      removeSpy.mockRestore();
    });

    it('beforeunload handler emits CALL_END and sends beacon when socket is connected', () => {
      const mockSendBeacon = jest.fn();
      Object.defineProperty(navigator, 'sendBeacon', {
        value: mockSendBeacon,
        configurable: true,
        writable: true,
      });

      const capturedHandlers: EventListener[] = [];
      const addSpy = jest.spyOn(window, 'addEventListener').mockImplementation(
        (event: string, handler: EventListenerOrEventListenerObject) => {
          if (event === 'beforeunload') {
            capturedHandlers.push(handler as EventListener);
          }
        }
      );

      act(() => {
        useCallStore.getState().startHeartbeat('call-beacon');
      });

      addSpy.mockRestore();

      // Fire the captured handler directly
      expect(capturedHandlers.length).toBeGreaterThan(0);
      capturedHandlers[capturedHandlers.length - 1](new Event('beforeunload'));

      expect(mockSocketEmit).toHaveBeenCalledWith(
        expect.stringContaining('end'),
        { callId: 'call-beacon', reason: 'completed' },
        expect.any(Function)
      );
      expect(mockSendBeacon).toHaveBeenCalledWith('/api/v1/calls/call-beacon/end');
    });

    it('beforeunload handler only sends beacon when socket is not connected', () => {
      const mockSendBeacon = jest.fn();
      Object.defineProperty(navigator, 'sendBeacon', {
        value: mockSendBeacon,
        configurable: true,
        writable: true,
      });

      // Return disconnected socket
      mockGetSocket.mockReturnValue({ connected: false, emit: mockSocketEmit });

      const capturedHandlers: EventListener[] = [];
      const addSpy = jest.spyOn(window, 'addEventListener').mockImplementation(
        (event: string, handler: EventListenerOrEventListenerObject) => {
          if (event === 'beforeunload') {
            capturedHandlers.push(handler as EventListener);
          }
        }
      );

      act(() => {
        useCallStore.getState().startHeartbeat('call-beacon-only');
      });

      addSpy.mockRestore();

      expect(capturedHandlers.length).toBeGreaterThan(0);
      capturedHandlers[capturedHandlers.length - 1](new Event('beforeunload'));

      // Socket emit not called (not connected)
      expect(mockSocketEmit).not.toHaveBeenCalled();
      // Beacon fallback still fires
      expect(mockSendBeacon).toHaveBeenCalledWith('/api/v1/calls/call-beacon-only/end');
    });

    it('beforeunload handler skips sendBeacon when navigator.sendBeacon is not available', () => {
      // Remove sendBeacon to cover the false-branch of sendBeacon availability check
      const original = (navigator as any).sendBeacon;
      Object.defineProperty(navigator, 'sendBeacon', {
        value: undefined,
        configurable: true,
        writable: true,
      });

      const capturedHandlers: EventListener[] = [];
      const addSpy = jest.spyOn(window, 'addEventListener').mockImplementation(
        (event: string, handler: EventListenerOrEventListenerObject) => {
          if (event === 'beforeunload') {
            capturedHandlers.push(handler as EventListener);
          }
        }
      );

      act(() => {
        useCallStore.getState().startHeartbeat('call-no-beacon');
      });

      addSpy.mockRestore();

      // Should not throw even without sendBeacon
      expect(() => {
        capturedHandlers[capturedHandlers.length - 1](new Event('beforeunload'));
      }).not.toThrow();

      // Restore
      Object.defineProperty(navigator, 'sendBeacon', {
        value: original,
        configurable: true,
        writable: true,
      });
    });
  });

  describe('Reset with active heartbeat', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      mockSocketEmit.mockReset();
      mockGetSocket.mockReturnValue({ connected: true, emit: mockSocketEmit });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('reset() clears heartbeat interval so no further ticks fire', () => {
      act(() => {
        useCallStore.getState().startHeartbeat('call-reset');
      });

      act(() => {
        useCallStore.getState().reset();
      });

      act(() => {
        jest.advanceTimersByTime(15_000);
      });

      // No heartbeat after reset
      expect(mockSocketEmit).not.toHaveBeenCalled();
    });

    it('reset() removes the beforeunload handler', () => {
      const removeSpy = jest.spyOn(window, 'removeEventListener');

      act(() => {
        useCallStore.getState().startHeartbeat('call-reset-unload');
      });

      act(() => {
        useCallStore.getState().reset();
      });

      expect(removeSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
      removeSpy.mockRestore();
    });
  });

  describe('Branch coverage: null-guard false-paths', () => {
    it('removeParticipant is a no-op when currentCall is null', () => {
      // currentCall is null (store reset in beforeEach)
      act(() => {
        useCallStore.getState().removeParticipant('participant-9');
      });

      expect(useCallStore.getState().currentCall).toBeNull();
    });

    it('updateParticipant is a no-op when currentCall is null', () => {
      act(() => {
        useCallStore.getState().updateParticipant('participant-9', { isAudioEnabled: false });
      });

      expect(useCallStore.getState().currentCall).toBeNull();
    });

    it('updateParticipant leaves non-matching participants unchanged', () => {
      // Set a call with two participants; update a non-existent participant so ternary false-branch runs
      const callWithTwo = {
        ...mockCallSession,
        participants: [mockParticipant, mockParticipant2],
      };
      act(() => {
        useCallStore.getState().setCurrentCall(callWithTwo);
        useCallStore.getState().updateParticipant('nonexistent-id', { isAudioEnabled: false });
      });

      const participants = useCallStore.getState().currentCall?.participants;
      // Both participants unchanged
      expect(participants).toHaveLength(2);
      expect(participants?.[0]).toEqual(mockParticipant);
      expect(participants?.[1]).toEqual(mockParticipant2);
    });

    it('removeRemoteStream is a no-op for unknown participantId (stream not in map)', () => {
      act(() => {
        // Map is empty — participantId not found → stream is undefined → skip track stop
        useCallStore.getState().removeRemoteStream('nonexistent-participant');
      });

      expect(useCallStore.getState().remoteStreams.size).toBe(0);
    });

    it('removePeerConnection is a no-op for unknown participantId (connection not in map)', () => {
      act(() => {
        useCallStore.getState().removePeerConnection('nonexistent-participant');
      });

      expect(useCallStore.getState().peerConnections.size).toBe(0);
    });
  });

  describe('Reset with extended state', () => {
    it('should reset extended state fields to their defaults', () => {
      act(() => {
        useCallStore.getState().setIceServers([{ urls: 'stun:stun.example.com' }]);
        useCallStore.getState().setReconnecting(5);
        useCallStore.getState().setConnectionQuality('poor');
        useCallStore.getState().setCallEndReason('rejected');
      });

      act(() => {
        useCallStore.getState().reset();
      });

      const state = useCallStore.getState();
      expect(state.iceServers).toBeNull();
      expect(state.isReconnecting).toBe(false);
      expect(state.reconnectAttempt).toBe(0);
      expect(state.connectionQuality).toBeNull();
      expect(state.callEndReason).toBeNull();
    });
  });
});
