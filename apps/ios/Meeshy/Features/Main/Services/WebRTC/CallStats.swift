import Foundation

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
    let inboundAudioBytes: Int
    let inboundVideoBytes: Int
    /// Niveau audio reçu (0…1, `audioLevel` des `inbound-rtp` audio, le plus
    /// fort) — nourrit « qui parle » dans un appel de groupe (#3585). Éphémère :
    /// jamais persisté avec le diagnostic.
    let inboundAudioLevel: Double

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
        jitterMs: Double = 0,
        inboundAudioBytes: Int = 0,
        inboundVideoBytes: Int = 0,
        inboundAudioLevel: Double = 0
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
        self.inboundAudioBytes = inboundAudioBytes
        self.inboundVideoBytes = inboundVideoBytes
        self.inboundAudioLevel = inboundAudioLevel
    }
}

// MARK: - CallStats Codable (backward-compatible)

extension CallStats: Codable {
    private enum CodingKeys: String, CodingKey {
        case roundTripTimeMs, packetsLost, bandwidth, bytesReceived, codec
        case inboundPacketsReceived, inboundAudioPackets, inboundVideoPackets
        case outboundPacketsSent, availableOutgoingBitrateBps, jitterMs
        case inboundAudioBytes, inboundVideoBytes
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
        inboundAudioBytes = try c.decodeIfPresent(Int.self, forKey: .inboundAudioBytes) ?? 0
        inboundVideoBytes = try c.decodeIfPresent(Int.self, forKey: .inboundVideoBytes) ?? 0
        inboundAudioLevel = 0
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
        try c.encode(inboundAudioBytes, forKey: .inboundAudioBytes)
        try c.encode(inboundVideoBytes, forKey: .inboundVideoBytes)
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
        var inboundAudioBytes = 0
        var inboundVideoBytes = 0
        var outbound = 0
        var primaryCodecId: String?
        var audioJitterSum = 0.0
        var audioJitterCount = 0
        var audioLevel = 0.0

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
                let receivedBytes = Int(entry.values["bytesReceived"] ?? 0)
                if entry.kind == "video" {
                    inboundVideo += received
                    inboundVideoBytes += receivedBytes
                } else {
                    inboundAudio += received
                    inboundAudioBytes += receivedBytes
                    // libwebrtc reports jitter in seconds; accumulate for mean across audio streams
                    if let j = entry.values["jitter"] { audioJitterSum += j; audioJitterCount += 1 }
                    audioLevel = max(audioLevel, entry.values["audioLevel"] ?? 0)
                }
                bytesReceived += receivedBytes
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
            jitterMs: jitterMs,
            inboundAudioBytes: inboundAudioBytes,
            inboundVideoBytes: inboundVideoBytes,
            inboundAudioLevel: audioLevel
        )
    }
}
