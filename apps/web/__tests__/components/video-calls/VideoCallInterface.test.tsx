import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ---- Mocks for the container's heavy dependencies -------------------------

const webrtc = {
  initializeLocalStream: jest.fn().mockResolvedValue(undefined),
  createOffer: jest.fn().mockResolvedValue(undefined),
  connectionState: 'connected',
  enableVideo: jest.fn().mockResolvedValue(undefined),
  disableVideo: jest.fn().mockResolvedValue(undefined),
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
};

const useAdaptiveDegradationMock = jest.fn(() => ({ videoSuspended: false }));

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (k: string) => k, isLoading: false }),
}));
// VideoStream carries heavy WebRTC/ref machinery — stub it for the fullscreen-region test.
jest.mock('@/components/video-calls/VideoStream', () => ({
  VideoStream: () => <div data-testid="remote-video-stream" />,
}));
jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'u1', username: 'Me' } }),
}));
jest.mock('@/hooks/use-webrtc-p2p', () => ({ useWebRTCP2P: () => webrtc }));
jest.mock('@/hooks/use-audio-effects', () => ({
  useAudioEffects: () => ({
    outputStream: null,
    effectsState: {},
    toggleEffect: jest.fn(),
    updateEffectParams: jest.fn(),
    loadPreset: jest.fn(),
    currentPreset: null,
    availableBackSounds: [],
    availablePresets: [],
  }),
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
jest.mock('@/hooks/use-active-peer-connection', () => ({
  useActivePeerConnection: () => null,
}));
jest.mock('@/hooks/use-adaptive-degradation', () => ({
  useAdaptiveDegradation: (...args: unknown[]) => useAdaptiveDegradationMock(...(args as [])),
}));
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
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
    (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(null);
  });

  it('renders the core call chrome', () => {
    render(<VideoCallInterface callId="call1" />);
    expect(screen.getByRole('toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('local-video-tile')).toBeInTheDocument();
    expect(screen.getByTestId('call-duration')).toBeInTheDocument();
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
      const button = screen.getByRole('button', { name: 'calls.stream.fullscreen' });
      expect(button).toHaveAttribute('tabIndex', '0');
      // Enter/Space must not throw and must be intercepted (preventDefault) by the handler.
      fireEvent.keyDown(button, { key: 'Enter' });
      fireEvent.keyDown(button, { key: ' ' });
      expect(button).toBeInTheDocument();
    } finally {
      storeState.remoteStreams = new Map();
    }
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
  describe('handleSwitchCamera — must not tear down the old track before replaceTrack settles', () => {
    const setupCameraSwitchDom = (getUserMediaImpl: jest.Mock) => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: {
          enumerateDevices: jest.fn().mockResolvedValue([
            { kind: 'videoinput' },
            { kind: 'videoinput' },
          ]),
          getUserMedia: getUserMediaImpl,
        },
      });
    };

    afterEach(() => {
      // @ts-expect-error -- test-only cleanup of a property we defined above
      delete navigator.mediaDevices;
      storeState.localStream = null;
      storeState.peerConnections = new Map();
    });

    const clickSwitchCamera = async () => {
      const button = await screen.findByRole('button', { name: 'calls.controls.switchCamera' });
      fireEvent.click(button);
    };

    it('waits for every peer connection to finish replaceTrack before stopping/detaching the old track', async () => {
      const videoTrack = { kind: 'video', getConstraints: () => ({ facingMode: 'user' }), stop: jest.fn() };
      const localStream = {
        getVideoTracks: () => [videoTrack],
        removeTrack: jest.fn(),
        addTrack: jest.fn(),
      };
      storeState.localStream = localStream as unknown as MediaStream;

      let resolveReplace: () => void = () => {};
      const replaceTrack = jest.fn(() => new Promise<void>((resolve) => { resolveReplace = resolve; }));
      const pc = { getSenders: () => [{ track: { kind: 'video' }, replaceTrack }] };
      storeState.peerConnections = new Map([['peer1', pc]]) as unknown as typeof storeState.peerConnections;

      const newVideoTrack = {};
      setupCameraSwitchDom(jest.fn().mockResolvedValue({ getVideoTracks: () => [newVideoTrack] }));

      render(<VideoCallInterface callId="call1" />);
      await clickSwitchCamera();

      await waitFor(() => expect(replaceTrack).toHaveBeenCalledWith(newVideoTrack));
      expect(videoTrack.stop).not.toHaveBeenCalled();
      expect(localStream.removeTrack).not.toHaveBeenCalled();

      resolveReplace();

      await waitFor(() => expect(videoTrack.stop).toHaveBeenCalledTimes(1));
      expect(localStream.removeTrack).toHaveBeenCalledWith(videoTrack);
      expect(localStream.addTrack).toHaveBeenCalledWith(newVideoTrack);
    });

    it('surfaces cameraSwitchFailed and keeps the old track alive when a peer connection rejects replaceTrack', async () => {
      const videoTrack = { kind: 'video', getConstraints: () => ({ facingMode: 'user' }), stop: jest.fn() };
      const localStream = {
        getVideoTracks: () => [videoTrack],
        removeTrack: jest.fn(),
        addTrack: jest.fn(),
      };
      storeState.localStream = localStream as unknown as MediaStream;

      const replaceTrack = jest.fn().mockRejectedValue(new Error('sender closed'));
      const pc = { getSenders: () => [{ track: { kind: 'video' }, replaceTrack }] };
      storeState.peerConnections = new Map([['peer1', pc]]) as unknown as typeof storeState.peerConnections;

      const newVideoTrack = {};
      setupCameraSwitchDom(jest.fn().mockResolvedValue({ getVideoTracks: () => [newVideoTrack] }));

      render(<VideoCallInterface callId="call1" />);
      await clickSwitchCamera();

      await waitFor(() => expect(replaceTrack).toHaveBeenCalled());
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('calls.toasts.cameraSwitchFailed'));

      expect(videoTrack.stop).not.toHaveBeenCalled();
      expect(localStream.removeTrack).not.toHaveBeenCalled();
      expect(localStream.addTrack).not.toHaveBeenCalled();
    });
  });
});
