/**
 * WEBRTC SERVICE
 * Phase 1A: P2P Video Calls MVP
 *
 * Manages WebRTC peer connections, media streams, and signaling
 */

'use client';

import { logger } from '@/utils/logger';
import type { ConnectionQualityLevel } from '@meeshy/shared/types/video-call';

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
  onConnectionQualityChange?: (quality: ConnectionQualityLevel) => void;
  onError?: (error: Error) => void;
  /**
   * Emitted whenever the service produces a local SDP that must be relayed to
   * the remote peer OUTSIDE the initial explicit offer/answer flow — i.e. for
   * renegotiation (audio↔video switch) and ICE restart. The initial offer and
   * answer are still returned by createOffer()/createAnswer() for the caller to
   * send. Without this, ICE restart and mid-call media changes never reach the
   * peer (the old restartIce() created an offer but dropped it on the floor).
   */
  onLocalDescription?: (description: RTCSessionDescriptionInit) => void;
}

/**
 * Adaptive video encoding ladder. Driven by the quality control loop: under
 * sustained loss/RTT we drop bitrate/resolution (compression that preserves
 * perceived quality by shedding resolution before framerate — see
 * degradationPreference 'maintain-framerate').
 */
export type VideoQualityTier = 'high' | 'medium' | 'low' | 'audio-only';

const VIDEO_ENCODING_LADDER: Record<
  Exclude<VideoQualityTier, 'audio-only'>,
  { maxBitrate: number; maxFramerate: number; scaleResolutionDownBy: number }
> = {
  high: { maxBitrate: 1_500_000, maxFramerate: 30, scaleResolutionDownBy: 1 },
  medium: { maxBitrate: 600_000, maxFramerate: 25, scaleResolutionDownBy: 2 },
  low: { maxBitrate: 250_000, maxFramerate: 15, scaleResolutionDownBy: 4 },
};

const QUALITY_MONITOR_INTERVAL_MS = 3_000;
// Grace window before an ICE 'disconnected' escalates to a restart.
const ICE_DISCONNECT_GRACE_MS = 3_000;

export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private config: WebRTCServiceConfig;
  private participantId: string | null = null;
  private qualityMonitorInterval: ReturnType<typeof setInterval> | null = null;
  private serverIceServers: RTCIceServer[] | null = null;

  // Perfect-negotiation state (W3C pattern). The polite peer yields on glare;
  // the impolite peer wins. Role is assigned deterministically from the two
  // user ids so both peers compute the same answer without coordination.
  private polite = false;
  private makingOffer = false;
  private isSettingRemoteAnswerPending = false;
  private ignoreOffer = false;
  // Auto-renegotiation (onnegotiationneeded → negotiate) is suppressed during
  // the initial explicit offer/answer to avoid a duplicate first offer. It is
  // armed once the connection is established so mid-call media changes (A/V
  // switch) renegotiate automatically.
  private autoNegotiate = false;
  // Stable handle to the (always pre-allocated) video transceiver so an
  // audio-only call can be upgraded to video by flipping direction + attaching
  // a track — never by addTransceiver mid-call (which desyncs m-line order).
  private videoTransceiver: RTCRtpTransceiver | null = null;
  private currentVideoTier: VideoQualityTier = 'high';
  // Grace timer for a transient ICE 'disconnected' before escalating to an ICE
  // restart. A blip often self-heals within a couple of seconds; restarting
  // immediately causes needless churn.
  private disconnectGraceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: WebRTCServiceConfig = {}) {
    this.config = {
      iceServers: DEFAULT_ICE_SERVERS,
      ...config,
    };
  }

  setIceServers(iceServers: RTCIceServer[]): void {
    this.serverIceServers = iceServers;
    // RC-1: TURN credentials can resolve/refresh AFTER createPeerConnection()
    // already ran (e.g. socket ack racing local-stream setup). Without this,
    // the live RTCPeerConnection keeps the STUN-only/stale servers it was
    // constructed with for the rest of the call, and a symmetric-NAT peer can
    // never gather a TURN relay candidate.
    if (this.peerConnection) {
      this.peerConnection.setConfiguration({ iceServers });
    }
  }

  /**
   * Assign the perfect-negotiation role deterministically. Both peers call this
   * with (localUserId, remoteUserId); the lexicographically smaller id is the
   * polite peer. Identical result on both sides, no signaling required.
   */
  setNegotiationRole(localUserId: string, remoteUserId: string): void {
    this.polite = localUserId < remoteUserId;
  }

  isPolite(): boolean {
    return this.polite;
  }

  /**
   * Munge SDP to set Opus codec parameters for high-quality audio
   * (maxaveragebitrate=128000, stereo=1, useinbandfec=1, usedtx=1, maxplaybackrate=48000)
   */
  private mungeOpusSdp(sdp: string): string {
    return sdp.replace(
      /a=fmtp:(\d+) (.+)/g,
      (_match, payloadType, existingParams) => {
        const opusParams = new Map<string, string>();
        existingParams.split(';').forEach((param: string) => {
          const [key, value] = param.trim().split('=');
          if (key && value) opusParams.set(key, value);
        });

        opusParams.set('maxaveragebitrate', '128000');
        opusParams.set('stereo', '1');
        opusParams.set('useinbandfec', '1');
        opusParams.set('usedtx', '1');
        opusParams.set('maxplaybackrate', '48000');

        const params = Array.from(opusParams.entries())
          .map(([k, v]) => `${k}=${v}`)
          .join(';');
        return `a=fmtp:${payloadType} ${params}`;
      }
    );
  }

  /**
   * Add RED (Redundant Encoding) for audio packet loss recovery.
   * Wraps Opus in RED at ~20% bandwidth cost for ~50% packet loss resilience.
   */
  private addAudioRedundancy(sdp: string): string {
    const opusMatch = sdp.match(/a=rtpmap:(\d+) opus\/48000\/2/);
    if (!opusMatch) return sdp;
    const opusPT = opusMatch[1];
    const redPT = '63';

    if (sdp.includes('red/48000')) return sdp;

    const lines = sdp.split('\r\n');
    const result: string[] = [];

    for (const line of lines) {
      if (line.startsWith('m=audio ')) {
        const parts = line.split(' ');
        if (parts.length >= 4 && !parts.includes(redPT)) {
          const [m, port, proto, ...payloads] = parts;
          result.push([m, port, proto, redPT, ...payloads].join(' '));
          continue;
        }
      }

      result.push(line);

      if (line === `a=rtpmap:${opusPT} opus/48000/2`) {
        result.push(`a=rtpmap:${redPT} red/48000/2`);
        result.push(`a=fmtp:${redPT} ${opusPT}/${opusPT}`);
      }
    }

    return result.join('\r\n');
  }

  /**
   * Add Transport-CC extension for Google Congestion Control bandwidth estimation.
   */
  private addTransportCC(sdp: string): string {
    const transportCCURI = 'http://www.ietf.org/id/draft-holmer-rmcat-transport-wide-cc-extensions-01';
    if (sdp.includes(transportCCURI)) return sdp;

    const usedIDs = new Set<number>();
    const extmapRegex = /a=extmap:(\d+)/g;
    let m: RegExpExecArray | null;
    while ((m = extmapRegex.exec(sdp)) !== null) {
      usedIDs.add(parseInt(m[1], 10));
    }

    let extID = 5;
    while (usedIDs.has(extID)) extID++;
    const extmapLine = `a=extmap:${extID} ${transportCCURI}`;

    const lines = sdp.split('\r\n');
    const result: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      result.push(lines[i]);
      if (lines[i].startsWith('m=audio ') || lines[i].startsWith('m=video ')) {
        let insertIdx = result.length;
        while (i + 1 < lines.length && !lines[i + 1].startsWith('m=')) {
          i++;
          result.push(lines[i]);
          if (lines[i].startsWith('a=extmap:')) {
            insertIdx = result.length;
          }
        }
        result.splice(insertIdx, 0, extmapLine);
      }
    }

    return result.join('\r\n');
  }

  /**
   * Add bitrate hints to video fmtp lines for better quality control.
   */
  private addVideoBitrateHints(sdp: string): string {
    const lines = sdp.split('\r\n');
    let inVideoSection = false;

    return lines.map((line) => {
      if (line.startsWith('m=video ')) { inVideoSection = true; return line; }
      if (line.startsWith('m=')) { inVideoSection = false; return line; }
      if (inVideoSection && line.startsWith('a=fmtp:') && !line.includes('x-google-max-bitrate')) {
        return `${line};x-google-max-bitrate=2500;x-google-min-bitrate=100`;
      }
      return line;
    }).join('\r\n');
  }

  /**
   * Enable 3-layer simulcast (h/m/l) for the primary video m= section.
   * Prep for SFU Phase 2 -- adds SDP structure for 720p/360p/180p layers.
   */
  enableSimulcast(sdp: string): string {
    const lines = sdp.split('\r\n');
    let firstVideoIdx = -1;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('m=video ')) { firstVideoIdx = i; break; }
    }
    if (firstVideoIdx === -1) return sdp;

    let endOfVideoSection = lines.length;
    for (let i = firstVideoIdx + 1; i < lines.length; i++) {
      if (lines[i].startsWith('m=')) { endOfVideoSection = i; break; }
    }

    const videoSection = lines.slice(firstVideoIdx, endOfVideoSection);
    if (videoSection.some((l) => l.startsWith('a=simulcast:'))) return sdp;

    const simulcastLines = [
      'a=rid:h send',
      'a=rid:m send',
      'a=rid:l send',
      'a=simulcast:send h;m;l',
    ];

    lines.splice(endOfVideoSection, 0, ...simulcastLines);
    return lines.join('\r\n');
  }

  /**
   * Apply all SDP munging: Opus params, RED, Transport-CC, video bitrate hints.
   */
  private mungeSdp(sdp: string): string {
    let munged = this.mungeOpusSdp(sdp);
    munged = this.addAudioRedundancy(munged);
    munged = this.addTransportCC(munged);
    munged = this.addVideoBitrateHints(munged);
    return munged;
  }

  /**
   * Initialize peer connection with ICE servers
   */
  createPeerConnection(participantId: string): RTCPeerConnection {
    try {
      logger.debug('[WebRTCService] Creating peer connection', { participantId });

      this.participantId = participantId;

      // Create RTCPeerConnection (prefer server-provided TURN servers over config defaults)
      this.peerConnection = new RTCPeerConnection({
        iceServers: this.serverIceServers ?? this.config.iceServers,
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

          // Unstable-connection playbook (SOTA):
          //  - 'disconnected' is often a transient blip → wait a short grace
          //    window; only restart if it has not self-healed.
          //  - 'failed' is terminal for the current ICE transport → restart now.
          //  - any healthy state cancels a pending grace timer.
          if (state === 'failed') {
            this.clearDisconnectGraceTimer();
            logger.error('[WebRTCService] ICE connection failed, restarting ICE...', {
              participantId,
              state,
            });
            this.restartIce().catch((error) => {
              logger.error('[WebRTCService] ICE restart attempt failed', { error });
            });
          } else if (state === 'disconnected') {
            logger.warn('[WebRTCService] ICE disconnected, starting grace timer', {
              participantId,
              state,
            });
            this.clearDisconnectGraceTimer();
            this.disconnectGraceTimer = setTimeout(() => {
              this.disconnectGraceTimer = null;
              const current = this.peerConnection?.iceConnectionState;
              if (current === 'disconnected' || current === 'failed') {
                logger.warn('[WebRTCService] ICE still down after grace, restarting ICE', {
                  participantId,
                  current,
                });
                this.restartIce().catch((error) => {
                  logger.error('[WebRTCService] ICE restart after grace failed', { error });
                });
              }
            }, ICE_DISCONNECT_GRACE_MS);
          } else if (state === 'connected' || state === 'completed') {
            this.clearDisconnectGraceTimer();
          }
        }
      };

      this.peerConnection.onnegotiationneeded = () => {
        logger.debug('[WebRTCService] Negotiation needed', { participantId, autoNegotiate: this.autoNegotiate });
        // Only auto-renegotiate once the initial offer/answer is done. The
        // initial negotiation is driven explicitly (createOffer/createAnswer);
        // afterwards a direction change (A/V switch) lands here and must
        // produce a fresh offer through the perfect-negotiation path.
        if (this.autoNegotiate) {
          void this.negotiate();
        }
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

      // No legacy offerToReceiveAudio/Video constraints: the pre-allocated
      // transceivers already declare send/recv intent. Mixing the legacy
      // Plan-B constraints with Unified-Plan transceivers is a known cause of
      // one-way media (duplicate/extra m-sections).
      const offer = await this.peerConnection.createOffer();

      if (offer.sdp) {
        offer.sdp = this.mungeSdp(offer.sdp);
      }

      await this.peerConnection.setLocalDescription(offer);

      // Initial offer is on the wire; arm auto-renegotiation for later media
      // changes (A/V switch fires onnegotiationneeded).
      this.autoNegotiate = true;

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

      if (answer.sdp) {
        answer.sdp = this.mungeSdp(answer.sdp);
      }

      // Set local description (answer)
      await this.peerConnection.setLocalDescription(answer);

      // Initial answer is on the wire; arm auto-renegotiation for later media
      // changes initiated locally (A/V switch).
      this.autoNegotiate = true;

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
   * Replace the video track on the peer connection (for video filters).
   * Pass null to restore the original camera track.
   */
  async replaceVideoTrack(newTrack: MediaStreamTrack | null): Promise<void> {
    if (!this.peerConnection) return;
    const sender = this.peerConnection.getSenders().find(s => s.track?.kind === 'video');
    if (sender) {
      await this.replaceTrack(sender, newTrack);
    }
  }

  /**
   * Restart ICE to recover from a dropped/blocked transport. Unlike the old
   * implementation (which created an offer and silently discarded it), this
   * drives a real renegotiation whose offer is emitted to the peer via
   * onLocalDescription — keeping all streams, senders and transceivers alive.
   */
  async restartIce(): Promise<void> {
    await this.negotiate({ iceRestart: true });
  }

  /**
   * Single offer path for every renegotiation (A/V switch, ICE restart). Guards
   * against re-entrancy (makingOffer) and emits the offer through
   * onLocalDescription so the caller's signaling relays it. The remote applies
   * it via handleRenegotiationOffer (glare-safe).
   */
  async negotiate(options: { iceRestart?: boolean } = {}): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }
    if (this.makingOffer) {
      logger.debug('[WebRTCService] negotiate() skipped: offer already in flight', {
        participantId: this.participantId,
      });
      return;
    }
    try {
      this.makingOffer = true;
      const offer = await this.peerConnection.createOffer(
        options.iceRestart ? { iceRestart: true } : undefined
      );
      if (offer.sdp) {
        offer.sdp = this.mungeSdp(offer.sdp);
      }
      await this.peerConnection.setLocalDescription(offer);
      logger.info('[WebRTCService] Renegotiation offer created', {
        participantId: this.participantId,
        iceRestart: Boolean(options.iceRestart),
      });
      const local = this.peerConnection.localDescription;
      if (local) {
        this.config.onLocalDescription?.({ type: local.type, sdp: local.sdp });
      }
    } catch (error) {
      logger.error('[WebRTCService] negotiate() failed', { error });
      const err = error instanceof Error ? error : new Error('Renegotiation failed');
      this.config.onError?.(err);
      throw err;
    } finally {
      this.makingOffer = false;
    }
  }

  /**
   * Apply a renegotiation OFFER that arrives on an already-established
   * connection (A/V switch or ICE restart from the peer). Implements the W3C
   * perfect-negotiation collision guard: the impolite peer ignores a colliding
   * offer; the polite peer rolls back and accepts it. On success it produces an
   * answer and emits it via onLocalDescription.
   */
  async handleRenegotiationOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }
    const pc = this.peerConnection;
    const readyForOffer =
      !this.makingOffer &&
      (pc.signalingState === 'stable' || this.isSettingRemoteAnswerPending);
    const offerCollision = !readyForOffer;

    this.ignoreOffer = !this.polite && offerCollision;
    if (this.ignoreOffer) {
      logger.warn('[WebRTCService] Ignoring colliding offer (impolite peer)', {
        participantId: this.participantId,
        signalingState: pc.signalingState,
      });
      return;
    }

    try {
      if (offerCollision) {
        // Polite peer yields: roll our local offer back to stable before
        // applying the remote offer.
        await pc.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit);
      }
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      if (answer.sdp) {
        answer.sdp = this.mungeSdp(answer.sdp);
      }
      await pc.setLocalDescription(answer);
      const local = pc.localDescription;
      if (local) {
        this.config.onLocalDescription?.({ type: local.type, sdp: local.sdp });
      }
      logger.info('[WebRTCService] Renegotiation answer sent', {
        participantId: this.participantId,
      });
    } catch (error) {
      logger.error('[WebRTCService] handleRenegotiationOffer failed', { error });
      const err = error instanceof Error ? error : new Error('Renegotiation answer failed');
      this.config.onError?.(err);
      throw err;
    }
  }

  /**
   * Set the remote ANSWER to one of our renegotiation offers. Mirrors
   * setRemoteDescription but maintains the perfect-negotiation pending flag.
   */
  async setRemoteAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }
    try {
      this.isSettingRemoteAnswerPending = true;
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } finally {
      this.isSettingRemoteAnswerPending = false;
    }
  }

  /**
   * Attach local media using PRE-ALLOCATED transceivers. Audio is always
   * sendrecv. Video is ALWAYS reserved as an m-line — sendrecv (with the camera
   * track) when the call starts as video, recvonly (no track) for an audio-only
   * call — so it can later be upgraded by flipping direction + replaceTrack
   * without an addTransceiver (which would reorder m-lines).
   */
  addLocalMedia(stream: MediaStream, options: { sendVideo: boolean }): void {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }
    this.localStream = stream;
    const audioTrack = stream.getAudioTracks()[0] ?? null;
    const videoTrack = stream.getVideoTracks()[0] ?? null;

    this.peerConnection.addTransceiver(audioTrack ?? 'audio', {
      direction: 'sendrecv',
      streams: [stream],
    });

    if (options.sendVideo && videoTrack) {
      // Hint the encoder toward camera content (drop resolution before
      // framerate under constraint).
      try { videoTrack.contentHint = 'motion'; } catch { /* not supported */ }
      this.videoTransceiver = this.peerConnection.addTransceiver(videoTrack, {
        direction: 'sendrecv',
        streams: [stream],
      });
    } else {
      // Reserve the video m-line without lighting the camera/LED.
      this.videoTransceiver = this.peerConnection.addTransceiver('video', {
        direction: 'recvonly',
      });
    }
  }

  /**
   * Upgrade an audio call to video (or re-enable the camera): attach the track
   * to the reserved video transceiver and flip it to sendrecv. The direction
   * change fires onnegotiationneeded → negotiate(), so the peer receives a
   * fresh offer and starts rendering our tile. FaceTime-style asymmetric — we
   * control our own outbound video only.
   */
  async enableVideoSend(track: MediaStreamTrack): Promise<void> {
    if (!this.videoTransceiver) {
      throw new Error('Video transceiver not initialized');
    }
    try { track.contentHint = 'motion'; } catch { /* not supported */ }
    if (this.localStream) {
      this.localStream.addTrack(track);
    }
    await this.videoTransceiver.sender.replaceTrack(track);
    if (this.videoTransceiver.direction !== 'sendrecv') {
      this.videoTransceiver.direction = 'sendrecv';
    }
    // direction change schedules onnegotiationneeded; ensure renegotiation even
    // if it was already stable (replaceTrack alone does not renegotiate).
    if (this.autoNegotiate) {
      await this.negotiate();
    }
    await this.applyVideoEncoding(this.currentVideoTier === 'audio-only' ? 'high' : this.currentVideoTier);
  }

  /**
   * Downgrade video→audio (turn my camera off): stop sending video, release the
   * track, and flip the transceiver to recvonly so we still receive the peer's
   * video. Renegotiates so the peer drops our tile.
   */
  async disableVideoSend(): Promise<void> {
    if (!this.videoTransceiver) return;
    const sender = this.videoTransceiver.sender;
    const track = sender.track;
    await sender.replaceTrack(null);
    if (track) {
      track.stop();
      this.localStream?.removeTrack(track);
    }
    if (this.videoTransceiver.direction !== 'recvonly') {
      this.videoTransceiver.direction = 'recvonly';
    }
    if (this.autoNegotiate) {
      await this.negotiate();
    }
  }

  /**
   * Adaptive bitrate / compression. Maps a quality tier to encoder parameters
   * via setParameters (no renegotiation) and pins degradationPreference to
   * 'maintain-framerate' so motion stays smooth (resolution is shed first).
   * 'audio-only' stops outbound video entirely as a last-resort survival mode.
   */
  async applyVideoEncoding(tier: VideoQualityTier): Promise<void> {
    this.currentVideoTier = tier;
    const sender = this.videoTransceiver?.sender
      ?? this.peerConnection?.getSenders().find((s) => s.track?.kind === 'video')
      ?? null;
    if (!sender || typeof sender.getParameters !== 'function') return;

    if (tier === 'audio-only') {
      await this.disableVideoSend().catch(() => { /* best effort */ });
      return;
    }

    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }
    const ladder = VIDEO_ENCODING_LADDER[tier];
    params.encodings[0].maxBitrate = ladder.maxBitrate;
    params.encodings[0].maxFramerate = ladder.maxFramerate;
    params.encodings[0].scaleResolutionDownBy = ladder.scaleResolutionDownBy;
    // Cast: degradationPreference is valid per spec but missing from some lib.dom versions.
    (params as RTCRtpSendParameters & { degradationPreference?: string }).degradationPreference =
      'maintain-framerate';
    try {
      await sender.setParameters(params);
      logger.debug('[WebRTCService] Applied video encoding tier', {
        participantId: this.participantId,
        tier,
        ...ladder,
      });
    } catch (error) {
      logger.warn('[WebRTCService] setParameters failed', { error });
    }
  }

  /**
   * Bound the receive jitter buffers: keep audio near-zero latency, allow a
   * little video buffering to smooth jitter. Prevents latency from ballooning
   * under load (never saturate). Best-effort: not all browsers expose the knob.
   */
  setJitterBufferTargets(): void {
    if (!this.peerConnection) return;
    for (const receiver of this.peerConnection.getReceivers()) {
      const target = receiver.track?.kind === 'video' ? 200 : 0;
      try {
        (receiver as RTCRtpReceiver & { jitterBufferTarget?: number | null }).jitterBufferTarget =
          target;
      } catch { /* unsupported — NetEq defaults apply */ }
    }
  }

  private clearDisconnectGraceTimer(): void {
    if (this.disconnectGraceTimer) {
      clearTimeout(this.disconnectGraceTimer);
      this.disconnectGraceTimer = null;
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
   * Start quality monitor that reads WebRTC stats every 3s
   * and reports connection quality level via callback
   */
  startQualityMonitor(): void {
    this.stopQualityMonitor();

    if (!this.peerConnection) {
      logger.warn('[WebRTCService]', 'Cannot start quality monitor: no peer connection');
      return;
    }

    logger.info('[WebRTCService] Starting quality monitor', {
      participantId: this.participantId,
    });

    let previousBytesReceived = 0;
    let previousTimestamp = 0;

    this.qualityMonitorInterval = setInterval(async () => {
      if (!this.peerConnection) {
        this.stopQualityMonitor();
        return;
      }

      try {
        const stats = await this.peerConnection.getStats();
        let packetLoss = 0;
        let rtt = 0;
        let currentBytesReceived = 0;
        let currentTimestamp = 0;

        stats.forEach((report) => {
          if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            const totalPackets = (report.packetsReceived ?? 0) + (report.packetsLost ?? 0);
            packetLoss = totalPackets > 0 ? ((report.packetsLost ?? 0) / totalPackets) * 100 : 0;
            currentBytesReceived = report.bytesReceived ?? 0;
            currentTimestamp = report.timestamp;
          }
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            rtt = report.currentRoundTripTime ? report.currentRoundTripTime * 1000 : 0;
          }
        });

        const bitrateKbps = previousTimestamp > 0 && currentTimestamp > previousTimestamp
          ? ((currentBytesReceived - previousBytesReceived) * 8) / (currentTimestamp - previousTimestamp)
          : 0;

        previousBytesReceived = currentBytesReceived;
        previousTimestamp = currentTimestamp;

        const quality = this.computeQualityLevel(packetLoss, rtt, bitrateKbps);
        this.config.onConnectionQualityChange?.(quality);

        logger.debug('[WebRTCService] Quality stats', {
          participantId: this.participantId,
          packetLoss: packetLoss.toFixed(1),
          rtt: rtt.toFixed(0),
          bitrateKbps: bitrateKbps.toFixed(0),
          quality,
        });
      } catch (error) {
        logger.warn('[WebRTCService] Failed to get stats', { error });
      }
    }, QUALITY_MONITOR_INTERVAL_MS);
  }

  /**
   * Stop quality monitor
   */
  stopQualityMonitor(): void {
    if (this.qualityMonitorInterval) {
      clearInterval(this.qualityMonitorInterval);
      this.qualityMonitorInterval = null;
    }
  }

  private computeQualityLevel(
    packetLoss: number,
    rtt: number,
    _bitrateKbps: number
  ): ConnectionQualityLevel {
    if (packetLoss < 1 && rtt < 100) return 'excellent';
    if (packetLoss < 3 && rtt < 200) return 'good';
    if (packetLoss < 8 && rtt < 400) return 'fair';
    return 'poor';
  }

  /**
   * Close connection and cleanup
   */
  close(): void {
    logger.debug('[WebRTCService] Closing connection', {
      participantId: this.participantId,
    });

    // Stop quality monitor
    this.stopQualityMonitor();
    this.clearDisconnectGraceTimer();

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
    this.videoTransceiver = null;
    this.autoNegotiate = false;
    this.makingOffer = false;
    this.isSettingRemoteAnswerPending = false;
    this.ignoreOffer = false;

    logger.info('[WebRTCService]', 'Connection closed and cleaned up');
  }
}
