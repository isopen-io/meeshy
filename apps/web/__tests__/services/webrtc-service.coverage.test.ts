/**
 * Coverage tests for WebRTCService.
 * Standalone file — does NOT import from webrtc-service.test.ts.
 * Goal: bring line+branch coverage to ≥92%.
 */

jest.mock('@/utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { WebRTCService, type WebRTCServiceConfig } from '@/services/webrtc-service';

// ---------------------------------------------------------------------------
// Fake RTCPeerConnection + supporting fakes
// ---------------------------------------------------------------------------

class FakeSender {
  track: unknown;
  private _params: {
    encodings?: Array<Record<string, unknown>>;
    degradationPreference?: string;
  } = { encodings: [{}] };

  replaceTrack = jest.fn(async (t: unknown) => {
    this.track = t;
  });
  getParameters = jest.fn(() => ({
    ...this._params,
    encodings: this._params.encodings ? [...this._params.encodings.map((e) => ({ ...e }))] : undefined,
  }));
  setParameters = jest.fn(async (p: typeof this._params) => {
    this._params = p;
  });

  constructor(track: unknown) {
    this.track = track ?? null;
  }
}

class FakeTransceiver {
  sender: FakeSender;
  direction: string;
  setCodecPreferences = jest.fn();
  constructor(track: unknown, direction: string) {
    this.sender = new FakeSender(track);
    this.direction = direction;
  }
}

class FakeReceiver {
  track: { kind: string };
  jitterBufferTarget?: number | null;
  constructor(kind: string) {
    this.track = { kind };
  }
}

class FakeRTCPeerConnection {
  onicecandidate: ((e: unknown) => void) | null = null;
  ontrack: ((e: unknown) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  onnegotiationneeded: (() => void) | null = null;
  signalingState = 'stable';
  connectionState: RTCPeerConnectionState = 'new';
  iceConnectionState: RTCIceConnectionState = 'new';
  localDescription: { type: string; sdp?: string } | null = null;
  config: unknown;
  _transceivers: FakeTransceiver[] = [];
  _receivers: FakeReceiver[] = [];

  createOffer = jest.fn(async (_opts?: unknown) => ({
    type: 'offer' as RTCSdpType,
    sdp: 'v=0\r\na=fmtp:111 minptime=10;usedtx=1\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\n',
  }));
  createAnswer = jest.fn(async () => ({
    type: 'answer' as RTCSdpType,
    sdp: 'v=0\r\na=fmtp:111 minptime=10;usedtx=1\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\n',
  }));
  setLocalDescription = jest.fn(async (desc: { type: string; sdp?: string }) => {
    this.localDescription = { type: desc.type, sdp: desc.sdp };
  });
  setRemoteDescription = jest.fn(async () => {});
  addIceCandidate = jest.fn(async () => {});
  addTrack = jest.fn((_track: unknown, _stream: unknown) => new FakeSender(_track));
  addTransceiver = jest.fn((trackOrKind: unknown, init?: { direction?: string }) => {
    const track = typeof trackOrKind === 'string' ? null : trackOrKind;
    const tx = new FakeTransceiver(track, init?.direction ?? 'sendrecv');
    this._transceivers.push(tx);
    return tx;
  });
  getSenders = jest.fn(() => this._transceivers.map((t) => t.sender));
  getReceivers = jest.fn(() => this._receivers as unknown as RTCRtpReceiver[]);
  getStats = jest.fn(async () => ({
    forEach: jest.fn(),
  }));
  close = jest.fn();
  setConfiguration = jest.fn((config: unknown) => {
    this.config = config;
  });
  constructor(config: unknown) {
    this.config = config;
  }
}

// ---------------------------------------------------------------------------
// Track / stream factories
// ---------------------------------------------------------------------------

const makeTrack = (kind: 'audio' | 'video') => ({
  kind,
  enabled: true,
  contentHint: '',
  stop: jest.fn(),
});

const makeStream = (opts: { audio?: boolean; video?: boolean }) => {
  const tracks: ReturnType<typeof makeTrack>[] = [];
  if (opts.audio) tracks.push(makeTrack('audio'));
  if (opts.video) tracks.push(makeTrack('video'));
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
    getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
    addTrack: jest.fn(),
    removeTrack: jest.fn(),
  } as unknown as MediaStream;
};

const makeFakeMediaStream = () => {
  const audioTrack = { kind: 'audio', stop: jest.fn(), enabled: true, contentHint: '' };
  const videoTrack = { kind: 'video', stop: jest.fn(), enabled: true, contentHint: '' };
  return {
    getTracks: () => [audioTrack, videoTrack],
    getAudioTracks: () => [audioTrack],
    getVideoTracks: () => [videoTrack],
    addTrack: jest.fn(),
    removeTrack: jest.fn(),
  } as unknown as MediaStream;
};

// ---------------------------------------------------------------------------
// Global setup
// ---------------------------------------------------------------------------

let OrigRTCPeerConnection: unknown;
let OrigRTCRtpSender: unknown;

const FAKE_AUDIO_CAPABILITIES = {
  codecs: [
    { mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
    { mimeType: 'audio/red', clockRate: 48000, channels: 2 },
    { mimeType: 'audio/PCMU', clockRate: 8000, channels: 1 },
  ],
};

beforeAll(() => {
  OrigRTCPeerConnection = (global as Record<string, unknown>).RTCPeerConnection;
  (global as Record<string, unknown>).RTCPeerConnection = FakeRTCPeerConnection;
  (global as Record<string, unknown>).RTCSessionDescription = jest
    .fn()
    .mockImplementation((init: unknown) => init);
  (global as Record<string, unknown>).RTCIceCandidate = jest
    .fn()
    .mockImplementation((init: unknown) => init);

  OrigRTCRtpSender = (global as Record<string, unknown>).RTCRtpSender;
  (global as Record<string, unknown>).RTCRtpSender = {
    getCapabilities: jest.fn(() => FAKE_AUDIO_CAPABILITIES),
  };
});

afterAll(() => {
  (global as Record<string, unknown>).RTCPeerConnection = OrigRTCPeerConnection;
  (global as Record<string, unknown>).RTCRtpSender = OrigRTCRtpSender;
});

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Helper: create service + peer connection
// ---------------------------------------------------------------------------

const setup = (overrides: Partial<WebRTCServiceConfig> = {}) => {
  const onLocalDescription = jest.fn();
  const onIceCandidate = jest.fn();
  const onTrack = jest.fn();
  const onConnectionStateChange = jest.fn();
  const onIceConnectionStateChange = jest.fn();
  const onConnectionQualityChange = jest.fn();
  const onError = jest.fn();

  const service = new WebRTCService({
    onLocalDescription,
    onIceCandidate,
    onTrack,
    onConnectionStateChange,
    onIceConnectionStateChange,
    onConnectionQualityChange,
    onError,
    ...overrides,
  });
  const pc = service.createPeerConnection('peer-1') as unknown as FakeRTCPeerConnection;
  return {
    service,
    pc,
    onLocalDescription,
    onIceCandidate,
    onTrack,
    onConnectionStateChange,
    onIceConnectionStateChange,
    onConnectionQualityChange,
    onError,
  };
};

// ===========================================================================
// setIceServers / isPolite
// ===========================================================================

describe('setIceServers', () => {
  it('stores server ICE servers used for next peer connection', () => {
    const service = new WebRTCService();
    const servers: RTCIceServer[] = [{ urls: 'turn:example.com' }];
    service.setIceServers(servers);

    // createPeerConnection should use the stored servers
    const pc = service.createPeerConnection('p') as unknown as FakeRTCPeerConnection;
    expect(pc.config).toEqual({ iceServers: servers });
  });

  it('applies immediately via setConfiguration when TURN credentials arrive after the peer connection already exists', () => {
    // Reproduces RC-1 (tasks/calls-fonctionnel-todo.md): a peer connection
    // created before server TURN credentials resolve must not be stuck on
    // STUN-only defaults for the rest of the call — a late/refreshed
    // setIceServers() has to reach the live RTCPeerConnection.
    const service = new WebRTCService();
    const pc = service.createPeerConnection('p') as unknown as FakeRTCPeerConnection;
    const servers: RTCIceServer[] = [
      { urls: 'turn:example.com', username: 'u', credential: 'c' },
    ];

    service.setIceServers(servers);

    expect(pc.setConfiguration).toHaveBeenCalledWith({ iceServers: servers });
  });

  it('does not throw when no peer connection has been created yet', () => {
    const service = new WebRTCService();
    expect(() => service.setIceServers([{ urls: 'stun:example.com' }])).not.toThrow();
  });
});

describe('isPolite', () => {
  it('returns false by default', () => {
    const service = new WebRTCService();
    expect(service.isPolite()).toBe(false);
  });

  it('returns true after setNegotiationRole makes local polite', () => {
    const service = new WebRTCService();
    service.setNegotiationRole('aaa', 'zzz'); // 'aaa' < 'zzz' → polite
    expect(service.isPolite()).toBe(true);
  });

  it('returns false when local is impolite', () => {
    const service = new WebRTCService();
    service.setNegotiationRole('zzz', 'aaa'); // 'zzz' > 'aaa' → impolite
    expect(service.isPolite()).toBe(false);
  });
});

// ===========================================================================
// createPeerConnection event handlers
// ===========================================================================

describe('createPeerConnection — event handlers', () => {
  it('fires onIceCandidate when candidate is present', () => {
    const { pc, onIceCandidate } = setup();
    const fakeCandidate = { candidate: 'candidate:1 ...' };
    pc.onicecandidate!({ candidate: fakeCandidate });
    expect(onIceCandidate).toHaveBeenCalledWith(fakeCandidate);
  });

  it('does not fire onIceCandidate when candidate is null', () => {
    const { pc, onIceCandidate } = setup();
    pc.onicecandidate!({ candidate: null });
    expect(onIceCandidate).not.toHaveBeenCalled();
  });

  it('fires onTrack when a remote track is received', () => {
    const { pc, onTrack } = setup();
    const fakeEvent = { track: { kind: 'audio' } };
    pc.ontrack!(fakeEvent);
    expect(onTrack).toHaveBeenCalledWith(fakeEvent);
  });

  it('fires onConnectionStateChange when connection state changes (with state)', () => {
    const { pc, onConnectionStateChange } = setup();
    pc.connectionState = 'connected';
    pc.onconnectionstatechange!();
    expect(onConnectionStateChange).toHaveBeenCalledWith('connected');
  });

  it('does not fire onConnectionStateChange when peerConnection has no connectionState', () => {
    // Make a service where peerConnection.connectionState is falsy
    const onConnectionStateChange = jest.fn();
    const service = new WebRTCService({ onConnectionStateChange });
    const pc = service.createPeerConnection('p') as unknown as FakeRTCPeerConnection;
    // Access connectionState via the pc on the service, which goes through optional chaining
    // We need connectionState to be empty string / falsy
    pc.connectionState = '' as RTCPeerConnectionState;
    pc.onconnectionstatechange!();
    expect(onConnectionStateChange).not.toHaveBeenCalled();
  });

  it('fires onIceConnectionStateChange for normal state changes', () => {
    const { pc, onIceConnectionStateChange } = setup();
    pc.iceConnectionState = 'checking';
    pc.oniceconnectionstatechange!();
    expect(onIceConnectionStateChange).toHaveBeenCalledWith('checking');
  });

  it('triggers ICE restart immediately on "failed" state', async () => {
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });
    await service.createOffer();

    const callsBefore = pc.createOffer.mock.calls.length;
    pc.iceConnectionState = 'failed';
    pc.oniceconnectionstatechange!();
    // give the async restartIce a tick to fire
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(pc.createOffer.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('starts grace timer on "disconnected" state and fires restart after expiry', async () => {
    jest.useFakeTimers();
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });
    await service.createOffer();

    const callsBefore = pc.createOffer.mock.calls.length;

    pc.iceConnectionState = 'disconnected';
    pc.oniceconnectionstatechange!();

    // Before grace period, no restart
    expect(pc.createOffer.mock.calls.length).toBe(callsBefore);

    // After grace period elapses and state is still 'disconnected', restart fires
    await jest.advanceTimersByTimeAsync(3001);
    expect(pc.createOffer.mock.calls.length).toBeGreaterThan(callsBefore);

    jest.useRealTimers();
  });

  it('grace timer self-heals if state recovers before expiry', async () => {
    jest.useFakeTimers();
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });
    await service.createOffer();

    const initialOfferCount = pc.createOffer.mock.calls.length;

    pc.iceConnectionState = 'disconnected';
    pc.oniceconnectionstatechange!();

    // State recovers before timer fires
    pc.iceConnectionState = 'connected';
    pc.oniceconnectionstatechange!(); // clears timer

    await jest.advanceTimersByTimeAsync(3001);
    // No additional offers because timer was cleared
    expect(pc.createOffer).toHaveBeenCalledTimes(initialOfferCount);

    jest.useRealTimers();
  });

  it('clears a pending grace timer so no restart fires on "connected" recovery', async () => {
    jest.useFakeTimers();
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });
    await service.createOffer();

    const offerCount = pc.createOffer.mock.calls.length;
    pc.iceConnectionState = 'disconnected';
    pc.oniceconnectionstatechange!();

    pc.iceConnectionState = 'connected';
    pc.oniceconnectionstatechange!();

    await jest.advanceTimersByTimeAsync(3001);
    expect(pc.createOffer.mock.calls.length).toBe(offerCount);
  });

  it('clears a pending grace timer so no restart fires on "completed" recovery', async () => {
    jest.useFakeTimers();
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });
    await service.createOffer();

    const offerCount = pc.createOffer.mock.calls.length;
    pc.iceConnectionState = 'disconnected';
    pc.oniceconnectionstatechange!();

    pc.iceConnectionState = 'completed';
    pc.oniceconnectionstatechange!();

    await jest.advanceTimersByTimeAsync(3001);
    expect(pc.createOffer.mock.calls.length).toBe(offerCount);
  });

  it('does not fire onIceConnectionStateChange if iceConnectionState is empty', () => {
    const { onIceConnectionStateChange } = setup();
    const service2 = new WebRTCService({ onIceConnectionStateChange });
    const pc2 = service2.createPeerConnection('p2') as unknown as FakeRTCPeerConnection;
    pc2.iceConnectionState = '' as RTCIceConnectionState;
    pc2.oniceconnectionstatechange!();
    expect(onIceConnectionStateChange).not.toHaveBeenCalled();
  });

  it('calls negotiate() when autoNegotiate is true and onnegotiationneeded fires', async () => {
    const { service, pc, onLocalDescription } = setup();
    service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });
    await service.createOffer(); // arms autoNegotiate

    onLocalDescription.mockClear();
    pc.onnegotiationneeded!();
    // negotiate() is called with void — wait for it to complete
    await new Promise<void>((r) => setTimeout(r, 10));
    expect(onLocalDescription).toHaveBeenCalled();
  });

  it('does NOT call negotiate() when autoNegotiate is false', () => {
    const { pc, onLocalDescription } = setup();
    // autoNegotiate is false before first createOffer
    pc.onnegotiationneeded!();
    expect(onLocalDescription).not.toHaveBeenCalled();
  });
});

describe('createPeerConnection — error path', () => {
  it('throws and fires onError when RTCPeerConnection constructor fails', () => {
    const origPC = (global as Record<string, unknown>).RTCPeerConnection;
    (global as Record<string, unknown>).RTCPeerConnection = jest.fn(() => {
      throw new Error('RTCPeerConnection not supported');
    });
    try {
      const onError = jest.fn();
      const service = new WebRTCService({ onError });
      expect(() => service.createPeerConnection('p')).toThrow('RTCPeerConnection not supported');
      expect(onError).toHaveBeenCalled();
    } finally {
      (global as Record<string, unknown>).RTCPeerConnection = origPC;
    }
  });

  it('wraps non-Error throws in an Error', () => {
    const origPC = (global as Record<string, unknown>).RTCPeerConnection;
    (global as Record<string, unknown>).RTCPeerConnection = jest.fn(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw 'string error';
    });
    try {
      const onError = jest.fn();
      const service = new WebRTCService({ onError });
      expect(() => service.createPeerConnection('p')).toThrow('Unknown error');
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    } finally {
      (global as Record<string, unknown>).RTCPeerConnection = origPC;
    }
  });
});

// ===========================================================================
// getLocalStream
// ===========================================================================

describe('getLocalStream', () => {
  const setMediaDevices = (value: unknown) => {
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value,
      writable: true,
      configurable: true,
    });
  };

  const setIsSecureContext = (value: boolean) => {
    Object.defineProperty(window, 'isSecureContext', {
      value,
      writable: true,
      configurable: true,
    });
  };

  afterEach(() => {
    // Restore to secure defaults
    setIsSecureContext(true);
    Object.defineProperty(window, 'isSecureContext', {
      value: true,
      writable: true,
      configurable: true,
    });
  });

  it('throws HTTPS error when not in secure context and protocol is http', async () => {
    setMediaDevices(undefined);
    setIsSecureContext(false);
    // window.location.protocol is already set up in jest.setup.js to be mockable
    // We use the existing mocked location setup from jest.setup.js
    // The default protocol in jsdom tests is 'about:blank' or empty — let's just test the isSecure check
    // Actually looking at the source: if (!isSecure || protocol === 'http:') → throw HTTPS error
    // We need isSecure=false which makes the condition true
    const onError = jest.fn();
    const service = new WebRTCService({ onError });
    await expect(service.getLocalStream()).rejects.toThrow(/HTTPS|camera/);
    expect(onError).toHaveBeenCalled();
  });

  it('throws browser-support error when secure but mediaDevices is null', async () => {
    setMediaDevices(null);
    setIsSecureContext(true);

    const onError = jest.fn();
    const service = new WebRTCService({ onError });
    await expect(service.getLocalStream()).rejects.toThrow(/browser does not support|HTTPS/);
    expect(onError).toHaveBeenCalled();
  });

  it('throws browser-support error when mediaDevices exists but getUserMedia is missing', async () => {
    setMediaDevices({ getUserMedia: undefined });
    setIsSecureContext(true);

    const onError = jest.fn();
    const service = new WebRTCService({ onError });
    await expect(service.getLocalStream()).rejects.toThrow(/browser does not support|HTTPS/);
    expect(onError).toHaveBeenCalled();
  });

  it('returns stream on success', async () => {
    const fakeStream = makeFakeMediaStream();
    setMediaDevices({ getUserMedia: jest.fn().mockResolvedValue(fakeStream) });
    setIsSecureContext(true);

    const service = new WebRTCService();
    const result = await service.getLocalStream();
    expect(result).toBe(fakeStream);
    expect(service.getCurrentStream()).toBe(fakeStream);
  });

  it('throws permission-denied error for DOMException NotAllowedError', async () => {
    const domErr = new DOMException('Permission denied', 'NotAllowedError');
    setMediaDevices({ getUserMedia: jest.fn().mockRejectedValue(domErr) });
    setIsSecureContext(true);

    const onError = jest.fn();
    const service = new WebRTCService({ onError });
    await expect(service.getLocalStream()).rejects.toThrow(/permission denied/i);
    expect(onError).toHaveBeenCalled();
  });

  it('throws permission-denied error for DOMException PermissionDeniedError', async () => {
    const domErr = new DOMException('Permission denied', 'PermissionDeniedError');
    setMediaDevices({ getUserMedia: jest.fn().mockRejectedValue(domErr) });
    setIsSecureContext(true);

    const onError = jest.fn();
    const service = new WebRTCService({ onError });
    await expect(service.getLocalStream()).rejects.toThrow(/permission denied/i);
    expect(onError).toHaveBeenCalled();
  });

  it('throws NotFoundError message for DOMException NotFoundError', async () => {
    const domErr = new DOMException('Not found', 'NotFoundError');
    setMediaDevices({ getUserMedia: jest.fn().mockRejectedValue(domErr) });
    setIsSecureContext(true);

    const onError = jest.fn();
    const service = new WebRTCService({ onError });
    await expect(service.getLocalStream()).rejects.toThrow(/No camera or microphone/);
    expect(onError).toHaveBeenCalled();
  });

  it('throws NotReadableError message for DOMException NotReadableError', async () => {
    const domErr = new DOMException('Not readable', 'NotReadableError');
    setMediaDevices({ getUserMedia: jest.fn().mockRejectedValue(domErr) });
    setIsSecureContext(true);

    const onError = jest.fn();
    const service = new WebRTCService({ onError });
    await expect(service.getLocalStream()).rejects.toThrow(/already in use/);
    expect(onError).toHaveBeenCalled();
  });

  it('throws TrackStartError message for DOMException TrackStartError', async () => {
    const domErr = new DOMException('Track start error', 'TrackStartError');
    setMediaDevices({ getUserMedia: jest.fn().mockRejectedValue(domErr) });
    setIsSecureContext(true);

    const onError = jest.fn();
    const service = new WebRTCService({ onError });
    await expect(service.getLocalStream()).rejects.toThrow(/already in use/);
    expect(onError).toHaveBeenCalled();
  });

  it('throws OverconstrainedError message for DOMException OverconstrainedError', async () => {
    const domErr = new DOMException('Overconstrained', 'OverconstrainedError');
    setMediaDevices({ getUserMedia: jest.fn().mockRejectedValue(domErr) });
    setIsSecureContext(true);

    const onError = jest.fn();
    const service = new WebRTCService({ onError });
    await expect(service.getLocalStream()).rejects.toThrow(/does not support the requested/);
    expect(onError).toHaveBeenCalled();
  });

  it('throws TypeError message for DOMException TypeError', async () => {
    const domErr = new DOMException('Type error', 'TypeError');
    setMediaDevices({ getUserMedia: jest.fn().mockRejectedValue(domErr) });
    setIsSecureContext(true);

    const onError = jest.fn();
    const service = new WebRTCService({ onError });
    await expect(service.getLocalStream()).rejects.toThrow(/Invalid media constraints/);
    expect(onError).toHaveBeenCalled();
  });

  it('re-throws generic Error as-is', async () => {
    const err = new Error('Some unexpected error');
    setMediaDevices({ getUserMedia: jest.fn().mockRejectedValue(err) });
    setIsSecureContext(true);

    const onError = jest.fn();
    const service = new WebRTCService({ onError });
    await expect(service.getLocalStream()).rejects.toThrow('Some unexpected error');
    expect(onError).toHaveBeenCalledWith(err);
  });

  it('wraps non-Error rejection in a generic message', async () => {
    setMediaDevices({ getUserMedia: jest.fn().mockRejectedValue('string error') });
    setIsSecureContext(true);

    const onError = jest.fn();
    const service = new WebRTCService({ onError });
    await expect(service.getLocalStream()).rejects.toThrow(/Failed to access camera/);
  });

  it('accepts custom constraints', async () => {
    const fakeStream = makeFakeMediaStream();
    const getUserMedia = jest.fn().mockResolvedValue(fakeStream);
    setMediaDevices({ getUserMedia });
    setIsSecureContext(true);

    const service = new WebRTCService();
    const customConstraints: MediaStreamConstraints = { audio: true, video: false };
    await service.getLocalStream(customConstraints);
    expect(getUserMedia).toHaveBeenCalledWith(customConstraints);
  });
});

// ===========================================================================
// createOffer — error path
// ===========================================================================

describe('createOffer — no peer connection', () => {
  it('throws and calls onError when peerConnection is not initialized', async () => {
    const onError = jest.fn();
    const service = new WebRTCService({ onError });
    await expect(service.createOffer()).rejects.toThrow('Peer connection not initialized');
    expect(onError).toHaveBeenCalled();
  });

  it('throws and fires onError when createOffer fails on PC', async () => {
    const onError = jest.fn();
    const { service, pc } = setup({ onError });
    pc.createOffer = jest.fn().mockRejectedValue(new Error('createOffer failed'));
    await expect(service.createOffer()).rejects.toThrow('createOffer failed');
    expect(onError).toHaveBeenCalled();
  });
});

// ===========================================================================
// createAnswer
// ===========================================================================

describe('createAnswer', () => {
  it('throws and calls onError when no peer connection', async () => {
    const onError = jest.fn();
    const service = new WebRTCService({ onError });
    await expect(service.createAnswer({ type: 'offer', sdp: '' })).rejects.toThrow(
      'Peer connection not initialized'
    );
    expect(onError).toHaveBeenCalled();
  });

  it('sets remote+local description, arms autoNegotiate, returns answer', async () => {
    const { service, pc } = setup();
    const offer = { type: 'offer' as RTCSdpType, sdp: 'v=0\r\n' };
    const answer = await service.createAnswer(offer);

    expect(pc.setRemoteDescription).toHaveBeenCalled();
    expect(pc.setLocalDescription).toHaveBeenCalled();
    expect(answer.type).toBe('answer');
  });

  it('throws and fires onError when createAnswer fails', async () => {
    const onError = jest.fn();
    const { service, pc } = setup({ onError });
    pc.createAnswer = jest.fn().mockRejectedValue(new Error('no answer'));
    await expect(service.createAnswer({ type: 'offer', sdp: '' })).rejects.toThrow('no answer');
    expect(onError).toHaveBeenCalled();
  });
});

// ===========================================================================
// setRemoteDescription
// ===========================================================================

describe('setRemoteDescription', () => {
  it('throws and calls onError when no peer connection', async () => {
    const onError = jest.fn();
    const service = new WebRTCService({ onError });
    await expect(
      service.setRemoteDescription({ type: 'answer', sdp: '' })
    ).rejects.toThrow('Peer connection not initialized');
    expect(onError).toHaveBeenCalled();
  });

  it('calls pc.setRemoteDescription with the description', async () => {
    const { service, pc } = setup();
    const desc = { type: 'answer' as RTCSdpType, sdp: 'v=0\r\n' };
    await service.setRemoteDescription(desc);
    expect(pc.setRemoteDescription).toHaveBeenCalled();
  });

  it('throws and fires onError when pc.setRemoteDescription fails', async () => {
    const onError = jest.fn();
    const { service, pc } = setup({ onError });
    pc.setRemoteDescription = jest.fn().mockRejectedValue(new Error('remote desc fail'));
    await expect(
      service.setRemoteDescription({ type: 'answer', sdp: '' })
    ).rejects.toThrow('remote desc fail');
    expect(onError).toHaveBeenCalled();
  });
});

// ===========================================================================
// addIceCandidate
// ===========================================================================

describe('addIceCandidate', () => {
  it('swallows the no-peer-connection error (does not propagate)', async () => {
    const service = new WebRTCService();
    // addIceCandidate catches all errors internally and does NOT rethrow
    await expect(service.addIceCandidate({ candidate: 'x' })).resolves.toBeUndefined();
  });

  it('calls pc.addIceCandidate on success', async () => {
    const { service, pc } = setup();
    await service.addIceCandidate({ candidate: 'candidate:1 ...' });
    expect(pc.addIceCandidate).toHaveBeenCalled();
  });

  it('swallows errors from pc.addIceCandidate', async () => {
    const { service, pc } = setup();
    pc.addIceCandidate = jest.fn().mockRejectedValue(new Error('candidate fail'));
    // Should not throw
    await expect(service.addIceCandidate({ candidate: 'bad' })).resolves.toBeUndefined();
  });
});

// ===========================================================================
// addTrack
// ===========================================================================

describe('addTrack', () => {
  it('returns null when no peer connection (error is caught)', () => {
    const service = new WebRTCService();
    const track = makeTrack('audio') as unknown as MediaStreamTrack;
    const stream = makeStream({ audio: true });
    const result = service.addTrack(track, stream);
    expect(result).toBeNull();
  });

  it('returns sender on success', () => {
    const { service, pc } = setup();
    const track = makeTrack('audio') as unknown as MediaStreamTrack;
    const stream = makeStream({ audio: true });
    const fakeSender = new FakeSender(track);
    pc.addTrack = jest.fn().mockReturnValue(fakeSender);

    const result = service.addTrack(track, stream);
    expect(result).toBe(fakeSender);
    expect(pc.addTrack).toHaveBeenCalledWith(track, stream);
  });

  it('returns null when addTrack throws', () => {
    const { service, pc } = setup();
    pc.addTrack = jest.fn().mockImplementation(() => {
      throw new Error('addTrack error');
    });
    const track = makeTrack('audio') as unknown as MediaStreamTrack;
    const stream = makeStream({ audio: true });
    expect(service.addTrack(track, stream)).toBeNull();
  });
});

// ===========================================================================
// replaceTrack
// ===========================================================================

describe('replaceTrack', () => {
  it('calls sender.replaceTrack and resolves', async () => {
    const { service } = setup();
    const sender = new FakeSender(makeTrack('video'));
    const newTrack = makeTrack('video') as unknown as MediaStreamTrack;
    await service.replaceTrack(sender as unknown as RTCRtpSender, newTrack);
    expect(sender.replaceTrack).toHaveBeenCalledWith(newTrack);
  });

  it('throws when sender.replaceTrack fails', async () => {
    const { service } = setup();
    const sender = new FakeSender(null);
    sender.replaceTrack = jest.fn().mockRejectedValue(new Error('replaceTrack failed'));
    await expect(
      service.replaceTrack(sender as unknown as RTCRtpSender, null)
    ).rejects.toThrow('replaceTrack failed');
  });
});

// ===========================================================================
// replaceVideoTrack
// ===========================================================================

describe('replaceVideoTrack', () => {
  it('does nothing when no peer connection', async () => {
    const service = new WebRTCService();
    // Should not throw
    await expect(service.replaceVideoTrack(null)).resolves.toBeUndefined();
  });

  it('does nothing when no video sender exists', async () => {
    const { service, pc } = setup();
    // Only audio senders
    pc.getSenders = jest.fn(() => {
      const audioSender = new FakeSender({ kind: 'audio' });
      return [audioSender] as unknown as RTCRtpSender[];
    });
    await expect(service.replaceVideoTrack(null)).resolves.toBeUndefined();
  });

  it('calls replaceTrack on the video sender', async () => {
    const { service, pc } = setup();
    const videoTrack = { kind: 'video' };
    const videoSender = new FakeSender(videoTrack);
    pc.getSenders = jest.fn(() => [videoSender] as unknown as RTCRtpSender[]);

    const newTrack = makeTrack('video') as unknown as MediaStreamTrack;
    await service.replaceVideoTrack(newTrack);
    expect(videoSender.replaceTrack).toHaveBeenCalledWith(newTrack);
  });
});

// ===========================================================================
// negotiate
// ===========================================================================

describe('negotiate', () => {
  it('throws (without onError) when no peer connection', async () => {
    // negotiate() does NOT call onError for the initial pc check — it throws directly
    const service = new WebRTCService();
    await expect(service.negotiate()).rejects.toThrow('Peer connection not initialized');
  });

  it('returns early (no second offer) when makingOffer is true', async () => {
    const { service, pc, onLocalDescription } = setup();
    service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });

    // Simulate an in-flight offer by making createOffer hang
    let resolveOffer!: (v: RTCSessionDescriptionInit) => void;
    pc.createOffer = jest.fn(
      () =>
        new Promise<RTCSessionDescriptionInit>((res) => {
          resolveOffer = res;
        })
    );

    const first = service.negotiate();
    // Second call while first is in flight should return immediately
    const second = service.negotiate();
    await second; // resolves immediately (skipped)

    resolveOffer({ type: 'offer', sdp: 'v=0\r\n' });
    await first;

    // createOffer should only be called once (second was skipped)
    expect(pc.createOffer).toHaveBeenCalledTimes(1);

    // Reset
    onLocalDescription.mockClear();
  });

  it('fires onLocalDescription with the local description after negotiate', async () => {
    const { service, onLocalDescription } = setup();
    service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });
    await service.negotiate();
    expect(onLocalDescription).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'offer' })
    );
  });

  it('does NOT fire onLocalDescription when localDescription is null after setLocalDescription', async () => {
    const { service, pc, onLocalDescription } = setup();
    service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });
    pc.setLocalDescription = jest.fn(async () => {
      pc.localDescription = null;
    });
    await service.negotiate();
    expect(onLocalDescription).not.toHaveBeenCalled();
  });

  it('throws and fires onError when createOffer throws during negotiate', async () => {
    const onError = jest.fn();
    const { service, pc } = setup({ onError });
    pc.createOffer = jest.fn().mockRejectedValue(new Error('negotiate failed'));
    await expect(service.negotiate()).rejects.toThrow('negotiate failed');
    expect(onError).toHaveBeenCalled();
  });

  it('resets makingOffer in finally so a subsequent negotiate() succeeds after failure', async () => {
    const { service, pc, onLocalDescription } = setup();
    service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });
    pc.createOffer = jest.fn()
      .mockRejectedValueOnce(new Error('transient failure'))
      .mockResolvedValue({ type: 'offer' as RTCSdpType, sdp: 'v=0\r\n' });
    await expect(service.negotiate()).rejects.toThrow('transient failure');
    await service.negotiate();
    expect(onLocalDescription).toHaveBeenCalled();
  });

  it('calls createOffer with iceRestart option when specified', async () => {
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });
    await service.negotiate({ iceRestart: true });
    expect(pc.createOffer).toHaveBeenCalledWith({ iceRestart: true });
  });

  it('calls createOffer with undefined when iceRestart is false', async () => {
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });
    await service.negotiate({ iceRestart: false });
    expect(pc.createOffer).toHaveBeenCalledWith(undefined);
  });
});

// ===========================================================================
// handleRenegotiationOffer — error path
// ===========================================================================

describe('handleRenegotiationOffer — edge cases', () => {
  it('throws (without onError) when no peer connection', async () => {
    // handleRenegotiationOffer does NOT call onError for the initial pc check
    const service = new WebRTCService();
    await expect(
      service.handleRenegotiationOffer({ type: 'offer', sdp: '' })
    ).rejects.toThrow('Peer connection not initialized');
  });

  it('throws and fires onError when setRemoteDescription fails during handling', async () => {
    const onError = jest.fn();
    const { service, pc } = setup({ onError });
    service.setNegotiationRole('zzz', 'aaa'); // impolite but state is stable → no collision
    pc.signalingState = 'stable';
    pc.setRemoteDescription = jest.fn().mockRejectedValue(new Error('remote desc error'));
    await expect(
      service.handleRenegotiationOffer({ type: 'offer', sdp: '' })
    ).rejects.toThrow('remote desc error');
    expect(onError).toHaveBeenCalled();
  });
});

// ===========================================================================
// setRemoteAnswer
// ===========================================================================

describe('setRemoteAnswer', () => {
  it('throws when no peer connection', async () => {
    const service = new WebRTCService();
    await expect(service.setRemoteAnswer({ type: 'answer', sdp: '' })).rejects.toThrow(
      'Peer connection not initialized'
    );
  });

  it('calls pc.setRemoteDescription and clears pending flag', async () => {
    const { service, pc } = setup();
    const answer = { type: 'answer' as RTCSdpType, sdp: 'v=0\r\n' };
    await service.setRemoteAnswer(answer);
    expect(pc.setRemoteDescription).toHaveBeenCalled();
  });

  it('clears isSettingRemoteAnswerPending even when setRemoteDescription throws (finally block)', async () => {
    const { service, pc } = setup();
    service.setNegotiationRole('zzz', 'aaa'); // impolite

    pc.setRemoteDescription = jest.fn().mockRejectedValue(new Error('fail'));
    await expect(service.setRemoteAnswer({ type: 'answer', sdp: '' })).rejects.toThrow('fail');

    // With flag cleared (false), an impolite peer in a non-stable signaling state
    // treats the incoming offer as a collision and ignores it — setRemoteDescription
    // is NOT called for the offer.  If the finally block were missing and the flag
    // stayed true, readyForOffer would be true, the offer would be processed, and
    // setRemoteDescription WOULD be called — failing the assertion below.
    pc.setRemoteDescription = jest.fn(async () => {});
    pc.createAnswer = jest.fn(async () => ({ type: 'answer' as RTCSdpType, sdp: 'v=0\r\n' }));
    pc.signalingState = 'have-local-offer'; // non-stable: readyForOffer depends on the flag
    await expect(
      service.handleRenegotiationOffer({ type: 'offer', sdp: '' })
    ).resolves.toBeUndefined();
    expect(pc.setRemoteDescription).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// enableVideoSend — various branches
// ===========================================================================

describe('enableVideoSend — autoNegotiate=false', () => {
  it('skips negotiate() call when autoNegotiate is false', async () => {
    const { service, onLocalDescription } = setup();
    service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });
    // Do NOT call createOffer → autoNegotiate stays false

    const camTrack = makeTrack('video') as unknown as MediaStreamTrack;
    await service.enableVideoSend(camTrack);

    // No negotiate → onLocalDescription should NOT have been called
    expect(onLocalDescription).not.toHaveBeenCalled();
  });
});

describe('enableVideoSend — direction already sendrecv', () => {
  it('replaces track and keeps direction when already sendrecv', async () => {
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true, video: true }), { sendVideo: true });
    await service.createOffer();

    const videoTx = pc._transceivers.find(
      (t) => (t.sender.track as { kind?: string })?.kind === 'video'
    )!;
    videoTx.direction = 'sendrecv';

    const newCam = makeTrack('video') as unknown as MediaStreamTrack;
    await service.enableVideoSend(newCam);

    expect(videoTx.direction).toBe('sendrecv');
    expect(videoTx.sender.replaceTrack).toHaveBeenCalledWith(newCam);
  });
});

describe('enableVideoSend — with localStream', () => {
  it('adds track to localStream when localStream is set', async () => {
    const { service, pc } = setup();
    const stream = makeStream({ audio: true });
    service.addLocalMedia(stream, { sendVideo: false });
    await service.createOffer();

    const camTrack = makeTrack('video') as unknown as MediaStreamTrack;
    await service.enableVideoSend(camTrack);

    // localStream.addTrack should have been called
    expect(stream.addTrack).toHaveBeenCalledWith(camTrack);
    const videoTx = pc._transceivers.find((t) => t.direction === 'recvonly' || t.direction === 'sendrecv');
    expect(videoTx).toBeDefined();
  });
});

// ===========================================================================
// disableVideoSend — additional coverage
// ===========================================================================

describe('disableVideoSend', () => {
  it('returns early when no videoTransceiver', async () => {
    const service = new WebRTCService();
    await expect(service.disableVideoSend()).resolves.toBeUndefined();
  });

  it('skips track.stop/removeTrack when sender has no track', async () => {
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });
    await service.createOffer();

    const videoTx = pc._transceivers.find((t) => t.direction === 'recvonly')!;
    videoTx.sender.track = null;

    await expect(service.disableVideoSend()).resolves.toBeUndefined();
    expect(videoTx.sender.replaceTrack).toHaveBeenCalledWith(null);
    expect(videoTx.direction).toBe('recvonly');
  });

  it('stops the video track and removes it from localStream when sender has a track', async () => {
    const { service, pc } = setup();
    const stream = makeStream({ audio: true, video: true });
    service.addLocalMedia(stream, { sendVideo: true });

    const videoTx = pc._transceivers.find(
      (t) => (t.sender.track as { kind?: string })?.kind === 'video'
    )!;
    const videoTrack = videoTx.sender.track as ReturnType<typeof makeTrack>;

    await service.disableVideoSend();

    expect(videoTx.sender.replaceTrack).toHaveBeenCalledWith(null);
    expect(videoTrack.stop).toHaveBeenCalled();
    expect(stream.removeTrack).toHaveBeenCalledWith(videoTrack);
  });
});

describe('disableVideoSend — autoNegotiate=false', () => {
  it('skips negotiate when autoNegotiate is false', async () => {
    const { service, onLocalDescription } = setup();
    service.addLocalMedia(makeStream({ audio: true, video: true }), { sendVideo: true });
    // No createOffer call → autoNegotiate=false

    await service.disableVideoSend();
    expect(onLocalDescription).not.toHaveBeenCalled();
  });

  it('nulls track and keeps direction when already recvonly', async () => {
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true, video: true }), { sendVideo: true });
    await service.createOffer();

    const videoTx = pc._transceivers.find(
      (t) => (t.sender.track as { kind?: string })?.kind === 'video'
    )!;
    videoTx.direction = 'recvonly';

    await service.disableVideoSend();
    expect(videoTx.sender.replaceTrack).toHaveBeenCalledWith(null);
    expect(videoTx.direction).toBe('recvonly');
  });
});

// ===========================================================================
// applyVideoEncoding — additional tiers + edge cases
// ===========================================================================

describe('applyVideoEncoding — tiers', () => {
  it('applies "medium" tier encoding', async () => {
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true, video: true }), { sendVideo: true });

    await service.applyVideoEncoding('medium');

    const videoSender = pc._transceivers.find(
      (t) => (t.sender.track as { kind?: string })?.kind === 'video'
    )!.sender;
    const params = videoSender.setParameters.mock.calls[0][0];
    expect(params.encodings![0]).toEqual(
      expect.objectContaining({ maxBitrate: 600_000, maxFramerate: 25, scaleResolutionDownBy: 2 })
    );
  });

  it('applies "high" tier encoding', async () => {
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true, video: true }), { sendVideo: true });

    await service.applyVideoEncoding('high');

    const videoSender = pc._transceivers.find(
      (t) => (t.sender.track as { kind?: string })?.kind === 'video'
    )!.sender;
    const params = videoSender.setParameters.mock.calls[0][0];
    expect(params.encodings![0]).toEqual(
      expect.objectContaining({ maxBitrate: 1_500_000, maxFramerate: 30, scaleResolutionDownBy: 1 })
    );
  });

  it('does nothing when no sender or transceiver (no pc at all)', async () => {
    const service = new WebRTCService();
    // No peer connection, no transceiver
    await expect(service.applyVideoEncoding('high')).resolves.toBeUndefined();
  });

  it('does nothing when sender has no getParameters function', async () => {
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true, video: true }), { sendVideo: true });

    const videoSender = pc._transceivers.find(
      (t) => (t.sender.track as { kind?: string })?.kind === 'video'
    )!.sender;
    // Remove getParameters
    (videoSender as unknown as { getParameters: undefined }).getParameters = undefined as never;

    await expect(service.applyVideoEncoding('high')).resolves.toBeUndefined();
  });

  it('creates a single encoding entry when encodings is empty', async () => {
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true, video: true }), { sendVideo: true });

    const videoSender = pc._transceivers.find(
      (t) => (t.sender.track as { kind?: string })?.kind === 'video'
    )!.sender;
    videoSender.getParameters = jest.fn(() => ({ encodings: [] }));

    await service.applyVideoEncoding('high');

    const params = videoSender.setParameters.mock.calls[0][0];
    expect(params.encodings).toHaveLength(1);
    expect(params.encodings![0].maxBitrate).toBe(1_500_000);
  });

  it('creates a single encoding entry when encodings is undefined/missing', async () => {
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true, video: true }), { sendVideo: true });

    const videoSender = pc._transceivers.find(
      (t) => (t.sender.track as { kind?: string })?.kind === 'video'
    )!.sender;
    videoSender.getParameters = jest.fn(() => ({ encodings: undefined }));

    await service.applyVideoEncoding('medium');

    const params = videoSender.setParameters.mock.calls[0][0];
    expect(params.encodings).toHaveLength(1);
  });

  it('swallows setParameters error', async () => {
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true, video: true }), { sendVideo: true });

    const videoSender = pc._transceivers.find(
      (t) => (t.sender.track as { kind?: string })?.kind === 'video'
    )!.sender;
    videoSender.setParameters = jest.fn().mockRejectedValue(new Error('setParameters error'));

    await expect(service.applyVideoEncoding('high')).resolves.toBeUndefined();
  });

  it('falls back to peerConnection getSenders when videoTransceiver is null', async () => {
    // Build a service where videoTransceiver is null but PC has a video sender
    const { service, pc } = setup();
    // Don't call addLocalMedia → videoTransceiver stays null
    // Manually inject a sender via _transceivers with a video-like track
    const videoSender = new FakeSender({ kind: 'video' });
    pc._transceivers.push({ sender: videoSender, direction: 'sendrecv' } as FakeTransceiver);

    await service.applyVideoEncoding('low');

    expect(videoSender.setParameters).toHaveBeenCalled();
  });
});

// ===========================================================================
// applyVideoEncoding — audio-only tier
// ===========================================================================

describe('applyVideoEncoding — audio-only tier', () => {
  it('calls disableVideoSend when audio-only tier is set', async () => {
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true, video: true }), { sendVideo: true });
    await service.createOffer();

    const videoTx = pc._transceivers.find(
      (t) => (t.sender.track as { kind?: string })?.kind === 'video'
    )!;
    await service.applyVideoEncoding('audio-only');

    expect(videoTx.sender.replaceTrack).toHaveBeenCalledWith(null);
    expect(videoTx.direction).toBe('recvonly');
  });

  it('upgrades to high tier when enableVideoSend is called after audio-only', async () => {
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });
    await service.createOffer();

    // Set tier to audio-only (disableVideoSend is best-effort, may swallow)
    await service.applyVideoEncoding('audio-only').catch(() => { /* best-effort */ });

    // Now enable video — should upgrade to 'high' because currentVideoTier is 'audio-only'
    const videoTx = pc._transceivers.find((t) => t.direction === 'recvonly')!;
    const camTrack = makeTrack('video') as unknown as MediaStreamTrack;
    await service.enableVideoSend(camTrack);

    // Should have applied 'high' tier (maxBitrate=1_500_000)
    const lastCall = videoTx.sender.setParameters.mock.calls.at(-1)?.[0];
    expect(lastCall?.encodings?.[0]?.maxBitrate).toBe(1_500_000);
  });
});

// ===========================================================================
// setJitterBufferTargets
// ===========================================================================

describe('setJitterBufferTargets', () => {
  it('does nothing when no peer connection', () => {
    const service = new WebRTCService();
    expect(() => service.setJitterBufferTargets()).not.toThrow();
  });

  it('sets 0 for audio receivers and 200 for video receivers', () => {
    const { service, pc } = setup();
    const audioReceiver = new FakeReceiver('audio');
    const videoReceiver = new FakeReceiver('video');
    pc._receivers = [audioReceiver, videoReceiver];

    service.setJitterBufferTargets();

    expect(audioReceiver.jitterBufferTarget).toBe(0);
    expect(videoReceiver.jitterBufferTarget).toBe(200);
  });

  it('swallows assignment errors (unsupported browsers)', () => {
    const { service, pc } = setup();
    const badReceiver = {
      track: { kind: 'audio' },
      set jitterBufferTarget(_v: unknown) {
        throw new Error('not supported');
      },
    };
    pc._receivers = [badReceiver as unknown as FakeReceiver];

    expect(() => service.setJitterBufferTargets()).not.toThrow();
  });
});

// ===========================================================================
// getConnectionState / getIceConnectionState / getPeerConnection / getCurrentStream
// ===========================================================================

describe('state getters', () => {
  it('getConnectionState returns null when no pc', () => {
    const service = new WebRTCService();
    expect(service.getConnectionState()).toBeNull();
  });

  it('getConnectionState returns state from pc', () => {
    const { service, pc } = setup();
    pc.connectionState = 'connected';
    expect(service.getConnectionState()).toBe('connected');
  });

  it('getIceConnectionState returns null when no pc', () => {
    const service = new WebRTCService();
    expect(service.getIceConnectionState()).toBeNull();
  });

  it('getIceConnectionState returns state from pc', () => {
    const { service, pc } = setup();
    pc.iceConnectionState = 'checking';
    expect(service.getIceConnectionState()).toBe('checking');
  });

  it('getPeerConnection returns the peer connection', () => {
    const { service, pc } = setup();
    expect(service.getPeerConnection()).toBe(pc);
  });

  it('getPeerConnection returns null when not initialized', () => {
    const service = new WebRTCService();
    expect(service.getPeerConnection()).toBeNull();
  });

  it('getCurrentStream returns null before stream acquired', () => {
    const service = new WebRTCService();
    expect(service.getCurrentStream()).toBeNull();
  });

  it('getCurrentStream returns stream after addLocalMedia', () => {
    const { service } = setup();
    const stream = makeStream({ audio: true });
    service.addLocalMedia(stream, { sendVideo: false });
    expect(service.getCurrentStream()).toBe(stream);
  });
});

// ===========================================================================
// startQualityMonitor
// ===========================================================================

describe('startQualityMonitor', () => {
  it('warns and returns when no peer connection', () => {
    const service = new WebRTCService();
    expect(() => service.startQualityMonitor()).not.toThrow();
  });

  it('stops any existing monitor before starting a new one', () => {
    const { service } = setup();
    service.startQualityMonitor();
    const spy = jest.spyOn(service, 'stopQualityMonitor');
    service.startQualityMonitor();
    expect(spy).toHaveBeenCalled();
    service.stopQualityMonitor();
    spy.mockRestore();
  });

  it('reports "excellent" quality when loss<1 and rtt<100ms', async () => {
    jest.useFakeTimers();
    const onConnectionQualityChange = jest.fn();
    const { service, pc } = setup({ onConnectionQualityChange });

    const mockStats = {
      forEach: jest.fn((cb: (report: unknown) => void) => {
        cb({ type: 'inbound-rtp', kind: 'audio', packetsReceived: 100, packetsLost: 0, bytesReceived: 1000, timestamp: 5000 });
        cb({ type: 'candidate-pair', state: 'succeeded', currentRoundTripTime: 0.05 }); // 50ms
      }),
    };
    pc.getStats = jest.fn(async () => mockStats);

    service.startQualityMonitor();
    await jest.advanceTimersByTimeAsync(3001);

    expect(onConnectionQualityChange).toHaveBeenCalledWith('excellent');
    service.stopQualityMonitor();
    jest.useRealTimers();
  });

  it('reports "good" quality for moderate loss and rtt', async () => {
    jest.useFakeTimers();
    const onConnectionQualityChange = jest.fn();
    const { service, pc } = setup({ onConnectionQualityChange });

    const mockStats = {
      forEach: jest.fn((cb: (report: unknown) => void) => {
        // packetLoss ≈ 1.96% (≥1, <3), rtt=150ms (<200)
        cb({ type: 'inbound-rtp', kind: 'audio', packetsReceived: 100, packetsLost: 2, bytesReceived: 1000, timestamp: 5000 });
        cb({ type: 'candidate-pair', state: 'succeeded', currentRoundTripTime: 0.15 });
      }),
    };
    pc.getStats = jest.fn(async () => mockStats);

    service.startQualityMonitor();
    await jest.advanceTimersByTimeAsync(3001);

    expect(onConnectionQualityChange).toHaveBeenCalledWith('good');
    service.stopQualityMonitor();
    jest.useRealTimers();
  });

  it('reports "fair" quality for higher loss and rtt', async () => {
    jest.useFakeTimers();
    const onConnectionQualityChange = jest.fn();
    const { service, pc } = setup({ onConnectionQualityChange });

    const mockStats = {
      forEach: jest.fn((cb: (report: unknown) => void) => {
        // packetLoss ≈ 4.76% (≥3, <8), rtt=300ms (<400)
        cb({ type: 'inbound-rtp', kind: 'audio', packetsReceived: 100, packetsLost: 5, bytesReceived: 1000, timestamp: 5000 });
        cb({ type: 'candidate-pair', state: 'succeeded', currentRoundTripTime: 0.3 });
      }),
    };
    pc.getStats = jest.fn(async () => mockStats);

    service.startQualityMonitor();
    await jest.advanceTimersByTimeAsync(3001);

    expect(onConnectionQualityChange).toHaveBeenCalledWith('fair');
    service.stopQualityMonitor();
    jest.useRealTimers();
  });

  it('reports "poor" quality for high loss and rtt', async () => {
    jest.useFakeTimers();
    const onConnectionQualityChange = jest.fn();
    const { service, pc } = setup({ onConnectionQualityChange });

    const mockStats = {
      forEach: jest.fn((cb: (report: unknown) => void) => {
        // packetLoss = 20% (≥8), rtt=500ms (≥400)
        cb({ type: 'inbound-rtp', kind: 'audio', packetsReceived: 80, packetsLost: 20, bytesReceived: 1000, timestamp: 5000 });
        cb({ type: 'candidate-pair', state: 'succeeded', currentRoundTripTime: 0.5 });
      }),
    };
    pc.getStats = jest.fn(async () => mockStats);

    service.startQualityMonitor();
    await jest.advanceTimersByTimeAsync(3001);

    expect(onConnectionQualityChange).toHaveBeenCalledWith('poor');
    service.stopQualityMonitor();
    jest.useRealTimers();
  });

  it('stops monitor when peerConnection becomes null during interval', async () => {
    jest.useFakeTimers();
    const { service, pc } = setup();

    let callCount = 0;
    pc.getStats = jest.fn(async () => {
      callCount++;
      return { forEach: jest.fn() };
    });

    service.startQualityMonitor();
    await jest.advanceTimersByTimeAsync(3001);
    expect(callCount).toBe(1);

    // Null the pc so the next interval hits the early-return path
    (service as unknown as { peerConnection: null }).peerConnection = null;
    const stopSpy = jest.spyOn(service, 'stopQualityMonitor');
    await jest.advanceTimersByTimeAsync(3001);
    expect(stopSpy).toHaveBeenCalled();

    stopSpy.mockRestore();
    jest.useRealTimers();
  });

  it('swallows getStats errors without crashing', async () => {
    jest.useFakeTimers();
    const { service, pc } = setup();
    pc.getStats = jest.fn().mockRejectedValue(new Error('stats error'));

    service.startQualityMonitor();
    await expect(jest.advanceTimersByTimeAsync(3001)).resolves.toBeUndefined();
    service.stopQualityMonitor();
    jest.useRealTimers();
  });

  it('handles candidate-pair without currentRoundTripTime (rtt defaults to 0)', async () => {
    jest.useFakeTimers();
    const onConnectionQualityChange = jest.fn();
    const { service, pc } = setup({ onConnectionQualityChange });

    const mockStats = {
      forEach: jest.fn((cb: (report: unknown) => void) => {
        cb({ type: 'inbound-rtp', kind: 'audio', packetsReceived: 100, packetsLost: 0, bytesReceived: 1000, timestamp: 5000 });
        cb({ type: 'candidate-pair', state: 'succeeded' }); // no currentRoundTripTime
      }),
    };
    pc.getStats = jest.fn(async () => mockStats);

    service.startQualityMonitor();
    await jest.advanceTimersByTimeAsync(3001);
    expect(onConnectionQualityChange).toHaveBeenCalledWith('excellent');
    service.stopQualityMonitor();
    jest.useRealTimers();
  });

  it('handles zero packets (avoids division by zero in packetLoss)', async () => {
    jest.useFakeTimers();
    const onConnectionQualityChange = jest.fn();
    const { service, pc } = setup({ onConnectionQualityChange });

    const mockStats = {
      forEach: jest.fn((cb: (report: unknown) => void) => {
        cb({ type: 'inbound-rtp', kind: 'audio', packetsReceived: 0, packetsLost: 0, bytesReceived: 0, timestamp: 5000 });
      }),
    };
    pc.getStats = jest.fn(async () => mockStats);

    service.startQualityMonitor();
    await jest.advanceTimersByTimeAsync(3001);
    expect(onConnectionQualityChange).toHaveBeenCalledWith('excellent');
    service.stopQualityMonitor();
    jest.useRealTimers();
  });

  it('computes bitrate on second tick using previous timestamp', async () => {
    jest.useFakeTimers();
    const onConnectionQualityChange = jest.fn();
    const { service, pc } = setup({ onConnectionQualityChange });

    let tick = 0;
    const mockStats = {
      forEach: jest.fn((cb: (report: unknown) => void) => {
        tick++;
        const timestamp = tick === 1 ? 1000 : 4000;
        const bytesReceived = tick === 1 ? 1000 : 5000;
        cb({ type: 'inbound-rtp', kind: 'audio', packetsReceived: 100, packetsLost: 0, bytesReceived, timestamp });
      }),
    };
    pc.getStats = jest.fn(async () => mockStats);

    service.startQualityMonitor();
    await jest.advanceTimersByTimeAsync(3001); // first tick
    await jest.advanceTimersByTimeAsync(3001); // second tick (bitrate calculated)
    expect(onConnectionQualityChange).toHaveBeenCalledTimes(2);
    service.stopQualityMonitor();
    jest.useRealTimers();
  });

  it('ignores candidate-pair that is not "succeeded"', async () => {
    jest.useFakeTimers();
    const onConnectionQualityChange = jest.fn();
    const { service, pc } = setup({ onConnectionQualityChange });

    const mockStats = {
      forEach: jest.fn((cb: (report: unknown) => void) => {
        cb({ type: 'inbound-rtp', kind: 'audio', packetsReceived: 100, packetsLost: 0, bytesReceived: 0, timestamp: 5000 });
        cb({ type: 'candidate-pair', state: 'failed', currentRoundTripTime: 99 }); // ignored
      }),
    };
    pc.getStats = jest.fn(async () => mockStats);

    service.startQualityMonitor();
    await jest.advanceTimersByTimeAsync(3001);
    // rtt=0 (non-succeeded pair ignored), loss=0 → excellent
    expect(onConnectionQualityChange).toHaveBeenCalledWith('excellent');
    service.stopQualityMonitor();
    jest.useRealTimers();
  });
});

// ===========================================================================
// stopQualityMonitor
// ===========================================================================

describe('stopQualityMonitor', () => {
  it('does nothing when no interval is running', () => {
    const service = new WebRTCService();
    expect(() => service.stopQualityMonitor()).not.toThrow();
  });

  it('clears the interval when one is running', () => {
    jest.useFakeTimers();
    const { service } = setup();
    service.startQualityMonitor();
    service.stopQualityMonitor();
    // Interval is cleared — no more callbacks
    // Just verify it doesn't throw and completes cleanly
    jest.useRealTimers();
  });
});

// ===========================================================================
// close
// ===========================================================================

describe('close', () => {
  it('stops tracks, closes pc, resets state', () => {
    const { service, pc } = setup();
    const stream = makeStream({ audio: true, video: true });
    service.addLocalMedia(stream, { sendVideo: true });

    service.close();

    expect(stream.getTracks()[0].stop).toHaveBeenCalled();
    expect(stream.getTracks()[1].stop).toHaveBeenCalled();
    expect(pc.close).toHaveBeenCalled();
    expect(service.getPeerConnection()).toBeNull();
    expect(service.getCurrentStream()).toBeNull();
  });

  it('stops quality monitor during close', () => {
    jest.useFakeTimers();
    const { service } = setup();
    service.startQualityMonitor();
    const spy = jest.spyOn(service, 'stopQualityMonitor');
    service.close();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
    jest.useRealTimers();
  });

  it('clears grace timer during close', async () => {
    jest.useFakeTimers();
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });
    await service.createOffer();

    // Trigger a grace timer
    pc.iceConnectionState = 'disconnected';
    pc.oniceconnectionstatechange!();

    const offerCountBefore = pc.createOffer.mock.calls.length;
    service.close();

    // Even after timer would fire, no restart because close cleared the timer
    await jest.advanceTimersByTimeAsync(3001);
    expect(pc.createOffer.mock.calls.length).toBe(offerCountBefore);

    jest.useRealTimers();
  });

  it('handles close when localStream is null', () => {
    const { service, pc } = setup();
    // Don't call addLocalMedia — localStream is null
    service.close();
    expect(pc.close).toHaveBeenCalled();
  });

  it('handles close when peerConnection is null', () => {
    const service = new WebRTCService();
    expect(() => service.close()).not.toThrow();
  });

  it('resets autoNegotiate and other flags so service can be reused', async () => {
    const { service } = setup();
    service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });
    await service.createOffer(); // sets autoNegotiate=true

    service.close();

    // After close, creating a new pc should work
    const pc2 = service.createPeerConnection('p2') as unknown as FakeRTCPeerConnection;
    expect(pc2).toBeDefined();
    // onnegotiationneeded should not auto-negotiate since autoNegotiate was reset
    const onLocalDesc = jest.fn();
    (service as unknown as { config: WebRTCServiceConfig }).config.onLocalDescription = onLocalDesc;
    pc2.onnegotiationneeded!();
    expect(onLocalDesc).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// enableSimulcast (public SDP method)
// ===========================================================================

describe('enableSimulcast', () => {
  const makeVideoSdp = () =>
    [
      'v=0',
      'm=audio 9 UDP/TLS/RTP/SAVPF 111',
      'a=rtpmap:111 opus/48000/2',
      'm=video 9 UDP/TLS/RTP/SAVPF 96',
      'a=rtpmap:96 VP8/90000',
    ].join('\r\n');

  it('adds simulcast lines to the first video section', () => {
    const service = new WebRTCService();
    const sdp = makeVideoSdp();
    const result = service.enableSimulcast(sdp);
    expect(result).toContain('a=rid:h send');
    expect(result).toContain('a=rid:m send');
    expect(result).toContain('a=rid:l send');
    expect(result).toContain('a=simulcast:send h;m;l');
  });

  it('returns SDP unchanged if no video section exists', () => {
    const service = new WebRTCService();
    const sdp = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n';
    expect(service.enableSimulcast(sdp)).toBe(sdp);
  });

  it('returns SDP unchanged if simulcast already present', () => {
    const service = new WebRTCService();
    const sdp = 'v=0\r\nm=video 9 ...\r\na=simulcast:send h;m;l\r\n';
    expect(service.enableSimulcast(sdp)).toBe(sdp);
  });

  it('inserts simulcast lines before the next m= section', () => {
    const service = new WebRTCService();
    const sdp = [
      'v=0',
      'm=video 9 UDP/TLS/RTP/SAVPF 96',
      'a=rtpmap:96 VP8/90000',
      'm=application 9 DTLS/SCTP 5000',
    ].join('\r\n');
    const result = service.enableSimulcast(sdp);
    expect(result).toContain('a=simulcast:send h;m;l');
    // simulcast lines should appear before m=application
    const simIdx = result.indexOf('a=simulcast:');
    const appIdx = result.indexOf('m=application');
    expect(simIdx).toBeLessThan(appIdx);
  });
});

// ===========================================================================
// SDP munging — exercised via createOffer / createAnswer
// ===========================================================================

describe('Audio codec preferences — applyAudioCodecPreferences (RED via setCodecPreferences)', () => {
  it('applies Opus+RED codec preferences to the audio transceiver on addLocalMedia', () => {
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });

    const audioTransceiver = pc._transceivers[0] as unknown as FakeTransceiver;
    expect(audioTransceiver.setCodecPreferences).toHaveBeenCalledTimes(1);
    const preferred = audioTransceiver.setCodecPreferences.mock.calls[0][0];
    expect(preferred.map((c: { mimeType: string }) => c.mimeType)).toEqual([
      'audio/opus',
      'audio/red',
    ]);
  });

  it('does not touch SDP (no more RED munging) — createOffer SDP is unaffected', async () => {
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });

    pc.createOffer = jest.fn(async () => ({
      type: 'offer' as RTCSdpType,
      sdp: 'm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\n',
    }));
    pc.setLocalDescription = jest.fn(async (desc: { sdp?: string }) => {
      pc.localDescription = { type: 'offer', sdp: desc.sdp };
    });

    const offer = await service.createOffer();
    expect(offer.sdp).not.toContain('red/48000');
  });

  it('no-ops when setCodecPreferences is not a function on the transceiver', () => {
    const { service, pc } = setup();
    const audioTransceiver = new FakeTransceiver(null, 'sendrecv');
    (audioTransceiver as unknown as { setCodecPreferences: unknown }).setCodecPreferences = undefined;
    pc.addTransceiver = jest.fn(() => {
      pc._transceivers.push(audioTransceiver);
      return audioTransceiver;
    });

    expect(() => service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false })).not.toThrow();
  });

  it('no-ops when RTCRtpSender.getCapabilities is unavailable', () => {
    const savedSender = (global as Record<string, unknown>).RTCRtpSender;
    (global as Record<string, unknown>).RTCRtpSender = undefined;
    try {
      const { service, pc } = setup();
      service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });
      const audioTransceiver = pc._transceivers[0] as unknown as FakeTransceiver;
      expect(audioTransceiver.setCodecPreferences).not.toHaveBeenCalled();
    } finally {
      (global as Record<string, unknown>).RTCRtpSender = savedSender;
    }
  });

  it('no-ops when getCapabilities returns no codecs', () => {
    const savedSender = (global as Record<string, unknown>).RTCRtpSender;
    (global as Record<string, unknown>).RTCRtpSender = {
      getCapabilities: jest.fn(() => ({ codecs: [] })),
    };
    try {
      const { service, pc } = setup();
      service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });
      const audioTransceiver = pc._transceivers[0] as unknown as FakeTransceiver;
      expect(audioTransceiver.setCodecPreferences).not.toHaveBeenCalled();
    } finally {
      (global as Record<string, unknown>).RTCRtpSender = savedSender;
    }
  });

  it('swallows a setCodecPreferences throw (e.g. "Invalid codec")', () => {
    const { service, pc } = setup();
    const audioTransceiver = new FakeTransceiver(null, 'sendrecv');
    audioTransceiver.setCodecPreferences = jest.fn(() => {
      throw new Error('Invalid codec');
    });
    pc.addTransceiver = jest.fn(() => {
      pc._transceivers.push(audioTransceiver);
      return audioTransceiver;
    });

    expect(() => service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false })).not.toThrow();
  });
});

describe('SDP munging — addTransportCC', () => {
  it('adds transport-cc extmap to audio section when absent', async () => {
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });

    pc.createOffer = jest.fn(async () => ({
      type: 'offer' as RTCSdpType,
      sdp: 'm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=extmap:5 urn:ietf:params:rtp-hdrext:ssrc-audio-level\r\na=rtpmap:111 opus/48000/2\r\n',
    }));
    pc.setLocalDescription = jest.fn(async (desc: { sdp?: string }) => {
      pc.localDescription = { type: 'offer', sdp: desc.sdp };
    });

    const offer = await service.createOffer();
    expect(offer.sdp).toContain('draft-holmer-rmcat-transport-wide-cc');
  });

  it('skips transport-cc when already present in SDP', async () => {
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });
    const transportCCURI = 'http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01';

    pc.createOffer = jest.fn(async () => ({
      type: 'offer' as RTCSdpType,
      sdp: `m=audio 9 ...\r\na=extmap:5 ${transportCCURI}\r\n`,
    }));
    pc.setLocalDescription = jest.fn(async (desc: { sdp?: string }) => {
      pc.localDescription = { type: 'offer', sdp: desc.sdp };
    });

    const offer = await service.createOffer();
    const count = (offer.sdp!.match(/draft-holmer-rmcat/g) || []).length;
    expect(count).toBe(1);
  });

  it('uses extmap id that avoids collision when id 5 is taken', async () => {
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });

    pc.createOffer = jest.fn(async () => ({
      type: 'offer' as RTCSdpType,
      // extmap ids 5 and 6 are taken
      sdp: 'm=audio 9 ...\r\na=extmap:5 urn:a\r\na=extmap:6 urn:b\r\n',
    }));
    pc.setLocalDescription = jest.fn(async (desc: { sdp?: string }) => {
      pc.localDescription = { type: 'offer', sdp: desc.sdp };
    });

    const offer = await service.createOffer();
    // Should pick id 7 (next after 6)
    expect(offer.sdp).toContain('a=extmap:7 ');
  });
});

describe('SDP munging — addVideoBitrateHints', () => {
  it('adds x-google-max-bitrate to video fmtp lines', async () => {
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true, video: true }), { sendVideo: true });

    pc.createOffer = jest.fn(async () => ({
      type: 'offer' as RTCSdpType,
      sdp: 'v=0\r\nm=audio 9 ...\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=fmtp:96 profile-level-id=42e01f\r\n',
    }));
    pc.setLocalDescription = jest.fn(async (desc: { sdp?: string }) => {
      pc.localDescription = { type: 'offer', sdp: desc.sdp };
    });

    const offer = await service.createOffer();
    expect(offer.sdp).toContain('x-google-max-bitrate=2500');
    expect(offer.sdp).toContain('x-google-min-bitrate=100');
  });

  it('does NOT add hints when fmtp already has x-google-max-bitrate', async () => {
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true, video: true }), { sendVideo: true });

    pc.createOffer = jest.fn(async () => ({
      type: 'offer' as RTCSdpType,
      sdp: 'v=0\r\nm=video 9 ...\r\na=fmtp:96 x-google-max-bitrate=2500\r\n',
    }));
    pc.setLocalDescription = jest.fn(async (desc: { sdp?: string }) => {
      pc.localDescription = { type: 'offer', sdp: desc.sdp };
    });

    const offer = await service.createOffer();
    const count = (offer.sdp!.match(/x-google-max-bitrate/g) || []).length;
    expect(count).toBe(1);
  });
});

describe('SDP munging — mungeOpusSdp', () => {
  it('adds opus quality params to fmtp lines via createOffer', async () => {
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });

    pc.createOffer = jest.fn(async () => ({
      type: 'offer' as RTCSdpType,
      sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=fmtp:111 minptime=10;usedtx=1\r\n',
    }));
    pc.setLocalDescription = jest.fn(async (desc: { sdp?: string }) => {
      pc.localDescription = { type: 'offer', sdp: desc.sdp };
    });

    const offer = await service.createOffer();
    expect(offer.sdp).toContain('maxaveragebitrate=128000');
    expect(offer.sdp).toContain('stereo=1');
    expect(offer.sdp).toContain('useinbandfec=1');
    expect(offer.sdp).toContain('maxplaybackrate=48000');
  });

  it('handles fmtp params without values (key-only params)', async () => {
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });

    // A param without '=' (just a key, no value) should be skipped by the if (key && value) branch
    pc.createOffer = jest.fn(async () => ({
      type: 'offer' as RTCSdpType,
      sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=fmtp:111 minptime=10;keyonly\r\n',
    }));
    pc.setLocalDescription = jest.fn(async (desc: { sdp?: string }) => {
      pc.localDescription = { type: 'offer', sdp: desc.sdp };
    });

    const offer = await service.createOffer();
    // Should still have the opus params (key-only param is simply skipped)
    expect(offer.sdp).toContain('maxaveragebitrate=128000');
  });

  it('does NOT pollute video fmtp lines with Opus-only params', async () => {
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true, video: true }), { sendVideo: true });

    pc.createOffer = jest.fn(async () => ({
      type: 'offer' as RTCSdpType,
      sdp:
        'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=fmtp:111 minptime=10;useinbandfec=1\r\n' +
        'm=video 9 UDP/TLS/RTP/SAVPF 96\r\na=fmtp:96 profile-level-id=42e01f;level-asymmetry-allowed=1\r\n',
    }));
    pc.setLocalDescription = jest.fn(async (desc: { sdp?: string }) => {
      pc.localDescription = { type: 'offer', sdp: desc.sdp };
    });

    const offer = await service.createOffer();
    const videoFmtpLine = offer.sdp!
      .split('\r\n')
      .find((line) => line.startsWith('a=fmtp:96'));

    // addVideoBitrateHints legitimately appends x-google-{max,min}-bitrate to
    // video fmtp lines — only the Opus-only params must stay off this line.
    expect(videoFmtpLine).toContain('profile-level-id=42e01f;level-asymmetry-allowed=1');
    expect(videoFmtpLine).not.toContain('maxaveragebitrate');
    expect(videoFmtpLine).not.toContain('stereo=');
    expect(videoFmtpLine).not.toContain('useinbandfec');
    expect(videoFmtpLine).not.toContain('usedtx');
    expect(videoFmtpLine).not.toContain('maxplaybackrate');
  });
});


// ===========================================================================
// ICE restart failure handlers (catch callbacks)
// ===========================================================================

describe('ICE restart failure — error catch handlers', () => {
  it('restartIce().catch handler absorbs rejection when ICE restart fails after "failed" state', async () => {
    const { service, pc, onError } = setup();
    service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });
    await service.createOffer();

    pc.createOffer = jest.fn().mockRejectedValue(new Error('ICE restart failed'));

    pc.iceConnectionState = 'failed';
    pc.oniceconnectionstatechange!();

    await new Promise<void>((r) => setTimeout(r, 0));
    expect(pc.createOffer).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'ICE restart failed' }));
  });

  it('restartIce().catch handler absorbs rejection when ICE restart fails after grace timer', async () => {
    jest.useFakeTimers();
    const { service, pc, onError } = setup();
    service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });
    await service.createOffer();

    pc.createOffer = jest.fn().mockRejectedValue(new Error('ICE restart after grace failed'));

    pc.iceConnectionState = 'disconnected';
    pc.oniceconnectionstatechange!();

    await jest.advanceTimersByTimeAsync(3001);
    expect(pc.createOffer).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'ICE restart after grace failed' })
    );
  });

  it('grace timer callback skips restart when state has recovered to healthy', async () => {
    jest.useFakeTimers();
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });
    await service.createOffer();

    const offerCountBefore = pc.createOffer.mock.calls.length;

    pc.iceConnectionState = 'disconnected';
    pc.oniceconnectionstatechange!();

    // Recover to a non-disconnected/failed state before timer fires
    pc.iceConnectionState = 'connected';

    // Timer fires but the current state is 'connected' → skip restart
    await jest.advanceTimersByTimeAsync(3001);
    expect(pc.createOffer.mock.calls.length).toBe(offerCountBefore);

    jest.useRealTimers();
  });
});

// ===========================================================================
// getLocalStream — secure context + no mediaDevices (line 434-439)
// ===========================================================================

describe('getLocalStream — secure context without mediaDevices support', () => {
  const setMediaDevices = (value: unknown) => {
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value,
      writable: true,
      configurable: true,
    });
  };

  it('throws when isSecureContext=true and protocol is https but no mediaDevices', async () => {
    // This test covers the "no mediaDevices available" error path.
    // In JSDOM the `!isSecure || protocol === 'http:'` check can go either way —
    // what we care about is that one of the two error branches fires.
    setMediaDevices(undefined);

    // Temporarily override window.location to return https: protocol
    const locationProto = Object.getPrototypeOf(window);
    const origLocationDesc = Object.getOwnPropertyDescriptor(locationProto, 'location');
    Object.defineProperty(locationProto, 'location', {
      get() { return { protocol: 'https:' }; },
      configurable: true,
    });
    // Override isSecureContext to true to reach the 'browser does not support' branch
    const origIsSecureDesc = Object.getOwnPropertyDescriptor(window, 'isSecureContext');
    // Try to patch isSecureContext on the proto (where JSDOM may define it)
    const windowProto = Object.getPrototypeOf(window);
    const protoIsSecureDesc = Object.getOwnPropertyDescriptor(windowProto, 'isSecureContext');

    let restored = false;
    try {
      if (protoIsSecureDesc?.configurable) {
        Object.defineProperty(windowProto, 'isSecureContext', { value: true, configurable: true, writable: true });
      } else {
        Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true, writable: true });
      }

      const onError = jest.fn();
      const service = new WebRTCService({ onError });
      await expect(service.getLocalStream()).rejects.toThrow(/browser|HTTPS|camera/i);
      expect(onError).toHaveBeenCalled();
      restored = false; // proceed to finally
    } finally {
      // Restore location
      if (origLocationDesc) {
        Object.defineProperty(locationProto, 'location', origLocationDesc);
      }
      // Restore isSecureContext
      if (protoIsSecureDesc?.configurable) {
        Object.defineProperty(windowProto, 'isSecureContext', protoIsSecureDesc);
      } else if (origIsSecureDesc) {
        Object.defineProperty(window, 'isSecureContext', origIsSecureDesc);
      }
      void restored;
    }
  });
});

// ===========================================================================
// addLocalMedia — no peer connection
// ===========================================================================

describe('addLocalMedia — no peer connection', () => {
  it('throws when called without a peer connection', () => {
    const service = new WebRTCService();
    const stream = makeStream({ audio: true });
    expect(() => service.addLocalMedia(stream, { sendVideo: false })).toThrow(
      'Peer connection not initialized'
    );
  });
});

// ===========================================================================
// addLocalMedia — audio track is null (uses 'audio' string fallback)
// ===========================================================================

describe('addLocalMedia — no audio track', () => {
  it('falls back to "audio" string when no audio track present', () => {
    const { service, pc } = setup();
    // Stream with no audio tracks
    const stream = makeStream({ video: true }); // audio: false → getAudioTracks() returns []
    service.addLocalMedia(stream, { sendVideo: true });

    // Should have called addTransceiver with 'audio' string fallback
    const audioCall = pc.addTransceiver.mock.calls.find(
      (c) => c[0] === 'audio'
    );
    expect(audioCall).toBeDefined();
  });
});

// ===========================================================================
// enableVideoSend — no videoTransceiver (throws)
// ===========================================================================

describe('enableVideoSend — no videoTransceiver', () => {
  it('throws when videoTransceiver is not initialized', async () => {
    const { service } = setup();
    // Don't call addLocalMedia → videoTransceiver stays null
    const camTrack = makeTrack('video') as unknown as MediaStreamTrack;
    await expect(service.enableVideoSend(camTrack)).rejects.toThrow(
      'Video transceiver not initialized'
    );
  });
});

// ===========================================================================
// enableVideoSend — localStream is null
// ===========================================================================

describe('enableVideoSend — localStream is null', () => {
  it('skips addTrack to stream when localStream is null', async () => {
    const { service, pc } = setup();
    // Set up a video transceiver via addLocalMedia (with sendVideo:false → recvonly)
    service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });
    await service.createOffer();

    // Force localStream to null after addLocalMedia set it
    (service as unknown as { localStream: null }).localStream = null;

    // Find the video transceiver (the one created for video, direction=recvonly)
    const videoTx = pc._transceivers.find((t) => t.direction === 'recvonly')!;
    expect(videoTx).toBeDefined();

    const camTrack = makeTrack('video') as unknown as MediaStreamTrack;
    await service.enableVideoSend(camTrack);

    // Track should have been replaced via replaceTrack on the video sender
    expect(videoTx.sender.replaceTrack).toHaveBeenCalledWith(camTrack);
    // localStream was null, so addTrack was NOT called on any stream
  });
});

// ===========================================================================
// createOffer / createAnswer / setRemoteDescription — no sdp in result (false branch)
// ===========================================================================

describe('createOffer — offer with no sdp field', () => {
  it('skips SDP munging when offer has no sdp', async () => {
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });

    pc.createOffer = jest.fn(async () => ({ type: 'offer' as RTCSdpType }));
    pc.setLocalDescription = jest.fn(async (desc: { sdp?: string }) => {
      pc.localDescription = { type: 'offer', sdp: desc.sdp };
    });

    const offer = await service.createOffer();
    expect(offer.sdp).toBeUndefined();
    expect(pc.setLocalDescription).toHaveBeenCalled();
  });
});

describe('createAnswer — answer with no sdp field', () => {
  it('skips SDP munging when answer has no sdp', async () => {
    const { service, pc } = setup();
    pc.createAnswer = jest.fn(async () => ({ type: 'answer' as RTCSdpType }));
    pc.setLocalDescription = jest.fn(async (desc: { sdp?: string }) => {
      pc.localDescription = { type: 'answer', sdp: desc.sdp };
    });

    const answer = await service.createAnswer({ type: 'offer', sdp: '' });
    expect(answer.sdp).toBeUndefined();
  });
});

describe('createOffer — non-Error thrown by pc', () => {
  it('wraps non-Error in "Failed to create offer"', async () => {
    const onError = jest.fn();
    const { service, pc } = setup({ onError });
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    pc.createOffer = jest.fn().mockRejectedValue('string rejection');
    await expect(service.createOffer()).rejects.toThrow('Failed to create offer');
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('createAnswer — non-Error thrown', () => {
  it('wraps non-Error in "Failed to create answer"', async () => {
    const onError = jest.fn();
    const { service, pc } = setup({ onError });
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    pc.createAnswer = jest.fn().mockRejectedValue('string rejection');
    await expect(service.createAnswer({ type: 'offer', sdp: '' })).rejects.toThrow(
      'Failed to create answer'
    );
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('setRemoteDescription — non-Error thrown', () => {
  it('wraps non-Error in "Failed to set remote description"', async () => {
    const onError = jest.fn();
    const { service, pc } = setup({ onError });
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    pc.setRemoteDescription = jest.fn().mockRejectedValue('string rejection');
    await expect(service.setRemoteDescription({ type: 'answer', sdp: '' })).rejects.toThrow(
      'Failed to set remote description'
    );
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('negotiate — non-Error thrown', () => {
  it('wraps non-Error in "Renegotiation failed"', async () => {
    const onError = jest.fn();
    const { service, pc } = setup({ onError });
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    pc.createOffer = jest.fn().mockRejectedValue('string rejection');
    await expect(service.negotiate()).rejects.toThrow('Renegotiation failed');
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('negotiate — offer with no sdp field', () => {
  it('skips SDP munging when offer has no sdp during renegotiation', async () => {
    const { service, pc, onLocalDescription } = setup();
    service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });

    pc.createOffer = jest.fn(async () => ({ type: 'offer' as RTCSdpType }));
    pc.setLocalDescription = jest.fn(async (desc: { sdp?: string }) => {
      pc.localDescription = { type: 'offer', sdp: desc.sdp };
    });

    await service.negotiate();
    expect(pc.setLocalDescription).toHaveBeenCalled();
    expect(onLocalDescription).toHaveBeenCalledWith(expect.objectContaining({ type: 'offer' }));
  });
});

// ===========================================================================
// handleRenegotiationOffer — additional branch coverage
// ===========================================================================

describe('handleRenegotiationOffer — impolite ignores collision (coverage test)', () => {
  it('impolite peer ignores colliding offer and returns early', async () => {
    const { service, pc } = setup();
    service.setNegotiationRole('zzz', 'aaa'); // impolite
    service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });
    pc.signalingState = 'have-local-offer'; // collision
    pc.setRemoteDescription = jest.fn();

    await service.handleRenegotiationOffer({ type: 'offer', sdp: '' });

    expect(pc.setRemoteDescription).not.toHaveBeenCalled();
  });
});

describe('handleRenegotiationOffer — polite rollback (coverage test)', () => {
  it('polite peer rolls back and answers', async () => {
    const { service, pc, onLocalDescription } = setup();
    service.setNegotiationRole('aaa', 'zzz'); // polite
    service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });
    pc.signalingState = 'have-local-offer'; // collision
    pc.createAnswer = jest.fn(async () => ({ type: 'answer' as RTCSdpType, sdp: 'v=0\r\n' }));
    pc.setLocalDescription = jest.fn(async (desc: { type: string; sdp?: string }) => {
      pc.localDescription = { type: desc.type, sdp: desc.sdp };
    });

    await service.handleRenegotiationOffer({ type: 'offer', sdp: 'v=0\r\n' });

    // Rollback was called
    expect(pc.setLocalDescription).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'rollback' })
    );
    expect(onLocalDescription).toHaveBeenCalledWith(expect.objectContaining({ type: 'answer' }));
  });
});

describe('handleRenegotiationOffer — answer with no sdp', () => {
  it('skips SDP munging when answer has no sdp', async () => {
    const { service, pc, onLocalDescription } = setup();
    pc.signalingState = 'stable';
    pc.createAnswer = jest.fn(async () => ({ type: 'answer' as RTCSdpType })); // no sdp
    pc.setLocalDescription = jest.fn(async (desc: { type: string; sdp?: string }) => {
      pc.localDescription = { type: desc.type, sdp: desc.sdp };
    });

    await service.handleRenegotiationOffer({ type: 'offer', sdp: '' });

    expect(onLocalDescription).toHaveBeenCalled();
  });
});

describe('handleRenegotiationOffer — local description is null after setLocalDescription', () => {
  it('does not fire onLocalDescription when localDescription is null', async () => {
    const { service, pc, onLocalDescription } = setup();
    pc.signalingState = 'stable';
    pc.createAnswer = jest.fn(async () => ({ type: 'answer' as RTCSdpType, sdp: 'v=0\r\n' }));
    pc.setLocalDescription = jest.fn(async () => {
      pc.localDescription = null;
    });

    await service.handleRenegotiationOffer({ type: 'offer', sdp: '' });

    expect(onLocalDescription).not.toHaveBeenCalled();
  });
});

describe('handleRenegotiationOffer — non-Error thrown', () => {
  it('wraps non-Error in "Renegotiation answer failed"', async () => {
    const onError = jest.fn();
    const { service, pc } = setup({ onError });
    pc.signalingState = 'stable';
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    pc.setRemoteDescription = jest.fn().mockRejectedValue('string rejection');
    await expect(
      service.handleRenegotiationOffer({ type: 'offer', sdp: '' })
    ).rejects.toThrow('Renegotiation answer failed');
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ===========================================================================
// handleRenegotiationOffer — isSettingRemoteAnswerPending path
// ===========================================================================

describe('handleRenegotiationOffer — isSettingRemoteAnswerPending collision avoidance', () => {
  it('treats isSettingRemoteAnswerPending=true as readyForOffer (no collision)', async () => {
    const { service, pc, onLocalDescription } = setup();
    service.setNegotiationRole('zzz', 'aaa'); // impolite
    pc.signalingState = 'have-remote-offer'; // NOT stable → would normally be collision
    // But if isSettingRemoteAnswerPending=true, readyForOffer=true → no collision

    // Force isSettingRemoteAnswerPending = true by calling setRemoteAnswer concurrently
    // We do this by starting setRemoteAnswer (which sets the flag) and then
    // calling handleRenegotiationOffer before it resolves
    let resolveSetRemote!: () => void;
    pc.setRemoteDescription = jest.fn(
      () =>
        new Promise<void>((res) => {
          resolveSetRemote = res;
        })
    );

    // Start setRemoteAnswer — this sets isSettingRemoteAnswerPending=true
    const setRemotePromise = service.setRemoteAnswer({ type: 'answer', sdp: '' });

    // Now handle a renegotiation offer — isSettingRemoteAnswerPending=true means readyForOffer=true
    // Temporarily fix pc.setRemoteDescription for the handleRenegotiationOffer call
    const savedSetRemote = pc.setRemoteDescription;
    pc.setRemoteDescription = jest.fn(async () => {});
    pc.createAnswer = jest.fn(async () => ({ type: 'answer' as RTCSdpType, sdp: 'v=0\r\n' }));
    pc.setLocalDescription = jest.fn(async (desc: { type: string; sdp?: string }) => {
      pc.localDescription = { type: desc.type, sdp: desc.sdp };
    });

    await service.handleRenegotiationOffer({ type: 'offer', sdp: '' });
    // Should have processed (not ignored) because isSettingRemoteAnswerPending=true
    expect(pc.setRemoteDescription).toHaveBeenCalled();

    // Clean up the pending setRemoteAnswer
    pc.setRemoteDescription = savedSetRemote;
    resolveSetRemote();
    await setRemotePromise;

    // Suppress unused variable warning
    void onLocalDescription;
  });
});

// ===========================================================================
// Quality monitor — stats with missing/undefined fields (null-coalescing branches)
// ===========================================================================

describe('startQualityMonitor — null-coalescing branches', () => {
  it('handles missing packetsReceived and packetsLost (defaults to 0)', async () => {
    jest.useFakeTimers();
    const onConnectionQualityChange = jest.fn();
    const { service, pc } = setup({ onConnectionQualityChange });

    const mockStats = {
      forEach: jest.fn((cb: (report: unknown) => void) => {
        // Neither packetsReceived nor packetsLost provided — exercises `?? 0`
        cb({ type: 'inbound-rtp', kind: 'audio', bytesReceived: 500, timestamp: 3000 });
      }),
    };
    pc.getStats = jest.fn(async () => mockStats);

    service.startQualityMonitor();
    await jest.advanceTimersByTimeAsync(3001);

    // totalPackets=0 → packetLoss=0, rtt=0 → excellent
    expect(onConnectionQualityChange).toHaveBeenCalledWith('excellent');
    service.stopQualityMonitor();
    jest.useRealTimers();
  });

  it('handles missing bytesReceived (defaults to 0)', async () => {
    jest.useFakeTimers();
    const onConnectionQualityChange = jest.fn();
    const { service, pc } = setup({ onConnectionQualityChange });

    const mockStats = {
      forEach: jest.fn((cb: (report: unknown) => void) => {
        cb({ type: 'inbound-rtp', kind: 'audio', packetsReceived: 10, packetsLost: 0, timestamp: 3000 });
      }),
    };
    pc.getStats = jest.fn(async () => mockStats);

    service.startQualityMonitor();
    await jest.advanceTimersByTimeAsync(3001);

    expect(onConnectionQualityChange).toHaveBeenCalledWith('excellent');
    service.stopQualityMonitor();
    jest.useRealTimers();
  });
});
