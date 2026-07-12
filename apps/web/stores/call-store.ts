/**
 * CALL STORE - Zustand State Management
 * Phase 1A: P2P Video Calls MVP
 *
 * Manages call state, streams, peer connections, and controls
 */

'use client';

import { create } from 'zustand';
import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { CLIENT_EVENTS } from '@meeshy/shared/types/socketio-events';
import type {
  CallSession,
  CallParticipant,
  CallControls,
  CallState,
  CallEndReason,
  ConnectionQualityLevel,
} from '@meeshy/shared/types/video-call';

/**
 * Join request posed by the live call bubble (`CallSystemMessage`, message
 * `kind: 'call-live'`). The bubble owns no media/UI — `CallManager` consumes
 * this request: validates the call is still active via
 * `GET /conversations/:id/active-call`, then runs the same accept path as an
 * incoming call. Cold-rehydration-safe: no dependency on a received
 * `call:initiated` event (works after a mid-call page reload).
 */
export interface JoinCallRequest {
  callId: string;
  conversationId: string;
  callType: 'audio' | 'video';
}

interface CallStoreState extends CallState {
  // Extended state
  callEndReason: CallEndReason | null;
  reconnectAttempt: number;
  connectionQuality: ConnectionQualityLevel | null;
  isReconnecting: boolean;
  joinRequest: JoinCallRequest | null;

  // Server-provided ICE servers (STUN + time-limited TURN credentials).
  // Supplied by the gateway via the initiate/join acks and the
  // participant-joined event. MUST be applied to every RTCPeerConnection
  // before it is created, otherwise calls fall back to STUN-only and fail
  // between peers behind symmetric NATs.
  iceServers: RTCIceServer[] | null;

  // Actions: Call management
  setIceServers: (iceServers: RTCIceServer[]) => void;
  setCurrentCall: (call: CallSession | null) => void;
  updateCallStatus: (status: CallSession['status']) => void;
  addParticipant: (participant: CallParticipant) => void;
  removeParticipant: (participantId: string) => void;
  updateParticipant: (participantId: string, updates: Partial<CallParticipant>) => void;

  // Actions: WebRTC streams
  setLocalStream: (stream: MediaStream | null) => void;
  addRemoteStream: (participantId: string, stream: MediaStream) => void;
  removeRemoteStream: (participantId: string) => void;
  clearRemoteStreams: () => void;

  // Actions: Peer connections
  addPeerConnection: (participantId: string, connection: RTCPeerConnection) => void;
  removePeerConnection: (participantId: string) => void;
  clearPeerConnections: () => void;

  // Actions: Controls
  toggleAudio: () => void;
  toggleVideo: () => void;
  toggleScreenShare: () => void;
  setControls: (controls: Partial<CallControls>) => void;

  // Actions: UI state
  setConnecting: (isConnecting: boolean) => void;
  setInCall: (isInCall: boolean) => void;
  setError: (error: string | null) => void;

  // Actions: Heartbeat
  startHeartbeat: (callId: string) => void;
  stopHeartbeat: () => void;

  // Actions: Reconnection
  setReconnecting: (attempt: number) => void;

  // Actions: Connection quality
  setConnectionQuality: (quality: ConnectionQualityLevel) => void;

  // Actions: End reason
  setCallEndReason: (reason: CallEndReason) => void;

  // Actions: Join an ongoing call from its live message bubble
  requestJoin: (request: JoinCallRequest) => void;
  clearJoinRequest: () => void;

  // Actions: Cleanup
  reset: () => void;
}

const HEARTBEAT_INTERVAL_MS = 15_000;

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
let beforeUnloadHandler: (() => void) | null = null;

// Buffer for `call:participant-joined` payloads that arrive while
// `currentCall` is still null — the initiator's own `call:initiate` ack
// (use-video-call.ts, P0 fix 2026-07-06) sets `currentCall` asynchronously,
// so a fast callee can legitimately join (and broadcast participant-joined)
// before that ack lands. Without this buffer, `addParticipant` used to no-op
// and the join was lost forever once the ack later overwrote `currentCall`
// with an empty participants array — the initiator would never create a
// WebRTC offer for a callee who had, in fact, already joined. Claimed and
// cleared by `setCurrentCall` once the matching call becomes current.
const pendingParticipantsByCallId = new Map<string, CallParticipant[]>();

const initialState: CallState = {
  // Current call
  currentCall: null,

  // WebRTC connections
  localStream: null,
  remoteStreams: new Map<string, MediaStream>(),

  // Peer connections (P2P mode)
  peerConnections: new Map<string, RTCPeerConnection>(),

  // SFU state (Phase 1B)
  sfuDevice: null,
  sfuTransport: null,

  // UI state
  controls: {
    audioEnabled: true,
    videoEnabled: true,
    screenShareEnabled: false,
  },
  isConnecting: false,
  isInCall: false,
  error: null,

  // Transcription state (Phase 2A/2B)
  transcriptions: [],
  isTranscribing: false,

  // Translation state (Phase 3)
  translations: new Map<string, any[]>(),
};

export const useCallStore = create<CallStoreState>((set, get) => ({
  ...initialState,

  // Extended state defaults
  callEndReason: null,
  reconnectAttempt: 0,
  connectionQuality: null,
  isReconnecting: false,
  iceServers: null,
  joinRequest: null,

  // ===== CALL MANAGEMENT =====

  setIceServers: (iceServers) => set({ iceServers }),

  setCurrentCall: (call) => {
    let nextCall = call;
    if (call) {
      const pending = pendingParticipantsByCallId.get(call.id);
      if (pending?.length) {
        pendingParticipantsByCallId.delete(call.id);
        const participants = [...call.participants];
        for (const participant of pending) {
          const existingIndex = participants.findIndex((p) => p.id === participant.id);
          if (existingIndex >= 0) {
            participants[existingIndex] = participant;
          } else {
            participants.push(participant);
          }
        }
        nextCall = { ...call, participants };
      }
    }
    set({ currentCall: nextCall });
    if (nextCall) {
      set({ isInCall: true, error: null });
    }
  },

  updateCallStatus: (status) => {
    const { currentCall } = get();
    if (currentCall) {
      set({
        currentCall: {
          ...currentCall,
          status,
        },
      });
    }
  },

  addParticipant: (participant) => {
    const { currentCall } = get();
    if (!currentCall) {
      // Buffer instead of dropping — see `pendingParticipantsByCallId` above.
      // `setCurrentCall` claims this entry once `call.id` matches.
      if (!participant.callSessionId) return;
      const pending = pendingParticipantsByCallId.get(participant.callSessionId) ?? [];
      const existingIndex = pending.findIndex((p) => p.id === participant.id);
      if (existingIndex >= 0) {
        pending[existingIndex] = participant;
      } else {
        pending.push(participant);
      }
      pendingParticipantsByCallId.set(participant.callSessionId, pending);
      return;
    }

    const participants = [...currentCall.participants];
    const existingIndex = participants.findIndex((p) => p.id === participant.id);

    if (existingIndex >= 0) {
      participants[existingIndex] = participant;
    } else {
      participants.push(participant);
    }

    set({
      currentCall: {
        ...currentCall,
        participants,
      },
    });
  },

  removeParticipant: (participantId) => {
    const { currentCall } = get();
    if (currentCall) {
      set({
        currentCall: {
          ...currentCall,
          participants: currentCall.participants.filter((p) => p.id !== participantId),
        },
      });
    }
  },

  updateParticipant: (participantId, updates) => {
    const { currentCall } = get();
    if (currentCall) {
      const participants = currentCall.participants.map((p) =>
        p.id === participantId ? { ...p, ...updates } : p
      );

      set({
        currentCall: {
          ...currentCall,
          participants,
        },
      });
    }
  },

  // ===== WEBRTC STREAMS =====

  setLocalStream: (stream) => {
    // Stop existing tracks if replacing stream
    const { localStream } = get();
    if (localStream && stream !== localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }

    set({ localStream: stream });
  },

  addRemoteStream: (participantId, stream) => {
    const { remoteStreams } = get();
    const newStreams = new Map(remoteStreams);
    newStreams.set(participantId, stream);
    set({ remoteStreams: newStreams });
  },

  removeRemoteStream: (participantId) => {
    const { remoteStreams } = get();
    const stream = remoteStreams.get(participantId);

    // Stop all tracks
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    const newStreams = new Map(remoteStreams);
    newStreams.delete(participantId);
    set({ remoteStreams: newStreams });
  },

  clearRemoteStreams: () => {
    const { remoteStreams } = get();

    // Stop all tracks in all streams
    remoteStreams.forEach((stream) => {
      stream.getTracks().forEach((track) => track.stop());
    });

    set({ remoteStreams: new Map() });
  },

  // ===== PEER CONNECTIONS =====

  addPeerConnection: (participantId, connection) => {
    const { peerConnections } = get();
    const newConnections = new Map(peerConnections);
    newConnections.set(participantId, connection);
    set({ peerConnections: newConnections });
  },

  removePeerConnection: (participantId) => {
    const { peerConnections } = get();
    const connection = peerConnections.get(participantId);

    // Close connection
    if (connection) {
      connection.close();
    }

    const newConnections = new Map(peerConnections);
    newConnections.delete(participantId);
    set({ peerConnections: newConnections });
  },

  clearPeerConnections: () => {
    const { peerConnections } = get();

    // Close all connections
    peerConnections.forEach((connection) => {
      connection.close();
    });

    set({ peerConnections: new Map() });
  },

  // ===== CONTROLS =====

  toggleAudio: () => {
    const { controls, localStream } = get();
    const newEnabled = !controls.audioEnabled;

    // Toggle audio tracks
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = newEnabled;
      });
    }

    set({
      controls: {
        ...controls,
        audioEnabled: newEnabled,
      },
    });
  },

  toggleVideo: () => {
    const { controls, localStream } = get();
    const newEnabled = !controls.videoEnabled;

    // Toggle video tracks
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = newEnabled;
      });
    }

    set({
      controls: {
        ...controls,
        videoEnabled: newEnabled,
      },
    });
  },

  toggleScreenShare: () => {
    const { controls } = get();
    set({
      controls: {
        ...controls,
        screenShareEnabled: !controls.screenShareEnabled,
      },
    });
  },

  setControls: (newControls) => {
    const { controls } = get();
    set({
      controls: {
        ...controls,
        ...newControls,
      },
    });
  },

  // ===== UI STATE =====

  setConnecting: (isConnecting) => set({ isConnecting }),

  setInCall: (isInCall) => set({ isInCall }),

  setError: (error) => set({ error }),

  // ===== HEARTBEAT =====

  startHeartbeat: (callId) => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }

    heartbeatInterval = setInterval(() => {
      const socket = meeshySocketIOService.getSocket();
      if (socket?.connected) {
        socket.emit(CLIENT_EVENTS.CALL_HEARTBEAT, { callId });
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Register beforeunload handler to end call on tab close (M3)
    if (beforeUnloadHandler) {
      window.removeEventListener('beforeunload', beforeUnloadHandler);
    }
    beforeUnloadHandler = () => {
      const socket = meeshySocketIOService.getSocket();
      if (socket?.connected) {
        socket.emit(CLIENT_EVENTS.CALL_END, { callId, reason: 'completed' }, () => {});
      }
      // No sendBeacon fallback: sendBeacon can only POST and cannot carry the
      // Authorization header the DELETE /calls/:callId route requires, and
      // there is no POST /calls/:callId/end route to target anyway — a
      // previous fallback here silently 404'd. Tab-close cleanup when the
      // emit above doesn't land relies on the gateway's disconnect +
      // reconnect-grace-window path (CallEventsHandler.armDisconnectGrace).
    };
    window.addEventListener('beforeunload', beforeUnloadHandler);
  },

  stopHeartbeat: () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    if (beforeUnloadHandler) {
      window.removeEventListener('beforeunload', beforeUnloadHandler);
      beforeUnloadHandler = null;
    }
  },

  // ===== RECONNECTION =====

  setReconnecting: (attempt) => {
    set({
      isReconnecting: attempt > 0,
      reconnectAttempt: attempt,
    });
  },

  // ===== CONNECTION QUALITY =====

  setConnectionQuality: (quality) => {
    set({ connectionQuality: quality });
  },

  // ===== END REASON =====

  setCallEndReason: (reason) => {
    set({ callEndReason: reason });
  },

  // ===== JOIN FROM LIVE CALL BUBBLE =====

  requestJoin: (request) => {
    // Already in a call (this one or another) — the bubble tap is a no-op;
    // joining pre-answer or double-joining is never driven from here.
    if (get().isInCall) {
      return;
    }
    set({ joinRequest: request });
  },

  clearJoinRequest: () => set({ joinRequest: null }),

  // ===== CLEANUP =====

  reset: () => {
    const state = get();

    // Stop heartbeat and beforeunload handler
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    if (beforeUnloadHandler) {
      window.removeEventListener('beforeunload', beforeUnloadHandler);
      beforeUnloadHandler = null;
    }

    // Stop local stream
    if (state.localStream) {
      state.localStream.getTracks().forEach((track) => track.stop());
    }

    // Stop remote streams
    state.remoteStreams.forEach((stream) => {
      stream.getTracks().forEach((track) => track.stop());
    });

    // Close peer connections
    state.peerConnections.forEach((connection) => {
      connection.close();
    });

    // Drop any unclaimed buffered participant-joined events (e.g. a call
    // that was cancelled/rejected before its initiate ack ever landed).
    pendingParticipantsByCallId.clear();

    // Reset to initial state
    set({
      ...initialState,
      remoteStreams: new Map(),
      peerConnections: new Map(),
      translations: new Map(),
      callEndReason: null,
      reconnectAttempt: 0,
      connectionQuality: null,
      isReconnecting: false,
      iceServers: null,
      joinRequest: null,
    });
  },
}));
