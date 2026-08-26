/**
 * WEBRTC SERVICE
 * Phase 1A: P2P Video Calls MVP
 *
 * Manages WebRTC peer connections, media streams, and signaling
 */

'use client';

import { logger } from '@/utils/logger';
import { callTranscriptChannel } from '@/services/call-transcript-channel';
import type { CallTranscriptEntryPayload } from '@meeshy/shared/types/video-call';

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
 *
 * 'frozen' is the network-survival floor (L6-3): a near-still encoder tier
 * (2 fps) applied per-peer via `applyVideoEncoding` — same `setParameters()`
 * path as every other tier, no track mutation, no renegotiation — so the
 * struggling peer keeps receiving a live (if near-static) frame instead of
 * losing outbound video outright, unlike `disableVideoSend()`/`'audio-only'`.
 */
export type VideoQualityTier = 'high' | 'medium' | 'low' | 'audio-only' | 'frozen';

const VIDEO_ENCODING_LADDER: Record<
  Exclude<VideoQualityTier, 'audio-only'>,
  { maxBitrate: number; maxFramerate: number; scaleResolutionDownBy: number }
> = {
  high: { maxBitrate: 1_500_000, maxFramerate: 30, scaleResolutionDownBy: 1 },
  medium: { maxBitrate: 600_000, maxFramerate: 25, scaleResolutionDownBy: 2 },
  low: { maxBitrate: 250_000, maxFramerate: 15, scaleResolutionDownBy: 4 },
  frozen: { maxBitrate: 100_000, maxFramerate: 2, scaleResolutionDownBy: 4 },
};

// Grace window before an ICE 'disconnected' escalates to a restart.
const ICE_DISCONNECT_GRACE_MS = 3_000;

// ICE-restart backoff/rate-limit scoping (follow-up to PR #3182, deferred at
// Vague 143). The FIRST restart of a degradation episode stays immediate
// (unstable-connection playbook, see oniceconnectionstatechange) — most
// blips self-heal on that single attempt. Every consecutive restart without
// an intervening 'connected'/'completed' backs off exponentially, and after
// ICE_RESTART_MAX_ATTEMPTS the service stops retrying altogether: without a
// cap, a genuinely broken transport (dead TURN allocation, blackholed route)
// makes createPeerConnection hammer createOffer/setLocalDescription — and
// relay a fresh SDP through signaling via onLocalDescription — in a tight,
// unbounded loop, burning battery/CPU/bandwidth for a connection that is
// never coming back on its own.
const ICE_RESTART_MAX_ATTEMPTS = 5;
const ICE_RESTART_BACKOFF_BASE_MS = 2_000;
const ICE_RESTART_BACKOFF_MAX_MS = 16_000;

export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private config: WebRTCServiceConfig;
  private participantId: string | null = null;
  private serverIceServers: RTCIceServer[] | null = null;

  // Perfect-negotiation state (W3C pattern). The polite peer yields on glare;
  // the impolite peer wins. Role is assigned deterministically from the two
  // user ids so both peers compute the same answer without coordination.
  private polite = false;
  private makingOffer = false;
  private isSettingRemoteAnswerPending = false;
  private ignoreOffer = false;
  // Set when negotiate({iceRestart:true}) is dropped by the makingOffer
  // guard because an unrelated renegotiation (e.g. A/V switch) is already in
  // flight. Without this, a colliding ICE restart is discarded with no
  // retry and the connection can be stranded in 'failed' forever — replayed
  // from negotiate()'s finally block once the in-flight offer settles.
  private pendingIceRestart = false;
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
  // The track this instance's own sender is currently transmitting — set by
  // addLocalMedia() (its own `.clone()` of the shared stream's video track,
  // Vague 96 — see that method's doc comment for why a literal, unshared
  // reference is unsafe) and by enableVideoSend()/switchVideoSendTrack().
  // Always exclusive to this instance, never another peer's sender: nothing
  // else references it, so close({stopLocalTracks: false})/disableVideoSend()/
  // switchVideoSendTrack() can always stop it without risk of killing a
  // sibling peer's outbound video in a group call.
  private exclusiveVideoTrack: MediaStreamTrack | null = null;
  // Grace timer for a transient ICE 'disconnected' before escalating to an ICE
  // restart. A blip often self-heals within a couple of seconds; restarting
  // immediately causes needless churn.
  private disconnectGraceTimer: ReturnType<typeof setTimeout> | null = null;
  // Consecutive ICE-restart attempts since the last real recovery
  // ('connected'/'completed'). Drives the backoff/cap in scheduleIceRestart().
  private iceRestartAttempt = 0;
  private iceRestartBackoffTimer: ReturnType<typeof setTimeout> | null = null;

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
    // Collect payload types declared by `m=audio` lines first (rather than
    // tracking section boundaries top-to-bottom) so this stays correct
    // regardless of whether `a=fmtp` lines appear before or after their
    // owning `m=` line. Without this, the params below (Opus-only) would
    // leak onto video fmtp lines (e.g. H264 `profile-level-id`) sharing the
    // same SDP.
    const audioPayloadTypes = new Set<string>();
    sdp.split('\r\n').forEach((line) => {
      if (!line.startsWith('m=audio ')) return;
      line.trim().split(' ').slice(3).forEach((pt) => audioPayloadTypes.add(pt));
    });

    return sdp.replace(
      /a=fmtp:(\d+) (.+)/g,
      (match, payloadType, existingParams) => {
        if (!audioPayloadTypes.has(payloadType)) return match;

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
   * Prefer Opus + RED (RFC 2198 redundancy, packet-loss resilience) via the
   * standard `setCodecPreferences` API instead of SDP munging. Mirrors the
   * iOS SOTA principle (docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md
   * §1.3.4 — "no SDP munging for Opus DTX/RED/codec preferences"): SDP-level
   * RED insertion (the old `addAudioRedundancy` regex munger) forced a
   * redundancy payload the local libwebrtc/browser encoder never validated
   * against its own capabilities, which is exactly the class of bug that
   * previously caused iOS to go silent after ICE connected once RED landed
   * in a peer's SDP. `setCodecPreferences` validates against
   * `RTCRtpSender.getCapabilities()`, so a codec that isn't actually
   * supported is never forced onto the wire. No-ops gracefully when the API
   * or capability isn't available (older Safari).
   */
  private applyAudioCodecPreferences(transceiver: RTCRtpTransceiver): void {
    if (typeof transceiver.setCodecPreferences !== 'function') return;
    const RtpSenderCtor = (globalThis as { RTCRtpSender?: typeof RTCRtpSender }).RTCRtpSender;
    const capabilities = RtpSenderCtor?.getCapabilities?.('audio');
    if (!capabilities?.codecs?.length) return;

    const opusCodecs = capabilities.codecs.filter((c) => c.mimeType.toLowerCase() === 'audio/opus');
    const redCodecs = capabilities.codecs.filter((c) => c.mimeType.toLowerCase() === 'audio/red');
    const preferred = [...opusCodecs, ...redCodecs];
    if (!preferred.length) return;

    try {
      transceiver.setCodecPreferences(preferred);
      logger.info('[WebRTCService] audio codec preferences applied', {
        codecs: preferred.map((c) => c.mimeType),
      });
    } catch (error) {
      logger.warn('[WebRTCService] setCodecPreferences (audio) failed', { error });
    }
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
   * Apply all SDP munging: Opus params, Transport-CC, video bitrate hints.
   * RED preference is applied separately via setCodecPreferences (see
   * applyAudioCodecPreferences) — not SDP munging.
   */
  private mungeSdp(sdp: string): string {
    let munged = this.mungeOpusSdp(sdp);
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

      // Perfect-negotiation state is scoped to the RTCPeerConnection this
      // method is about to build — a service instance can be reused across a
      // participant leave→rejoin without an intervening close() (see
      // use-webrtc-p2p.ts's per-participant service cache), so any state left
      // over from a prior connection (e.g. autoNegotiate=true from a
      // completed initial negotiation) is stale and must not leak onto the
      // new one, or onnegotiationneeded can fire a second, racing offer.
      this.videoTransceiver = null;
      this.autoNegotiate = false;
      this.makingOffer = false;
      this.isSettingRemoteAnswerPending = false;
      this.ignoreOffer = false;
      this.pendingIceRestart = false;

      // A service instance can be reused across a participant leave→rejoin
      // without an intervening close() (see the perfect-negotiation reset
      // above, and use-webrtc-p2p.ts's per-participant service cache) — if a
      // prior RTCPeerConnection is still hanging off this instance, overwriting
      // it below without closing it first orphans it: it stays registered
      // with the browser, its transports and DTLS/ICE state alive, forever.
      if (this.peerConnection) {
        logger.debug('[WebRTCService] Closing previous peer connection before reuse', {
          participantId,
        });
        this.peerConnection.close();
      }

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

      // Data channel entrant — le pair iOS offreur crée le channel
      // "transcription" avant son offre (négocié dans le SDP). Il transporte
      // les entrées de journal de transcription en P2P direct
      // (`transcript-entry`, miroir de CallTranscriptDataChannelMessage dans
      // packages/shared/types/video-call.ts) plus les messages de contrôle
      // ping/bye, ignorés ici (le web s'appuie sur le fanout socket
      // `call:ended`, chemin autoritatif). Le web ne crée pas de channel
      // lui-même : quand il est offreur, le pair retombe sur le relais
      // serveur — les deux chemins convergent dans use-call-transcript-journal
      // par fusion sur l'id d'entrée.
      this.peerConnection.ondatachannel = (event) => {
        event.channel.onmessage = (message) => {
          if (typeof message.data !== 'string') return;
          try {
            const parsed: unknown = JSON.parse(message.data);
            if (
              typeof parsed === 'object' && parsed !== null &&
              (parsed as { type?: unknown }).type === 'transcript-entry' &&
              typeof (parsed as { entry?: unknown }).entry === 'object' &&
              (parsed as { entry?: unknown }).entry !== null
            ) {
              callTranscriptChannel.publish(
                (parsed as { entry: CallTranscriptEntryPayload }).entry
              );
            }
          } catch {
            // Payload non-JSON (version future, bruit) — inerte par design.
          }
        };
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
            this.scheduleIceRestart();
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
                this.scheduleIceRestart();
              }
            }, ICE_DISCONNECT_GRACE_MS);
          } else if (state === 'connected' || state === 'completed') {
            this.clearDisconnectGraceTimer();
            // Real recovery — forgive past attempts so a LATER degradation
            // episode gets its own immediate first restart instead of
            // inheriting this episode's backoff/cap.
            this.iceRestartAttempt = 0;
            this.clearIceRestartBackoffTimer();
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
          void this.negotiate().catch((error) => {
            logger.error('[WebRTCService] Auto-renegotiation (onnegotiationneeded) failed', { error });
          });
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
      if (options.iceRestart) {
        // Do not drop this on the floor: a colliding ICE restart must still
        // happen once the in-flight offer settles, or the connection can be
        // stranded in 'failed' with no further recovery signal.
        this.pendingIceRestart = true;
        logger.warn('[WebRTCService] negotiate() iceRestart deferred: offer already in flight', {
          participantId: this.participantId,
        });
      } else {
        logger.debug('[WebRTCService] negotiate() skipped: offer already in flight', {
          participantId: this.participantId,
        });
      }
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
      if (this.pendingIceRestart) {
        this.pendingIceRestart = false;
        logger.info('[WebRTCService] Replaying deferred ICE restart after in-flight offer settled', {
          participantId: this.participantId,
        });
        void this.negotiate({ iceRestart: true }).catch((error) => {
          logger.error('[WebRTCService] Deferred ICE restart replay failed', { error });
        });
      }
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
   *
   * The outgoing video track is always a `.clone()` of `stream`'s current
   * video track, never the literal object (Vague 96). This method runs once
   * per NEW peer connection — including a late joiner added to an ALREADY
   * video-active group call, at which point `stream.getVideoTracks()[0]` is
   * another already-connected peer's live sender.track (enableVideo()/
   * switchCamera() in use-webrtc-p2p.ts hand that same literal object to
   * whichever peer is first in their snapshot). Attaching it here directly
   * would alias two independent RTCRtpSenders to one MediaStreamTrack: the
   * next unrelated switchVideoSendTrack()/disableVideoSend() on THAT other
   * peer reads its own sender.track as ground truth and stops it
   * unconditionally, silently freezing this peer's outbound video too.
   * Cloning — and recording the clone as `exclusiveVideoTrack` — gives this
   * instance the same self-contained ownership every other track-attaching
   * path already keeps, so it can never be stopped by anyone else's cleanup,
   * and is itself correctly released (instead of leaked) if this peer alone
   * leaves the group call via close({ stopLocalTracks: false }).
   */
  addLocalMedia(stream: MediaStream, options: { sendVideo: boolean }): void {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }
    this.localStream = stream;
    const audioTrack = stream.getAudioTracks()[0] ?? null;
    const sourceVideoTrack = stream.getVideoTracks()[0] ?? null;

    const audioTransceiver = this.peerConnection.addTransceiver(audioTrack ?? 'audio', {
      direction: 'sendrecv',
      streams: [stream],
    });
    this.applyAudioCodecPreferences(audioTransceiver);

    if (options.sendVideo && sourceVideoTrack) {
      const videoTrack = sourceVideoTrack.clone();
      // Hint the encoder toward camera content (drop resolution before
      // framerate under constraint).
      try { videoTrack.contentHint = 'motion'; } catch { /* not supported */ }
      this.videoTransceiver = this.peerConnection.addTransceiver(videoTrack, {
        direction: 'sendrecv',
        streams: [stream],
      });
      this.localStream.addTrack(videoTrack);
      this.exclusiveVideoTrack = videoTrack;
    } else {
      // Reserve the video m-line without lighting the camera/LED. Still
      // pre-associate it with `stream` (same as the sendVideo branch above):
      // a sender's MSID/stream grouping is fixed at addTransceiver() time —
      // replaceTrack() in enableVideoSend() later attaches the camera track
      // but does NOT change that association. Without it, the mid-call
      // audio→video upgrade renegotiates with no stream grouping, and the
      // remote peer's ontrack event fires with an empty `event.streams`,
      // silently dropping the upgrade (use-webrtc-p2p.ts's onTrack handler
      // gates on `event.streams[0]`).
      this.videoTransceiver = this.peerConnection.addTransceiver('video', {
        direction: 'recvonly',
        streams: [stream],
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
    this.exclusiveVideoTrack = track;
    await this.videoTransceiver.sender.replaceTrack(track);
    if (this.videoTransceiver.direction !== 'sendrecv') {
      this.videoTransceiver.direction = 'sendrecv';
    }
    // direction change schedules onnegotiationneeded; ensure renegotiation even
    // if it was already stable (replaceTrack alone does not renegotiate).
    if (this.autoNegotiate) {
      await this.negotiate();
    }
    // A passive re-enable (manual camera toggle, camera switch) must not
    // reinstate a stale survival freeze: 'audio-only' and 'frozen' are both
    // states this instance can only have entered from a track that is now
    // being replaced, so neither is a tier to restore — fall back to 'high'
    // the same way 'audio-only' already did.
    const tierToRestore =
      this.currentVideoTier === 'audio-only' || this.currentVideoTier === 'frozen'
        ? 'high'
        : this.currentVideoTier;
    await this.applyVideoEncoding(tierToRestore);
  }

  /**
   * Swap the currently-sent camera track for a new one without a full
   * enable/disable cycle (front↔back camera flip, FaceTime-style — Vague 95).
   * The transceiver is already sendrecv and stays that way: replaceTrack()
   * alone is sufficient, no renegotiation needed, unlike enableVideoSend().
   *
   * Reads the outgoing track straight off the sender (ground truth) before
   * replacing — the same technique disableVideoSend() already uses — rather
   * than trusting `exclusiveVideoTrack`, so this instance's own previous
   * track is the only one ever stopped/removed. use-webrtc-p2p.ts's
   * enableVideo() gives each peer beyond the first its own `.clone()`; a
   * camera switch must respect that same per-peer ownership or it silently
   * orphans a live camera capture on every other peer's track in a group
   * call (the bug this method replaces: handleSwitchCamera used to replace
   * every sender with one shared track object while assuming `localStream`
   * held exactly one video track).
   */
  async switchVideoSendTrack(track: MediaStreamTrack): Promise<void> {
    if (!this.videoTransceiver) {
      throw new Error('Video transceiver not initialized');
    }
    try { track.contentHint = 'motion'; } catch { /* not supported */ }
    const previousTrack = this.videoTransceiver.sender.track;
    await this.videoTransceiver.sender.replaceTrack(track);
    if (this.localStream) {
      this.localStream.addTrack(track);
      if (previousTrack) {
        this.localStream.removeTrack(previousTrack);
      }
    }
    if (previousTrack) {
      previousTrack.stop();
    }
    this.exclusiveVideoTrack = track;
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
    this.exclusiveVideoTrack = null;
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
   * 'maintain-framerate' so motion stays smooth (resolution is shed first) —
   * except at the 'frozen' floor, which keeps resolution and sheds cadence
   * instead ('maintain-resolution'): parity with iOS
   * `applyVideoEncoding(degradationPreference:)`.
   * 'audio-only' stops outbound video entirely as a last-resort survival mode.
   * 'frozen' is just another ladder entry (near-still bitrate/framerate) —
   * unlike 'audio-only' it never touches the track or the transceiver.
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
      tier === 'frozen' ? 'maintain-resolution' : 'maintain-framerate';
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
   * Schedule an ICE restart with exponential backoff after the first
   * consecutive attempt, and give up once ICE_RESTART_MAX_ATTEMPTS is
   * exceeded. See the constants' doc comment for why an unbounded, immediate
   * retry-on-every-transition loop is unsafe. Attempts are forgiven on real
   * recovery ('connected'/'completed', see oniceconnectionstatechange).
   */
  private scheduleIceRestart(): void {
    this.iceRestartAttempt += 1;
    const attempt = this.iceRestartAttempt;

    if (attempt > ICE_RESTART_MAX_ATTEMPTS) {
      logger.error('[WebRTCService] ICE restart attempts exhausted, giving up', {
        participantId: this.participantId,
        attempts: attempt - 1,
      });
      this.config.onError?.(new Error('ICE_RESTART_ATTEMPTS_EXHAUSTED'));
      return;
    }

    const delayMs = attempt <= 1
      ? 0
      : Math.min(
          ICE_RESTART_BACKOFF_BASE_MS * 2 ** (attempt - 2),
          ICE_RESTART_BACKOFF_MAX_MS
        );

    logger.info('[WebRTCService] Scheduling ICE restart', {
      participantId: this.participantId,
      attempt,
      delayMs,
    });

    this.clearIceRestartBackoffTimer();
    this.iceRestartBackoffTimer = setTimeout(() => {
      this.iceRestartBackoffTimer = null;
      this.restartIce().catch((error) => {
        logger.error('[WebRTCService] Scheduled ICE restart failed', { error });
      });
    }, delayMs);
  }

  private clearIceRestartBackoffTimer(): void {
    if (this.iceRestartBackoffTimer) {
      clearTimeout(this.iceRestartBackoffTimer);
      this.iceRestartBackoffTimer = null;
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
   * Close connection and cleanup.
   *
   * `stopLocalTracks` defaults to `true` (full-teardown behavior). Pass
   * `false` when closing ONE peer connection among several that share the
   * same local `MediaStream` reference (group calls: use-webrtc-p2p.ts keeps
   * one WebRTCService per remote participant, all fed the same stream via
   * addLocalMedia) — stopping the hardware tracks here would kill local
   * audio/video for every OTHER still-connected participant, not just this
   * one. The shared stream's real lifecycle (camera/mic release) belongs to
   * whoever owns it (call-store's reset()), not to a single peer's cleanup.
   */
  close(options: { stopLocalTracks?: boolean } = {}): void {
    const { stopLocalTracks = true } = options;
    logger.debug('[WebRTCService] Closing connection', {
      participantId: this.participantId,
    });

    this.clearDisconnectGraceTimer();
    this.clearIceRestartBackoffTimer();
    this.iceRestartAttempt = 0;

    // Release this instance's own reference; only stop the tracks themselves
    // when this service owns the full teardown (see doc comment above).
    if (this.localStream) {
      if (stopLocalTracks) {
        this.localStream.getTracks().forEach((track) => {
          track.stop();
          logger.debug('[WebRTCService] Stopped local track', {
            trackKind: track.kind,
          });
        });
      } else if (this.exclusiveVideoTrack) {
        // Not a full teardown (group call, one peer among several), but this
        // instance's own video track from enableVideoSend() is never shared
        // with another peer's sender — release it or it leaks on the shared
        // stream forever. See the field doc comment.
        this.exclusiveVideoTrack.stop();
        this.localStream.removeTrack(this.exclusiveVideoTrack);
      }
      this.localStream = null;
    }
    this.exclusiveVideoTrack = null;

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
    this.pendingIceRestart = false;

    logger.info('[WebRTCService]', 'Connection closed and cleaned up');
  }
}
