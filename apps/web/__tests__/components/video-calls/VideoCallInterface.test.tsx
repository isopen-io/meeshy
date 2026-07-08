import { render, screen, fireEvent } from '@testing-library/react';

// ---- Mocks for the container's heavy dependencies -------------------------

const webrtc = {
  initializeLocalStream: jest.fn().mockResolvedValue(undefined),
  createOffer: jest.fn().mockResolvedValue(undefined),
  connectionState: 'connected',
  enableVideo: jest.fn().mockResolvedValue(undefined),
  disableVideo: jest.fn().mockResolvedValue(undefined),
  applyQualityTier: jest.fn().mockResolvedValue(undefined),
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
jest.mock('@/hooks/use-active-peer-connection', () => ({
  useActivePeerConnection: () => null,
}));
jest.mock('@/hooks/use-adaptive-degradation', () => ({
  useAdaptiveDegradation: (...args: unknown[]) => useAdaptiveDegradationMock(...(args as [])),
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
        const handleParticipantLeft = fakeSocket.on.mock.calls[0][1] as (event: unknown) => void;
        handleParticipantLeft({ callId: 'call1', userId: 'peer1' });
        jest.advanceTimersByTime(2000);
        expect(storeState.removeRemoteStream).toHaveBeenCalledWith('peer1');
        expect(storeState.removePeerConnection).toHaveBeenCalledWith('peer1');

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

        const handleParticipantLeft = fakeSocket.on.mock.calls[0][1] as (event: unknown) => void;
        handleParticipantLeft({ callId: 'call1', userId: 'peer1' });

        // Rejoin before the grace window elapses: a fresh RTCPeerConnection
        // replaces the (absent) old one under the same participant id.
        const freshConnection = {} as RTCPeerConnection;
        storeState.peerConnections = new Map([['peer1', freshConnection]]);

        jest.advanceTimersByTime(2000);

        expect(storeState.removeRemoteStream).not.toHaveBeenCalledWith('peer1');
        expect(storeState.removePeerConnection).not.toHaveBeenCalledWith('peer1');
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

        const handleParticipantLeft = fakeSocket.on.mock.calls[0][1] as (event: unknown) => void;
        handleParticipantLeft({ callId: 'call1', userId: 'peer1' });

        jest.advanceTimersByTime(2000);

        expect(storeState.removeRemoteStream).toHaveBeenCalledWith('peer1');
        expect(storeState.removePeerConnection).toHaveBeenCalledWith('peer1');
      } finally {
        jest.useRealTimers();
        storeState.peerConnections = new Map();
      }
    });
  });
});
