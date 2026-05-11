import Foundation

/// Wrapper for preference values that don't carry an intrinsic id field
/// (`[String]` for tags, `UserPreferences` for app-level prefs,
/// `APIConversationPreferences` for per-conversation prefs). The wrapper
/// satisfies `CacheIdentifiable` by promoting the cache key (or any
/// caller-provided discriminator) to the `id` of the row, so we can store
/// preference data in `GRDBCacheStore` alongside everything else without
/// having to invent a new storage primitive.
///
/// Each preference type gets its own typed `GRDBCacheStore` in
/// `CacheCoordinator` (`userTags`, `userPreferences`,
/// `conversationPreferences`) — the wrapper keeps `Value` strongly typed
/// per store, no polymorphic dispatch.
public struct PreferenceValue<T: Codable & Sendable>: Codable, Sendable, CacheIdentifiable {
    public let id: String
    public let value: T

    public init(id: String, value: T) {
        self.id = id
        self.value = value
    }
}

/// Single-value tag entry. Tags are returned as `[String]` from the
/// gateway (no per-tag id), so we use the tag string itself as the
/// CacheIdentifiable id. Cheap, deterministic, dedup-friendly when
/// downstream consumers want to merge tag sets across cache snapshots.
public struct ConversationTagEntry: Codable, Sendable, CacheIdentifiable, Equatable {
    public let id: String

    public init(name: String) {
        self.id = name
    }

    /// Convenience accessor matching the `[String]` shape expected by
    /// `PreferenceServiceProviding.getMyConversationTags`.
    public var name: String { id }
}
