import Foundation

/// One unit of work the user performs on a conversation's per-user state.
///
/// `ConversationStore.apply(_:for:)` (Phase 4) accepts these, applies them
/// optimistically to the local snapshot, enqueues a matching task in the
/// SQLite outbox, then dispatches to the appropriate REST endpoint:
///
/// - Most cases map to `PUT /api/v1/user-preferences/conversations/:id`
///   with a single field set.
/// - `markAsRead` / `markAsUnread` map to the dedicated POST endpoints.
/// - `deleteForUser` and `leave` map to their respective POSTs and are
///   never coalesced in the outbox.
/// - `setLocked` is local-only (per-device PIN lock); never reaches the
///   network.
///
/// See `docs/superpowers/specs/2026-05-22-conversation-user-state-unification-design.md` §4.2.
public enum UserStateMutation: Codable, Hashable, Sendable {
    // PUT /api/v1/user-preferences/conversations/:id (single-field updates)
    case setPinned(Bool)
    case setMuted(Bool)
    case setMentionsOnly(Bool)
    case setArchived(Bool)
    case setCustomName(String?)
    case setReaction(String?)
    case setSection(categoryId: String?)
    case setOrderInCategory(Int?)
    case setTags([String])
    case addTag(String)
    case removeTag(String)
    case setClearHistoryBefore(Date?)

    // Dedicated endpoints
    case markAsRead
    case markAsUnread
    case deleteForUser
    case leave

    // Local-only (no network)
    case setLocked(Bool)

    // MARK: - Coalescing key
    //
    // Two mutations with the same key collapse into the last-write-wins in
    // the outbox. `addTag`/`removeTag`/`setTags` share a key so the
    // outbox can fuse them into a final `setTags(finalArray)` before
    // dispatch. `deleteForUser`/`leave` return unique keys so they never
    // coalesce.

    public var coalescingKey: String {
        switch self {
        case .setPinned: return "setPinned"
        case .setMuted: return "setMuted"
        case .setMentionsOnly: return "setMentionsOnly"
        case .setArchived: return "setArchived"
        case .setCustomName: return "setCustomName"
        case .setReaction: return "setReaction"
        case .setSection: return "setSection"
        case .setOrderInCategory: return "setOrderInCategory"
        case .setTags, .addTag, .removeTag: return "tags"
        case .setClearHistoryBefore: return "setClearHistoryBefore"
        case .markAsRead, .markAsUnread: return "readState"
        case .deleteForUser: return "deleteForUser-\(UUID().uuidString)"
        case .leave: return "leave-\(UUID().uuidString)"
        case .setLocked: return "setLocked"
        }
    }

    /// `true` when the mutation only mutates local-device state and must
    /// never be dispatched to the network. The outbox skips them.
    public var isLocalOnly: Bool {
        if case .setLocked = self { return true }
        return false
    }

    // MARK: - Codable (tolerant decoding)
    //
    // Encoded shape: `{"type": "<case>", "value": <case-payload>}`.
    // Tolerant decoding: an unknown `type` (e.g. a future case sent by a
    // newer build that was persisted in an older app's outbox) decodes as
    // `.unknown` so the outbox can drop it instead of crashing on launch.

    private enum CodingKeys: String, CodingKey {
        case type
        case value
        case categoryId
    }

    /// Pseudo-case used only to surface "this case was added in a newer
    /// version of the app". Not constructible from outside the module —
    /// the outbox uses `decodeIfPresent` and drops these silently.
    public static let unknownTypeTag = "__unknown__"

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let type = try c.decode(String.self, forKey: .type)
        switch type {
        case "setPinned": self = .setPinned(try c.decode(Bool.self, forKey: .value))
        case "setMuted": self = .setMuted(try c.decode(Bool.self, forKey: .value))
        case "setMentionsOnly": self = .setMentionsOnly(try c.decode(Bool.self, forKey: .value))
        case "setArchived": self = .setArchived(try c.decode(Bool.self, forKey: .value))
        case "setCustomName": self = .setCustomName(try c.decodeIfPresent(String.self, forKey: .value))
        case "setReaction": self = .setReaction(try c.decodeIfPresent(String.self, forKey: .value))
        case "setSection":
            self = .setSection(categoryId: try c.decodeIfPresent(String.self, forKey: .categoryId))
        case "setOrderInCategory":
            self = .setOrderInCategory(try c.decodeIfPresent(Int.self, forKey: .value))
        case "setTags": self = .setTags(try c.decode([String].self, forKey: .value))
        case "addTag": self = .addTag(try c.decode(String.self, forKey: .value))
        case "removeTag": self = .removeTag(try c.decode(String.self, forKey: .value))
        case "setClearHistoryBefore":
            self = .setClearHistoryBefore(try c.decodeIfPresent(Date.self, forKey: .value))
        case "markAsRead": self = .markAsRead
        case "markAsUnread": self = .markAsUnread
        case "deleteForUser": self = .deleteForUser
        case "leave": self = .leave
        case "setLocked": self = .setLocked(try c.decode(Bool.self, forKey: .value))
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .type,
                in: c,
                debugDescription: "Unknown UserStateMutation type '\(type)' (forward-incompatible payload — drop from outbox)"
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .setPinned(let v):
            try c.encode("setPinned", forKey: .type); try c.encode(v, forKey: .value)
        case .setMuted(let v):
            try c.encode("setMuted", forKey: .type); try c.encode(v, forKey: .value)
        case .setMentionsOnly(let v):
            try c.encode("setMentionsOnly", forKey: .type); try c.encode(v, forKey: .value)
        case .setArchived(let v):
            try c.encode("setArchived", forKey: .type); try c.encode(v, forKey: .value)
        case .setCustomName(let v):
            try c.encode("setCustomName", forKey: .type); try c.encodeIfPresent(v, forKey: .value)
        case .setReaction(let v):
            try c.encode("setReaction", forKey: .type); try c.encodeIfPresent(v, forKey: .value)
        case .setSection(let id):
            try c.encode("setSection", forKey: .type); try c.encodeIfPresent(id, forKey: .categoryId)
        case .setOrderInCategory(let v):
            try c.encode("setOrderInCategory", forKey: .type); try c.encodeIfPresent(v, forKey: .value)
        case .setTags(let v):
            try c.encode("setTags", forKey: .type); try c.encode(v, forKey: .value)
        case .addTag(let v):
            try c.encode("addTag", forKey: .type); try c.encode(v, forKey: .value)
        case .removeTag(let v):
            try c.encode("removeTag", forKey: .type); try c.encode(v, forKey: .value)
        case .setClearHistoryBefore(let v):
            try c.encode("setClearHistoryBefore", forKey: .type); try c.encodeIfPresent(v, forKey: .value)
        case .markAsRead:
            try c.encode("markAsRead", forKey: .type)
        case .markAsUnread:
            try c.encode("markAsUnread", forKey: .type)
        case .deleteForUser:
            try c.encode("deleteForUser", forKey: .type)
        case .leave:
            try c.encode("leave", forKey: .type)
        case .setLocked(let v):
            try c.encode("setLocked", forKey: .type); try c.encode(v, forKey: .value)
        }
    }
}
