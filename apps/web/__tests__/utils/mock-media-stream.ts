/**
 * Mock Media Stream Utilities for Video Call Testing
 *
 * Provides utilities to create mock MediaStream objects for testing
 * WebRTC functionality without requiring actual camera/microphone access.
 */

/**
 * Creates a mock video MediaStream using a canvas
 * @param width - Video width (default: 640)
 * @param height - Video height (default: 480)
 * @param fps - Frames per second (default: 30)
 * @returns MediaStream with video track
 */
export function createMockVideoStream(
  width = 640,
  height = 480,
  fps = 30
): MediaStream {
  // Create canvas element
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2D context from canvas');
  }

  // Draw a blue background with text
  ctx.fillStyle = 'blue';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'white';
  ctx.font = '48px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Mock Video', canvas.width / 2, canvas.height / 2);

  // Capture stream from canvas
  // @ts-ignore - captureStream exists but TypeScript may not recognize it
  const stream = canvas.captureStream(fps) as MediaStream;

  return stream;
}

/**
 * Creates a mock audio MediaStream using Web Audio API
 * @param frequency - Oscillator frequency in Hz (default: 440Hz - A4 note)
 * @returns MediaStream with audio track
 */
export function createMockAudioStream(frequency = 440): MediaStream {
  // Create audio context
  const audioCtx = new AudioContext();

  // Create oscillator (generates tone)
  const oscillator = audioCtx.createOscillator();
  oscillator.frequency.value = frequency;
  oscillator.type = 'sine';

  // Create destination for media stream
  const dest = audioCtx.createMediaStreamDestination();
  oscillator.connect(dest);
  oscillator.start();

  return dest.stream;
}

/**
 * Creates a complete mock MediaStream with both video and audio tracks
 * @returns MediaStream with video and audio tracks
 */
export function createMockMediaStream(): MediaStream {
  const videoStream = createMockVideoStream();
  const audioStream = createMockAudioStream();

  // Combine video and audio tracks
  const combinedStream = new MediaStream();

  videoStream.getVideoTracks().forEach(track => {
    combinedStream.addTrack(track);
  });

  audioStream.getAudioTracks().forEach(track => {
    combinedStream.addTrack(track);
  });

  return combinedStream;
}

/**
 * Mocks navigator.mediaDevices.getUserMedia to return a mock stream
 * @param options - Optional configuration for the mock stream
 * @returns The mock stream that will be returned
 */
export function mockGetUserMedia(options?: {
  video?: boolean;
  audio?: boolean;
  videoWidth?: number;
  videoHeight?: number;
  audioFrequency?: number;
}): MediaStream {
  const {
    video = true,
    audio = true,
    videoWidth = 640,
    videoHeight = 480,
    audioFrequency = 440,
  } = options || {};

  let mockStream: MediaStream;

  if (video && audio) {
    mockStream = createMockMediaStream();
  } else if (video) {
    mockStream = createMockVideoStream(videoWidth, videoHeight);
  } else if (audio) {
    mockStream = createMockAudioStream(audioFrequency);
  } else {
    mockStream = new MediaStream();
  }

  // Mock the getUserMedia function
  const getUserMediaMock = jest.fn().mockResolvedValue(mockStream);

  Object.defineProperty(navigator, 'mediaDevices', {
    writable: true,
    configurable: true,
    value: {
      getUserMedia: getUserMediaMock,
      enumerateDevices: jest.fn().mockResolvedValue([
        {
          deviceId: 'mock-camera-1',
          kind: 'videoinput',
          label: 'Mock Camera',
          groupId: 'mock-group-1',
        },
        {
          deviceId: 'mock-mic-1',
          kind: 'audioinput',
          label: 'Mock Microphone',
          groupId: 'mock-group-2',
        },
      ]),
    },
  });

  return mockStream;
}

/**
 * Mocks getUserMedia to reject with a permission denied error
 */
export function mockGetUserMediaPermissionDenied(): void {
  const error = new DOMException('Permission denied', 'NotAllowedError');

  Object.defineProperty(navigator, 'mediaDevices', {
    writable: true,
    configurable: true,
    value: {
      getUserMedia: jest.fn().mockRejectedValue(error),
      enumerateDevices: jest.fn().mockResolvedValue([]),
    },
  });
}

/**
 * Mocks getUserMedia to reject with a device not found error
 */
export function mockGetUserMediaDeviceNotFound(): void {
  const error = new DOMException('Device not found', 'NotFoundError');

  Object.defineProperty(navigator, 'mediaDevices', {
    writable: true,
    configurable: true,
    value: {
      getUserMedia: jest.fn().mockRejectedValue(error),
      enumerateDevices: jest.fn().mockResolvedValue([]),
    },
  });
}

/**
 * Stops all tracks in a MediaStream
 * @param stream - The MediaStream to stop
 */
export function stopMediaStream(stream: MediaStream): void {
  stream.getTracks().forEach(track => {
    track.stop();
  });
}

/**
 * Creates a mock MediaStreamTrack
 * @param kind - 'audio' or 'video'
 * @param id - Track ID
 * @returns Mock MediaStreamTrack
 */
export function createMockTrack(
  kind: 'audio' | 'video',
  id = `mock-${kind}-track-${Date.now()}`
): MediaStreamTrack {
  const track = {
    id,
    kind,
    label: `Mock ${kind} track`,
    enabled: true,
    muted: false,
    readyState: 'live' as MediaStreamTrackState,
    stop: jest.fn(),
    clone: jest.fn(),
    getConstraints: jest.fn().mockReturnValue({}),
    getSettings: jest.fn().mockReturnValue({
      width: kind === 'video' ? 640 : undefined,
      height: kind === 'video' ? 480 : undefined,
      frameRate: kind === 'video' ? 30 : undefined,
      sampleRate: kind === 'audio' ? 48000 : undefined,
    }),
    getCapabilities: jest.fn().mockReturnValue({}),
    applyConstraints: jest.fn().mockResolvedValue(undefined),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  } as unknown as MediaStreamTrack;

  return track;
}

/**
 * Creates a mock RTCPeerConnection for testing
 * @returns Mock RTCPeerConnection
 */
export function createMockPeerConnection(): RTCPeerConnection {
  const pc = {
    localDescription: null,
    remoteDescription: null,
    signalingState: 'stable' as RTCSignalingState,
    iceConnectionState: 'new' as RTCIceConnectionState,
    connectionState: 'new' as RTCPeerConnectionState,
    iceGatheringState: 'new' as RTCIceGatheringState,

    createOffer: jest.fn().mockResolvedValue({
      type: 'offer' as RTCSdpType,
      sdp: 'mock-sdp-offer',
    }),
    createAnswer: jest.fn().mockResolvedValue({
      type: 'answer' as RTCSdpType,
      sdp: 'mock-sdp-answer',
    }),
    setLocalDescription: jest.fn().mockResolvedValue(undefined),
    setRemoteDescription: jest.fn().mockResolvedValue(undefined),
    addIceCandidate: jest.fn().mockResolvedValue(undefined),

    addTrack: jest.fn().mockReturnValue({
      sender: {
        track: null,
        replaceTrack: jest.fn().mockResolvedValue(undefined),
      },
    }),
    removeTrack: jest.fn(),
    getSenders: jest.fn().mockReturnValue([]),
    getReceivers: jest.fn().mockReturnValue([]),
    getTransceivers: jest.fn().mockReturnValue([]),

    addTransceiver: jest.fn(),

    close: jest.fn(),

    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),

    getStats: jest.fn().mockResolvedValue(new Map()),
  } as unknown as RTCPeerConnection;

  return pc;
}

/**
 * Mocks the RTCPeerConnection constructor
 */
export function mockRTCPeerConnection(): void {
  // @ts-ignore
  global.RTCPeerConnection = jest.fn().mockImplementation(() => {
    return createMockPeerConnection();
  });
}

/**
 * Restores the original RTCPeerConnection
 */
export function restoreRTCPeerConnection(): void {
  // @ts-ignore
  delete global.RTCPeerConnection;
}

/**
 * Simulates ICE candidate gathering
 * @param pc - The peer connection
 * @param onIceCandidate - Callback for each ICE candidate
 */
export function simulateIceCandidates(
  pc: RTCPeerConnection,
  onIceCandidate: (candidate: RTCIceCandidate) => void
): void {
  setTimeout(() => {
    const mockCandidate = {
      candidate: 'candidate:1 1 UDP 2130706431 192.168.1.100 54321 typ host',
      sdpMLineIndex: 0,
      sdpMid: '0',
    } as RTCIceCandidate;

    onIceCandidate(mockCandidate);
  }, 100);

  setTimeout(() => {
    // Null candidate signals gathering complete
    onIceCandidate(null as any);
  }, 200);
}

/**
 * Test helper to wait for a condition
 * @param condition - Function that returns true when condition is met
 * @param timeout - Maximum time to wait in ms
 * @param interval - Check interval in ms
 */
export async function waitFor(
  condition: () => boolean,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const startTime = Date.now();

  while (!condition()) {
    if (Date.now() - startTime > timeout) {
      throw new Error('Timeout waiting for condition');
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
}
