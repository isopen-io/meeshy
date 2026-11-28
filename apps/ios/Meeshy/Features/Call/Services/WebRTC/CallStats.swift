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
    /// Mon niveau audio (0…1, `audioLevel` de la source média audio sortante,
    /// `media-source`) — nourrit l'illumination de MA vignette quand je parle
    /// (P11.5). Éphémère comme `inboundAudioLevel`.
    let outboundAudioLevel: Double
    /// #8698 — whether the selected ICE pair rides a TURN relay (`true`) or a
    /// direct host/srflx path (`false`); `nil` while no pair is selected.
    /// Ephemeral like `inboundAudioLevel`: never persisted with the diagnostic.
    let relayed: Bool?
    /// #11294 — gels, limitation, tampon de gigue, masquage, NACK et PLI.
    /// Éphémère comme `relayed` : jamais persisté avec le diagnostic.
    let mediaQuality: CallMediaQuality

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
        inboundAudioLevel: Double = 0,
        outboundAudioLevel: Double = 0,
        relayed: Bool? = nil,
        mediaQuality: CallMediaQuality = .none
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
        self.outboundAudioLevel = outboundAudioLevel
        self.relayed = relayed
        self.mediaQuality = mediaQuality
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
        outboundAudioLevel = 0
        relayed = nil
        mediaQuality = .none
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
        let strings: [String: String]

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
            values: [String: Double] = [:],
            strings: [String: String] = [:]
        ) {
            self.id = id
            self.type = type
            self.kind = kind
            self.codecId = codecId
            self.mimeType = mimeType
            self.values = values
            self.strings = strings
        }

        nonisolated static let numericKeys = [
            "currentRoundTripTime", "availableOutgoingBitrate",
            "packetsLost", "packetsReceived",
            "packetsSent", "bytesSent", "bytesReceived", "jitter", "audioLevel",
            "nominated", "priority", "freezeCount", "totalFreezesDuration", "framesPerSecond",
            "jitterBufferDelay", "jitterBufferEmittedCount", "concealedSamples", "nackCount", "pliCount",
            "roundTripTime"
        ]

        nonisolated static let stringKeys = [
            "selectedCandidatePairId", "localCandidateId", "remoteCandidateId",
            "candidateType", "state", "qualityLimitationReason"
        ]

        /// Projects one libwebrtc stats entry (`RTCStatistics.values`) onto the
        /// `Sendable` fields the reducer reads — numbers as `Double`, the ICE
        /// route identifiers as `String`.
        nonisolated init(id: String, type: String, raw: [String: NSObject]) {
            self.init(
                id: id,
                type: type,
                kind: (raw["kind"] as? String) ?? (raw["mediaType"] as? String),
                codecId: raw["codecId"] as? String,
                mimeType: raw["mimeType"] as? String,
                values: Self.numericKeys.reduce(into: [:]) { map, key in
                    if let number = raw[key] as? NSNumber { map[key] = number.doubleValue }
                },
                strings: Self.stringKeys.reduce(into: [:]) { map, key in
                    if let text = raw[key] as? String { map[key] = text }
                }
            )
        }
    }

    /// #8698 — the route of the SELECTED ICE pair (`selectedCandidatePair`).
    /// Relayed as soon as either end is a `relay` candidate; `nil` when nothing
    /// is known.
    static func relayedRoute(in entries: [RawEntry]) -> Bool? {
        let byId = Dictionary(entries.map { ($0.id, $0) }, uniquingKeysWith: { _, last in last })
        guard let pair = selectedCandidatePair(in: entries) else { return nil }
        let candidateTypes = [pair.strings["localCandidateId"], pair.strings["remoteCandidateId"]]
            .compactMap { $0.flatMap { byId[$0]?.strings["candidateType"] } }
        guard !candidateTypes.isEmpty else { return nil }
        return candidateTypes.contains("relay")
    }

    /// #20098 — the SELECTED ICE pair, always a `candidate-pair`: the one named
    /// by the transport of smallest id whose `selectedCandidatePairId` names an
    /// existing pair, else the nominated succeeded pair first in
    /// `electionOrder`; `nil` otherwise. Route, RTT and available outgoing
    /// bitrate all read it, as on Android (`CallStats.selectedCandidatePair`);
    /// the bitrate reads ONLY it (#20284).
    static func selectedCandidatePair(in entries: [RawEntry]) -> RawEntry? {
        let pairs = electionOrder(entries)
        let byId = Dictionary(pairs.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        let named = entries
            .filter { $0.type == "transport" }
            .sorted { $0.id < $1.id }
            .compactMap { transport in transport.strings["selectedCandidatePairId"].flatMap { byId[$0] } }
            .first
        return named ?? pairs.first { $0.strings["state"] == "succeeded" && ($0.values["nominated"] ?? 0) > 0 }
    }

    /// #20121 — the `candidate-pair` entries by strongest `priority`, then smallest `id` (unique in a report, W3C): never the report's order.
    private static func electionOrder(_ entries: [RawEntry]) -> [RawEntry] {
        let rank = { (entry: RawEntry) in CallStatValue.measured(entry.values["priority"] ?? 0) }
        return entries
            .filter { $0.type == "candidate-pair" }
            .sorted { rank($0) != rank($1) ? rank($0) > rank($1) : $0.id < $1.id }
    }

    /// #20221 — rtp entries audio first (`kind != "video"`), then smallest `id`: never the report's order.
    private static func streamOrder(_ entries: [RawEntry]) -> [RawEntry] {
        entries.sorted { ($0.kind == "video") != ($1.kind == "video") ? $1.kind == "video" : $0.id < $1.id }
    }

    /// #20098 — a pair measure read on the elected pair; with no elected pair,
    /// or one lacking the field, on the pair carrying it first in `electionOrder`.
    /// Never used for `availableOutgoingBitrate` (#20284).
    private static func pairMeasure(_ key: String, elected: RawEntry?, in entries: [RawEntry]) -> Double? {
        elected?.values[key] ?? electionOrder(entries).first { $0.values[key] != nil }?.values[key]
    }

    /// #20348 — the peer's `roundTripTime` (s): the first `remote-inbound-rtp`
    /// of `streamOrder` carrying a finite value `>= 0` (web `remoteRoundTripTime`).
    private static func remoteRoundTripTime(in entries: [RawEntry]) -> Double? {
        streamOrder(entries.filter { $0.type == "remote-inbound-rtp" })
            .lazy.compactMap { $0.values["roundTripTime"] }.first { $0.isFinite && $0 >= 0 }
    }

    /// Pure reducer (§5.7 fix for bug j). Resolves the real codec name via
    /// `codecId → codec.mimeType` (the legacy code stored the stats-graph
    /// reference id, e.g. `"COT01_111"`, instead of `"opus"`/`"H264"`) on the
    /// first `inbound-rtp` of `streamOrder` whose codec resolves (#20221), and keeps
    /// inbound audio/video separate. RTT and available outgoing bitrate come
    /// from the SELECTED pair (#20098). RTT alone falls back, with no elected
    /// pair or an elected pair lacking it, to the pair carrying it first in
    /// `electionOrder` (strongest `priority`, then smallest `id`, #20121), and
    /// with no pair carrying it, to the peer's `remote-inbound-rtp` (#20348). The
    /// bitrate never does (#20284): a pair that carries no traffic holds a low
    /// or stale estimate, and the video tier would follow it — no estimate on
    /// the elected pair reads 0, "no estimate", as on the web (`readStats`), and
    /// so does an estimate beyond `CallStatValue.maxBitrateEstimateBps` (#20348).
    static func reduce(entries: [RawEntry]) -> CallStats {
        var packetsLost = 0
        var bytesSent = 0
        var bytesReceived = 0
        var inboundAudio = 0
        var inboundVideo = 0
        var inboundAudioBytes = 0
        var inboundVideoBytes = 0
        var outbound = 0
        var audioJitterSum = 0.0
        var audioJitterCount = 0
        var audioLevel = 0.0
        var localAudioLevel = 0.0

        let codecMime: [String: String] = entries.reduce(into: [:]) { map, entry in
            guard entry.type == "codec", let mime = entry.mimeType else { return }
            map[entry.id] = mime
        }

        for entry in entries {
            switch entry.type {
            case "inbound-rtp":
                if let lost = entry.values["packetsLost"] { packetsLost = CallStatValue.sum(packetsLost, CallStatValue.count(lost)) }
                let received = CallStatValue.count(entry.values["packetsReceived"] ?? 0)
                let receivedBytes = CallStatValue.count(entry.values["bytesReceived"] ?? 0)
                if entry.kind == "video" {
                    inboundVideo = CallStatValue.sum(inboundVideo, received)
                    inboundVideoBytes = CallStatValue.sum(inboundVideoBytes, receivedBytes)
                } else {
                    inboundAudio = CallStatValue.sum(inboundAudio, received)
                    inboundAudioBytes = CallStatValue.sum(inboundAudioBytes, receivedBytes)
                    // libwebrtc reports jitter in seconds; accumulate for mean across audio streams
                    if let j = entry.values["jitter"], j.isFinite, j >= 0 { audioJitterSum += j; audioJitterCount += 1 }
                    audioLevel = max(audioLevel, entry.values["audioLevel"] ?? 0)
                }
                bytesReceived = CallStatValue.sum(bytesReceived, receivedBytes)
            case "outbound-rtp":
                outbound = CallStatValue.sum(outbound, CallStatValue.count(entry.values["packetsSent"] ?? 0))
                bytesSent = CallStatValue.sum(bytesSent, CallStatValue.count(entry.values["bytesSent"] ?? 0))
            case "media-source" where entry.kind == "audio":
                localAudioLevel = max(localAudioLevel, entry.values["audioLevel"] ?? 0)
            default:
                break
            }
        }

        let resolvedCodec: String? = streamOrder(entries.filter { $0.type == "inbound-rtp" && !($0.codecId ?? "").isEmpty })
            .lazy.compactMap { $0.codecId.flatMap { codecMime[$0] } }.first
            .map { mime in mime.split(separator: "/").last.map(String.init) ?? mime }

        let elected = selectedCandidatePair(in: entries)
        let rtt = (pairMeasure("currentRoundTripTime", elected: elected, in: entries) ?? remoteRoundTripTime(in: entries))
            .map { CallStatValue.measured($0 * 1000) } ?? 0
        let availableOutgoingBitrateBps = elected?.values["availableOutgoingBitrate"].map(CallStatValue.bitrateEstimate) ?? 0

        let jitterMs = audioJitterCount > 0 ? CallStatValue.measured((audioJitterSum / Double(audioJitterCount)) * 1000) : 0

        return CallStats(
            roundTripTimeMs: rtt,
            packetsLost: packetsLost,
            bandwidth: bytesSent,
            bytesReceived: bytesReceived,
            codec: resolvedCodec,
            inboundPacketsReceived: CallStatValue.sum(inboundAudio, inboundVideo),
            inboundAudioPackets: inboundAudio,
            inboundVideoPackets: inboundVideo,
            outboundPacketsSent: outbound,
            availableOutgoingBitrateBps: availableOutgoingBitrateBps,
            jitterMs: jitterMs,
            inboundAudioBytes: inboundAudioBytes,
            inboundVideoBytes: inboundVideoBytes,
            inboundAudioLevel: audioLevel,
            outboundAudioLevel: localAudioLevel,
            relayed: relayedRoute(in: entries),
            mediaQuality: CallMediaQuality.reduce(entries: entries)
        )
    }
}

// MARK: - Media Quality (#11294)

/// **Ce que les gels et la limitation disent d'un appel** : lu sur les mêmes
/// relevés `getStats` que `CallStats`. Les compteurs sont CUMULÉS par WebRTC
/// depuis le début de l'appel : le dernier relevé les porte tous.
nonisolated struct CallMediaQuality: Equatable, Sendable {
    let freezeCount: Int
    /// Durée cumulée des gels de la vidéo reçue, en secondes.
    let totalFreezesDuration: Double
    let framesPerSecond: Double
    /// `none` | `cpu` | `bandwidth` | `other`, à l'émission vidéo.
    let qualityLimitationReason: String?
    /// Délai moyen du tampon de gigue audio, en millisecondes ; `nil` sans émission.
    let jitterBufferDelayMs: Double?
    let concealedSamples: Int
    let nackCount: Int
    let pliCount: Int

    static let none = CallMediaQuality(freezeCount: 0, totalFreezesDuration: 0, framesPerSecond: 0,
                                       qualityLimitationReason: nil, jitterBufferDelayMs: nil,
                                       concealedSamples: 0, nackCount: 0, pliCount: 0)

    static func reduce(entries: [CallStats.RawEntry]) -> CallMediaQuality {
        let video = entries.filter { $0.type == "inbound-rtp" && $0.kind == "video" }
        let audio = entries.filter { $0.type == "inbound-rtp" && $0.kind != "video" }
        let somme = { (flux: [CallStats.RawEntry], cle: String) in flux.reduce(0.0) { $0 + ($1.values[cle] ?? 0) } }
        let emissions = somme(audio, "jitterBufferEmittedCount")
        return CallMediaQuality(
            freezeCount: CallStatValue.count(somme(video, "freezeCount")),
            totalFreezesDuration: CallStatValue.measured(somme(video, "totalFreezesDuration")),
            framesPerSecond: video.compactMap { $0.values["framesPerSecond"] }.max() ?? 0,
            qualityLimitationReason: limitationReason(entries),
            jitterBufferDelayMs: emissions > 0 ? CallStatValue.measured(somme(audio, "jitterBufferDelay") / emissions * 1000) : nil,
            concealedSamples: CallStatValue.count(somme(audio, "concealedSamples")),
            nackCount: CallStatValue.count(somme(video, "nackCount")),
            pliCount: CallStatValue.count(somme(video, "pliCount")))
    }

    /// #20221 — la cause la plus contraignante des `outbound-rtp` vidéo, quel que
    /// soit l'ordre du relevé : `bandwidth` > `cpu` > `other` > le reste ;
    /// égalité ⇒ plus petit `id` ; une chaîne vide n'est pas une cause.
    private static func limitationReason(_ entries: [CallStats.RawEntry]) -> String? {
        let reasoned: [(id: String, reason: String)] = entries
            .filter { $0.type == "outbound-rtp" && $0.kind == "video" }
            .compactMap { entry in
                guard let reason = entry.strings["qualityLimitationReason"], !reason.isEmpty else { return nil }
                return (id: entry.id, reason: reason)
            }
        return reasoned.min { lhs, rhs in
            let (left, right) = (limitationRank(lhs.reason), limitationRank(rhs.reason))
            return left != right ? left > right : lhs.id < rhs.id
        }?.reason
    }

    private static func limitationRank(_ reason: String) -> Int {
        switch reason {
        case "bandwidth": return 3
        case "cpu": return 2
        case "other": return 1
        default: return 0
        }
    }
}

// MARK: - Aberrant values (#19933)

/// **Une mesure aberrante n'est pas une mesure** : `getStats` peut rendre NaN,
/// l'infini, un négatif ou un compteur démesuré. Une valeur non finie ou
/// négative vaut 0 (non mesurée), et un compteur au-delà de 2^53 − 1 aussi,
/// comme sur le web : la passerelle (zod 4, `.int()`) refuse tout le
/// `call:analytics` pour un entier hors de `Number.MAX_SAFE_INTEGER`. Les cumuls
/// plafonnent au même seuil, si bien que la somme de deux compteurs ne déborde
/// jamais `Int` en aval (`WebRTCService.intervalLossRatio`).
nonisolated enum CallStatValue {
    static let maxSafeCount = 9_007_199_254_740_991

    static func measured(_ value: Double) -> Double {
        value.isFinite && value > 0 ? value : 0
    }

    static func count(_ value: Double) -> Int {
        let valid = measured(value)
        return valid > Double(maxSafeCount) ? 0 : Int(valid)
    }

    /// La borne de VRAISEMBLANCE d'une estimation de débit (`availableOutgoingBitrate`,
    /// b/s), la même sur Android (`Int.MAX_VALUE`) et le web (#20348) : ~2,1 Gb/s.
    static let maxBitrateEstimateBps = 2_147_483_647

    /// Une estimation non finie, nulle, négative ou au-delà de `maxBitrateEstimateBps`
    /// n'est pas une estimation et vaut 0 (#20348).
    static func bitrateEstimate(_ value: Double) -> Int {
        let valid = measured(value)
        return valid > Double(maxBitrateEstimateBps) ? 0 : Int(valid)
    }

    static func sum(_ lhs: Int, _ rhs: Int) -> Int {
        let (total, overflow) = lhs.addingReportingOverflow(rhs)
        return overflow ? maxSafeCount : min(total, maxSafeCount)
    }
}
