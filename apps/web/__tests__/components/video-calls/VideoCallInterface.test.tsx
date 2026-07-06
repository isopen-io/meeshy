import { render, screen, fireEvent, act } from '@testing-library/react';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

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
const getSocketMock = jest.fn(() => null as unknown);
jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: { getSocket: () => getSocketMock(), onStatusChange: jest.fn(() => () => {}) },
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

describe('VideoCallInterface (container)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getSocketMock.mockReturnValue(null);
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

  it('clears offersCreatedFor for a departed participant so a rejoin re-triggers an offer', () => {
    jest.useFakeTimers();
    try {
      const handlers: Record<string, (event: unknown) => void> = {};
      const fakeSocket = {
        on: jest.fn((event: string, handler: (e: unknown) => void) => {
          handlers[event] = handler;
        }),
        off: jest.fn(),
      };
      getSocketMock.mockReturnValue(fakeSocket);

      const withPeer = (present: boolean) => ({
        id: 'call1',
        startedAt: new Date().toISOString(),
        initiatorId: 'u1', // self is the initiator — drives offer creation
        participants: [
          { userId: 'u1', username: 'Me', leftAt: null, isAudioEnabled: true, isVideoEnabled: true },
          ...(present
            ? [{ userId: 'p1', username: 'Peer', leftAt: null, isAudioEnabled: true, isVideoEnabled: true }]
            : []),
        ],
      });

      storeState.currentCall = withPeer(true);
      const { rerender } = render(<VideoCallInterface callId="call1" />);
      expect(webrtc.createOffer).toHaveBeenCalledTimes(1);
      expect(webrtc.createOffer).toHaveBeenCalledWith('p1');

      // p1 leaves: the participants list drops them and the server emits
      // CALL_PARTICIPANT_LEFT.
      storeState.currentCall = withPeer(false);
      rerender(<VideoCallInterface callId="call1" />);
      act(() => {
        handlers[SERVER_EVENTS.CALL_PARTICIPANT_LEFT]({ callId: 'call1', userId: 'p1' });
      });

      // Grace period elapses — stream/peer-connection cleanup runs.
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(storeState.removeRemoteStream).toHaveBeenCalledWith('p1');

      // p1 rejoins the same call (network blip, tab reload).
      storeState.currentCall = withPeer(true);
      rerender(<VideoCallInterface callId="call1" />);

      expect(webrtc.createOffer).toHaveBeenCalledTimes(2);
      expect(webrtc.createOffer).toHaveBeenLastCalledWith('p1');
    } finally {
      jest.useRealTimers();
    }
  });
});
