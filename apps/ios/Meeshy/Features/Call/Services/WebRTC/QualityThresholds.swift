import CoreGraphics
import Foundation
import MeeshySDK

// MARK: - Quality Thresholds

/// Pure namespace of immutable configuration constants. Declared `nonisolated`
/// so it opts out of the module's `defaultIsolation = MainActor`: these `static
/// let` thresholds are Sendable value types and must be readable from nonisolated
/// contexts (e.g. libwebrtc stats callbacks, `VoIPPushManager.parseIceServers`).
nonisolated enum QualityThresholds {
    // MARK: Audio bitrate tier boundaries (used by adjustBitrate in WebRTCService)

    /// RTT at or below this value → excellent audio quality (max bitrate).
    static let excellentRTT: Double = 100
    /// RTT at or below this value → good audio quality (default bitrate). Above → min bitrate.
    static let goodRTT: Double = 250
    /// RTT above this value → critical video tier (severe congestion).
    /// 800 ms round-trip ≈ 400 ms one-way, the ITU-T G.114 conversational
    /// acceptability limit. Below it a distant intercontinental link
    /// (Africa↔Asia backbone alone is 155-221 ms RTT before any last mile —
    /// WACS 155, 2Africa 158, ACC-1 221) stays 'poor', not 'critical'. The
    /// prior 500 ms boundary flagged healthy long-haul mobile calls as critical.
    static let poorRTT: Double = 800

    static let excellentPacketLoss: Double = 0.01
    static let goodPacketLoss: Double = 0.05
    static let poorPacketLoss: Double = 0.10

    // MARK: Video quality tier boundaries (used by VideoQualityLevel.from(rtt:packetLoss:))
    // Note: excellentRTT (100), poorRTT (800), excellentPacketLoss (0.01),
    // goodPacketLoss (0.05), and poorPacketLoss (0.10) are also referenced by the
    // video ladder; the two intermediate video boundaries below are video-specific.
    //
    // The RTT ladder is calibrated round-trip against ITU-T G.114 one-way targets
    // (RTT ≈ 2× one-way) and REAL long-haul baselines, NOT a domestic wired link:
    // an Africa↔Asia submarine backbone is already 155-221 ms RTT before the
    // mobile last mile, so a healthy intercontinental call routinely sits at
    // 250-450 ms. The prior boundaries (fair >200, poor >300) painted those calls
    // orange/red at 00:06. Packet loss — the true congestion signal — keeps its
    // tighter bands (see below). Web mirror: apps/web/hooks/use-call-quality.ts.

    /// RTT boundary between good and fair video quality tiers (~150 ms one-way).
    /// Above this → at most .fair; at or below → may be .good or .excellent.
    static let videoFairRTT: Double = 300

    /// RTT boundary between fair and poor video quality tiers (~250 ms one-way).
    /// Sized to keep an Africa↔Asia backbone hop + a mobile last mile in 'fair'.
    /// Above this → at most .poor; at or below → may be .fair or better.
    static let videoPoorRTT: Double = 500

    /// Packet-loss boundary between fair and poor video quality.
    /// Above this → at most .poor; at or below → may be .fair or better.
    static let videoFairPacketLoss: Double = 0.03

    // MARK: BWE (TWCC GCC) quality tier thresholds
    // Set conservatively below each tier's `targetVideoBitrate` to absorb
    // audio (~64kbps) + RTCP/SRTCP overhead without over-committing bitrate.
    // Used by VideoQualityLevel.from(availableOutgoingBitrateBps:).

    static let bweExcellentBps: Int = 2_000_000  // 80 % of excellent target (2.5 Mbps)
    static let bweGoodBps: Int     = 1_000_000   // 67 % of good target (1.5 Mbps)
    static let bweFairBps: Int     =   400_000   // 50 % of fair target (800 kbps)
    static let bwePoorBps: Int     =   150_000   // 37.5 % of poor target (400 kbps)

    // MARK: PiP thermal frame-rate ladder
    // PiP shows a small floating thumbnail — lower fps than the main encoder
    // is acceptable and significantly reduces GPU/ANE load on a hot device.
    // Separate from `VideoThermalProfile` (which caps the *main* stream encoder)
    // so the two ladders can be tuned independently.

    /// Maximum frame rate delivered to the PiP thumbnail when the device is
    /// thermally nominal or only lightly stressed (.nominal / .fair).
    static let pipFrameRateDefault: Int = 15

    /// PiP frame rate cap under `.serious` thermal pressure. Still smooth
    /// enough for speech at 10 fps; saves significant GPU compared to 15.
    static let pipFrameRateSerious: Int = 10

    /// PiP frame rate cap under `.critical` thermal pressure. Near-slideshow
    /// but preserves the call without the user losing the remote face entirely.
    static let pipFrameRateCritical: Int = 8

    /// Fixed clearance added on top of `safeAreaInsets.top` when computing the
    /// PiP thumbnail resting position. Must clear the ENTIRE top chrome row —
    /// 8 pt top padding + 44 pt chevron/conversation buttons (leading) and
    /// call-duration badge (trailing) + 8 pt breathing room — because the PiP
    /// rests top-trailing by default, right where the duration badge lives.
    /// Source of truth for `CallView.pipCenter(_:in:safeArea:)`.
    static let pipTopClearance: CGFloat = 60

    /// Fixed clearance added on top of `safeAreaInsets.bottom` when computing
    /// the PiP thumbnail resting position. Provides room for the call control
    /// bar above the safe area edge (control bar ≈ 120 pt).
    /// Source of truth for `CallView.pipCenter(_:in:safeArea:)`.
    static let pipBottomClearance: CGFloat = 130

    static let maxBitrate: Int = 128_000
    /// Floor bitrate the adaptation algorithm will proactively target under
    /// severe degradation (24 kbps = speech quality floor for Opus).
    static let minBitrate: Int = 24_000
    static let defaultBitrate: Int = 64_000
    /// Audio jitter above this threshold (ms) triggers a cap to `minBitrate`.
    /// Opus PLC degrades noticeably when jitter exceeds ~30 ms; shedding encoder
    /// complexity gives the jitter buffer headroom to absorb the spikes.
    static let highJitterThresholdMs: Double = 30.0
    /// SDP-level absolute codec minimum set in `RTCRtpEncodingParameters`.
    /// Lower than `minBitrate` so the encoder can survive an extreme network
    /// event even after the adaptation algorithm has already reduced to 24 kbps.
    static let audioCodecFloorBitrateBps: Int = 16_000

    // Audit P2-iOS-12 — bumped from 3s to 5s. RTCPeerConnection.statistics
    // walks the entire stats graph (~5–10ms CPU per call); 5s is the
    // industry baseline (WhatsApp/Jitsi use 2–5s during reconnection only).
    static let statsIntervalSeconds: TimeInterval = 5.0
    /// The shared heartbeat cadence (`CallRules`, #8074) — 10 s, cellular-safe.
    static let heartbeatIntervalSeconds: TimeInterval = CallRules.heartbeatInterval

    /// Cadence des snapshots analytics « in_progress » pendant un appel
    /// connecté. 60 s = 1-2 req/min avec l'émission finale — bien sous le
    /// rate limit gateway CALL_ANALYTICS (10/min) ; un kill de l'app perd au
    /// pire la dernière minute de télémétrie.
    static let analyticsSnapshotIntervalSeconds: TimeInterval = 60.0

    /// 3 missed beats (~30s) marks heartbeat as lost. After this, FSM
    /// transitions active → reconnecting.
    static let heartbeatLostThresholdSeconds: TimeInterval = 30.0

    /// Phase 1 fix P10: cellular ACK round-trip can take 3-4s in poor signal.
    /// 5s timeout absorbs worst-case without false positives.
    static let heartbeatAckTimeoutSeconds: TimeInterval = 5.0
    /// #9111 (2026-10-02) — 6 → 8. With `reconnectAttemptBudgetSeconds` (10 s)
    /// the attempts span 80 s: never LESS than the server's rejoin grace plus a
    /// heartbeat (`CallRules.rejoinGrace` 60 s + 10 s) — the client must not give
    /// up a call the gateway still holds for it — and, backoff included (~110 s),
    /// never MORE than `CallRules.heartbeatTimeout` (120 s), the cap of the
    /// gateway's grace extensions. At 6 (~60 s) the client hung up while the
    /// server still held the peer's seat. On a media-only failure (ICE down,
    /// signaling alive) the server sets no deadline: the window is then a pure
    /// UX cost on « Reconnexion… », accepted for the call to survive.
    static let maxReconnectAttempts: Int = 8
    /// Hard cap on the ICE candidate buffer maintained while the socket is
    /// down.  ICE can generate 50+ candidates per gathering round (host +
    /// STUN server-reflexive + TURN relayed × UDP/TCP); beyond this cap
    /// candidates are dropped since they belong to a stale ICE generation
    /// that the remote won't honour after reconnect anyway.
    /// 100 (was 50) — the prior cap sat exactly at the documented "50+"
    /// figure, so a single busy gathering round during a socket outage
    /// could hit the cap and drop legitimate, still-relevant candidates.
    static let maxPendingIceCandidates: Int = 100
    /// Cap on the `WebRTCService.iceCandidateBuffer` maintained while the remote
    /// description has not yet been set. Beyond this count ICE candidates are
    /// FIFO-evicted (oldest first) — the ICE agent selects a pair well before
    /// 200 candidates arrive, so older entries have negligible value.
    /// Distinct from `maxPendingIceCandidates` (CallManager socket-level buffer, cap 50).
    static let iceCandidateBufferCap: Int = 200
    /// Maximum byte length of a single ICE candidate line accepted from a remote peer.
    /// libwebrtc parses these strings without bounds checks; a malformed or hostile SDP
    /// with a multi-MB candidate string causes memory pressure inside the library.
    /// 10 KB is orders of magnitude above any real ICE candidate (~200 bytes typical).
    static let iceCandidateLineMaxBytes: Int = 10_000
    /// Maximum character length of the `sdpMid` field in an ICE candidate.
    /// RFC 5888 §5 allows any ALPHANUMERIC token; 256 chars is a safe ceiling.
    static let iceCandidateSdpMidMaxLength: Int = 256
    /// Maximum character length of a TURN credential field (username or credential).
    /// libwebrtc encodes these in HTTP Authorization headers; > 1 KB per field risks
    /// header-size rejection by TURN servers and memory pressure in the auth path.
    nonisolated static let turnCredentialMaxLength: Int = 1024

    /// §3.2 — debounce before treating `RTCPeerConnectionState.disconnected`
    /// as a reconnect trigger. ICE produces transient `.disconnected` blips
    /// (path migration, brief loss) that self-heal within 1-2s; reacting
    /// immediately causes reconnect churn. 3.5s waits out the blip while still
    /// reacting well before the ~30s `.failed` timeout. `.failed`/`.closed`
    /// are NOT debounced (terminal/decisive).
    static let disconnectDebounceSeconds: TimeInterval = 3.5

    static let minVideoBitrate: Int = 100_000
    static let maxVideoBitrate: Int = 2_500_000
    /// Frame-rate floor applied when `VideoQualityLevel.critical.targetFPS == 0`.
    /// Mirrors the `.poor` tier's fps — keeps video alive at minimum cost rather
    /// than stalling the encoder with an fps of zero.
    static let criticalVideoFloorFPS: Int = 15
    /// Resolution floor (portrait height, pixels) applied when
    /// `VideoQualityLevel.critical.targetResolutionHeight == 0`.
    /// Together with `criticalVideoFloorFPS` and `minVideoBitrate` this defines
    /// the 360p15 @ 100 kbps worst-case floor documented in `applyVideoQuality`.
    static let criticalVideoFloorHeight: Int = 360
    /// Frame rate of the network-survival FREEZE floor (L6-1). Deliberately
    /// NOT zero and NOT `isActive = false`: the stream never stops, so the
    /// decoder's reference chain stays valid and no keyframe has to be forced
    /// on thaw. 2 fps reads as a still image while keeping RTP flowing.
    static let survivalFrozenFPS: Int = 2

    /// Phase 1 fix E6 — RTP gate before transitioning to .connected.
    /// ICE connected does NOT mean media flows: NAT, codec mismatch, audio
    /// session not flipped, or routing bug can leave us with iceState=.connected
    /// but zero RTP packets. We poll stats every 2s up to 5 times (10s budget),
    /// require ≥5 inbound RTP packets (≈100ms of audio at 50pps Opus) before
    /// declaring "connected". Beyond 10s with no RTP → ended(.failed).
    /// Reference: docs/superpowers/specs/2026-05-10-calls-sota-redesign-design.md §2.3
    static let rtpGatePollIntervalSeconds: TimeInterval = 2.0
    static let rtpGateRequiredPackets: Int = 5

    /// §5.8 — grace window after reaching `.connected` before a stalled inbound
    /// (`inbound == 0 && outbound > 0`) is treated as a real half-open path and
    /// healed with one automatic ICE restart. The first ~1s post-handshake is
    /// legitimately packet-free; 4s waits that out without an annoying lag.
    static let halfOpenHealGraceSeconds: TimeInterval = 4.0

    /// §5.8 / bug h — `.connecting` watchdog budget. ICE/DTLS that never reaches
    /// `.connected` triggers ONE ICE restart at `connectingRestartSeconds`, then
    /// fails the call at `connectingFailSeconds`. Distinct from
    /// `outgoingRingTimeoutSeconds` (which guards `.ringing`, *before* the offer).
    static let connectingRestartSeconds: TimeInterval = 12.0
    static let connectingFailSeconds: TimeInterval = 25.0

    /// `.reconnecting` watchdog budget — the max time a single ICE-restart attempt
    /// may stay pending before the watchdog escalates to the next attempt. Covers
    /// the per-attempt exponential backoff (≤4s) plus ICE re-gather/connect on a
    /// weak cellular link (~5s), without leaving the user staring at "Reconnecting…".
    /// Combined with `maxReconnectAttempts` it bounds the total reconnection window
    /// to ~`maxReconnectAttempts × reconnectAttemptBudgetSeconds` before the call
    /// fails with `.connectionLost` — instead of hanging forever when an ICE restart
    /// silently stalls (offer sent, peer never answers, no new PC-state callback,
    /// no network flap to re-arm `attemptReconnection`).
    static let reconnectAttemptBudgetSeconds: TimeInterval = 10.0

    /// Caller-side ringing timeout — the SAME window the gateway marks missed
    /// at (`CallRules.ringTimeout`, #8074). The server arms its timer first,
    /// at creation; this one is the net when `call:ended` never arrives.
    static let outgoingRingTimeoutSeconds: TimeInterval = CallRules.ringTimeout

    /// Default TURN credential TTL (seconds) used when the signalling path does
    /// not carry an explicit `ttl` field (VoIP push, socket-only incoming — neither
    /// payload carries a `ttl`). Mirrors the gateway's own default
    /// (`TURNCredentialService.credentialTTL`, `services/gateway/src/services/TURNCredentialService.ts`,
    /// `TURN_CREDENTIAL_TTL` env, 24h) rather than guessing a shorter window: the
    /// gateway raised its default from 600s to 86400s (CALL-FIX 2026-06-25) after the
    /// short value silently killed TURN-relayed calls once credentials expired mid-call.
    /// A client-side guess much shorter than the real TTL only costs an extra refresh
    /// round-trip (harmless), but one that's a fraction of the true value — like the
    /// previous 480s here — would have been actively misleading documentation for
    /// anyone tuning this against the gateway.
    static let turnDefaultCredentialTTLSeconds: TimeInterval = 86400

    /// Minimum delay (seconds) before a TURN credential refresh, regardless of
    /// the TTL reported by the gateway. Guards against a malformed TTL=0 response
    /// that would otherwise trigger an immediate refresh on every call tick.
    static let turnMinRefreshDelaySeconds: TimeInterval = 30

    /// Watchdog window (seconds) after emitting `call:request-ice-servers`
    /// before retrying, if `call:ice-servers-refreshed` hasn't come back yet.
    /// `emitRequestIceServers` is fire-and-forget (no ACK) — a single dropped
    /// emit or gateway reply must not permanently kill the refresh chain for
    /// the rest of a long call.
    static let turnRefreshRetryTimeoutSeconds: TimeInterval = 8

    /// Max consecutive retries of a single TURN refresh request before giving
    /// up on that cycle and falling back to re-arming the next periodic
    /// refresh (rather than retrying forever).
    static let turnRefreshMaxRetries: Int = 3

    /// Delay after `.connected` before the stuck-muted CallKit fallback
    /// re-checks whether `provider:didActivate:` ever fired. CallKit normally
    /// delivers it within ~500 ms of the call connecting; 2 s is comfortably
    /// past that without leaving the user in a silent call for long.
    static let stuckMutedFallbackDelaySeconds: TimeInterval = 2.0

    /// How long the callee waits for an SDP offer after answering before
    /// failing the call — the shared `CallRules.offerTimeout` (#8074).
    static let sdpOfferTimeoutSeconds: TimeInterval = CallRules.offerTimeout

    /// Safety net that force-fulfills a held `CXAnswerCallAction` if the call
    /// still hasn't connected. MUST stay strictly greater than
    /// `sdpOfferTimeoutSeconds`: if it fired first, CallKit would be told the
    /// call is "connected" (starting the Recents timer) only for
    /// `scheduleSdpOfferTimeout` to fail the call moments later — Recents
    /// would then show a call that lasted the gap between the two timeouts
    /// but never actually connected. The 5s margin absorbs scheduling jitter
    /// between the two independently-armed timers.
    static let pendingAnswerActionSafetyNetSeconds: TimeInterval = sdpOfferTimeoutSeconds + 5

    /// Settle window after `callState` transitions to `.ended` before the
    /// call identity (callId / remoteUserId / callDuration) is cleared.
    /// Gives the UI time to read final stats before teardown completes.
    static let callEndSettleSeconds: TimeInterval = 1.5

    /// Longer settle window for a RETRYABLE transient failure — the ended screen
    /// holds its « Réessayer » affordance this long before auto-dismissing, so
    /// the user has a real chance to re-dial (parité web/Android retry).
    static let callEndRetryableSettleSeconds: TimeInterval = 12.0

    /// Delay `endCurrentAndAnswerPending()` waits after calling `endCall()`
    /// before answering the waiting call — gives CallKit's `CXEndCallAction`
    /// and the audio session teardown time to settle so the pending call's
    /// answer doesn't race the outgoing call's hangup on the same audio
    /// session. Distinct from `callEndSettleSeconds` (a UI-facing stats
    /// readability window on the call that just ended, not a handoff delay
    /// before starting the next one).
    static let endAndAnswerPendingHandoffSeconds: TimeInterval = 0.5

    /// HTTP timeout for the VoIP push freshness check (GET /calls/:id).
    /// 4 s absorbs worst-case DNS + TLS + gateway response while still
    /// failing fast enough to avoid blocking CallKit for a stale push.
    static let voipFreshnessTimeoutSeconds: TimeInterval = 4.0

    /// How often the data-channel keep-alive ping fires. 15 s matches the
    /// TURN server's minimum activity requirement (Coturn refreshTimeout).
    static let dataChannelPingIntervalSeconds: TimeInterval = 15

    /// Bound on how long `disconnectAfterFlushingPendingSend()` waits for a
    /// just-enqueued DataChannel send (the local hangup `bye`) to actually
    /// reach the wire before forcing teardown regardless. A stuck/never-
    /// draining buffer (peer already gone) must not delay hangup indefinitely.
    static let dataChannelFlushTimeoutMilliseconds: Int = 200

    /// Poll interval while waiting for `dataChannelFlushTimeoutMilliseconds`.
    static let dataChannelFlushPollIntervalMilliseconds: Int = 20

    /// How long a remote-quality-degraded badge stays visible before it
    /// auto-resets to healthy. 15 s is long enough to be meaningful without
    /// persisting after a transient blip self-heals.
    static let remoteQualityResetSeconds: TimeInterval = 15

    // MARK: Opus fmtp codec hints (OpusFmtpMunger, CallDataProfile)

    /// `maxaveragebitrate` fmtp hint for Opus VOICE on Wi-Fi (#8697): 32 kbps
    /// mono is transparent for speech; leaner profiles lower it further.
    static let opusFmtpMaxAverageBitrate: Int = 32_000
    /// `maxplaybackrate` fmtp hint for Opus. 48 kHz = full wideband audio,
    /// the native sample rate of the Opus codec and WebRTC's internal APM.
    static let opusFmtpMaxPlaybackRate: Int = 48_000

    // MARK: SDP x-google-bitrate hints (addVideoBitrateHints in P2PWebRTCClient)

    /// `x-google-max-bitrate` hint injected into video fmtp lines. 2 500 kbps
    /// aligns with `maxVideoBitrate` (2.5 Mbps) — the open-loop encoder ceiling
    /// when TWCC GCC hasn't yet provided a BWE estimate. Not a hard cap; GCC
    /// overrides once probing data arrives.
    static let sdpVideoMaxBitrateKbps: Int = 2_500
    /// `x-google-min-bitrate` hint injected into video fmtp lines. 100 kbps =
    /// `minVideoBitrate` expressed in kbps (the SDP hint unit), ensuring the
    /// encoder never drops below the critical-tier floor on startup.
    static let sdpVideoMinBitrateKbps: Int = 100

    // MARK: Quality-level debounce (WebRTCService)

    /// Minimum interval between consecutive video quality-level upgrades.
    /// 5 s prevents thrashing when stats oscillate around a tier boundary —
    /// a single RTT spike doesn't immediately flip the encoder back to a
    /// lower tier once it has stabilised. Used in `processStats` debounce gate.
    static let qualityLevelDebounceSeconds: TimeInterval = 5.0

    // MARK: ICE candidate pool (P2PWebRTCClient — PERF-003)

    /// Number of ICE candidates pre-gathered before the SDP exchange completes.
    /// 4 = host + srflx + 2×relay; covers the dual-STUN + single-TURN topology
    /// without over-provisioning. Pre-warming starts as soon as `setConfiguration`
    /// runs, shaving 200–400ms off connect time on cellular.
    static let iceCandidatePoolSize: Int = 4

    // MARK: Video survival hysteresis (VideoSurvivalPolicy)

    /// How long a call must stay at `.poor` / `.critical` quality continuously
    /// before the survival controller drops to audio-only. 6 s absorbs transient
    /// spikes (cellular handoff, brief congestion) without prematurely killing
    /// video while the link is still likely to recover on its own.
    static let videoSurvivalSuspendAfterSeconds: TimeInterval = 6

    /// How long a call must stay at `.excellent` / `.good` quality continuously
    /// before the survival controller re-enables outbound video. Intentionally
    /// longer than `videoSurvivalSuspendAfterSeconds` (6 s): re-acquiring the
    /// camera + renegotiating is expensive, so we require the link to have
    /// clearly settled before committing.
    static let videoSurvivalResumeAfterSeconds: TimeInterval = 10

    // MARK: Signalling retry (emitOfferWithRetry / emitAnswerRetry)

    /// Starting backoff delay for SDP offer/answer ACK retries. Doubles on each
    /// successive attempt (500ms → 1s → 2s) — §4.6 bounded exponential backoff.
    static let signalRetryInitialDelaySeconds: TimeInterval = 0.5

    /// Total SDP offer transmission attempts (including the first). 3 attempts
    /// with 500ms/1s/2s backoff give the socket up to 3.5s total window before
    /// the gateway replay buffer takes over.
    static let signalOfferMaxAttempts: Int = 3

    /// Total SDP answer transmission attempts (including the inline attempt 1).
    /// The callee's answer path runs attempt 1 inline (so `CXAnswerCallAction`
    /// can be fulfilled promptly), then retries 2…4 in the background via
    /// `emitAnswerRetry`. Matches the offer budget so neither side starves.
    static let signalAnswerTotalAttempts: Int = 4

    // MARK: SDP extmap ID allocation (RFC 5285 §4.2)

    /// First extmap ID tried when injecting Transport-CC into the SDP.
    /// IDs 1–4 are typically consumed by libwebrtc's own extensions (MID,
    /// RID, audio level, abs-send-time). Starting at 5 avoids collisions
    /// without scanning the full extmap list.
    static let extmapStartId: Int = 5

    /// Maximum valid extmap ID for the 1-byte header form (RFC 5285 §4.2).
    /// IDs 15+ require the 2-byte header form, which not all implementations
    /// support. If IDs 5–14 are exhausted (10 occupied slots — extremely
    /// unlikely in a real WebRTC SDP), the extension is not injected and
    /// a fault is logged rather than emitting an invalid 15+ ID.
    static let extmapMaxId: Int = 14

    /// Delay after rebuilding the audio stack following an AVAudioSession
    /// media-services reset before re-applying the speaker route.  The
    /// RTCAudioSession I/O unit needs a short stabilisation window once
    /// `audioSessionDidActivate` has been called; attempting `overrideOutputAudioPort`
    /// too early (< ~100 ms) can silently fail on some hardware.
    /// 200 ms is conservative but avoids the race on all tested devices.
    static let mediaServicesResetSpeakerDelaySeconds: TimeInterval = 0.2
}
