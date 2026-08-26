import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ---- Mocks for the container's heavy dependencies -------------------------

const webrtc = {
  initializeLocalStream: jest.fn().mockResolvedValue(undefined),
  createOffer: jest.fn().mockResolvedValue(undefined),
  connectionState: 'connected',
  enableVideo: jest.fn().mockResolvedValue(undefined),
  disableVideo: jest.fn().mockResolvedValue(undefined),
  switchCamera: jest.fn().mockResolvedValue(undefined),
  applyQualityTierToPeer: jest.fn().mockResolvedValue(undefined),
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
const useRemoteCallAlertsMock = jest.fn(() => ({
  remoteQualityDegraded: false,
  remoteQualityDegradedParticipantId: null as string | null,
  remoteScreenCapturing: false,
  remoteScreenCapturingParticipantIds: [] as readonly string[],
}));

jest.mock('@/hooks/useI18n', () => ({
  // remoteAlerts.* carry a {name} placeholder in the real catalog (mirrors
  // CallQualityOverlay's own test mock) — needed so the group-call name-
  // attribution tests below (Vague 131) can assert on the interpolated name
  // instead of a bare, un-interpolated translation key.
  useI18n: () => ({
    // Mirror the real `t(key, params)` function-replacer (hooks/use-i18n.ts) so a
    // name is inserted verbatim through the params path, not via a hand-rolled
    // String.prototype.replace that would re-interpret `$`-sequences.
    t: (k: string, params?: Record<string, unknown>) => {
      const template = k.startsWith('remoteAlerts.') ? `${k} {name}` : k;
      if (!params) return template;
      return template.replace(/\{(\w+)\}/g, (match, key: string) =>
        params[key] != null ? String(params[key]) : match,
      );
    },
    isLoading: false,
  }),
}));
// VideoStream carries heavy WebRTC/ref machinery — stub it for the fullscreen-region test.
// `data-muted` mirrors the real `muted` prop so tests can assert speaker-toggle wiring
// without reaching into an actual <video> element's audio output. The testid is keyed
// off `isLocal` — LocalVideoTile renders this same component (always muted, self-view)
// and would otherwise collide with the remote instance under the same fixed testid.
jest.mock('@/components/video-calls/VideoStream', () => ({
  VideoStream: (props: { muted?: boolean; isLocal?: boolean; onKickParticipant?: () => void }) => (
    <div
      data-testid={props.isLocal ? 'local-video-stream' : 'remote-video-stream'}
      data-muted={String(props.muted)}
      data-has-kick={String(!!props.onKickParticipant)}
    >
      {props.onKickParticipant && (
        <button onClick={props.onKickParticipant}>mock-kick</button>
      )}
    </div>
  ),
}));
jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: { id: 'u1', username: 'Me' } }),
}));
// Captured so tests can drive the component's own onError callback directly
// (Vague 149) — the mock previously ignored the config object entirely.
let capturedWebRTCConfig: { onError?: (error: Error) => void; onConnected?: () => void } = {};
jest.mock('@/hooks/use-webrtc-p2p', () => ({
  useWebRTCP2P: (config: { onError?: (error: Error) => void; onConnected?: () => void }) => {
    capturedWebRTCConfig = config;
    return webrtc;
  },
}));
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
const useCallQualityMock = jest.fn(() => ({
  qualityStats: null as unknown,
  perPeerStats: new Map() as ReadonlyMap<string, unknown>,
}));
jest.mock('@/hooks/use-call-quality', () => ({
  useCallQuality: (...args: unknown[]) => useCallQualityMock(...(args as [])),
}));
jest.mock('@/hooks/use-remote-call-alerts', () => ({
  useRemoteCallAlerts: (...args: unknown[]) => useRemoteCallAlertsMock(...(args as [])),
}));
jest.mock('@/hooks/use-remote-transcription-active', () => ({
  useRemoteTranscriptionActive: () => ({ peerTranscribing: false }),
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
jest.mock('@/hooks/queries/use-conversations-query', () => ({
  useConversationQuery: jest.fn(() => ({ data: undefined })),
}));
jest.mock('@/services/calls.service', () => ({
  callsService: { removeParticipant: jest.fn() },
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
import { useConversationQuery } from '@/hooks/queries/use-conversations-query';
import { callsService } from '@/services/calls.service';
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
    useCallQualityMock.mockReturnValue({ qualityStats: null, perPeerStats: new Map() });
    useRemoteCallAlertsMock.mockReturnValue({
      remoteQualityDegraded: false,
      remoteQualityDegradedParticipantId: null,
      remoteScreenCapturing: false,
      remoteScreenCapturingParticipantIds: [],
    });
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

  // --- Vague 120 (2026-08-13): `currentCall.participants` never contains the
  // local user — the gateway explicitly skips echoing `call:participant-joined`
  // back to the socket that triggered it (CallEventsHandler.ts, `if
  // (remoteSocket.id === socket.id) continue`), and the caller's own optimistic
  // `setCurrentCall` on the `call:initiate` ack seeds `participants: []` by
  // design (use-video-call.ts). `VideoCallInterface` only ever mounts while
  // `isInCall` is true, so the local user is unconditionally part of the call
  // for its entire lifetime — the overlay's count must include them. Without
  // the +1, a caller watching their own screen mid-ring saw "0 participants",
  // and a connected 1:1 call always under-reported by one (e.g. "1 participant"
  // for two people on the line).

  it('counts the local user even before anyone else has joined (ringing, participants empty)', () => {
    storeState.currentCall = {
      id: 'call1',
      startedAt: new Date().toISOString(),
      initiatorId: 'u1',
      participants: [],
    };
    render(<VideoCallInterface callId="call1" />);
    expect(screen.getByTestId('call-participant-count')).toHaveAttribute('data-count', '1');
  });

  it('counts the local user alongside every other active participant', () => {
    storeState.currentCall = {
      id: 'call1',
      startedAt: new Date().toISOString(),
      initiatorId: 'other',
      participants: [
        { userId: 'other', username: 'Other', leftAt: null, isAudioEnabled: true, isVideoEnabled: true },
        { userId: 'third', username: 'Third', leftAt: new Date().toISOString(), isAudioEnabled: true, isVideoEnabled: true },
      ],
    };
    render(<VideoCallInterface callId="call1" />);
    // 1 active other participant (the second has left) + the local user = 2.
    expect(screen.getByTestId('call-participant-count')).toHaveAttribute('data-count', '2');
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

  // Audit web-calls (2026-08-15): the participant pinned to fullscreen
  // leaving a group call used to blank the main view (fall through to the
  // "waiting for participant" placeholder) for the REST of the call, even
  // though other participants were still fully connected — the lookup miss
  // only fell back to the first remaining stream when `fullscreenParticipantId`
  // was null, never when the pinned id simply no longer matched anything.
  it('falls back to another live stream when the fullscreen-pinned participant leaves', () => {
    storeState.remoteStreams = new Map([
      ['peer1', {} as MediaStream],
      ['peer2', {} as MediaStream],
    ]);
    try {
      const { rerender } = render(<VideoCallInterface callId="call1" />);

      // Pin the (currently displayed, default-first) peer1 to fullscreen.
      fireEvent.click(screen.getByRole('button', { name: 'stream.fullscreen' }));

      // peer1 leaves the call; only peer2 remains live.
      storeState.remoteStreams = new Map([['peer2', {} as MediaStream]]);
      rerender(<VideoCallInterface callId="call1" />);

      // Main view must still show a live remote stream, not the
      // "waiting for participant" placeholder.
      expect(screen.getByTestId('remote-video-stream')).toBeInTheDocument();
      expect(screen.queryByText('waiting.forParticipant')).not.toBeInTheDocument();
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

  // Vague 133 — `CallParticipantLeftEvent.userId` is optional (the gateway's
  // disconnect-grace-expiry error-fallback path omitted it entirely before
  // this wave's gateway fix). The handler's identity resolution used to fall
  // back to a nonexistent `event.anonymousId` field, so any payload missing
  // `userId` silently no-op'd — no disconnected marker, no cleanup, no
  // `offersCreatedFor` release. It must fall back to the always-present
  // `participantId` (the DB CallParticipant id) instead.
  describe('PARTICIPANT_LEFT falls back to participantId when userId is absent (Vague 133)', () => {
    it('marks the participant disconnected and cleans up using participantId alone', () => {
      jest.useFakeTimers();
      try {
        const fakeSocket = { on: jest.fn(), off: jest.fn() };
        (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(fakeSocket);
        storeState.peerConnections = new Map();

        render(<VideoCallInterface callId="call1" />);

        const handleParticipantLeft = participantLeftHandler(fakeSocket);
        // No `userId` — exactly the shape emitted by the gateway's
        // forceCleanupParticipationAfterLeaveFailure fallback before this
        // wave's gateway fix (still a possibility from an older gateway
        // build, hence the client-side fallback too).
        handleParticipantLeft({ callId: 'call1', participantId: 'peer1' });
        jest.advanceTimersByTime(2000);

        expect(storeState.removeRemoteStream).toHaveBeenCalledWith('peer1');
        expect(webrtc.removeParticipant).toHaveBeenCalledWith('peer1');
      } finally {
        jest.useRealTimers();
        storeState.peerConnections = new Map();
        storeState.remoteStreams = new Map();
      }
    });

    it('still no-ops when neither userId nor participantId is present', () => {
      jest.useFakeTimers();
      try {
        const fakeSocket = { on: jest.fn(), off: jest.fn() };
        (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(fakeSocket);

        render(<VideoCallInterface callId="call1" />);

        const handleParticipantLeft = participantLeftHandler(fakeSocket);
        handleParticipantLeft({ callId: 'call1' });
        jest.advanceTimersByTime(2000);

        expect(storeState.removeRemoteStream).not.toHaveBeenCalled();
        expect(webrtc.removeParticipant).not.toHaveBeenCalled();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  // Group calls used to be a star, not a mesh: the offer-creation effect
  // bailed out entirely unless `currentCall.initiatorId === user.id`, so only
  // the initiator ever called `createOffer`. Two non-initiator participants
  // in the same 3+-person call never created an offer toward each other and
  // so never connected at all — the roster listed everyone, but only the
  // initiator's audio/video was ever received by anyone else. Local user is
  // always 'u1' (mocked `useAuth` above).
  describe('group calls — non-initiator participants must offer each other (mesh, not star)', () => {
    it('a non-initiator creates an offer toward another non-initiator whose id sorts AFTER its own', () => {
      storeState.currentCall = {
        id: 'call1',
        startedAt: new Date().toISOString(),
        initiatorId: 'organizer',
        participants: [
          { userId: 'organizer', username: 'Organizer', leftAt: null, isAudioEnabled: true, isVideoEnabled: true },
          // 'u1' < 'u2' — the local user owns this pair.
          { userId: 'u2', username: 'Peer', leftAt: null, isAudioEnabled: true, isVideoEnabled: true },
        ],
      };

      render(<VideoCallInterface callId="call1" />);

      // Owns the pair with 'u2' (tie-break) — never the pair with the
      // initiator, who owns every pair it's part of.
      expect(webrtc.createOffer).toHaveBeenCalledTimes(1);
      expect(webrtc.createOffer).toHaveBeenCalledWith('u2');
      expect(webrtc.createOffer).not.toHaveBeenCalledWith('organizer');
    });

    it('a non-initiator does NOT create an offer toward a peer whose id sorts BEFORE its own (the peer owns it instead)', () => {
      storeState.currentCall = {
        id: 'call1',
        startedAt: new Date().toISOString(),
        initiatorId: 'organizer',
        participants: [
          { userId: 'organizer', username: 'Organizer', leftAt: null, isAudioEnabled: true, isVideoEnabled: true },
          // 'u0' < 'u1' — the OTHER side owns this pair, not the local user.
          { userId: 'u0', username: 'Peer', leftAt: null, isAudioEnabled: true, isVideoEnabled: true },
        ],
      };

      render(<VideoCallInterface callId="call1" />);

      expect(webrtc.createOffer).not.toHaveBeenCalled();
    });

    it('the initiator still owns every pair it is part of, regardless of id ordering', () => {
      storeState.currentCall = {
        id: 'call1',
        startedAt: new Date().toISOString(),
        initiatorId: 'u1',
        participants: [
          { userId: 'a-peer', username: 'A', leftAt: null, isAudioEnabled: true, isVideoEnabled: true },
          { userId: 'z-peer', username: 'Z', leftAt: null, isAudioEnabled: true, isVideoEnabled: true },
        ],
      };

      render(<VideoCallInterface callId="call1" />);

      expect(webrtc.createOffer).toHaveBeenCalledTimes(2);
      expect(webrtc.createOffer).toHaveBeenCalledWith('a-peer');
      expect(webrtc.createOffer).toHaveBeenCalledWith('z-peer');
    });
  });

  // Vague 131 — CallQualityOverlay's remote-peer alerts (quality-degraded,
  // screen-capturing) used to be labelled with the FIRST non-self participant
  // found (`remoteParticipant`), regardless of which peer the alert was
  // actually ABOUT. In a group call this names the wrong person.
  describe('group calls — remote-alert overlay must name the peer the alert is ABOUT, not just the first one', () => {
    beforeEach(() => {
      storeState.currentCall = {
        id: 'call1',
        startedAt: new Date().toISOString(),
        initiatorId: 'organizer',
        participants: [
          { userId: 'u1', username: 'Me', leftAt: null, isAudioEnabled: true, isVideoEnabled: true },
          { userId: 'alice', username: 'Alice', leftAt: null, isAudioEnabled: true, isVideoEnabled: true },
          { userId: 'bob', username: 'Bob', leftAt: null, isAudioEnabled: true, isVideoEnabled: true },
        ],
      };
    });

    it('names the ACTUAL degraded peer (Bob), not the first remote participant (Alice)', () => {
      useRemoteCallAlertsMock.mockReturnValue({
        remoteQualityDegraded: true,
        remoteQualityDegradedParticipantId: 'bob',
        remoteScreenCapturing: false,
        remoteScreenCapturingParticipantIds: [],
      });

      render(<VideoCallInterface callId="call1" />);

      const indicator = screen.getByTestId('remote-quality-indicator');
      expect(indicator.getAttribute('aria-label')).toContain('Bob');
      expect(indicator.getAttribute('aria-label')).not.toContain('Alice');
    });

    it('names the ACTUAL capturing peer (Bob), not the first remote participant (Alice)', () => {
      useRemoteCallAlertsMock.mockReturnValue({
        remoteQualityDegraded: false,
        remoteQualityDegradedParticipantId: null,
        remoteScreenCapturing: true,
        remoteScreenCapturingParticipantIds: ['bob'],
      });

      render(<VideoCallInterface callId="call1" />);

      const pill = screen.getByTestId('screen-capture-pill');
      expect(pill.textContent).toContain('Bob');
      expect(pill.textContent).not.toContain('Alice');
    });

    it('names each alert independently when the degraded peer and the capturing peer are DIFFERENT people', () => {
      useRemoteCallAlertsMock.mockReturnValue({
        remoteQualityDegraded: true,
        remoteQualityDegradedParticipantId: 'alice',
        remoteScreenCapturing: true,
        remoteScreenCapturingParticipantIds: ['bob'],
      });

      render(<VideoCallInterface callId="call1" />);

      const indicator = screen.getByTestId('remote-quality-indicator');
      expect(indicator.getAttribute('aria-label')).toContain('Alice');
      expect(indicator.getAttribute('aria-label')).not.toContain('Bob');
      const pill = screen.getByTestId('screen-capture-pill');
      expect(pill.textContent).toContain('Bob');
      expect(pill.textContent).not.toContain('Alice');
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

  // L6-3: the network-survival freeze must be indistinguishable, from the
  // PEER's point of view, from nothing happening at all — the peer keeps
  // rendering our last (near-still) frame instead of destroying it for an
  // avatar placeholder, which a `call:toggle-video(video,false)` would
  // trigger exactly like a real manual camera-off. Guards a REGRESSION back
  // to that emission just as strictly as it guards the disableVideo()/
  // enableVideo() calls it replaced.
  describe('call-wide network-survival freeze (L6-3) — no peer notification, no track mutation', () => {
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

    it('suspend() never emits call:toggle-video and never calls disableVideo/enableVideo', async () => {
      const fakeSocket = { on: jest.fn(), off: jest.fn(), emit: jest.fn() };
      (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(fakeSocket);

      render(<VideoCallInterface callId="call1" />);
      await act(async () => {
        await capturedActions().suspend();
      });

      expect(fakeSocket.emit).not.toHaveBeenCalledWith('call:toggle-video', expect.anything());
      expect(webrtc.disableVideo).not.toHaveBeenCalled();
      expect(webrtc.enableVideo).not.toHaveBeenCalled();
      expect(toast.warning).toHaveBeenCalledWith('toasts.videoSuspendedPoorConnection');
    });

    it('resume() never emits call:toggle-video and never calls disableVideo/enableVideo', async () => {
      const fakeSocket = { on: jest.fn(), off: jest.fn(), emit: jest.fn() };
      (meeshySocketIOService.getSocket as jest.Mock).mockReturnValue(fakeSocket);

      render(<VideoCallInterface callId="call1" />);
      await act(async () => {
        await capturedActions().resume();
      });

      expect(fakeSocket.emit).not.toHaveBeenCalledWith('call:toggle-video', expect.anything());
      expect(webrtc.disableVideo).not.toHaveBeenCalled();
      expect(webrtc.enableVideo).not.toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalledWith('toasts.videoResumed');
    });

    // Without this reset, the freeze — a piece of VideoCallInterface state
    // now fully decoupled from any track lifecycle — would survive a manual
    // camera off/on cycle: useAdaptiveDegradation's OWN internal reset
    // (use-adaptive-degradation.ts, on the SAME `!userWantsVideo` signal)
    // puts its state machine back in `sending: true`, from which `resume()`
    // is unreachable until a FRESH poor→good cycle — so a since-recovered
    // peer would stay silently pinned to the 2 fps floor for the rest of
    // the call, with no automatic path left to ever clear it.
    it('a manual camera off/on cycle clears a stale freeze, instead of leaving a recovered peer pinned to 2fps forever', async () => {
      useCallQualityMock.mockReturnValue({
        qualityStats: null,
        perPeerStats: new Map([['peer-1', { level: 'excellent', timestamp: new Date() }]]),
      });

      const { rerender } = render(<VideoCallInterface callId="call1" />);
      await act(async () => {
        await capturedActions().suspend();
      });
      expect(webrtc.applyQualityTierToPeer).toHaveBeenLastCalledWith('peer-1', 'frozen');
      webrtc.applyQualityTierToPeer.mockClear();

      // Camera off, then back on (mirrors the store update handleToggleVideo
      // drives via the mocked setControls — applied directly here for a
      // clean, timing-free assertion on the reset effect it should trigger).
      storeState.controls = { audioEnabled: true, videoEnabled: false };
      await act(async () => {
        rerender(<VideoCallInterface callId="call1" />);
      });
      storeState.controls = { audioEnabled: true, videoEnabled: true };
      await act(async () => {
        rerender(<VideoCallInterface callId="call1" />);
      });

      // The peer's link is still 'excellent' — the freeze must not still be
      // in effect, so this re-derives to 'high', not the stale 'frozen'.
      expect(webrtc.applyQualityTierToPeer).toHaveBeenLastCalledWith('peer-1', 'high');
    });
  });

  // Vague 82: Vague 76 guarded the manual double-click (`videoToggleInFlightRef`)
  // but explicitly left open ("reste ouvert") that the manual toggle and the
  // adaptive-degradation controller's own suspend()/resume() were never
  // synchronized against EACH OTHER — only against themselves. Either
  // ordering used to acquire two independent camera tracks on the same
  // WebRTCService instances, exactly like the double-click bug. Since L6-3,
  // suspend()/resume() no longer touch a track at all — they only flip a
  // local `frozen` flag and toast — so this race can no longer orphan a
  // camera capture; the shared guard (`runGuardedVideoToggle`) is kept
  // anyway (harmless, avoids reopening the synchronization question for a
  // narrow change) and is still exercised here, now observed through the
  // toast side effect rather than a call to disableVideo/enableVideo.
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

    it('a manual toggle in flight blocks a concurrent auto-suspend from freezing video', async () => {
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
      // Rejected by the guard before its body ran — the freeze toast never fires.
      expect(toast.warning).not.toHaveBeenCalled();

      await act(async () => {
        resolveDisable();
        await Promise.resolve();
      });
    });

    it('an in-flight auto-suspend blocks a concurrent manual toggle from calling disableVideo', async () => {
      storeState.controls = { audioEnabled: true, videoEnabled: true };
      render(<VideoCallInterface callId="call1" />);

      // suspend()'s guarded body (setVideoFrozen + toast) has no await of
      // its own, so it runs to completion synchronously; the guard's ref is
      // only released on the NEXT microtask (the `finally` after
      // `await op()`) — so it is still held for the manual click fired here,
      // in the same synchronous tick.
      const suspendPromise = capturedActions().suspend();

      const button = screen.getByTestId('toggle-video');
      fireEvent.click(button);

      expect(webrtc.disableVideo).not.toHaveBeenCalled();

      await act(async () => {
        await suspendPromise;
      });
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

    it('a camera switch in flight blocks a concurrent auto-suspend from freezing video', async () => {
      storeState.controls = { audioEnabled: true, videoEnabled: true };
      let resolveSwitch: () => void = () => {};
      webrtc.switchCamera.mockImplementation(
        () => new Promise<void>((resolve) => { resolveSwitch = resolve; }),
      );
      setupCameraSwitchFixture();

      render(<VideoCallInterface callId="call1" />);
      await clickSwitchCamera(); // camera switch now in flight

      await expect(capturedActions().suspend()).rejects.toThrow();
      // Rejected by the guard before its body ran — the freeze toast never fires.
      expect(toast.warning).not.toHaveBeenCalled();

      await act(async () => {
        resolveSwitch();
        await Promise.resolve();
      });
    });

    it('an in-flight auto-suspend blocks a concurrent camera switch from calling switchCamera', async () => {
      storeState.controls = { audioEnabled: true, videoEnabled: true };
      setupCameraSwitchFixture();

      render(<VideoCallInterface callId="call1" />);
      // Resolve the switch-camera button first (it only appears once the
      // fixture's mocked enumerateDevices() settles) so the exclusivity
      // check below is not itself racing that unrelated async gap.
      const button = await screen.findByRole('button', { name: 'controls.switchCamera' });

      // suspend()'s guarded body has no await of its own, so it runs to
      // completion synchronously; the guard's ref is only released on the
      // NEXT microtask (the `finally` after `await op()`) — so it is still
      // held for the camera-switch click fired here, in the same tick.
      const suspendPromise = capturedActions().suspend();
      fireEvent.click(button);

      expect(webrtc.switchCamera).not.toHaveBeenCalled();

      await act(async () => {
        await suspendPromise;
      });
    });
  });

  // W6 (`tasks/2026-08-13-group-calls-gap-analysis.md`) — moderator "remove
  // from call". Conversation role lives on `useConversationQuery`'s
  // `Participant[]`, never on `CallParticipant` (that `role` is call-session
  // initiator/participant, unrelated to conversation membership).
  describe('moderator "remove from call" (W6)', () => {
    const groupModeratorConversation = {
      id: 'conv1',
      type: 'group',
      participants: [
        { userId: 'u1', role: 'moderator' },
        { userId: 'peer1', role: 'member' },
      ],
    };

    beforeEach(() => {
      storeState.remoteStreams = new Map([['peer1', {} as MediaStream]]);
      storeState.currentCall = {
        id: 'call1',
        conversationId: 'conv1',
        startedAt: new Date().toISOString(),
        initiatorId: 'other',
        participants: [
          { userId: 'u1', username: 'Me', leftAt: null, isAudioEnabled: true, isVideoEnabled: true },
          { userId: 'peer1', username: 'Peer', leftAt: null, isAudioEnabled: true, isVideoEnabled: true },
        ],
      };
      (callsService.removeParticipant as jest.Mock).mockResolvedValue({ success: true, data: {} });
    });

    afterEach(() => {
      storeState.remoteStreams = new Map();
      (useConversationQuery as jest.Mock).mockReturnValue({ data: undefined });
    });

    it('does not expose a kick control while the conversation role has not resolved yet', () => {
      (useConversationQuery as jest.Mock).mockReturnValue({ data: undefined });
      render(<VideoCallInterface callId="call1" />);
      expect(screen.getByTestId('remote-video-stream')).toHaveAttribute('data-has-kick', 'false');
    });

    it('does not expose a kick control for a plain member', () => {
      (useConversationQuery as jest.Mock).mockReturnValue({
        data: {
          ...groupModeratorConversation,
          participants: [
            { userId: 'u1', role: 'member' },
            { userId: 'peer1', role: 'member' },
          ],
        },
      });
      render(<VideoCallInterface callId="call1" />);
      expect(screen.getByTestId('remote-video-stream')).toHaveAttribute('data-has-kick', 'false');
    });

    it('does not expose a kick control in a direct conversation, even for a moderator role', () => {
      (useConversationQuery as jest.Mock).mockReturnValue({
        data: { ...groupModeratorConversation, type: 'direct' },
      });
      render(<VideoCallInterface callId="call1" />);
      expect(screen.getByTestId('remote-video-stream')).toHaveAttribute('data-has-kick', 'false');
    });

    it('exposes a kick control for a group-call moderator', () => {
      (useConversationQuery as jest.Mock).mockReturnValue({ data: groupModeratorConversation });
      render(<VideoCallInterface callId="call1" />);
      expect(screen.getByTestId('remote-video-stream')).toHaveAttribute('data-has-kick', 'true');
    });

    it('calls callsService.removeParticipant with the call id and the target user id', async () => {
      (useConversationQuery as jest.Mock).mockReturnValue({ data: groupModeratorConversation });
      render(<VideoCallInterface callId="call1" />);

      fireEvent.click(screen.getByText('mock-kick'));

      await waitFor(() => {
        expect(callsService.removeParticipant).toHaveBeenCalledWith('call1', 'peer1');
      });
    });

    it('shows a success toast and does not itself mutate the call store — the existing PARTICIPANT_LEFT listener reconciles state for everyone', async () => {
      (useConversationQuery as jest.Mock).mockReturnValue({ data: groupModeratorConversation });
      render(<VideoCallInterface callId="call1" />);

      fireEvent.click(screen.getByText('mock-kick'));

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalledWith('toasts.participantRemoved');
      });
      expect(storeState.removeRemoteStream).not.toHaveBeenCalled();
      expect(storeState.removePeerConnection).not.toHaveBeenCalled();
    });

    it('shows an error toast when the removal request is rejected (e.g. permission denied)', async () => {
      (useConversationQuery as jest.Mock).mockReturnValue({ data: groupModeratorConversation });
      (callsService.removeParticipant as jest.Mock).mockRejectedValue(new Error('PERMISSION_DENIED'));
      render(<VideoCallInterface callId="call1" />);

      fireEvent.click(screen.getByText('mock-kick'));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('toasts.removeParticipantFailed');
      });
    });
  });

  describe('handleWebRTCError — known internal error codes get a translated toast, not the raw code (Vague 149)', () => {
    it('translates PEER_CONNECTION_FAILED instead of leaking the raw code', () => {
      render(<VideoCallInterface callId="call1" />);

      act(() => capturedWebRTCConfig.onError?.(new Error('PEER_CONNECTION_FAILED')));

      expect(toast.error).toHaveBeenCalledWith('toasts.peerConnectionFailed');
      expect(toast.error).not.toHaveBeenCalledWith(expect.stringContaining('PEER_CONNECTION_FAILED'));
    });

    it('translates ICE_CONNECTION_FAILED instead of leaking the raw code', () => {
      render(<VideoCallInterface callId="call1" />);

      act(() => capturedWebRTCConfig.onError?.(new Error('ICE_CONNECTION_FAILED')));

      expect(toast.error).toHaveBeenCalledWith('toasts.iceConnectionFailed');
      expect(toast.error).not.toHaveBeenCalledWith(expect.stringContaining('ICE_CONNECTION_FAILED'));
    });

    it('falls back to the generic connectionError prefix + raw message for an unrecognized error (debuggability non-regression)', () => {
      render(<VideoCallInterface callId="call1" />);

      act(() => capturedWebRTCConfig.onError?.(new Error('SOME_UNKNOWN_CODE')));

      expect(toast.error).toHaveBeenCalledWith('toasts.connectionError: SOME_UNKNOWN_CODE');
    });
  });

  describe('handleWebRTCConnected — the call-connected success toast is translated, not hardcoded English (Vague 153)', () => {
    it('shows a translated toast when the hook reports the call connected', () => {
      render(<VideoCallInterface callId="call1" />);

      act(() => capturedWebRTCConfig.onConnected?.());

      expect(toast.success).toHaveBeenCalledWith('toasts.connected');
      expect(toast.success).not.toHaveBeenCalledWith('Connected!');
    });
  });
});
