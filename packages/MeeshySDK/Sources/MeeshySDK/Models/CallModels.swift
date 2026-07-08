import Foundation

// MARK: - Call Direction

/// From the current user's vantage point. The gateway derives and sends this;
/// the client trusts it. `init(raw:)` degrades unknown values to `.incoming`
/// rather than failing to decode the whole record.
public enum CallDirection: String, Sendable, Equatable {
    case incoming
    case outgoing
    case missed

    public init(raw: String) {
        self = CallDirection(rawValue: raw) ?? .incoming
    }
}

// MARK: - Peer

/// The other party of a P2P/direct call. `nil` for group calls (the
/// conversation name/avatar identifies those).
public struct CallHistoryPeer: Codable, Sendable, Equatable {
    public let userId: String
    public let username: String
    public let displayName: String?
    public let avatar: String?
    public let phoneNumber: String?
    public let isOnline: Bool

    public init(
        userId: String,
        username: String,
        displayName: String? = nil,
        avatar: String? = nil,
        phoneNumber: String? = nil,
        isOnline: Bool = false
    ) {
        self.userId = userId
        self.username = username
        self.displayName = displayName
        self.avatar = avatar
        self.phoneNumber = phoneNumber
        self.isOnline = isOnline
    }
}

// MARK: - Call Record (mirrors gateway CallHistoryItem)

/// One entry in the call journal. Mirrors the gateway's `CallHistoryItem` REST
/// contract (`services/gateway/src/services/callHistory.ts`). Cached via
/// `CacheCoordinator.callHistory` (`CacheIdentifiable` keyed on `callId`).
public struct APICallRecord: Codable, CacheIdentifiable, Identifiable, Sendable, Equatable {
    public let callId: String
    public let conversationId: String
    public let conversationType: String
    public let conversationTitle: String?
    public let conversationAvatar: String?
    public let mode: String
    public let status: String
    public let endReason: String?
    public let direction: String
    public let isVideo: Bool
    public let startedAt: Date
    public let answeredAt: Date?
    public let endedAt: Date?
    public let durationSec: Int
    public let bytesSent: Int?
    public let bytesReceived: Int?
    public let peer: CallHistoryPeer?

    public var id: String { callId }

    public init(
        callId: String,
        conversationId: String,
        conversationType: String,
        conversationTitle: String? = nil,
        conversationAvatar: String? = nil,
        mode: String,
        status: String,
        endReason: String? = nil,
        direction: String,
        isVideo: Bool,
        startedAt: Date,
        answeredAt: Date? = nil,
        endedAt: Date? = nil,
        durationSec: Int,
        bytesSent: Int? = nil,
        bytesReceived: Int? = nil,
        peer: CallHistoryPeer? = nil
    ) {
        self.callId = callId
        self.conversationId = conversationId
        self.conversationType = conversationType
        self.conversationTitle = conversationTitle
        self.conversationAvatar = conversationAvatar
        self.mode = mode
        self.status = status
        self.endReason = endReason
        self.direction = direction
        self.isVideo = isVideo
        self.startedAt = startedAt
        self.answeredAt = answeredAt
        self.endedAt = endedAt
        self.durationSec = durationSec
        self.bytesSent = bytesSent
        self.bytesReceived = bytesReceived
        self.peer = peer
    }
}

// MARK: - Display Accessors (pure)

public extension APICallRecord {
    var directionKind: CallDirection { CallDirection(raw: direction) }
    var isMissed: Bool { directionKind == .missed }

    /// Best display name: peer display name → peer username → conversation
    /// title (group) → `fallback`, supplied by the caller so the SDK never
    /// hardcodes UI copy (SDK Purity — localized strings are app-side).
    func displayName(fallback: String) -> String {
        if let name = peer?.displayName, !name.isEmpty { return name }
        if let username = peer?.username, !username.isEmpty { return username }
        if let title = conversationTitle, !title.isEmpty { return title }
        return fallback
    }

    var avatarURL: String? { peer?.avatar ?? conversationAvatar }

    /// `"M:SS"` (or `"H:MM:SS"` past an hour). Empty for zero-duration calls.
    var durationLabel: String {
        guard durationSec > 0 else { return "" }
        let h = durationSec / 3600
        let m = (durationSec % 3600) / 60
        let s = durationSec % 60
        if h > 0 { return String(format: "%d:%02d:%02d", h, m, s) }
        return String(format: "%d:%02d", m, s)
    }

    /// Total data transferred, human-readable (e.g. `"1,2 Mo"`); `nil` when no
    /// byte counters were recorded.
    var dataLabel: String? {
        let total = (bytesSent ?? 0) + (bytesReceived ?? 0)
        guard bytesSent != nil || bytesReceived != nil, total > 0 else { return nil }
        let formatter = ByteCountFormatter()
        formatter.countStyle = .file
        return formatter.string(fromByteCount: Int64(total))
    }
}
