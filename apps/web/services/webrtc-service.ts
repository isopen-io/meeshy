/**
 * WEBRTC SERVICE
 * Phase 1A: P2P Video Calls MVP
 *
 * Manages WebRTC peer connections, media streams, and signaling
 */

'use client';

import { logger } from '@/utils/logger';

// Default ICE servers for STUN
const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

// Default media constraints - optimized for mobile Safari compatibility
const DEFAULT_MEDIA_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
  video: {
    width: { ideal: 640, max: 1280 },
    height: { ideal: 480, max: 720 },
    frameRate: { ideal: 24, max: 30 },
    facingMode: 'user', // Use front camera by default on mobile
  },
};

export interface WebRTCServiceConfig {
  iceServers?: RTCIceServer[];
  onIceCandidate?: (candidate: RTCIceCandidate) => void;
  onTrack?: (event: RTCTrackEvent) => void;
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  onIceConnectionStateChange?: (state: RTCIceConnectionState) => void;
  onError?: (error: Error) => void;
}

export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private config: WebRTCServiceConfig;
  private participantId: string | null = null;

  constructor(config: WebRTCServiceConfig = {}) {
    this.config = {
      iceServers: DEFAULT_ICE_SERVERS,
      ...config,
    };
  }

  /**
   * Initialize peer connection with ICE servers
   */
  createPeerConnection(participantId: string): RTCPeerConnection {
    try {
      logger.debug('[WebRTCService] Creating peer connection', { participantId });

      this.participantId = participantId;

      // Create RTCPeerConnection
      this.peerConnection = new RTCPeerConnection({
        iceServers: this.config.iceServers,
      });

      // Setup event listeners
      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          logger.debug('[WebRTCService] ICE candidate generated', {
            participantId,
            candidate: event.candidate.candidate,
          });
          this.config.onIceCandidate?.(event.candidate);
        }
      };

      this.peerConnection.ontrack = (event) => {
        logger.debug('[WebRTCService] Remote track received', {
          participantId,
          trackKind: event.track.kind,
        });
        this.config.onTrack?.(event);
      };

      this.peerConnection.onconnectionstatechange = () => {
        const state = this.peerConnection?.connectionState;
        logger.debug('[WebRTCService] Connection state changed', {
          participantId,
          state,
        });
        if (state) {
          this.config.onConnectionStateChange?.(state);
        }
      };

      this.peerConnection.oniceconnectionstatechange = () => {
        const state = this.peerConnection?.iceConnectionState;
        logger.debug('[WebRTCService] ICE connection state changed', {
          participantId,
          state,
        });
        if (state) {
          this.config.onIceConnectionStateChange?.(state);

          // Handle ICE failures - attempt restart
          if (state === 'failed') {
            logger.error('[WebRTCService] ICE connection failed, attempting restart...', {
              participantId,
              state,
            });

            // Attempt ICE restart
            this.restartIce().catch((error) => {
              logger.error('[WebRTCService] ICE restart attempt failed', { error });
            });
          } else if (state === 'disconnected') {
            logger.warn('[WebRTCService] ICE connection disconnected', {
              participantId,
              state,
            });
            // Note: disconnected state can recover on its own, so we don't restart immediately
          }
        }
      };

      this.peerConnection.onnegotiationneeded = () => {
        logger.debug('[WebRTCService] Negotiation needed', { participantId });
      };

      logger.info('[WebRTCService] Peer connection created successfully', { participantId });
      return this.peerConnection;
    } catch (error) {
      logger.error('[WebRTCService] Failed to create peer connection', { error });
      const err = error instanceof Error ? error : new Error('Unknown error');
      this.config.onError?.(err);
      throw err;
    }
  }

  /**
   * Get user media (camera + microphone)
   * iOS Safari compatible with fallbacks and proper error handling
   */
  async getLocalStream(constraints?: MediaStreamConstraints): Promise<MediaStream> {
    try {
      logger.debug('[WebRTCService] Requesting user media', { constraints });

      // CRITICAL: Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        // Check if we're in a secure context
        const isSecure = window.isSecureContext;
        const protocol = window.location.protocol;

        logger.error('[WebRTCService] getUserMedia not available', {
          hasMediaDevices: !!navigator.mediaDevices,
          isSecureContext: isSecure,
          protocol
        });

        // Provide helpful error message
        if (!isSecure || protocol === 'http:') {
          const err = new Error(
            'Camera/microphone access requires HTTPS. ' +
            'Please access the app via https:// instead of http://'
          );
          this.config.onError?.(err);
          throw err;
        }

        const err = new Error(
          'Your browser does not support camera/microphone access. ' +
          'Please update to the latest version of Safari or use a different browser.'
        );
        this.config.onError?.(err);
        throw err;
      }

      const mediaConstraints = constraints || DEFAULT_MEDIA_CONSTRAINTS;

      // iOS Safari specific: Log constraints for debugging
      logger.debug('[WebRTCService] iOS getUserMedia constraints', {
        constraints: mediaConstraints,
        userAgent: navigator.userAgent,
        isSecureContext: window.isSecureContext
      });

      // Request permissions
      this.localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints);

      logger.info('[WebRTCService] Local stream obtained', {
        audioTracks: this.localStream.getAudioTracks().length,
        videoTracks: this.localStream.getVideoTracks().length,
      });

      return this.localStream;
    } catch (error) {
      logger.error('[WebRTCService] Failed to get user media', { error });

      // Handle specific errors with user-friendly messages
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          const err = new Error(
            'Camera/microphone permission denied. ' +
            'Please allow access in Safari settings: Settings > Safari > Camera & Microphone'
          );
          this.config.onError?.(err);
          throw err;
        } else if (error.name === 'NotFoundError') {
          const err = new Error(
            'No camera or microphone found on your device. ' +
            'Please check your device hardware.'
          );
          this.config.onError?.(err);
          throw err;
        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
          const err = new Error(
            'Camera/microphone is already in use by another app. ' +
            'Please close other apps using the camera/microphone.'
          );
          this.config.onError?.(err);
          throw err;
        } else if (error.name === 'OverconstrainedError') {
          const err = new Error(
            'Your device does not support the requested video/audio quality. ' +
            'Please try again.'
          );
          this.config.onError?.(err);
          throw err;
        } else if (error.name === 'TypeError') {
          const err = new Error(
            'Invalid media constraints. Please try again or contact support.'
          );
          this.config.onError?.(err);
          throw err;
        }
      }

      // Generic error
      const err = error instanceof Error
        ? error
        : new Error('Failed to access camera/microphone. Please check your device permissions.');
      this.config.onError?.(err);
      throw err;
    }
  }

  /**
   * Create WebRTC offer (SDP)
   */
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    try {
      if (!this.peerConnection) {
        throw new Error('Peer connection not initialized');
      }

      logger.debug('[WebRTCService] Creating offer', { participantId: this.participantId });

      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });

      await this.peerConnection.setLocalDescription(offer);

      logger.info('[WebRTCService] Offer created and set as local description', {
        participantId: this.participantId,
      });

      return offer;
    } catch (error) {
      logger.error('[WebRTCService] Failed to create offer', { error });
      const err = error instanceof Error ? error : new Error('Failed to create offer');
      this.config.onError?.(err);
      throw err;
    }
  }

  /**
   * Create WebRTC answer (SDP)
   */
  async createAnswer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    try {
      if (!this.peerConnection) {
        throw new Error('Peer connection not initialized');
      }

      logger.debug('[WebRTCService] Creating answer', { participantId: this.participantId });

      // Set remote description (offer)
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

      // Create answer
      const answer = await this.peerConnection.createAnswer();

      // Set local description (answer)
      await this.peerConnection.setLocalDescription(answer);

      logger.info('[WebRTCService] Answer created and set as local description', {
        participantId: this.participantId,
      });

      return answer;
    } catch (error) {
      logger.error('[WebRTCService] Failed to create answer', { error });
      const err = error instanceof Error ? error : new Error('Failed to create answer');
      this.config.onError?.(err);
      throw err;
    }
  }

  /**
   * Set remote description (answer)
   */
  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    try {
      if (!this.peerConnection) {
        throw new Error('Peer connection not initialized');
      }

      logger.debug('[WebRTCService] Setting remote description', {
        participantId: this.participantId,
        type: description.type,
      });

      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(description));

      logger.info('[WebRTCService] Remote description set successfully', {
        participantId: this.participantId,
      });
    } catch (error) {
      logger.error('[WebRTCService] Failed to set remote description', { error });
      const err = error instanceof Error ? error : new Error('Failed to set remote description');
      this.config.onError?.(err);
      throw err;
    }
  }

  /**
   * Add ICE candidate
   */
  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    try {
      if (!this.peerConnection) {
        throw new Error('Peer connection not initialized');
      }

      logger.debug('[WebRTCService] Adding ICE candidate', {
        participantId: this.participantId,
        candidate: candidate.candidate,
      });

      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));

      logger.debug('[WebRTCService] ICE candidate added successfully', {
        participantId: this.participantId,
      });
    } catch (error) {
      logger.error('[WebRTCService] Failed to add ICE candidate', { error });
      // Don't throw - ICE candidates can fail individually
    }
  }

  /**
   * Add track to peer connection
   */
  addTrack(track: MediaStreamTrack, stream: MediaStream): RTCRtpSender | null {
    try {
      if (!this.peerConnection) {
        throw new Error('Peer connection not initialized');
      }

      logger.debug('[WebRTCService] Adding track to peer connection', {
        participantId: this.participantId,
        trackKind: track.kind,
      });

      const sender = this.peerConnection.addTrack(track, stream);

      logger.info('[WebRTCService] Track added successfully', {
        participantId: this.participantId,
        trackKind: track.kind,
      });

      return sender;
    } catch (error) {
      logger.error('[WebRTCService] Failed to add track', { error });
      return null;
    }
  }

  /**
   * Replace track (for screen sharing, etc.)
   */
  async replaceTrack(
    sender: RTCRtpSender,
    newTrack: MediaStreamTrack | null
  ): Promise<void> {
    try {
      logger.debug('[WebRTCService] Replacing track', {
        participantId: this.participantId,
        newTrackKind: newTrack?.kind,
      });

      await sender.replaceTrack(newTrack);

      logger.info('[WebRTCService] Track replaced successfully', {
        participantId: this.participantId,
      });
    } catch (error) {
      logger.error('[WebRTCService] Failed to replace track', { error });
      throw error;
    }
  }

  /**
   * Restart ICE connection (for recovering from failures)
   */
  async restartIce(): Promise<void> {
    try {
      if (!this.peerConnection) {
        throw new Error('Peer connection not initialized');
      }

      logger.info('[WebRTCService] Attempting ICE restart', {
        participantId: this.participantId,
      });

      // Create new offer with iceRestart option
      const offer = await this.peerConnection.createOffer({ iceRestart: true });

      // Set as local description
      await this.peerConnection.setLocalDescription(offer);

      logger.info('[WebRTCService] ICE restart offer created', {
        participantId: this.participantId,
      });

      // The offer needs to be sent to the remote peer via signaling
      // This will be handled by the onIceCandidate callback
      if (this.config.onIceCandidate && offer.sdp) {
        // Note: In a real implementation, you'd send this via your signaling mechanism
        logger.debug('[WebRTCService]', 'ICE restart offer ready to be sent');
      }
    } catch (error) {
      logger.error('[WebRTCService] ICE restart failed', { error });
      const err = error instanceof Error ? error : new Error('ICE restart failed');
      this.config.onError?.(err);
      throw err;
    }
  }

  /**
   * Get connection state
   */
  getConnectionState(): RTCPeerConnectionState | null {
    return this.peerConnection?.connectionState || null;
  }

  /**
   * Get ICE connection state
   */
  getIceConnectionState(): RTCIceConnectionState | null {
    return this.peerConnection?.iceConnectionState || null;
  }

  /**
   * Get peer connection
   */
  getPeerConnection(): RTCPeerConnection | null {
    return this.peerConnection;
  }

  /**
   * Get current local stream (getter)
   */
  getCurrentStream(): MediaStream | null {
    return this.localStream;
  }

  /**
   * Close connection and cleanup
   */
  close(): void {
    logger.debug('[WebRTCService] Closing connection', {
      participantId: this.participantId,
    });

    // Stop all local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        track.stop();
        logger.debug('[WebRTCService] Stopped local track', {
          trackKind: track.kind,
        });
      });
      this.localStream = null;
    }

    // Close peer connection
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.participantId = null;

    logger.info('[WebRTCService] Connection closed and cleaned up');
  }
}
