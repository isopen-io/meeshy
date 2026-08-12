import Foundation

public protocol ReadableCacheStore<Key, Value> {
    associatedtype Key: Hashable & Sendable & CustomStringConvertible
    associatedtype Value: Sendable

    var policy: CachePolicy { get }

    func load(for key: Key) async -> CacheResult<[Value]>
    func invalidate(for key: Key) async
    func invalidateAll() async
}

public protocol MutableCacheStore<Key, Value>: ReadableCacheStore {
    /// Persist a fresh snapshot of items for `key`. Throws on write failure
    /// (e.g. encryption failure on an `encrypted: true` store) so callers
    /// don't silently observe stale cache while data was never written.
    ///
    /// Strict semantics introduced by Task 1.1 of the iOS Local-First
    /// Wave 1 plan — previously `save` was non-throwing and would silently
    /// log + drop write errors.
    func save(_ items: [Value], for key: Key) async throws

    func update(for key: Key, mutate: @Sendable ([Value]) -> [Value]) async

    /// Atomic read-modify-write that falls back to L2 or empty when L1 is cold.
    /// Unlike `update`, this never silently no-ops when the key is absent from
    /// the in-memory cache — it loads from persistent storage first.
    func mergeUpdate(for key: Key, mutate: @Sendable ([Value]) -> [Value]) async

    /// cache-04 — dernière donnée connue MÊME au-delà du TTL, pour que la
    /// branche `.expired` d'un lecteur cache-first puisse peindre le disque
    /// au lieu d'un écran vide offline. `nil` par défaut (stores sans
    /// récupération d'expiré).
    func loadIgnoringExpiry(for key: Key) async -> (items: [Value], age: TimeInterval)?
}

public extension MutableCacheStore {
    func loadIgnoringExpiry(for key: Key) async -> (items: [Value], age: TimeInterval)? { nil }
}
