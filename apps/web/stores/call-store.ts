/**
 * CALL STORE - Zustand State Management
 * Phase 1A: P2P Video Calls MVP
 *
 * Manages call state, streams, peer connections, and controls
 */

'use client';

import { create } from 'zustand';
import type {
  CallSession,
  CallParticipant,
  CallControls,
  CallState,
} from '@meeshy/shared/types/video-call';

interface CallStoreState extends CallState {
  // Actions: Call management
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

  // Actions: Cleanup
  reset: () => void;
}

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

  // ===== CALL MANAGEMENT =====

  setCurrentCall: (call) => {
    set({ currentCall: call });
    if (call) {
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
    if (currentCall) {
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
    }
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

  // ===== CLEANUP =====

  reset: () => {
    const state = get();

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

    // Reset to initial state
    set({
      ...initialState,
      remoteStreams: new Map(),
      peerConnections: new Map(),
      translations: new Map(),
    });
  },
}));
