import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ---- Mocks for the container's heavy dependencies -------------------------

const webrtc = {
  initializeLocalStream: jest.fn().mockResolvedValue(undefined),
  createOffer: jest.fn().mockResolvedValue(undefined),
  connectionState: 'connected',
  enableVideo: jest.fn().mockResolvedValue(undefined),
  disableVideo: jest.fn().mockResolvedValue(undefined),
  switchCamera: jest.fn().mockResolvedValue(undefined),
  applyQualityTier: jest.fn().mockResolvedValue(undefined),
  removeParticipant: jest.fn(),
};

const storeState: Record<string, unknown> = {
  localStream: null,
  remoteStreams: new Map(),
  currentCall: {
    id: 'call1',
    startedAt: new Date().toISOString(),
    initiatorId: 'other',
    participants: [
      { userId: 'u1', username: 'Me', leftAt: null, isAudioEnabled: true, isVideoEnabled: true },
    ],
  },
  controls: { audioEnabled: true, videoEnabled: true },
  toggleAudio: jest.fn(),
  setControls: jest.fn(),
  reset: jest.fn(),
  isInCall: true,
  peerConnections: new Map(),
  setLocalStream: jest.fn(),
  removeRemoteStream: jest.fn(),
  removePeerConnection: jest.fn(),
  offerCallRetry: jest.fn(),
};

const useAdaptiveDegradationMock = jest.fn(() => ({ videoSuspended: false }));

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (k: string) => k, isLoading: false }),
}));
// VideoStream carries heavy WebRTC/ref machinery — stub it for the fullscreen-region test.
// `data-muted` mirrors the real `muted` prop so tests can assert speaker-toggle wiring
// without reaching into an actual <video> element's audio output. The testid is keyed
// off `isLocal` — LocalVideoTile renders this same component (always muted, self-view)
// and would otherwise collide with the remote instance under the same fixed testid.
jest.mock('@/components/video-calls/VideoStream', () => ({
  VideoStream: (props: { muted?: boolean; isLocal?: boolean }) => (
    <div
      data-testid={props.isLocal ? 'local-video-stream' : 'remote-video-stream'}
      data-muted={String(props.muted)}
    />
  ),
}));
jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'u1', username: 'Me' } }),
}));
jest.mock('@/hooks/use-webrtc-p2p', () => ({ useWebRTCP2P: () => webrtc }));
const useAudioEffectsMock = jest.fn(() => ({
  outputStream: null as unknown,
  effectsState: {} as Record<string, { enabled: boolean }>,
  toggleEffect: jest.fn(),
  updateEffectParams: jest.fn(),
  loadPreset: jest.fn(),
  currentPreset: null,
  availableBackSounds: [],
  availablePresets: [],
}));
jest.mock('@/hooks/use-audio-effects', () => ({
  useAudioEffects: (...args: unknown[]) => useAudioEffectsMock(...(args as [])),
}));
jest.mock('@/hooks/use-call-quality', () => ({
  useCallQuality: () => ({ qualityStats: null }),
}));
jest.mock('@/hooks/use-remote-call-alerts', () => ({
  useRemoteCallAlerts: () => ({ remoteQualityDegraded: false, remoteScreenCapturing: false }),
}));
jest.mock('@/hooks/use-call-captions', () => ({
  useCallCaptions: () => ({ captions: [] }),
}));
jest.mock('@/hooks/use-call-analytics-reporter', () => ({
  useCallAnalyticsReporter: () => {},
}));
jest.mock('@/hooks/use-peer-connections', () => ({
  usePeerConnections: () => new Map(),
}));
jest.mock('@/hooks/use-adaptive-degradation', () => ({
  useAdaptiveDegradation: (...args: unknown[]) => useAdaptiveDegradationMock(...(args as [])),
}));
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
  },
}));
jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    getSocket: jest.fn(() => null),
    onStatusChange: jest.fn(() => () => {}),
  },
}));
jest.mock('@/stores/call-store', () => {
  const useCallStore = jest.fn(() => storeState) as unknown as {
    (): typeof storeState;
    getState: () => typeof storeState;
    subscribe: () => () => void;
  };
  useCallStore.getState = () => storeState;
  useCallStore.subscribe = () => () => {};
  return { useCallStore };
});

import { VideoCallInterface } from '@/components/video-calls/VideoCallInterface';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { toast } from 'sonner';

// Capture keyed by event name, never by registration order: the component may
// legitimately register other call listeners before this one.
const participantLeftHandler = (fakeSocket: { on: jest.Mock }) =>
  fakeSocket.on.mock.calls.find(([event]) => event === 'call:participant-left')?.[1] as (
    event: unknown,
  ) => void;

describe('VideoCallInterface (container)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    storeState.controls = { audioEnabled: true, videoEnabled: true };
    storeState.currentCall = {
      id: 'call1',
      startedAt: new Date().toISOString(),
      initiatorId: 'other',
      participants: [
        { userId: 'u1', username: 'Me', leftAt: null, isAudioEnabled: true, isVideoEnabled: true },
      ],
    };
    useAdaptiveDegradationMock.mockReturnValue({ videoSuspended: false });
    useAudioEffectsMock.mockReturnValue({
      outputStream: null,
      effectsState: {},
      toggleEffect: jest.fn(),
      updateEffectParams: jest.fn(),
      loadPreset: jest.fn(),
      currentPreset: null,
      availableBackSounds: [],
      availablePresets: [],
    });
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(null);
  });

  it('renders the core call chrome', () => {
    render(<VideoCallInterface callId="call1" />);
    expect(screen.getByRole('toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('local-video-tile')).toBeInTheDocument();
    expect(screen.getByTestId('call-duration')).toBeInTheDocument();
  });

  // Vague 117: CallStatusIndicator used to render its own connection-quality
  // badge + participant-name label at the exact same `absolute top-4 right-4`
  // position as CallQualityOverlay's ConnectionQualityBadge — two overlapping
  // clusters stacked on screen the moment the connection degraded or stats
  // were opened. Its participant name ("Unknown" fallback, hardcoded — never
  // even run through t()) duplicated the label VideoStream already renders on
  // the video tile itself. Removed outright; this guards the overlap from
  // returning.
  it('does not render the removed CallStatusIndicator (duplicate quality cluster)', () => {
    render(<VideoCallInterface callId="call1" />);
    expect(screen.queryByText('Unknown')).not.toBeInTheDocument();
  });

  // --- Vague 110 (2026-08-12): the visible clock must anchor on answeredAt,
  // never startedAt (ring delay bleeding into "call duration") -------------

  it('shows 0:00 while a call has been ringing but not yet answered (answeredAt unset)', () => {
    storeState.currentCall = {
      id: 'call1',
      startedAt: new Date(Date.now() - 12000).toISOString(), // rang 12s ago
      answeredAt: undefined,
      initiatorId: 'other',
      participants: [
        { userId: 'u1', username: 'Me', leftAt: null, isAudioEnabled: true, isVideoEnabled: true },
      ],
    };
    render(<VideoCallInterface callId="call1" />);
    expect(screen.getByTestId('call-duration')).toHaveTextContent('0:00');
  });

  it('ticks from answeredAt, not from the earlier startedAt ring-start', () => {
    storeState.currentCall = {
      id: 'call1',
      startedAt: new Date(Date.now() - 17000).toISOString(), // rang 17s ago
      answeredAt: new Date(Date.now() - 5000).toISOString(), // answered 5s ago
      initiatorId: 'other',
      participants: [
        { userId: 'u1', username: 'Me', leftAt: null, isAudioEnabled: true, isVideoEnabled: true },
      ],
    };
    render(<VideoCallInterface callId="call1" />);
    expect(screen.getByTestId('call-duration')).toHaveTextContent('0:05');
  });

  // --- watchdog de connexion : un appel jamais connecté est borné à 45 s ---
  // (parité iOS connectingFailSeconds / Android CallConnectingWatchdog — un
  // échec ICE ne produisait qu'un toast, l'UI d'appel restait à vie)

  it('termine l’appel jamais connecté à l’expiration du watchdog', () => {
    jest.useFakeTimers();
    const fakeSocket = { on: jest.fn(), off: jest.fn(), emit: jest.fn() };
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(fakeSocket);
    webrtc.connectionState = 'connecting';
    try {
      render(<VideoCallInterface callId="call1" />);

      act(() => {
        jest.advanceTimersByTime(45_000);
      });

      expect(fakeSocket.emit).toHaveBeenCalledWith('call:leave', { callId: 'call1' });
    } finally {
      webrtc.connectionState = 'connected';
      jest.useRealTimers();
    }
  });

  it('à l’expiration du watchdog, offre un « Réessayer » pour la conversation', () => {
    jest.useFakeTimers();
    const fakeSocket = { on: jest.fn(), off: jest.fn(), emit: jest.fn() };
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(fakeSocket);
    (storeState.offerCallRetry as jest.Mock).mockClear();
    storeState.currentCall = { id: 'call1', conversationId: 'conv-1', participants: [] };
    storeState.controls = { audioEnabled: true, videoEnabled: false };
    webrtc.connectionState = 'connecting';
    try {
      render(<VideoCallInterface callId="call1" />);

      act(() => {
        jest.advanceTimersByTime(45_000);
      });

      expect(storeState.offerCallRetry).toHaveBeenCalledWith({ conversationId: 'conv-1', type: 'audio' });
    } finally {
      webrtc.connectionState = 'connected';
      jest.useRealTimers();
    }
  });

  it('le watchdog est inerte pour un appel déjà connecté', () => {
    jest.useFakeTimers();
    const fakeSocket = { on: jest.fn(), off: jest.fn(), emit: jest.fn() };
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(fakeSocket);
    try {
      render(<VideoCallInterface callId="call1" />);

      act(() => {
        jest.advanceTimersByTime(45_000);
      });

      expect(fakeSocket.emit).not.toHaveBeenCalledWith('call:leave', expect.anything());
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows NO survival affordances when video is healthy', () => {
    render(<VideoCallInterface callId="call1" />);
    expect(screen.queryByTestId('survival-pill')).not.toBeInTheDocument();
    expect(screen.queryByTestId('local-video-suspended')).not.toBeInTheDocument();
    expect(screen.queryByTestId('video-autopaused-dot')).not.toBeInTheDocument();
  });

  it('surfaces all survival affordances when the controller suspends video', () => {
    useAdaptiveDegradationMock.mockReturnValue({ videoSuspended: true });
    render(<VideoCallInterface callId="call1" />);
    expect(screen.getByTestId('survival-pill')).toBeInTheDocument();
    expect(screen.getByTestId('local-video-suspended')).toBeInTheDocument();
    expect(screen.getByTestId('video-autopaused-dot')).toBeInTheDocument();
  });

  it('wires the camera button to the WebRTC layer (disable when currently on)', () => {
    render(<VideoCallInterface callId="call1" />);
    fireEvent.click(screen.getByTestId('toggle-video'));
    expect(webrtc.disableVideo).toHaveBeenCalledTimes(1);
  });

  it('exposes the main remote video as a keyboard-activable fullscreen button', () => {
    storeState.remoteStreams = new Map([['peer1', {} as MediaStream]]);
    try {
      render(<VideoCallInterface callId="call1" />);
      const button = screen.getByRole('button', { name: 'stream.fullscreen' });
      expect(button).toHaveAttribute('tabIndex', '0');
      // Enter/Space must not throw and must be intercepted (preventDefault) by the handler.
      fireEvent.keyDown(button, { key: 'Enter' });
      fireEvent.keyDown(button, { key: ' ' });
      expect(button).toBeInTheDocument();
    } finally {
      storeState.remoteStreams = new Map();
    }
  });

  // Regression guard — the speaker button used to flip a `useState` local to
  // `CallControls` that nothing downstream ever read: clicking it changed the
  // icon but never muted/unmuted a single <video> element, on any surface
  // (fullscreen main participant or draggable overlay tiles).
  describe('speaker toggle actually mutes/unmutes remote audio', () => {
    beforeEach(() => {
      storeState.remoteStreams = new Map([['peer1', {} as MediaStream]]);
    });
    afterEach(() => {
      storeState.remoteStreams = new Map();
    });

    it('plays remote audio (unmuted) by default', () => {
      render(<VideoCallInterface callId="call1" />);
      expect(screen.getByTestId('remote-video-stream')).toHaveAttribute('data-muted', 'false');
    });

    it('mutes the remote video element when the speaker is toggled off', () => {
      render(<VideoCallInterface callId="call1" />);
      fireEvent.click(screen.getByRole('button', { name: 'controls.speakerOff' }));
      expect(screen.getByTestId('remote-video-stream')).toHaveAttribute('data-muted', 'true');
    });

    it('unmutes again on a second toggle', () => {
      render(<VideoCallInterface callId="call1" />);
      const button = () => screen.getByRole('button', { name: /controls\.speaker(On|Off)/ });
      fireEvent.click(button());
      fireEvent.click(button());
      expect(screen.getByTestId('remote-video-stream')).toHaveAttribute('data-muted', 'false');
    });
  });

  // Sibling-drift fix: `offersCreatedFor` used to be populated on offer
  // creation but never cleared when the peer left — a participant who left
  // and later rejoined mid-call (network blip, tab reload) would silently
  // never get a fresh offer, since the guard thought it had already offered
  // them. It must be released once the peer's connection is actually torn
  // down (the same 2s cleanup step that removes their stream/peer connection).
  describe('offersCreatedFor guard release on participant-left', () => {
    it('clears the offer-created guard so a rejoined participant gets a fresh offer', () => {
      jest.useFakeTimers();
      try {
        const fakeSocket = { on: jest.fn(), off: jest.fn() };
        (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(fakeSocket);

        // We are the initiator so the offer-creation effect is active.
        storeState.currentCall = {
          id: 'call1',
          startedAt: new Date().toISOString(),
          initiatorId: 'u1',
          participants: [
            { userId: 'peer1', leftAt: null, isAudioEnabled: true, isVideoEnabled: true },
          ],
        };

        const { rerender } = render(<VideoCallInterface callId="call1" />);
        expect(webrtc.createOffer).toHaveBeenCalledTimes(1);
        expect(webrtc.createOffer).toHaveBeenCalledWith('peer1');

        // The peer leaves: participant-left fires, then the 2s cleanup runs.
        const handleParticipantLeft = participantLeftHandler(fakeSocket);
        handleParticipantLeft({ callId: 'call1', userId: 'peer1' });
        jest.advanceTimersByTime(2000);
        expect(storeState.removeRemoteStream).toHaveBeenCalledWith('peer1');
        expect(webrtc.removeParticipant).toHaveBeenCalledWith('peer1');

        // Force the offer-creation effect to re-evaluate by round-tripping
        // `participants.length` (its dependency) through 0 and back to 1 —
        // simulating the peer briefly leaving the roster then rejoining.
        storeState.currentCall = {
          id: 'call1',
          startedAt: new Date().toISOString(),
          initiatorId: 'u1',
          participants: [],
        };
        rerender(<VideoCallInterface callId="call1" />);
        storeState.currentCall = {
          id: 'call1',
          startedAt: new Date().toISOString(),
          initiatorId: 'u1',
          participants: [
            { userId: 'peer1', leftAt: null, isAudioEnabled: true, isVideoEnabled: true },
          ],
        };
        rerender(<VideoCallInterface callId="call1" />);

        expect(webrtc.createOffer).toHaveBeenCalledTimes(2);
        expect(webrtc.createOffer).toHaveBeenNthCalledWith(2, 'peer1');
      } finally {
        jest.useRealTimers();
        storeState.remoteStreams = new Map();
      }
    });
  });

  // P0 rejoin-race fix: the 2s delayed cleanup used to tear down whatever
  // RTCPeerConnection was registered under the participant's id at the time it
  // fired, with no check that it was still the *same* connection scheduled for
  // removal. A participant who left and rejoined within that 2s window (network
  // blip, tab reload) gets a brand-new RTCPeerConnection registered under the
  // same id — the stale timeout must not close it out from under the call.
  describe('rejoin race — delayed cleanup must not tear down a fresh connection', () => {
    it('skips removeRemoteStream/removePeerConnection when the participant rejoined before the 2s cleanup fires', () => {
      jest.useFakeTimers();
      try {
        const fakeSocket = { on: jest.fn(), off: jest.fn() };
        (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(fakeSocket);
        storeState.peerConnections = new Map();

        render(<VideoCallInterface callId="call1" />);

        const handleParticipantLeft = participantLeftHandler(fakeSocket);
        handleParticipantLeft({ callId: 'call1', userId: 'peer1' });

        // Rejoin before the grace window elapses: a fresh RTCPeerConnection
        // replaces the (absent) old one under the same participant id.
        const freshConnection = {} as RTCPeerConnection;
        storeState.peerConnections = new Map([['peer1', freshConnection]]);

        jest.advanceTimersByTime(2000);

        expect(storeState.removeRemoteStream).not.toHaveBeenCalledWith('peer1');
        expect(webrtc.removeParticipant).not.toHaveBeenCalledWith('peer1');
        expect((storeState.peerConnections as Map<string, RTCPeerConnection>).get('peer1')).toBe(freshConnection);
      } finally {
        jest.useRealTimers();
        storeState.peerConnections = new Map();
      }
    });

    it('still tears down the connection when the participant does not rejoin', () => {
      jest.useFakeTimers();
      try {
        const fakeSocket = { on: jest.fn(), off: jest.fn() };
        (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(fakeSocket);
        const originalConnection = {} as RTCPeerConnection;
        storeState.peerConnections = new Map([['peer1', originalConnection]]);

        render(<VideoCallInterface callId="call1" />);

        const handleParticipantLeft = participantLeftHandler(fakeSocket);
        handleParticipantLeft({ callId: 'call1', userId: 'peer1' });

        jest.advanceTimersByTime(2000);

        expect(storeState.removeRemoteStream).toHaveBeenCalledWith('peer1');
        expect(webrtc.removeParticipant).toHaveBeenCalledWith('peer1');
      } finally {
        jest.useRealTimers();
        storeState.peerConnections = new Map();
      }
    });
  });

  // Regression: the 2s delayed cleanup's setTimeout id was never stored, so
  // unmounting (or the effect re-running for a new callId) mid-window left it
  // armed. It would still fire against whatever call is current by then —
  // tearing down a brand-new call's participant the user just joined.
  describe('unmount before the 2s cleanup fires', () => {
    it('does not run the delayed cleanup against the (now-stale) global store after unmount', () => {
      jest.useFakeTimers();
      try {
        const fakeSocket = { on: jest.fn(), off: jest.fn() };
        (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(fakeSocket);
        storeState.peerConnections = new Map([['peer1', {} as RTCPeerConnection]]);

        const { unmount } = render(<VideoCallInterface callId="call1" />);

        const handleParticipantLeft = participantLeftHandler(fakeSocket);
        handleParticipantLeft({ callId: 'call1', userId: 'peer1' });

        unmount();
        jest.advanceTimersByTime(2000);

        expect(storeState.removeRemoteStream).not.toHaveBeenCalled();
        expect(webrtc.removeParticipant).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
        storeState.peerConnections = new Map();
      }
    });
  });

  // Reconnect bug: `removeParticipant()` (in use-webrtc-p2p.ts) tears down the
  // WebRTCService/remoteDescriptionSetRef/iceCandidateQueueRef/offerInFlightRef
  // entries a rejoin needs cleared — without it, a same-session leave→rejoin
  // gets its fresh initial offer misrouted as a renegotiation against a
  // WebRTCService the leave never closed.
  describe('participant-left cleanup releases WebRTC signaling state, not just the store', () => {
    it('calls removeParticipant (not just the store peer-connection map) when a participant leaves for good', () => {
      jest.useFakeTimers();
      try {
        const fakeSocket = { on: jest.fn(), off: jest.fn() };
        (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(fakeSocket);
        storeState.peerConnections = new Map([['peer1', {} as RTCPeerConnection]]);

        render(<VideoCallInterface callId="call1" />);

        const handleParticipantLeft = participantLeftHandler(fakeSocket);
        handleParticipantLeft({ callId: 'call1', userId: 'peer1' });
        jest.advanceTimersByTime(2000);

        expect(webrtc.removeParticipant).toHaveBeenCalledWith('peer1');
      } finally {
        jest.useRealTimers();
        storeState.peerConnections = new Map();
      }
    });

    it('does not call removeParticipant when the participant rejoined before the grace window elapses', () => {
      jest.useFakeTimers();
      try {
        const fakeSocket = { on: jest.fn(), off: jest.fn() };
        (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(fakeSocket);
        storeState.peerConnections = new Map();

        render(<VideoCallInterface callId="call1" />);

        const handleParticipantLeft = participantLeftHandler(fakeSocket);
        handleParticipantLeft({ callId: 'call1', userId: 'peer1' });
        storeState.peerConnections = new Map([['peer1', {} as RTCPeerConnection]]);
        jest.advanceTimersByTime(2000);

        expect(webrtc.removeParticipant).not.toHaveBeenCalledWith('peer1');
      } finally {
        jest.useRealTimers();
        storeState.peerConnections = new Map();
      }
    });
  });

  // replaceTrack() is async and MDN warns the outgoing track must not be
  // stopped until it resolves — the sender may still read from it. The
  // camera-switch path used to stop/detach the old track synchronously,
  // right after firing (not awaiting) replaceTrack, unlike the sibling
  // audio-track-replacement effect a few lines above it in the same file.
  // Vague 95: the actual track acquisition + per-peer replaceTrack/stop
  // sequencing used to live here, assuming `localStream` held exactly one
  // video track and that a single new track object could safely replace
  // every peer connection's sender — an assumption that silently orphans a
  // camera capture the moment a group call has per-peer clones in flight
  // (use-webrtc-p2p.ts's enableVideo() ownership model). That sequencing now
  // lives in WebRTCService.switchVideoSendTrack (unit-tested in
  // webrtc-service.coverage.test.ts) orchestrated by use-webrtc-p2p.ts's
  // switchCamera() (unit-tested in use-webrtc-p2p.test.tsx) — this
  // component's only remaining job is computing the target facing mode and
  // delegating to it.
  describe('handleSwitchCamera — delegates the track swap to switchCamera()', () => {
    beforeEach(() => {
      // The switch-camera button only renders once CallControls' own
      // enumerateDevices probe confirms 2+ cameras — unrelated to
      // switchCamera() itself, which is mocked at the hook level below.
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          enumerateDevices: jest.fn().mockResolvedValue([
            { kind: 'videoinput' },
            { kind: 'videoinput' },
          ]),
        },
      });
    });

    afterEach(() => {
      webrtc.switchCamera.mockResolvedValue(undefined);
      storeState.localStream = null;
      // @ts-expect-error -- test-only cleanup of a property defined above
      delete navigator.mediaDevices;
    });

    const clickSwitchCamera = async () => {
      const button = await screen.findByRole('button', { name: 'controls.switchCamera' });
      fireEvent.click(button);
    };

    it('derives "environment" from a user-facing current track and delegates to switchCamera()', async () => {
      const videoTrack = { kind: 'video', getConstraints: () => ({ facingMode: 'user' }) };
      storeState.localStream = {
        getVideoTracks: () => [videoTrack],
        getAudioTracks: () => [],
      } as unknown as MediaStream;

      render(<VideoCallInterface callId="call1" />);
      await clickSwitchCamera();

      await waitFor(() => expect(webrtc.switchCamera).toHaveBeenCalledWith('environment'));
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith('toasts.cameraSwitched'));
    });

    it('derives "user" from an environment-facing current track', async () => {
      const videoTrack = { kind: 'video', getConstraints: () => ({ facingMode: 'environment' }) };
      storeState.localStream = {
        getVideoTracks: () => [videoTrack],
        getAudioTracks: () => [],
      } as unknown as MediaStream;

      render(<VideoCallInterface callId="call1" />);
      await clickSwitchCamera();

      await waitFor(() => expect(webrtc.switchCamera).toHaveBeenCalledWith('user'));
    });

    it('surfaces cameraSwitchFailed and does not toast success when switchCamera rejects', async () => {
      const videoTrack = { kind: 'video', getConstraints: () => ({ facingMode: 'user' }) };
      storeState.localStream = {
        getVideoTracks: () => [videoTrack],
        getAudioTracks: () => [],
      } as unknown as MediaStream;
      webrtc.switchCamera.mockRejectedValueOnce(new Error('replaceTrack failed'));

      render(<VideoCallInterface callId="call1" />);
      await clickSwitchCamera();

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('toasts.cameraSwitchFailed'));
      expect(toast.success).not.toHaveBeenCalledWith('toasts.cameraSwitched');
    });

    it('no-ops without calling switchCamera when there is no local video track', async () => {
      storeState.localStream = {
        getVideoTracks: () => [],
        getAudioTracks: () => [],
      } as unknown as MediaStream;

      render(<VideoCallInterface callId="call1" />);
      await clickSwitchCamera();

      expect(webrtc.switchCamera).not.toHaveBeenCalled();
    });
  });

  describe('audio effects track routing — sender must always carry the CURRENT audioEffectsActive choice', () => {
    // React runs an outgoing effect's cleanup with the closure captured at
    // the render that scheduled it, i.e. the PREVIOUS value of any
    // dependency — never the value that triggered the re-run. The old
    // implementation's cleanup branched on `!audioEffectsActive` to decide
    // whether to restore the raw track, which means it always inspected the
    // stale, pre-toggle value: turning effects OFF left the processed track
    // on the wire (restore skipped), and turning them ON restored the raw
    // track for one hop before the new processed track landed (audible
    // blip). The fix must pick processed-vs-raw from the CURRENT render's
    // value directly in the effect body, not from an inverted cleanup.
    const originalTrack = { kind: 'audio', id: 'original' };
    const processedTrack = { kind: 'audio', id: 'processed' };
    // The sender's initial track (as wired by the WebRTC layer when the
    // connection was created) is deliberately a third, distinct id — neither
    // `originalTrack` nor `processedTrack` — so every assertion below is a
    // real `replaceTrack` call driven by this effect, never a same-track
    // no-op skip.
    const senderInitialTrack = { kind: 'audio', id: 'sender-initial' };
    let replaceTrack: jest.Mock;

    beforeEach(() => {
      replaceTrack = jest.fn().mockResolvedValue(undefined);
      storeState.localStream = {
        getAudioTracks: () => [originalTrack],
      } as unknown as MediaStream;
      storeState.peerConnections = new Map([
        ['peer1', { getSenders: () => [{ track: senderInitialTrack, replaceTrack }] }],
      ]) as unknown as typeof storeState.peerConnections;
    });

    afterEach(() => {
      storeState.localStream = null;
      storeState.peerConnections = new Map();
    });

    it('routes the sender through the RAW track (not the processed one) while no effect is enabled', async () => {
      useAudioEffectsMock.mockReturnValue({
        outputStream: { getAudioTracks: () => [processedTrack] } as unknown,
        effectsState: { reverb: { enabled: false } },
        toggleEffect: jest.fn(),
        updateEffectParams: jest.fn(),
        loadPreset: jest.fn(),
        currentPreset: null,
        availableBackSounds: [],
        availablePresets: [],
      });

      render(<VideoCallInterface callId="call1" />);

      await waitFor(() => expect(replaceTrack).toHaveBeenCalled());
      expect(replaceTrack).toHaveBeenCalledWith(originalTrack);
      expect(replaceTrack).not.toHaveBeenCalledWith(processedTrack);
    });

    it('switches the sender from raw to processed the moment an effect is toggled on', async () => {
      useAudioEffectsMock.mockReturnValue({
        outputStream: { getAudioTracks: () => [processedTrack] } as unknown,
        effectsState: { reverb: { enabled: false } },
        toggleEffect: jest.fn(),
        updateEffectParams: jest.fn(),
        loadPreset: jest.fn(),
        currentPreset: null,
        availableBackSounds: [],
        availablePresets: [],
      });

      const { rerender } = render(<VideoCallInterface callId="call1" />);
      await waitFor(() => expect(replaceTrack).toHaveBeenCalledWith(originalTrack));
      replaceTrack.mockClear();

      useAudioEffectsMock.mockReturnValue({
        outputStream: { getAudioTracks: () => [processedTrack] } as unknown,
        effectsState: { reverb: { enabled: true } },
        toggleEffect: jest.fn(),
        updateEffectParams: jest.fn(),
        loadPreset: jest.fn(),
        currentPreset: null,
        availableBackSounds: [],
        availablePresets: [],
      });
      rerender(<VideoCallInterface callId="call1" />);

      await waitFor(() => expect(replaceTrack).toHaveBeenCalledWith(processedTrack));
      expect(replaceTrack).not.toHaveBeenCalledWith(originalTrack);
    });

    it('restores the raw track the moment the last enabled effect is toggled off', async () => {
      useAudioEffectsMock.mockReturnValue({
        outputStream: { getAudioTracks: () => [processedTrack] } as unknown,
        effectsState: { reverb: { enabled: true } },
        toggleEffect: jest.fn(),
        updateEffectParams: jest.fn(),
        loadPreset: jest.fn(),
        currentPreset: null,
        availableBackSounds: [],
        availablePresets: [],
      });

      const { rerender } = render(<VideoCallInterface callId="call1" />);
      await waitFor(() => expect(replaceTrack).toHaveBeenCalledWith(processedTrack));
      replaceTrack.mockClear();

      useAudioEffectsMock.mockReturnValue({
        outputStream: { getAudioTracks: () => [processedTrack] } as unknown,
        effectsState: { reverb: { enabled: false } },
        toggleEffect: jest.fn(),
        updateEffectParams: jest.fn(),
        loadPreset: jest.fn(),
        currentPreset: null,
        availableBackSounds: [],
        availablePresets: [],
      });
      rerender(<VideoCallInterface callId="call1" />);

      await waitFor(() => expect(replaceTrack).toHaveBeenCalledWith(originalTrack));
      expect(replaceTrack).not.toHaveBeenCalledWith(processedTrack);
    });
  });

  // Vague 76: neither handler held an in-flight guard, unlike its sibling
  // `CallManager.handleAcceptCall` (Vague 33). A double-click/tap — or the
  // adaptive-degradation controller's own resume()/suspend() racing a manual
  // toggle (use-adaptive-degradation.ts) — before the first getUserMedia +
  // replaceTrack round-trip settles let a second invocation acquire its own
  // camera track. That second track gets appended to localStream / accepted
  // by whichever replaceTrack resolves last, but the LOSING track is never
  // referenced by anything that could stop it — an orphaned camera capture
  // survives silently for the rest of the call (camera indicator stays lit).
  describe('re-entrancy guards — a second invocation before the first settles must not leak a camera track', () => {
    afterEach(() => {
      webrtc.enableVideo.mockResolvedValue(undefined);
      webrtc.disableVideo.mockResolvedValue(undefined);
      webrtc.switchCamera.mockResolvedValue(undefined);
      storeState.localStream = null;
    });

    it('handleToggleVideo: a second click before enableVideo resolves must not call enableVideo twice', async () => {
      storeState.controls = { audioEnabled: true, videoEnabled: false };
      let resolveEnable: () => void = () => {};
      webrtc.enableVideo.mockImplementation(
        () => new Promise<void>((resolve) => { resolveEnable = resolve; }),
      );

      render(<VideoCallInterface callId="call1" />);
      const button = screen.getByTestId('toggle-video');

      fireEvent.click(button);
      fireEvent.click(button);

      expect(webrtc.enableVideo).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveEnable();
        await Promise.resolve();
      });

      // The in-flight guard must release once settled — a THIRD, later click
      // is a legitimate new toggle and must go through.
      fireEvent.click(button);
      expect(webrtc.enableVideo).toHaveBeenCalledTimes(2);
    });

    it('handleToggleVideo: a second click before disableVideo resolves must not call disableVideo twice', async () => {
      storeState.controls = { audioEnabled: true, videoEnabled: true };
      let resolveDisable: () => void = () => {};
      webrtc.disableVideo.mockImplementation(
        () => new Promise<void>((resolve) => { resolveDisable = resolve; }),
      );

      render(<VideoCallInterface callId="call1" />);
      const button = screen.getByTestId('toggle-video');

      fireEvent.click(button);
      fireEvent.click(button);

      expect(webrtc.disableVideo).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveDisable();
        await Promise.resolve();
      });
    });

    it('handleSwitchCamera: a second click before switchCamera resolves must not call switchCamera twice', async () => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          enumerateDevices: jest.fn().mockResolvedValue([
            { kind: 'videoinput' },
            { kind: 'videoinput' },
          ]),
        },
      });
      const videoTrack = { kind: 'video', getConstraints: () => ({ facingMode: 'user' }) };
      storeState.localStream = {
        getVideoTracks: () => [videoTrack],
        getAudioTracks: () => [],
      } as unknown as MediaStream;

      let resolveSwitch: () => void = () => {};
      webrtc.switchCamera.mockImplementation(
        () => new Promise<void>((resolve) => { resolveSwitch = resolve; }),
      );

      render(<VideoCallInterface callId="call1" />);
      const button = await screen.findByRole('button', { name: 'controls.switchCamera' });

      fireEvent.click(button);
      fireEvent.click(button);

      expect(webrtc.switchCamera).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveSwitch();
        await Promise.resolve();
      });

      // @ts-expect-error -- test-only cleanup of a property defined above
      delete navigator.mediaDevices;
    });
  });

  // Vague 86: enableVideo() (use-webrtc-p2p.ts) used to resolve silently
  // (no-op, no throw) when no peer connection exists yet — e.g. the call is
  // still ringing. handleToggleVideo has no way to distinguish that from a
  // real success: it flipped controls.videoEnabled to true and told the peer
  // video was on via CALL_TOGGLE_VIDEO, even though no camera track was ever
  // acquired or attached to anything. enableVideo now throws in that case —
  // this locks handleToggleVideo's reaction to the rejection through the
  // SAME catch path already proven for a mid-call replaceTrack failure.
  describe('handleToggleVideo — enableVideo rejecting must not report video as enabled (Vague 86)', () => {
    afterEach(() => {
      webrtc.enableVideo.mockResolvedValue(undefined);
    });

    it('keeps controls.videoEnabled false and does not notify the peer when enableVideo rejects', async () => {
      storeState.controls = { audioEnabled: true, videoEnabled: false };
      webrtc.enableVideo.mockRejectedValueOnce(new Error('NO_PEER_CONNECTION'));
      const fakeSocket = { on: jest.fn(), off: jest.fn(), emit: jest.fn() };
      (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(fakeSocket);

      render(<VideoCallInterface callId="call1" />);
      const button = screen.getByTestId('toggle-video');
      fireEvent.click(button);

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('toasts.videoSwitchFailed'));

      expect(storeState.setControls).not.toHaveBeenCalled();
      expect(fakeSocket.emit).not.toHaveBeenCalledWith(
        'call:toggle-video',
        expect.anything(),
      );
    });
  });

  // Vague 82: Vague 76 guarded the manual double-click (`videoToggleInFlightRef`)
  // but explicitly left open ("reste ouvert") that the manual toggle and the
  // adaptive-degradation controller's own suspend()/resume() (which call
  // enableVideo/disableVideo directly, see use-adaptive-degradation.ts) were
  // never synchronized against EACH OTHER — only against themselves. Either
  // ordering (manual-then-auto or auto-then-manual) acquires two independent
  // camera tracks on the same WebRTCService instances, exactly like the
  // double-click bug: the losing track is never referenced by anything that
  // could stop it.
  describe('mutual exclusion — manual toggle vs. adaptive-degradation controller (Vague 82)', () => {
    type CapturedDegradationActions = {
      applyTier: (tier: string) => void;
      suspend: () => Promise<void>;
      resume: () => Promise<void>;
    };

    const capturedActions = (): CapturedDegradationActions => {
      const calls = useAdaptiveDegradationMock.mock.calls;
      const lastCall = calls[calls.length - 1] as unknown as [{ actions: CapturedDegradationActions }];
      return lastCall[0].actions;
    };

    afterEach(() => {
      webrtc.enableVideo.mockResolvedValue(undefined);
      webrtc.disableVideo.mockResolvedValue(undefined);
    });

    it('a manual toggle in flight blocks a concurrent auto-suspend from calling disableVideo twice', async () => {
      storeState.controls = { audioEnabled: true, videoEnabled: true };
      let resolveDisable: () => void = () => {};
      webrtc.disableVideo.mockImplementation(
        () => new Promise<void>((resolve) => { resolveDisable = resolve; }),
      );

      render(<VideoCallInterface callId="call1" />);
      const button = screen.getByTestId('toggle-video');
      fireEvent.click(button); // manual disableVideo now in flight

      expect(webrtc.disableVideo).toHaveBeenCalledTimes(1);

      await expect(capturedActions().suspend()).rejects.toThrow();
      expect(webrtc.disableVideo).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveDisable();
        await Promise.resolve();
      });
    });

    it('an in-flight auto-suspend blocks a concurrent manual toggle from calling disableVideo twice', async () => {
      storeState.controls = { audioEnabled: true, videoEnabled: true };
      let resolveDisable: () => void = () => {};
      webrtc.disableVideo.mockImplementation(
        () => new Promise<void>((resolve) => { resolveDisable = resolve; }),
      );

      render(<VideoCallInterface callId="call1" />);
      const suspendPromise = capturedActions().suspend(); // auto suspend now in flight

      const button = screen.getByTestId('toggle-video');
      fireEvent.click(button);

      expect(webrtc.disableVideo).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveDisable();
        await Promise.resolve();
      });
      await suspendPromise;
    });
  });

  // Vague 92: Vague 82 unified the manual toggle with the adaptive-degradation
  // controller's suspend()/resume(), but `handleSwitchCamera` kept its own,
  // entirely disconnected `cameraSwitchInFlightRef` — a camera flip could
  // still race either path, letting one replaceTrack/stop a track the other
  // was still mid-acquisition on.
  describe('mutual exclusion — camera switch vs. manual toggle / adaptive-degradation controller (Vague 92)', () => {
    type CapturedDegradationActions = {
      applyTier: (tier: string) => void;
      suspend: () => Promise<void>;
      resume: () => Promise<void>;
    };

    const capturedActions = (): CapturedDegradationActions => {
      const calls = useAdaptiveDegradationMock.mock.calls;
      const lastCall = calls[calls.length - 1] as unknown as [{ actions: CapturedDegradationActions }];
      return lastCall[0].actions;
    };

    const setupCameraSwitchFixture = () => {
      const videoTrack = { kind: 'video', getConstraints: () => ({ facingMode: 'user' }) };
      storeState.localStream = {
        getVideoTracks: () => [videoTrack],
        getAudioTracks: () => [],
      } as unknown as MediaStream;
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          enumerateDevices: jest.fn().mockResolvedValue([{ kind: 'videoinput' }, { kind: 'videoinput' }]),
        },
      });
    };

    const clickSwitchCamera = async () => {
      const button = await screen.findByRole('button', { name: 'controls.switchCamera' });
      fireEvent.click(button);
    };

    afterEach(() => {
      webrtc.enableVideo.mockResolvedValue(undefined);
      webrtc.disableVideo.mockResolvedValue(undefined);
      webrtc.switchCamera.mockResolvedValue(undefined);
      // @ts-expect-error -- test-only cleanup of a property defined per-test below
      delete navigator.mediaDevices;
      storeState.localStream = null;
    });

    it('a camera switch in flight blocks a concurrent manual toggle from calling disableVideo', async () => {
      storeState.controls = { audioEnabled: true, videoEnabled: true };
      let resolveSwitch: () => void = () => {};
      webrtc.switchCamera.mockImplementation(
        () => new Promise<void>((resolve) => { resolveSwitch = resolve; }),
      );
      setupCameraSwitchFixture();

      render(<VideoCallInterface callId="call1" />);
      await clickSwitchCamera(); // camera switch now in flight

      const button = screen.getByTestId('toggle-video');
      fireEvent.click(button);

      expect(webrtc.disableVideo).not.toHaveBeenCalled();

      await act(async () => {
        resolveSwitch();
        await Promise.resolve();
      });
    });

    it('an in-flight manual toggle blocks a concurrent camera switch from calling switchCamera', async () => {
      storeState.controls = { audioEnabled: true, videoEnabled: true };
      let resolveDisable: () => void = () => {};
      webrtc.disableVideo.mockImplementation(
        () => new Promise<void>((resolve) => { resolveDisable = resolve; }),
      );
      setupCameraSwitchFixture();

      render(<VideoCallInterface callId="call1" />);
      const button = screen.getByTestId('toggle-video');
      fireEvent.click(button); // manual disableVideo now in flight

      await clickSwitchCamera();

      expect(webrtc.switchCamera).not.toHaveBeenCalled();

      await act(async () => {
        resolveDisable();
        await Promise.resolve();
      });
    });

    it('a camera switch in flight blocks a concurrent auto-suspend from calling disableVideo', async () => {
      storeState.controls = { audioEnabled: true, videoEnabled: true };
      let resolveSwitch: () => void = () => {};
      webrtc.switchCamera.mockImplementation(
        () => new Promise<void>((resolve) => { resolveSwitch = resolve; }),
      );
      setupCameraSwitchFixture();

      render(<VideoCallInterface callId="call1" />);
      await clickSwitchCamera(); // camera switch now in flight

      await expect(capturedActions().suspend()).rejects.toThrow();
      expect(webrtc.disableVideo).not.toHaveBeenCalled();

      await act(async () => {
        resolveSwitch();
        await Promise.resolve();
      });
    });

    it('an in-flight auto-suspend blocks a concurrent camera switch from calling switchCamera', async () => {
      storeState.controls = { audioEnabled: true, videoEnabled: true };
      let resolveDisable: () => void = () => {};
      webrtc.disableVideo.mockImplementation(
        () => new Promise<void>((resolve) => { resolveDisable = resolve; }),
      );
      setupCameraSwitchFixture();

      render(<VideoCallInterface callId="call1" />);
      const suspendPromise = capturedActions().suspend(); // auto suspend now in flight

      await clickSwitchCamera();

      expect(webrtc.switchCamera).not.toHaveBeenCalled();

      await act(async () => {
        resolveDisable();
        await Promise.resolve();
      });
      await suspendPromise;
    });
  });
});
