import CoreGraphics
import Foundation

// MARK: - Agnostic Types (no WebRTC framework dependency)

enum SDPType: String, Codable, Sendable {
    case offer
    case answer
    case prAnswer = "pranswer"
    case iceRestart = "ice-restart"
}

struct SessionDescription: Codable, Sendable {
    let type: SDPType
    let sdp: String
}

struct IceCandidate: Codable, Sendable {
    let sdpMid: String?
    let sdpMLineIndex: Int32
    let candidate: String
}

struct IceServer: Sendable {
    let urls: [String]
    let username: String?
    let credential: String?

    var hasTURNURL: Bool {
        urls.contains { $0.hasPrefix("turn:") || $0.hasPrefix("turns:") }
    }

    static let defaultServers: [IceServer] = [
        IceServer(urls: ["stun:stun.l.google.com:19302"], username: nil, credential: nil),
        IceServer(urls: ["stun:stun1.l.google.com:19302"], username: nil, credential: nil),
        IceServer(urls: ["stun:stun2.l.google.com:19302"], username: nil, credential: nil),
        IceServer(urls: ["stun:stun6.l.google.com:19302"], username: nil, credential: nil),
        // Cloudflare STUN — second provider for resilience against Google STUN outages
        IceServer(urls: ["stun:stun.cloudflare.com:3478"], username: nil, credential: nil)
    ]
}

struct MediaTracks: Sendable {
    let audioEnabled: Bool
    let videoEnabled: Bool
}

enum CallMediaType: Sendable {
    case audioOnly
    case audioVideo
}

// MARK: - Peer Connection State

enum PeerConnectionState: String, Sendable {
    case new
    case connecting
    case checking      // ICE checking — UX warning lors d'une nouvelle tentative de connexion
    case connected
    case disconnected
    case reconnecting  // ICE restart en cours après perte de connectivité
    case failed
    case closed
}

// MARK: - Call Stats

struct CallStats: Equatable, Sendable {
    let roundTripTimeMs: Double
    let packetsLost: Int
    let bandwidth: Int
    /// Cumulative bytes received (sum of inbound-rtp `bytesReceived`). Paired
    /// with `bandwidth` (cumulative bytes sent) to report total data spent.
    let bytesReceived: Int
    let codec: String?
    let inboundPacketsReceived: Int   // Phase 1 fix E6 — RTP gate (sum of all kinds)
    // §5.7 — inbound parsed per `kind` so a single-direction *per media* (audio OK
    // but video dead, or vice-versa) is diagnosable. The legacy code summed every
    // `inbound-rtp` (audio + video + rtx/fec), masking which leg was broken.
    let inboundAudioPackets: Int
    let inboundVideoPackets: Int
    // §5.8 — outbound packet count drives half-open self-heal: a real half-open
    // path is `inbound == 0 && outbound > 0`. Without the outbound side we cannot
    // distinguish a transport fault from a peer who simply muted / has mic off.
    let outboundPacketsSent: Int
    /// TWCC GCC bandwidth estimate from `candidate-pair` stats. Populated when
    /// Transport-CC is negotiated (non-zero). 0 = TWCC not yet active or not
    /// supported on this path. When non-zero this is a more authoritative signal
    /// than the RTT/loss heuristic for setting the video encoder ceiling.
    let availableOutgoingBitrateBps: Int
    /// Mean audio jitter (milliseconds) averaged across all inbound-rtp audio
    /// streams. Derived from the WebRTC `jitter` field (reported in seconds by
    /// libwebrtc; multiplied by 1000 here). 0 = no audio inbound-rtp entry yet.
    /// High jitter (> 30 ms) causes Opus PLC to degrade noticeably; this field
    /// feeds the gateway `call:quality-report` so the summary can surface it.
    let jitterMs: Double

    init(
        roundTripTimeMs: Double = 0,
        packetsLost: Int = 0,
        bandwidth: Int = 0,
        bytesReceived: Int = 0,
        codec: String? = nil,
        inboundPacketsReceived: Int = 0,
        inboundAudioPackets: Int = 0,
        inboundVideoPackets: Int = 0,
        outboundPacketsSent: Int = 0,
        availableOutgoingBitrateBps: Int = 0,
        jitterMs: Double = 0
    ) {
        self.roundTripTimeMs = roundTripTimeMs
        self.packetsLost = packetsLost
        self.bandwidth = bandwidth
        self.bytesReceived = bytesReceived
        self.codec = codec
        self.inboundPacketsReceived = inboundPacketsReceived
        self.inboundAudioPackets = inboundAudioPackets
        self.inboundVideoPackets = inboundVideoPackets
        self.outboundPacketsSent = outboundPacketsSent
        self.availableOutgoingBitrateBps = availableOutgoingBitrateBps
        self.jitterMs = jitterMs
    }
}

// MARK: - CallStats Codable (backward-compatible)

extension CallStats: Codable {
    private enum CodingKeys: String, CodingKey {
        case roundTripTimeMs, packetsLost, bandwidth, bytesReceived, codec
        case inboundPacketsReceived, inboundAudioPackets, inboundVideoPackets
        case outboundPacketsSent, availableOutgoingBitrateBps, jitterMs
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        roundTripTimeMs = try c.decode(Double.self, forKey: .roundTripTimeMs)
        packetsLost = try c.decode(Int.self, forKey: .packetsLost)
        bandwidth = try c.decode(Int.self, forKey: .bandwidth)
        bytesReceived = try c.decode(Int.self, forKey: .bytesReceived)
        codec = try c.decodeIfPresent(String.self, forKey: .codec)
        inboundPacketsReceived = try c.decode(Int.self, forKey: .inboundPacketsReceived)
        inboundAudioPackets = try c.decode(Int.self, forKey: .inboundAudioPackets)
        inboundVideoPackets = try c.decode(Int.self, forKey: .inboundVideoPackets)
        outboundPacketsSent = try c.decode(Int.self, forKey: .outboundPacketsSent)
        availableOutgoingBitrateBps = try c.decode(Int.self, forKey: .availableOutgoingBitrateBps)
        // Added after initial release — absent from persisted snapshots. Fall back to 0
        // so old UserDefaults CallStats data continues to decode without error.
        jitterMs = try c.decodeIfPresent(Double.self, forKey: .jitterMs) ?? 0
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(roundTripTimeMs, forKey: .roundTripTimeMs)
        try c.encode(packetsLost, forKey: .packetsLost)
        try c.encode(bandwidth, forKey: .bandwidth)
        try c.encode(bytesReceived, forKey: .bytesReceived)
        try c.encodeIfPresent(codec, forKey: .codec)
        try c.encode(inboundPacketsReceived, forKey: .inboundPacketsReceived)
        try c.encode(inboundAudioPackets, forKey: .inboundAudioPackets)
        try c.encode(inboundVideoPackets, forKey: .inboundVideoPackets)
        try c.encode(outboundPacketsSent, forKey: .outboundPacketsSent)
        try c.encode(availableOutgoingBitrateBps, forKey: .availableOutgoingBitrateBps)
        try c.encode(jitterMs, forKey: .jitterMs)
    }
}

// MARK: - Call Stats Reducer (§5.7)

extension CallStats {
    /// Minimal, `Sendable` projection of one `RTCStatistics` entry. The live
    /// `getStats` reads `RTCStatisticsReport` (a framework type that can't cross
    /// the stats callback's nonisolated boundary as-is) into `[RawEntry]`, then
    /// `reduce` turns it into a `CallStats`. Splitting the parse this way keeps the
    /// arithmetic (per-kind sums, codec resolution) pure and unit-testable without
    /// a live `RTCPeerConnection`.
    struct RawEntry: Sendable, Equatable {
        let id: String
        let type: String            // "candidate-pair" | "inbound-rtp" | "outbound-rtp" | "codec" | …
        let kind: String?           // "audio" | "video" on inbound/outbound-rtp
        let codecId: String?        // points at a "codec" entry's id
        let mimeType: String?       // only on "codec" entries, e.g. "audio/opus"
        let values: [String: Double]

        // `nonisolated` : `RawEntry` est un value type pur `Sendable` construit dans
        // le callback nonisolated `RTCPeerConnection.statistics` (thread du framework
        // WebRTC, hors main actor). Sous `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`,
        // l'init serait sinon inféré `@MainActor` -> warning Swift 6 (futur error) à
        // chaque construction off-main. Toutes les stored props sont des value types
        // Sendable, donc la construction nonisolated est sûre.
        nonisolated init(
            id: String,
            type: String,
            kind: String? = nil,
            codecId: String? = nil,
            mimeType: String? = nil,
            values: [String: Double] = [:]
        ) {
            self.id = id
            self.type = type
            self.kind = kind
            self.codecId = codecId
            self.mimeType = mimeType
            self.values = values
        }
    }

    /// Pure reducer (§5.7 fix for bug j). Resolves the real codec name via
    /// `codecId → codec.mimeType` (the legacy code stored the stats-graph
    /// reference id, e.g. `"COT01_111"`, instead of `"opus"`/`"H264"`) and keeps
    /// inbound audio/video separate.
    static func reduce(entries: [RawEntry]) -> CallStats {
        var rtt = 0.0
        var availableOutgoingBitrateBps = 0
        var packetsLost = 0
        var bytesSent = 0
        var bytesReceived = 0
        var inboundAudio = 0
        var inboundVideo = 0
        var outbound = 0
        var primaryCodecId: String?
        var audioJitterSum = 0.0
        var audioJitterCount = 0

        let codecMime: [String: String] = entries.reduce(into: [:]) { map, entry in
            guard entry.type == "codec", let mime = entry.mimeType else { return }
            map[entry.id] = mime
        }

        for entry in entries {
            switch entry.type {
            case "candidate-pair":
                if let value = entry.values["currentRoundTripTime"] { rtt = value * 1000 }
                if let bps = entry.values["availableOutgoingBitrate"] { availableOutgoingBitrateBps = Int(bps) }
            case "inbound-rtp":
                if let lost = entry.values["packetsLost"] { packetsLost += Int(lost) }
                let received = Int(entry.values["packetsReceived"] ?? 0)
                if entry.kind == "video" {
                    inboundVideo += received
                } else {
                    inboundAudio += received
                    // libwebrtc reports jitter in seconds; accumulate for mean across audio streams
                    if let j = entry.values["jitter"] { audioJitterSum += j; audioJitterCount += 1 }
                }
                bytesReceived += Int(entry.values["bytesReceived"] ?? 0)
                if primaryCodecId == nil { primaryCodecId = entry.codecId }
            case "outbound-rtp":
                outbound += Int(entry.values["packetsSent"] ?? 0)
                bytesSent += Int(entry.values["bytesSent"] ?? 0)
            default:
                break
            }
        }

        let resolvedCodec: String? = primaryCodecId
            .flatMap { codecMime[$0] }
            .map { mime in mime.split(separator: "/").last.map(String.init) ?? mime }

        let jitterMs = audioJitterCount > 0 ? (audioJitterSum / Double(audioJitterCount)) * 1000 : 0

        return CallStats(
            roundTripTimeMs: rtt,
            packetsLost: packetsLost,
            bandwidth: bytesSent,
            bytesReceived: bytesReceived,
            codec: resolvedCodec,
            inboundPacketsReceived: inboundAudio + inboundVideo,
            inboundAudioPackets: inboundAudio,
            inboundVideoPackets: inboundVideo,
            outboundPacketsSent: outbound,
            availableOutgoingBitrateBps: availableOutgoingBitrateBps,
            jitterMs: jitterMs
        )
    }
}

// MARK: - Call Reliability Policy (§5.8)

/// Pure, stateless reliability decisions for the call FSM. Extracted so the
/// half-open self-heal and the `.connecting` watchdog can be unit-tested without
/// a live `RTCPeerConnection` or device. `CallManager` owns the timers and the
/// side effects (ICE restart, end-call); this type owns only the *decision*.
nonisolated enum CallReliabilityPolicy {

    /// EXIGENCE №1 — degraded-signaling indicator. The media path (P2P
    /// DTLS-SRTP) is decoupled from the signaling socket: a socket drop during
    /// an established call never tears it down (no listener has that power —
    /// re-join/resync happens on `didReconnect`). This policy only drives the
    /// discreet in-call hint that signaling operations (media toggles, hangup
    /// relay, ICE relay) are deferred until the socket returns.
    static func signalingDegraded(callEstablished: Bool, socketConnected: Bool) -> Bool {
        callEstablished && !socketConnected
    }

    /// §5.8 — half-open media detection. We keep `.connected` immediately on
    /// `RTCPeerConnectionState.connected` for snappy UX, but a real half-open
    /// path (we send RTP, the peer's RTP never arrives) is silent audio. After a
    /// grace window we self-heal with exactly one ICE restart.
    enum HalfOpenOutcome: Equatable {
        case healthy        // bidirectional RTP confirmed — stop monitoring
        case waiting        // not enough evidence yet — keep polling
        case healHalfOpen   // outbound flowing, inbound stalled → ICE restart
    }

    static func evaluateHalfOpen(
        inboundPackets: Int,
        outboundPackets: Int,
        secondsInConnected: TimeInterval,
        requiredInboundPackets: Int = QualityThresholds.rtpGateRequiredPackets,
        graceSeconds: TimeInterval = QualityThresholds.halfOpenHealGraceSeconds
    ) -> HalfOpenOutcome {
        if inboundPackets >= requiredInboundPackets { return .healthy }
        // Below the inbound threshold. Within the grace window the first second
        // after ICE/DTLS is legitimately packet-free — keep waiting.
        guard secondsInConnected >= graceSeconds else { return .waiting }
        // Past grace, still no inbound. Only a true *half-open* (we ARE sending)
        // warrants an ICE restart; if we're not sending either it's a mute /
        // mic-off business condition, not a transport fault — keep waiting.
        return outboundPackets > 0 ? .healHalfOpen : .waiting
    }

    /// §5.8 / bug h — `.connecting` watchdog. ICE/DTLS can wedge with `.connected`
    /// never arriving. We give it a budget, try ONE ICE restart, then fail rather
    /// than spin forever (the old code only guarded `.ringing`).
    enum ConnectingOutcome: Equatable {
        case waiting
        case restartICE
        case fail
    }

    static func evaluateConnecting(
        secondsInConnecting: TimeInterval,
        didAttemptRestart: Bool,
        restartAfterSeconds: TimeInterval = QualityThresholds.connectingRestartSeconds,
        failAfterSeconds: TimeInterval = QualityThresholds.connectingFailSeconds
    ) -> ConnectingOutcome {
        if secondsInConnecting >= failAfterSeconds { return .fail }
        if secondsInConnecting >= restartAfterSeconds && !didAttemptRestart { return .restartICE }
        return .waiting
    }

    /// `.reconnecting` watchdog. `attemptReconnection` self-limits at
    /// `maxReconnectAttempts`, but it is only re-armed by a *fresh* signal — a new
    /// `RTCPeerConnectionState` callback, a network-path flap, or a nil ICE-restart
    /// offer. When an ICE restart is sent and then silently stalls (peer never
    /// answers, transport wedged with no new state transition), none of those fire,
    /// the attempt counter never advances, and the call hangs in `.reconnecting`
    /// forever. This watchdog gives each attempt a budget; once it overruns we
    /// escalate (`.retry` → `attemptReconnection`), which advances the counter and
    /// eventually trips the cap → `.connectionLost`. Symmetric to the `.connecting`
    /// watchdog, for the post-`.connected` reconnection path.
    enum ReconnectingOutcome: Equatable {
        case waiting
        case retry
    }

    static func evaluateReconnecting(
        secondsInAttempt: TimeInterval,
        budgetSeconds: TimeInterval = QualityThresholds.reconnectAttemptBudgetSeconds
    ) -> ReconnectingOutcome {
        secondsInAttempt >= budgetSeconds ? .retry : .waiting
    }

    /// Reconnection-trigger arbitration. Reconnection is requested from several
    /// independent sources: NWPathMonitor edges (path lost / restored / interface
    /// handoff), the PC-state delegate, the watchdogs, and the ICE-restart
    /// failure path. Without arbitration a single network blip fires several of
    /// them back-to-back and each advances `reconnectAttempt` — the
    /// `maxReconnectAttempts` budget is spent on redundant trigger *edges*
    /// instead of reconnection *cycles*, and a call that would survive a 1-2s
    /// hiccup drops with `.connectionLost`.
    enum ReconnectTriggerOutcome: Equatable {
        case startCycle   // not reconnecting yet — begin a cycle (advance budget)
        case coalesce     // cycle in flight — re-arm its ICE restart, do NOT advance
        case escalate     // watchdog overrun / failed restart — advance budget
    }

    static func evaluateReconnectTrigger(
        isAlreadyReconnecting: Bool,
        isEscalation: Bool
    ) -> ReconnectTriggerOutcome {
        if isEscalation { return .escalate }
        return isAlreadyReconnecting ? .coalesce : .startCycle
    }

    /// FSM §3.2 invariant — `.reconnecting` is reserved for calls whose media
    /// negotiation has begun (remote description applied): `.connected`,
    /// `.reconnecting`, and `.connecting` (answer received, ICE in flight).
    /// Before the answer (.ringing/.offering) an ICE restart is semantically
    /// impossible — no remote description exists — and flipping the state made
    /// CallView render the connected layout (frozen 00:00 timer) while the
    /// callee was still ringing.
    static func reconnectingAllowed(from state: CallState) -> Bool {
        switch state {
        case .connected, .reconnecting, .connecting: return true
        case .idle, .ringing, .offering, .ended: return false
        }
    }

    /// Duration-clock decision at the `.connected` transition. Reset on a fresh
    /// connect AND on a first-ever connect that transited through
    /// `.reconnecting` (pre-establishment ICE restart) — `durationTask` dies on
    /// a nil `callStartDate`, so skipping the reset froze the timer at 00:00.
    /// Preserve only on a genuine mid-call reconnect (running clock exists).
    static func shouldResetCallClock(wasReconnecting: Bool, hasExistingStartDate: Bool) -> Bool {
        !wasReconnecting || !hasExistingStartDate
    }

    /// Seconds after quality-monitor start during which the BWE signal is
    /// ignored: GCC ramps from its conservative kick-off estimate (~300 kbps)
    /// and converges in ~5-10 s on a healthy path — reading the ramp as
    /// .poor flags a perfectly good call.
    static let bweWarmupSeconds: TimeInterval = 15

    /// Merge policy for the two quality signals (RTT/loss heuristic vs TWCC
    /// GCC bandwidth estimate). The BWE ladder is calibrated against VIDEO
    /// tier bitrates (poor < 400 kbps): on an audio-only call GCC never
    /// probes above the ~64 kbps the Opus encoder asks for, so every audio
    /// call read as .poor/.critical for its whole duration (prod analytics
    /// 2026-07-03: RTT 7 ms, 0 % loss, still "poor"). The BWE signal only
    /// constrains the level when video is actually being sent AND the
    /// estimator has had time to converge; the RTT/loss heuristic is never
    /// gated.
    static func effectiveQualityLevel(
        heuristic: VideoQualityLevel,
        bwe: VideoQualityLevel?,
        isSendingVideo: Bool,
        secondsSinceMonitorStart: TimeInterval
    ) -> VideoQualityLevel {
        guard isSendingVideo,
              secondsSinceMonitorStart >= bweWarmupSeconds,
              let bwe else { return heuristic }
        return min(heuristic, bwe)
    }

    /// Delay before the periodic TURN credential refresh, at 80% of the TTL.
    /// A degenerate TTL (zero, negative, or shorter than the floor) clamps to
    /// `minimumDelay` instead of disarming the refresh — silently skipping it
    /// would let mid-call TURN credentials expire and kill relayed calls at the
    /// credential horizon (coturn rejects allocation refreshes past the expiry
    /// embedded in the username).
    static func turnRefreshDelay(
        ttl: TimeInterval,
        minimumDelay: TimeInterval = QualityThresholds.turnMinRefreshDelaySeconds
    ) -> TimeInterval {
        max(minimumDelay, ttl * 0.8)
    }

    /// Stuck-muted CallKit fallback gate. On iPhone/iPad,
    /// `RTCAudioSession.isAudioEnabled` is flipped ONLY by `provider:didActivate:`.
    /// If CallKit never delivers it, the call sits `.connected` with dead mic and
    /// speaker and no safety net (the half-open detector keys off RTP counters,
    /// which comfort-noise/DTX packets keep non-zero). Force activation only in
    /// that exact stuck state — never when CallKit did its job, never on Mac
    /// (which self-activates in `transitionToConnected`), never after the call
    /// ended.
    static func shouldForceAudioSessionActivation(
        usesCallKit: Bool,
        didActivateFired: Bool,
        isAudioEnabled: Bool,
        callIsActive: Bool
    ) -> Bool {
        usesCallKit && callIsActive && !didActivateFired && !isAudioEnabled
    }

    /// Whether the platform's CallKit stack can actually drive a call.
    /// Two environments must run calls entirely in-app instead:
    /// - iOS-app-on-Mac: `reportNewIncomingCall` fails (error 3) and
    ///   `provider:didActivate:` never fires — CallKit half-succeeds then
    ///   leaves a stuck "call in progress".
    /// - Simulator: `provider:didActivate:` never fires either, and
    ///   callservicesd autonomously sends `CXEndCallAction` ~3s after an
    ///   outgoing start, killing the call while still `.ringing`.
    /// Both take the `[AUDIO_FALLBACK]` self-activation path in
    /// `transitionToConnected`.
    static func platformUsesCallKit(isiOSAppOnMac: Bool, isSimulator: Bool) -> Bool {
        !isiOSAppOnMac && !isSimulator
    }

    /// Whether the call UI must render the video layout. True as soon as ANY
    /// stream is visible: the local camera, or the peer's camera during a
    /// unilateral escalation of an audio call (renegotiation delivers the
    /// remote track while `localVideoEnabled` stays false). Gating the layout
    /// on the local camera alone leaves the incoming H264 stream decoded but
    /// never rendered.
    static func videoLayoutActive(
        localVideoEnabled: Bool,
        hasRemoteVideoTrack: Bool,
        remoteVideoEnabled: Bool
    ) -> Bool {
        localVideoEnabled || (hasRemoteVideoTrack && remoteVideoEnabled)
    }
}

/// Sustained-degradation gate for the "Connexion instable" pill. One 5 s
/// stats tick is not a bad call — a transient RTT spike or a single loss
/// burst self-heals without the user ever needing a warning. Alert only
/// after two consecutive degraded ticks (~10 s); a single healthy tick
/// clears immediately (fast recovery feedback). `.fair` is a working link —
/// it never alerts.
nonisolated struct DegradedLinkTracker {
    static let consecutiveTicksToAlert = 2

    private var degradedStreak = 0
    private(set) var isDegraded = false

    @discardableResult
    mutating func record(level: VideoQualityLevel) -> Bool {
        switch level {
        case .poor, .critical:
            degradedStreak += 1
            if degradedStreak >= Self.consecutiveTicksToAlert { isDegraded = true }
        case .excellent, .good, .fair:
            degradedStreak = 0
            isDegraded = false
        }
        return isDegraded
    }

    mutating func reset() {
        degradedStreak = 0
        isDegraded = false
    }
}

/// Half-open detection state across connection epochs.
///
/// Replaces the poll-loop-local `halfOpenSettled` bool, which had two defects:
/// 1. It was only reset when the loop *observed* `.reconnecting`; a reconnection
///    cycle completing between two poll ticks left it `true` for the rest of the
///    call (self-heal frozen).
/// 2. Re-arming compared *cumulative* RTP counters against the threshold, so a
///    post-restart half-open was instantly declared `.healthy` on the strength
///    of pre-restart traffic.
///
/// The owner bumps `connectionEpoch` on every `transitionToConnected`; this
/// state re-arms itself whenever the epoch changes, snapshots the counters as
/// the epoch baseline, and evaluates per-epoch *deltas*. Returns `nil` once the
/// epoch has settled (healthy confirmed or the one allowed self-heal fired).
nonisolated struct HalfOpenMonitorState {
    private var observedEpoch = Int.min
    private var settled = false
    private var epochStart = Date.distantPast
    private var baselineInbound = 0
    private var baselineOutbound = 0

    /// Cheap pre-check so the poll loop can skip the (relatively expensive)
    /// WebRTC stats fetch once the current epoch has settled.
    func needsEvaluation(epoch: Int) -> Bool {
        epoch != observedEpoch || !settled
    }

    mutating func evaluate(
        epoch: Int,
        inboundPackets: Int,
        outboundPackets: Int,
        now: Date = Date(),
        requiredInboundPackets: Int = QualityThresholds.rtpGateRequiredPackets,
        graceSeconds: TimeInterval = QualityThresholds.halfOpenHealGraceSeconds
    ) -> CallReliabilityPolicy.HalfOpenOutcome? {
        if epoch != observedEpoch {
            observedEpoch = epoch
            settled = false
            epochStart = now
            baselineInbound = inboundPackets
            baselineOutbound = outboundPackets
        }
        guard !settled else { return nil }
        let outcome = CallReliabilityPolicy.evaluateHalfOpen(
            inboundPackets: inboundPackets - baselineInbound,
            outboundPackets: outboundPackets - baselineOutbound,
            secondsInConnected: now.timeIntervalSince(epochStart),
            requiredInboundPackets: requiredInboundPackets,
            graceSeconds: graceSeconds
        )
        if outcome == .healthy || outcome == .healHalfOpen { settled = true }
        return outcome
    }
}

// MARK: - WebRTC Client Protocol

protocol WebRTCClientProviding: AnyObject {
    var delegate: (any WebRTCClientDelegate)? { get set }
    var isConnected: Bool { get }
    var localVideoTrack: Any? { get }
    var remoteVideoTrack: Any? { get }

    func configure(iceServers: [IceServer]) throws
    func updateIceServers(_ iceServers: [IceServer])
    /// §3.4 perfect negotiation — sets the deterministic polite/impolite role.
    /// Computed symmetrically by both peers (lexicographically-smaller userId is
    /// polite) and fixed once for the call's lifetime, independent of caller/
    /// callee, so it survives renegotiations. The client stores it and uses it
    /// in the glare-collision guard.
    func setNegotiationRole(isPolite: Bool)
    func createOffer() async throws -> SessionDescription
    /// P0-4 — schedule an ICE restart on the next `createOffer()`. Must be
    /// called before `createOffer()` to set the `IceRestart: true` constraint
    /// so the SDP carries new ICE credentials and the peer reconnects.
    func restartIce()
    func createAnswer(for offer: SessionDescription) async throws -> SessionDescription
    func setRemoteAnswer(_ answer: SessionDescription) async throws
    func addIceCandidate(_ candidate: IceCandidate) async throws
    func startLocalMedia(type: CallMediaType) async throws
    func toggleAudio(_ enabled: Bool)
    func toggleVideo(_ enabled: Bool)
    /// Applies adaptive video sender caps (max bitrate / framerate / resolution
    /// downscale). No-op on audio-only calls (no video transceiver). Driven by
    /// the quality ladder in `WebRTCService.adjustBitrate`.
    func applyVideoEncoding(maxBitrateBps: Int, maxFramerate: Int, scaleResolutionDownBy: Double)
    /// Applies an adaptive audio sender cap (max bitrate). Called by
    /// `WebRTCService.adjustBitrate` when the quality ladder changes tier so
    /// the encoder sheds bandwidth on a degraded link rather than competing
    /// with video for the available budget. Min bitrate is always preserved
    /// at the value set by `applyAudioCodecPreferences` (16 kbps floor).
    func applyAudioEncoding(maxBitrateBps: Int)
    /// Whether a local camera track currently exists (audio-only calls have
    /// none until upgraded). Drives the self-preview / camera-toggle UI.
    var hasLocalVideoTrack: Bool { get }
    /// §5.4 mid-call audio→video upgrade: lazily build the camera track, attach
    /// it to the reserved video transceiver and flip to sendRecv. Returns true
    /// when a renegotiation (createOffer) is required.
    func enableLocalVideo() async throws -> Bool
    /// §5.4 mid-call video→audio downgrade: stop the camera, detach the track,
    /// flip the transceiver to recvonly. Returns true when renegotiation needed.
    func disableLocalVideo() async -> Bool
    func switchCamera() async throws
    /// §7.1 — available capture cameras (front/back/Continuity/external). Empty
    /// on the no-WebRTC stub. Drives the Mac/iPad camera picker.
    func availableCameras() -> [CameraDeviceOption]
    /// §7.1 — switch the active capture device by `uniqueID` (Continuity / USB
    /// camera selection). Reuses the same stop/start path as `switchCamera`.
    func switchToCamera(uniqueID: String) async throws
    func getStats() async -> CallStats?
    func createDataChannel(label: String) -> Bool
    func sendDataChannelMessage(_ data: Data)
    /// RFC 4733 DTMF: forward digits to the audio transceiver's RTCDTMFSender.
    /// Called from `CXPlayDTMFCallAction` when the user presses digits in the
    /// CallKit keypad (e.g. conference PIN, IVR navigation). No-op when the
    /// audio transceiver's DTMF sender is unavailable or the connection is not
    /// established. Valid characters: 0-9, A-D, *, #, comma (2 s pause).
    func sendDTMF(digits: String)
    func disconnect()

    var audioEffectsService: CallAudioEffectsServiceProviding? { get }
    var videoFilterPipeline: VideoFilterPipeline { get }
    func setAudioEffect(_ effect: AudioEffectConfig?) throws
    func updateAudioEffectParams(_ config: AudioEffectConfig) throws
}

// MARK: - DataChannel Transcription Message

struct DataChannelTranscriptionMessage: Codable, Sendable {
    let type: String  // "transcription-segment"
    let text: String
    let speakerId: String
    let startTime: Double
    let isFinal: Bool
    let language: String
    let translatedText: String?
    let translatedLanguage: String?
}

// MARK: - WebRTC Client Delegate

protocol WebRTCClientDelegate: AnyObject {
    func webRTCClient(_ client: any WebRTCClientProviding, didGenerateCandidate candidate: IceCandidate)
    func webRTCClient(_ client: any WebRTCClientProviding, didChangeConnectionState state: PeerConnectionState)
    // `sending` lets the non-Sendable RTC track cross from the WebRTC framework's
    // own thread into our `@MainActor` Task without a Swift 6 strict-concurrency
    // diagnostic. The framework hands us a unique reference and never reads it
    // again after the delegate fires, so exclusive transfer is sound.
    func webRTCClient(_ client: any WebRTCClientProviding, didReceiveRemoteVideoTrack track: sending Any)
    func webRTCClient(_ client: any WebRTCClientProviding, didReceiveRemoteAudioTrack track: sending Any)
    func webRTCClient(_ client: any WebRTCClientProviding, didReceiveDataChannelMessage data: Data)
}

// MARK: - Call End Reason

enum CallEndReason: Equatable, Sendable {
    case local
    case remote
    case rejected
    case missed
    case failed(String)
    case connectionLost
}

extension CallEndReason {
    nonisolated static func == (lhs: CallEndReason, rhs: CallEndReason) -> Bool {
        switch (lhs, rhs) {
        case (.local, .local), (.remote, .remote), (.rejected, .rejected),
             (.missed, .missed), (.connectionLost, .connectionLost): return true
        case (.failed(let a), .failed(let b)): return a == b
        default: return false
        }
    }
}

// MARK: - Call Display Mode

enum CallDisplayMode: Sendable {
    case fullScreen
    case pip
}

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
    static let poorRTT: Double = 500

    static let excellentPacketLoss: Double = 0.01
    static let goodPacketLoss: Double = 0.05
    static let poorPacketLoss: Double = 0.10

    // MARK: Video quality tier boundaries (used by VideoQualityLevel.from(rtt:packetLoss:))
    // Note: excellentRTT (100), poorRTT (500), excellentPacketLoss (0.01),
    // goodPacketLoss (0.05), and poorPacketLoss (0.10) are shared across both
    // audio and video classification; the two intermediate video boundaries below
    // are video-specific.

    /// RTT boundary between good and fair video quality tiers.
    /// Above this → at most .fair; at or below → may be .good or .excellent.
    static let videoFairRTT: Double = 200

    /// RTT boundary between fair and poor video quality tiers.
    /// Above this → at most .poor; at or below → may be .fair or better.
    static let videoPoorRTT: Double = 300

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
    /// PiP thumbnail resting position. Provides room for the minimize chevron
    /// and the call-duration badge above the safe area edge.
    /// Source of truth for `CallView.pipCenter(_:in:safeArea:)`.
    static let pipTopClearance: CGFloat = 20

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
    /// Source of truth for both `P2PWebRTCClient` audio encoding and
    /// `AudioConfig.default.minBitrateBps` in `CallMediaConfig`.
    static let audioCodecFloorBitrateBps: Int = 16_000

    // Audit P2-iOS-12 — bumped from 3s to 5s. RTCPeerConnection.statistics
    // walks the entire stats graph (~5–10ms CPU per call); 5s is the
    // industry baseline (WhatsApp/Jitsi use 2–5s during reconnection only).
    static let statsIntervalSeconds: TimeInterval = 5.0
    /// Phase 1 fix P1: cellular networks have RTT 800ms+ ; 5s heartbeat with
    /// 15s lost was too aggressive (false-positive reconnects). SOTA matches
    /// WhatsApp/Telegram with 10s/30s. Reference §5.12.
    static let heartbeatIntervalSeconds: TimeInterval = 10.0

    /// 3 missed beats (~30s) marks heartbeat as lost. After this, FSM
    /// transitions active → reconnecting.
    static let heartbeatLostThresholdSeconds: TimeInterval = 30.0

    /// Phase 1 fix P10: cellular ACK round-trip can take 3-4s in poor signal.
    /// 5s timeout absorbs worst-case without false positives.
    static let heartbeatAckTimeoutSeconds: TimeInterval = 5.0
    static let maxReconnectAttempts: Int = 3
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

    static let initialVideoBitrate: Int = 500_000
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

    /// Caller-side ringing timeout. The gateway has its own 60s server-side
    /// timeout (CallEventsHandler.ts §scheduleRingingTimeout) but a snappier
    /// 45s client-side cutoff gives the user a faster fail path when:
    ///   - the recipient is unreachable yet the gateway delays the no_answer
    ///   - the network drops the call:ended event before we receive it
    ///   - the server timeout misfires
    /// Picked at 45s to align with WhatsApp/FaceTime UX while leaving 15s
    /// headroom under the gateway's hard cap.
    static let outgoingRingTimeoutSeconds: TimeInterval = 45.0

    /// Default TURN credential TTL (seconds) used when the signalling path does
    /// not carry an explicit `ttl` field (VoIP push, socket-only incoming). The
    /// 80%-of-TTL refresh fires at 384 s — well before any standard TURN server
    /// eviction window (Coturn default 600 s; Meeshy gateway issues 480 s by
    /// default so credentials stay valid for the first 96 s after refresh).
    static let turnDefaultCredentialTTLSeconds: TimeInterval = 480

    /// Minimum delay (seconds) before a TURN credential refresh, regardless of
    /// the TTL reported by the gateway. Guards against a malformed TTL=0 response
    /// that would otherwise trigger an immediate refresh on every call tick.
    static let turnMinRefreshDelaySeconds: TimeInterval = 30

    /// Delay after `.connected` before the stuck-muted CallKit fallback
    /// re-checks whether `provider:didActivate:` ever fired. CallKit normally
    /// delivers it within ~500 ms of the call connecting; 2 s is comfortably
    /// past that without leaving the user in a silent call for long.
    static let stuckMutedFallbackDelaySeconds: TimeInterval = 2.0

    /// How long to wait for an SDP offer after the callee answers before
    /// treating the call as timed-out and failing it. Covers worst-case
    /// signalling round-trips on bad cellular (NAT traversal + server hop).
    /// Matches the gateway's own offer-expiry window.
    static let sdpOfferTimeoutSeconds: TimeInterval = 30

    /// Settle window after `callState` transitions to `.ended` before the
    /// call identity (callId / remoteUserId / callDuration) is cleared.
    /// Gives the UI time to read final stats before teardown completes.
    static let callEndSettleSeconds: TimeInterval = 1.5

    /// HTTP timeout for the VoIP push freshness check (GET /calls/:id).
    /// 4 s absorbs worst-case DNS + TLS + gateway response while still
    /// failing fast enough to avoid blocking CallKit for a stale push.
    static let voipFreshnessTimeoutSeconds: TimeInterval = 4.0

    /// How often the data-channel keep-alive ping fires. 15 s matches the
    /// TURN server's minimum activity requirement (Coturn refreshTimeout).
    static let dataChannelPingIntervalSeconds: TimeInterval = 15

    /// How long a remote-quality-degraded badge stays visible before it
    /// auto-resets to healthy. 15 s is long enough to be meaningful without
    /// persisting after a transient blip self-heals.
    static let remoteQualityResetSeconds: TimeInterval = 15

    // MARK: Opus fmtp codec hints (mungeOpusSDP in P2PWebRTCClient)

    /// `maxaveragebitrate` fmtp hint for Opus. 64 kbps matches the
    /// `defaultBitrate` adaptation target — the SDP hint is the absolute
    /// encoder ceiling; the RtpEncoding max handles the dynamic range.
    static let opusFmtpMaxAverageBitrate: Int = 64_000
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

// MARK: - Video Quality Level (§4.8)

// `nonisolated` — pure value ladder consumed from nonisolated policy code
// (CallReliabilityPolicy.effectiveQualityLevel needs the Comparable
// conformance outside the MainActor) and libwebrtc stats callbacks.
nonisolated enum VideoQualityLevel: String, Comparable, Sendable {
    case excellent
    case good
    case fair
    case poor
    case critical

    private var rank: Int {
        switch self {
        case .excellent: 4
        case .good: 3
        case .fair: 2
        case .poor: 1
        case .critical: 0
        }
    }

    static func < (lhs: VideoQualityLevel, rhs: VideoQualityLevel) -> Bool {
        lhs.rank < rhs.rank
    }

    var targetResolutionHeight: Int {
        switch self {
        case .excellent: 720
        case .good: 720
        case .fair: 480
        case .poor: 360
        case .critical: 0
        }
    }

    var targetFPS: Int {
        switch self {
        case .excellent: 30
        case .good: 24
        case .fair: 20
        case .poor: 15
        case .critical: 0
        }
    }

    var targetVideoBitrate: Int {
        switch self {
        case .excellent: 2_500_000
        case .good: 1_500_000
        case .fair: 800_000
        case .poor: 400_000
        case .critical: 0
        }
    }

    static func from(rtt: Double, packetLoss: Double) -> VideoQualityLevel {
        if rtt > QualityThresholds.poorRTT || packetLoss > QualityThresholds.poorPacketLoss { return .critical }
        if rtt > QualityThresholds.videoPoorRTT || packetLoss > QualityThresholds.goodPacketLoss { return .poor }
        if rtt > QualityThresholds.videoFairRTT || packetLoss > QualityThresholds.videoFairPacketLoss { return .fair }
        if rtt > QualityThresholds.excellentRTT || packetLoss > QualityThresholds.excellentPacketLoss { return .good }
        return .excellent
    }

    /// Map TWCC GCC `availableOutgoingBitrate` (bps) to a quality level. Thresholds
    /// are set conservatively below each tier's `targetVideoBitrate` to leave headroom
    /// for audio + RTCP overhead. Returns `.critical` when `bps == 0` (TWCC not yet active).
    static func from(availableOutgoingBitrateBps bps: Int) -> VideoQualityLevel {
        if bps >= QualityThresholds.bweExcellentBps { return .excellent }
        if bps >= QualityThresholds.bweGoodBps      { return .good }
        if bps >= QualityThresholds.bweFairBps       { return .fair }
        if bps >= QualityThresholds.bwePoorBps       { return .poor }
        return .critical
    }
}

// MARK: - Errors

enum WebRTCError: Error, LocalizedError, Sendable {
    case noPeerConnection
    case failedToCreatePeerConnection
    case failedToCreateSDP
    case noCameraAvailable
    case noCameraFormatAvailable
    case notSupported
    case simulatorVideoUnsupported
    case offerIgnored
    /// The user has denied camera access in iOS Settings. The call can continue
    /// as audio-only; the user must re-grant permission to enable video.
    case cameraPermissionDenied

    var errorDescription: String? {
        switch self {
        case .noPeerConnection: "No peer connection available"
        case .failedToCreatePeerConnection: "Failed to create peer connection"
        case .failedToCreateSDP: "Failed to create SDP"
        case .noCameraAvailable: "No camera available"
        case .noCameraFormatAvailable: "No suitable camera format"
        case .notSupported: "WebRTC not available on this device"
        case .simulatorVideoUnsupported:
            "Video unsupported on iOS Simulator (FigCaptureSourceRemote XPC failure). " +
            "Use a real device for video calls."
        case .offerIgnored:
            "Colliding offer ignored by the impolite peer (perfect negotiation glare)"
        case .cameraPermissionDenied:
            "Camera access denied. Enable it in Settings → Meeshy → Camera."
        }
    }
}

// MARK: - Thermal-aware video encoder ceiling (§5.6)

/// §5.6 — thermal-aware video encoder ceiling. The network-driven quality
/// ladder (`WebRTCService.adjustBitrate`) picks an encoder target from RTT +
/// packet loss; this composes a SECOND, independent ceiling from the device's
/// `ProcessInfo.thermalState` so a hot device sheds encode load (the #1 cause
/// of dropped frames + battery drain in long video calls) regardless of how
/// healthy the network looks.
///
/// Pure + deterministic: maps a thermal state to multiplicative/absolute caps,
/// then takes the MORE conservative of the network target and the thermal cap
/// on each axis. `.nominal` is a strict no-op.
enum VideoThermalProfile {
    struct Ceiling: Equatable, Sendable {
        let bitrateFactor: Double   // multiplies the network bitrate target (≤ 1)
        let maxFramerate: Int       // absolute fps cap
        let minScaleDownBy: Double  // floor on resolution downscale (≥ 1)
    }

    static func ceiling(for state: ProcessInfo.ThermalState) -> Ceiling {
        switch state {
        case .nominal:  return Ceiling(bitrateFactor: 1.0, maxFramerate: 60, minScaleDownBy: 1.0)
        case .fair:     return Ceiling(bitrateFactor: 0.8, maxFramerate: 30, minScaleDownBy: 1.0)
        case .serious:  return Ceiling(bitrateFactor: 0.5, maxFramerate: 24, minScaleDownBy: 1.5)
        case .critical: return Ceiling(bitrateFactor: 0.3, maxFramerate: 15, minScaleDownBy: 2.0)
        @unknown default: return Ceiling(bitrateFactor: 1.0, maxFramerate: 60, minScaleDownBy: 1.0)
        }
    }

    /// Compose a network-derived encoder target with the thermal ceiling, taking
    /// the more conservative value on each axis. Bitrate/framerate never go below
    /// 1; scale never below 1.0.
    static func apply(
        bitrateBps: Int,
        framerate: Int,
        scaleDownBy: Double,
        thermalState: ProcessInfo.ThermalState
    ) -> (bitrateBps: Int, framerate: Int, scaleDownBy: Double) {
        let c = ceiling(for: thermalState)
        let cappedBitrate = Int((Double(bitrateBps) * c.bitrateFactor).rounded())
        let cappedFramerate = min(framerate, c.maxFramerate)
        let flooredScale = max(scaleDownBy, c.minScaleDownBy)
        return (max(1, cappedBitrate), max(1, cappedFramerate), max(1.0, flooredScale))
    }
}

// MARK: - Camera device catalog (§7.1 — Continuity / external camera picker)

/// Framework-agnostic facing of a capture device. On iOS-app-on-Mac and iPad,
/// Continuity / USB cameras report no front/back position, so we surface them as
/// `.external` (named) rather than a meaningless front/back flip.
enum CameraFacing: String, Sendable, Equatable {
    case front, back, external, unspecified
}

/// A selectable capture camera, surfaced to the call UI's device picker.
struct CameraDeviceOption: Identifiable, Equatable, Sendable {
    let id: String          // AVCaptureDevice.uniqueID
    let displayName: String
    let facing: CameraFacing

    var isExternal: Bool { facing == .external }
}

/// Pure ordering/labeling of the camera list — kept free of AVFoundation so it
/// is unit-testable from plain descriptors. The live enumeration
/// (`RTCCameraVideoCapturer.captureDevices()`) maps into `Descriptor`.
enum CameraCatalog {
    struct Descriptor: Equatable, Sendable {
        let uniqueID: String
        let localizedName: String
        let facing: CameraFacing
    }

    /// Build a stable, de-duplicated, human-ordered camera list. Ordering:
    /// front → back → external/Continuity → unspecified, then by name, so the
    /// most-expected camera leads the picker. Identically-named externals get a
    /// "(2)" suffix so two same-model cameras stay distinguishable.
    static func options(from descriptors: [Descriptor]) -> [CameraDeviceOption] {
        let order: [CameraFacing: Int] = [.front: 0, .back: 1, .external: 2, .unspecified: 3]
        var seen = Set<String>()
        let unique = descriptors.filter { seen.insert($0.uniqueID).inserted }
        let sorted = unique.sorted {
            let a = order[$0.facing] ?? 9
            let b = order[$1.facing] ?? 9
            if a != b { return a < b }
            let byName = $0.localizedName.localizedCaseInsensitiveCompare($1.localizedName)
            if byName != .orderedSame { return byName == .orderedAscending }
            // Deterministic tiebreaker (Swift's sort isn't stable) so two
            // identically-named cameras keep a fixed order in the picker.
            return $0.uniqueID < $1.uniqueID
        }
        var nameCounts: [String: Int] = [:]
        return sorted.map { d in
            let count = (nameCounts[d.localizedName] ?? 0) + 1
            nameCounts[d.localizedName] = count
            let display = count > 1 ? "\(d.localizedName) (\(count))" : d.localizedName
            return CameraDeviceOption(id: d.uniqueID, displayName: display, facing: d.facing)
        }
    }
}
