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

// MARK: - Group Participant

/// Someone who joined a GROUP call, reader excluded (#8066). Mirrors the
/// gateway's `CallHistoryParticipant`: a name and a face, never a presence nor
/// a contact field.
public struct CallHistoryParticipant: Codable, Sendable, Equatable, Identifiable {
    public let participantId: String
    public let userId: String?
    public let username: String?
    public let displayName: String
    public let avatar: String?

    public var id: String { participantId }

    public init(participantId: String, userId: String? = nil, username: String? = nil, displayName: String, avatar: String? = nil) {
        self.participantId = participantId
        self.userId = userId
        self.username = username
        self.displayName = displayName
        self.avatar = avatar
    }
}

/// The first names a journal row shows, and how many others it counts.
public struct CallParticipantSummary: Sendable, Equatable {
    public let names: [String]
    public let more: Int

    public init(names: [String], more: Int) {
        self.names = names
        self.more = more
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
    /// Who joined a group call, reader excluded, in join order; empty for a
    /// direct call and for a record cached before #8066.
    public let participants: [CallHistoryParticipant]
    /// #8439 — les réactions envoyées pendant l'appel, comptées par emoji.
    public let reactionCounts: [String: Int]

    public var id: String { callId }

    private enum CodingKeys: String, CodingKey {
        case callId, conversationId, conversationType, conversationTitle, conversationAvatar
        case mode, status, endReason, direction, isVideo
        case startedAt, answeredAt, endedAt, durationSec, bytesSent, bytesReceived
        case peer, participants, reactionCounts
    }

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
        peer: CallHistoryPeer? = nil,
        participants: [CallHistoryParticipant] = [],
        reactionCounts: [String: Int] = [:]
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
        self.participants = participants
        self.reactionCounts = reactionCounts
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        callId = try container.decode(String.self, forKey: .callId)
        conversationId = try container.decode(String.self, forKey: .conversationId)
        conversationType = try container.decode(String.self, forKey: .conversationType)
        conversationTitle = try container.decodeIfPresent(String.self, forKey: .conversationTitle)
        conversationAvatar = try container.decodeIfPresent(String.self, forKey: .conversationAvatar)
        mode = try container.decode(String.self, forKey: .mode)
        status = try container.decode(String.self, forKey: .status)
        endReason = try container.decodeIfPresent(String.self, forKey: .endReason)
        direction = try container.decode(String.self, forKey: .direction)
        isVideo = try container.decode(Bool.self, forKey: .isVideo)
        startedAt = try container.decode(Date.self, forKey: .startedAt)
        answeredAt = try container.decodeIfPresent(Date.self, forKey: .answeredAt)
        endedAt = try container.decodeIfPresent(Date.self, forKey: .endedAt)
        durationSec = try container.decode(Int.self, forKey: .durationSec)
        bytesSent = try container.decodeIfPresent(Int.self, forKey: .bytesSent)
        bytesReceived = try container.decodeIfPresent(Int.self, forKey: .bytesReceived)
        peer = try container.decodeIfPresent(CallHistoryPeer.self, forKey: .peer)
        participants = (try? container.decodeIfPresent([CallHistoryParticipant].self, forKey: .participants)) ?? []
        reactionCounts = (try? container.decodeIfPresent([String: Int].self, forKey: .reactionCounts)) ?? [:]
    }
}

// MARK: - Display Accessors (pure)

public struct CallReactionTallyEntry: Equatable, Sendable {
    public let emoji: CallReactionEmoji
    public let count: Int
}

public extension APICallRecord {
    /// Les comptes relus sans confiance, dans l'ordre de la palette.
    var reactionTally: [CallReactionTallyEntry] {
        CallReactionEmoji.allCases.compactMap { emoji in
            guard let count = reactionCounts[emoji.rawValue], count > 0 else { return nil }
            return CallReactionTallyEntry(emoji: emoji, count: count)
        }
    }

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

    /// The first `limit` participant names of a group call and how many others.
    func participantSummary(limit: Int) -> CallParticipantSummary {
        let names = participants.map(\.displayName)
        return CallParticipantSummary(names: Array(names.prefix(limit)), more: max(0, names.count - limit))
    }

    /// Journal search (#8066): the displayed name (fallback included), the
    /// peer's username and a group call's participants, folding accents and
    /// case — the web's `searchCallRecords`. A blank query matches everything.
    func matches(query: String, fallback: String) -> Bool {
        let needle = Self.foldedForSearch(query)
        guard !needle.isEmpty else { return true }
        let fields: [String?] = [displayName(fallback: fallback), peer?.username]
            + participants.flatMap { [$0.displayName, $0.username] }
        return fields.compactMap { $0 }.contains { Self.foldedForSearch($0).contains(needle) }
    }

    private static func foldedForSearch(_ text: String) -> String {
        text.folding(options: [.diacriticInsensitive, .caseInsensitive], locale: nil)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

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
        return Int64(total).formatted(.byteCount(style: .file))
    }
}

// MARK: - Active Call (crash/reconnect recovery)

/// Minimal user reference embedded in `ActiveCallParticipant`. Mirrors the
/// gateway's `userMinimalSchema` (packages/shared/types/api-schemas.ts) —
/// intentionally narrower than `CallHistoryPeer` (no phoneNumber/isOnline,
/// which the call-history route's own serializer adds but the raw call
/// session schema does not).
public struct ActiveCallParticipantUser: Codable, Sendable, Equatable {
    public let id: String
    public let username: String
    public let displayName: String?
    public let avatar: String?

    public init(id: String, username: String, displayName: String? = nil, avatar: String? = nil) {
        self.id = id
        self.username = username
        self.displayName = displayName
        self.avatar = avatar
    }
}

public struct ActiveCallParticipant: Codable, Sendable, Equatable {
    public let userId: String
    public let user: ActiveCallParticipantUser?

    public init(userId: String, user: ActiveCallParticipantUser? = nil) {
        self.userId = userId
        self.user = user
    }

    private enum CodingKeys: String, CodingKey {
        case userId
        case user
    }

    /// Resilient decode: `userId` is the gateway's top-level participant key
    /// (P1-C, 2026-07-12), but fall back to the nested `user.id` when a payload
    /// omits it or sends it empty. `userId` is non-optional, so without this a
    /// single participant missing `userId` would throw and fail the decode of
    /// the WHOLE `ActiveCallSession` — silently killing crash-recovery (the pill
    /// disappears, `joinOngoingCall` catches and toasts "impossible de rejoindre").
    /// This makes the client robust to a gateway regression re-dropping `userId`.
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let nestedUser = try container.decodeIfPresent(ActiveCallParticipantUser.self, forKey: .user)
        self.user = nestedUser
        if let topLevel = try container.decodeIfPresent(String.self, forKey: .userId), !topLevel.isEmpty {
            self.userId = topLevel
        } else if let fallback = nestedUser?.id {
            self.userId = fallback
        } else {
            throw DecodingError.dataCorruptedError(
                forKey: CodingKeys.userId,
                in: container,
                debugDescription: "ActiveCallParticipant: neither top-level userId nor nested user.id present"
            )
        }
    }
}

/// A currently-active (not yet ended) call session, as returned by
/// `GET /conversations/:conversationId/active-call` and `GET /calls/active`
/// (mirrors `callSessionSchema`, packages/shared/types/api-schemas.ts). Used
/// to reconcile a device's local call state with the server's after the
/// device's own `CallManager` session was lost (app relaunch, crash) while
/// the call itself is still ongoing — see `ActiveCallService`.
public struct ActiveCallSession: Codable, Identifiable, Sendable, Equatable {
    public let id: String
    public let conversationId: String
    public let mode: String
    public let status: String
    public let metadata: ActiveCallMetadata?
    public let participants: [ActiveCallParticipant]

    public init(id: String, conversationId: String, mode: String, status: String, metadata: ActiveCallMetadata? = nil, participants: [ActiveCallParticipant]) {
        self.id = id
        self.conversationId = conversationId
        self.mode = mode
        self.status = status
        self.metadata = metadata
        self.participants = participants
    }

    /// `metadata.type` is the REST source of the call's audio/video nature.
    /// `mode` carries the WebRTC architecture (p2p|sfu) — it is never "video"
    /// on the wire (bug 2026-07-12: a video call rejoined after crash resumed
    /// as audio) and stays only as a forward-compatibility fallback.
    public var isVideo: Bool { (metadata?.type ?? mode) == "video" }

    /// The other participant in a direct call — the first entry whose
    /// `userId` isn't `currentUserId`. `nil` for group calls or if the
    /// participant list hasn't been populated.
    public func remoteParticipant(currentUserId: String) -> ActiveCallParticipant? {
        participants.first { $0.userId != currentUserId }
    }
}

/// The whitelisted slice of `CallSession.metadata` the gateway serializes
/// (`callSessionSchema` — every other metadata key is stripped for privacy).
public struct ActiveCallMetadata: Codable, Sendable, Equatable {
    public let type: String?

    public init(type: String? = nil) {
        self.type = type
    }
}
