/**
 * Unit tests for WebRTCService — the perfect-negotiation / renegotiation core.
 *
 * Covers the behaviours added for the unified A/V call path:
 *  - real ICE restart that EMITS the offer (the old impl dropped it)
 *  - perfect-negotiation glare handling (polite rolls back, impolite ignores)
 *  - pre-allocated transceivers (audio sendrecv + reserved video m-line)
 *  - mid-call audio→video upgrade (replaceTrack + direction flip + renegotiate)
 *  - adaptive bitrate via setParameters + audio-only survival mode
 *
 * A lightweight fake RTCPeerConnection lets us assert the exact API calls
 * without a real browser.
 */

jest.mock('@/utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { WebRTCService, type WebRTCServiceConfig } from '@/services/webrtc-service';

class FakeSender {
  track: unknown;
  private _params: { encodings?: Array<Record<string, unknown>>; degradationPreference?: string } = {
    encodings: [{}],
  };
  replaceTrack = jest.fn(async (t: unknown) => { this.track = t; });
  getParameters = jest.fn(() => this._params);
  setParameters = jest.fn(async (p: typeof this._params) => { this._params = p; });
  constructor(track: unknown) { this.track = track ?? null; }
}

class FakeTransceiver {
  sender: FakeSender;
  direction: string;
  constructor(track: unknown, direction: string) {
    this.sender = new FakeSender(track);
    this.direction = direction;
  }
}

class FakeRTCPeerConnection {
  onicecandidate: ((e: unknown) => void) | null = null;
  ontrack: ((e: unknown) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  onnegotiationneeded: (() => void) | null = null;
  signalingState = 'stable';
  connectionState = 'new';
  iceConnectionState = 'new';
  localDescription: { type: string; sdp?: string } | null = null;
  config: unknown;
  _transceivers: FakeTransceiver[] = [];
  _receivers: Array<{ track: { kind: string } }> = [];

  createOffer = jest.fn(async (_opts?: unknown) => ({ type: 'offer', sdp: 'v=0\r\na=fmtp:111 minptime=10\r\n' }));
  createAnswer = jest.fn(async () => ({ type: 'answer', sdp: 'v=0\r\na=fmtp:111 minptime=10\r\n' }));
  setLocalDescription = jest.fn(async (desc: { type: string; sdp?: string }) => {
    this.localDescription = { type: desc.type, sdp: desc.sdp };
  });
  setRemoteDescription = jest.fn(async () => {});
  addIceCandidate = jest.fn(async () => {});
  addTrack = jest.fn();
  addTransceiver = jest.fn((trackOrKind: unknown, init?: { direction?: string }) => {
    const track = typeof trackOrKind === 'string' ? null : trackOrKind;
    const tx = new FakeTransceiver(track, init?.direction ?? 'sendrecv');
    this._transceivers.push(tx);
    return tx;
  });
  getSenders = jest.fn(() => this._transceivers.map((t) => t.sender));
  getReceivers = jest.fn(() => this._receivers);
  close = jest.fn();
  constructor(config: unknown) { this.config = config; }
}

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

beforeAll(() => {
  (global as unknown as { RTCPeerConnection: unknown }).RTCPeerConnection = FakeRTCPeerConnection;
  (global as unknown as { RTCSessionDescription: unknown }).RTCSessionDescription =
    jest.fn().mockImplementation((init: unknown) => init);
  (global as unknown as { RTCIceCandidate: unknown }).RTCIceCandidate =
    jest.fn().mockImplementation((init: unknown) => init);
});

const setup = (overrides: Partial<WebRTCServiceConfig> = {}) => {
  const onLocalDescription = jest.fn();
  const service = new WebRTCService({ onLocalDescription, ...overrides });
  const pc = service.createPeerConnection('peer-1') as unknown as FakeRTCPeerConnection;
  return { service, pc, onLocalDescription };
};

describe('WebRTCService — transceiver pre-allocation', () => {
  it('reserves a recvonly video m-line for an audio-only call', () => {
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });

    // Audio is attached as a sendrecv transceiver carrying the live track.
    const audioCall = pc.addTransceiver.mock.calls.find(
      (c) => (c[0] as { kind?: string })?.kind === 'audio'
    );
    expect(audioCall?.[1]).toEqual(expect.objectContaining({ direction: 'sendrecv' }));
    // Video m-line is reserved recvonly (no camera) so it can be upgraded later.
    expect(pc.addTransceiver).toHaveBeenCalledWith('video', { direction: 'recvonly' });
  });

  it('sends video immediately when the call starts as video', () => {
    const { service, pc } = setup();
    const stream = makeStream({ audio: true, video: true });
    service.addLocalMedia(stream, { sendVideo: true });

    const videoCall = pc.addTransceiver.mock.calls.find(
      (c) => typeof c[0] !== 'string' && (c[0] as { kind: string }).kind === 'video'
    );
    expect(videoCall?.[1]).toEqual(expect.objectContaining({ direction: 'sendrecv' }));
  });
});

describe('WebRTCService — ICE restart', () => {
  it('emits the restart offer via onLocalDescription (not dropped)', async () => {
    const { service, pc, onLocalDescription } = setup();
    service.addLocalMedia(makeStream({ audio: true, video: true }), { sendVideo: true });
    await service.createOffer(); // initial offer, arms auto-negotiation

    onLocalDescription.mockClear();
    await service.restartIce();

    expect(pc.createOffer).toHaveBeenCalledWith({ iceRestart: true });
    expect(onLocalDescription).toHaveBeenCalledWith(expect.objectContaining({ type: 'offer' }));
  });
});

describe('WebRTCService — perfect negotiation (glare)', () => {
  it('impolite peer IGNORES a colliding offer', async () => {
    const { service, pc } = setup();
    service.setNegotiationRole('zzz-local', 'aaa-remote'); // local > remote → impolite
    service.addLocalMedia(makeStream({ audio: true, video: true }), { sendVideo: true });
    pc.signalingState = 'have-local-offer'; // collision: we have an outstanding offer

    await service.handleRenegotiationOffer({ type: 'offer', sdp: 'remote-offer' });

    expect(pc.setRemoteDescription).not.toHaveBeenCalled();
  });

  it('polite peer ROLLS BACK and answers a colliding offer', async () => {
    const { service, pc, onLocalDescription } = setup();
    service.setNegotiationRole('aaa-local', 'zzz-remote'); // local < remote → polite
    service.addLocalMedia(makeStream({ audio: true, video: true }), { sendVideo: true });
    pc.signalingState = 'have-local-offer'; // collision

    await service.handleRenegotiationOffer({ type: 'offer', sdp: 'remote-offer' });

    expect(pc.setLocalDescription).toHaveBeenCalledWith(expect.objectContaining({ type: 'rollback' }));
    expect(pc.setRemoteDescription).toHaveBeenCalled();
    expect(onLocalDescription).toHaveBeenCalledWith(expect.objectContaining({ type: 'answer' }));
  });

  it('accepts a non-colliding offer normally (stable state)', async () => {
    const { service, pc, onLocalDescription } = setup();
    service.setNegotiationRole('zzz-local', 'aaa-remote'); // impolite, but no collision
    service.addLocalMedia(makeStream({ audio: true, video: true }), { sendVideo: true });
    pc.signalingState = 'stable';

    await service.handleRenegotiationOffer({ type: 'offer', sdp: 'remote-offer' });

    expect(pc.setRemoteDescription).toHaveBeenCalled();
    expect(onLocalDescription).toHaveBeenCalledWith(expect.objectContaining({ type: 'answer' }));
  });
});

describe('WebRTCService — mid-call A/V switch', () => {
  it('upgrades audio→video: replaceTrack + direction sendrecv + renegotiate', async () => {
    const { service, pc, onLocalDescription } = setup();
    service.addLocalMedia(makeStream({ audio: true }), { sendVideo: false });
    await service.createOffer(); // arm auto-negotiation

    const videoTx = pc._transceivers.find((t) => t.direction === 'recvonly')!;
    onLocalDescription.mockClear();

    const camTrack = makeTrack('video');
    await service.enableVideoSend(camTrack as unknown as MediaStreamTrack);

    expect(videoTx.sender.replaceTrack).toHaveBeenCalledWith(camTrack);
    expect(videoTx.direction).toBe('sendrecv');
    expect(onLocalDescription).toHaveBeenCalledWith(expect.objectContaining({ type: 'offer' }));
  });

  it('downgrades video→audio: replaceTrack(null) + direction recvonly', async () => {
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true, video: true }), { sendVideo: true });
    await service.createOffer();

    const videoTx = pc._transceivers.find((t) => (t.sender.track as { kind?: string })?.kind === 'video')!;
    await service.disableVideoSend();

    expect(videoTx.sender.replaceTrack).toHaveBeenCalledWith(null);
    expect(videoTx.direction).toBe('recvonly');
  });
});

describe('WebRTCService — adaptive bitrate', () => {
  it('applies the encoding ladder + maintain-framerate for a quality tier', async () => {
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true, video: true }), { sendVideo: true });

    await service.applyVideoEncoding('low');

    const videoSender = pc._transceivers.find((t) => (t.sender.track as { kind?: string })?.kind === 'video')!.sender;
    expect(videoSender.setParameters).toHaveBeenCalled();
    const params = videoSender.setParameters.mock.calls[0][0];
    expect(params.encodings![0]).toEqual(
      expect.objectContaining({ maxBitrate: 250_000, maxFramerate: 15, scaleResolutionDownBy: 4 })
    );
    expect(params.degradationPreference).toBe('maintain-framerate');
  });

  it("'audio-only' tier stops outbound video as a survival mode", async () => {
    const { service, pc } = setup();
    service.addLocalMedia(makeStream({ audio: true, video: true }), { sendVideo: true });
    await service.createOffer();

    const videoTx = pc._transceivers.find((t) => (t.sender.track as { kind?: string })?.kind === 'video')!;
    await service.applyVideoEncoding('audio-only');

    expect(videoTx.sender.replaceTrack).toHaveBeenCalledWith(null);
    expect(videoTx.direction).toBe('recvonly');
  });
});
