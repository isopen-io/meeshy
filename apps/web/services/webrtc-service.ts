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
}

const QUALITY_MONITOR_INTERVAL_MS = 3_000;

export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private config: WebRTCServiceConfig;
  private participantId: string | null = null;
  private qualityMonitorInterval: ReturnType<typeof setInterval> | null = null;
  private serverIceServers: RTCIceServer[] | null = null;

  constructor(config: WebRTCServiceConfig = {}) {
    this.config = {
      iceServers: DEFAULT_ICE_SERVERS,
      ...config,
    };
  }

  setIceServers(iceServers: RTCIceServer[]): void {
    this.serverIceServers = iceServers;
  }

  /**
   * Munge SDP to set Opus codec parameters for high-quality audio
   * (maxaveragebitrate=128000, stereo=1, useinbandfec=1, usedtx=0, maxplaybackrate=48000)
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
        opusParams.set('usedtx', '0');
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

      if (offer.sdp) {
        offer.sdp = this.mungeSdp(offer.sdp);
      }

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

      if (answer.sdp) {
        answer.sdp = this.mungeSdp(answer.sdp);
      }

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

      if (offer.sdp) {
        offer.sdp = this.mungeSdp(offer.sdp);
      }

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
   * Start quality monitor that reads WebRTC stats every 3s
   * and reports connection quality level via callback
   */
  startQualityMonitor(): void {
    this.stopQualityMonitor();

    if (!this.peerConnection) {
      logger.warn('[WebRTCService] Cannot start quality monitor: no peer connection');
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

    logger.info('[WebRTCService]', 'Connection closed and cleaned up');
  }
}
