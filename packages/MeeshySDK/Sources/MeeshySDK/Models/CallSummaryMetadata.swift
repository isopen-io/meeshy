import Foundation

/// Structured facts about a terminated call, carried on a call-summary system
/// message's `metadata` (gateway `Message.metadata`, built by
/// `packages/shared/utils/call-summary.ts`). Lets the client render a rich,
/// actionable call bubble WITHOUT re-fetching the call: direction is resolved
/// per-viewer from `initiatorId`, the media glyph from `callType`, the tint/red
/// from `outcome`, and the "duration · data · quality" line from the rest.
///
/// Pure value type with pure formatting helpers — no Meeshy singletons, no I/O —
/// so it is a legitimate SDK building block (atomic, product-agnostic).
public struct CallSummaryMetadata: Codable, Sendable, Equatable {
    public enum MediaType: String, Codable, Sendable {
        case audio
        case video
    }

    public enum Outcome: String, Codable, Sendable {
        case completed
        case missed
        case rejected
        case failed
    }

    /// Ordered worst→best so views can compare tiers and pick a color ramp.
    public enum NetworkQuality: String, Codable, Sendable, Comparable, CaseIterable {
        case poor
        case fair
        case good
        case excellent

        public static func < (lhs: NetworkQuality, rhs: NetworkQuality) -> Bool {
            guard let l = allCases.firstIndex(of: lhs), let r = allCases.firstIndex(of: rhs) else { return false }
            return l < r
        }
    }

    public let callId: String
    /// User id of the call initiator. Compared to the current user to render
    /// "outgoing" (emitted) vs "incoming" (received).
    public let initiatorId: String
    public let callType: MediaType
    public let outcome: Outcome
    public let durationSeconds: Int
    /// Total bytes (sent + received), or `nil` when never measured (missed /
    /// rejected calls carried no media).
    public let bytesTotal: Int?
    /// `true` when `bytesTotal` was estimated from duration rather than measured.
    public let bytesEstimated: Bool
    public let networkQuality: NetworkQuality?
    /// `true` for the LIVE message posted at `call:initiate` (`kind:
    /// "call-live"`), while the call is still ongoing. A live summary's
    /// `outcome` is a neutral placeholder — check `isLive` BEFORE `outcome`.
    public let isLive: Bool
    /// Present (`true`) only on a missed call that was never answered and was
    /// ended by its own initiator — "cancelled" from the initiator's viewpoint.
    /// `nil` on every other summary (the gateway omits the key entirely).
    public let endedByInitiator: Bool?

    public init(
        callId: String,
        initiatorId: String,
        callType: MediaType,
        outcome: Outcome,
        durationSeconds: Int,
        bytesTotal: Int?,
        bytesEstimated: Bool,
        networkQuality: NetworkQuality?,
        isLive: Bool = false,
        endedByInitiator: Bool? = nil
    ) {
        self.callId = callId
        self.initiatorId = initiatorId
        self.callType = callType
        self.outcome = outcome
        self.durationSeconds = durationSeconds
        self.bytesTotal = bytesTotal
        self.bytesEstimated = bytesEstimated
        self.networkQuality = networkQuality
        self.isLive = isLive
        self.endedByInitiator = endedByInitiator
    }

    private enum CodingKeys: String, CodingKey {
        case kind, callId, initiatorId, callType, outcome, durationSeconds
        case bytesTotal, bytesEstimated, networkQuality, endedByInitiator
    }

    /// Decodes only when `kind` is `"call"` (terminal summary) or `"call-live"`
    /// (ongoing call), so unrelated structured metadata on a message is ignored
    /// rather than mis-decoded into a call bubble. A live payload tolerates a
    /// missing `outcome` (it is a placeholder anyway); a terminal payload keeps
    /// requiring it.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try c.decodeIfPresent(String.self, forKey: .kind)
        guard kind == "call" || kind == "call-live" else {
            throw DecodingError.dataCorruptedError(
                forKey: .kind, in: c,
                debugDescription: "metadata.kind is not 'call'/'call-live' (\(kind ?? "nil"))"
            )
        }
        isLive = kind == "call-live"
        callId = try c.decode(String.self, forKey: .callId)
        initiatorId = try c.decode(String.self, forKey: .initiatorId)
        callType = try c.decode(MediaType.self, forKey: .callType)
        outcome = isLive
            ? try c.decodeIfPresent(Outcome.self, forKey: .outcome) ?? .completed
            : try c.decode(Outcome.self, forKey: .outcome)
        durationSeconds = try c.decodeIfPresent(Int.self, forKey: .durationSeconds) ?? 0
        bytesTotal = try c.decodeIfPresent(Int.self, forKey: .bytesTotal)
        bytesEstimated = try c.decodeIfPresent(Bool.self, forKey: .bytesEstimated) ?? false
        networkQuality = try c.decodeIfPresent(NetworkQuality.self, forKey: .networkQuality)
        endedByInitiator = try c.decodeIfPresent(Bool.self, forKey: .endedByInitiator)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(isLive ? "call-live" : "call", forKey: .kind)
        try c.encode(callId, forKey: .callId)
        try c.encode(initiatorId, forKey: .initiatorId)
        try c.encode(callType, forKey: .callType)
        try c.encode(outcome, forKey: .outcome)
        try c.encode(durationSeconds, forKey: .durationSeconds)
        try c.encodeIfPresent(bytesTotal, forKey: .bytesTotal)
        try c.encode(bytesEstimated, forKey: .bytesEstimated)
        try c.encodeIfPresent(networkQuality, forKey: .networkQuality)
        try c.encodeIfPresent(endedByInitiator, forKey: .endedByInitiator)
    }
}

// MARK: - Pure presentation helpers

public extension CallSummaryMetadata {
    /// The current user initiated the call (emitted/outgoing) when they are the
    /// initiator; otherwise they received it (incoming).
    func isOutgoing(currentUserId: String) -> Bool {
        !currentUserId.isEmpty && initiatorId == currentUserId
    }

    /// A missed call ended by its own initiator renders as "Appel annulé" — but
    /// ONLY in the initiator's view. The callee keeps the plain "Appel manqué".
    func isCancelled(viewerIsInitiator: Bool) -> Bool {
        viewerIsInitiator && outcome == .missed && endedByInitiator == true
    }

    /// "M:SS" (or "H:MM:SS" past an hour), minutes zero-padded — mirrors the
    /// gateway `formatCallDuration`. A 4m32s call reads "04:32".
    var durationLabel: String {
        Self.formatDuration(durationSeconds)
    }

    /// Human-readable data spent (decimal KB/MB/GB), prefixed with "~" when the
    /// value was estimated. `nil` when no data was measured/estimated, so the
    /// view can omit the chip entirely (missed/rejected calls).
    var dataSpentLabel: String? {
        guard let bytes = bytesTotal, bytes > 0 else { return nil }
        let size = Self.formatDataSize(bytes)
        return bytesEstimated ? "~\(size)" : size
    }

    static func formatDuration(_ seconds: Int) -> String {
        let total = max(0, seconds)
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let secs = total % 60
        let pad2 = { (v: Int) in v < 10 ? "0\(v)" : "\(v)" }
        if hours > 0 {
            return "\(hours):\(pad2(minutes)):\(pad2(secs))"
        }
        return "\(pad2(minutes)):\(pad2(secs))"
    }

    /// Decimal units (1 KB = 1000 B), matching how data plans / WhatsApp /
    /// Telegram report usage — mirrors the gateway `formatCallDataSize`.
    static func formatDataSize(_ bytes: Int) -> String {
        guard bytes > 0 else { return "0 KB" }
        let kb = Double(bytes) / 1000
        if kb < 1 { return "1 KB" }
        // Use the post-rounding value for the unit cutover so e.g. 999.7 KB
        // promotes to "1 MB" rather than printing "1000 KB".
        if Int(kb.rounded()) < 1000 { return "\(Int(kb.rounded())) KB" }
        let mb = Double(bytes) / 1_000_000
        if roundDecimal(mb) < 1000 { return "\(decimal(mb)) MB" }
        let gb = Double(bytes) / 1_000_000_000
        return "\(decimal(gb)) GB"
    }

    private static func roundDecimal(_ value: Double) -> Double {
        (value * 10).rounded() / 10
    }

    /// One decimal place, trailing ".0" stripped: 2.40 → "2.4", 3.00 → "3".
    private static func decimal(_ value: Double) -> String {
        let rounded = roundDecimal(value)
        if rounded == rounded.rounded() {
            return String(Int(rounded))
        }
        return String(format: "%.1f", rounded)
    }
}
