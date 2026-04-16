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
    func save(_ items: [Value], for key: Key) async
    func update(for key: Key, mutate: @Sendable ([Value]) -> [Value]) async

    /// Atomic read-modify-write that falls back to L2 or empty when L1 is cold.
    /// Unlike `update`, this never silently no-ops when the key is absent from
    /// the in-memory cache — it loads from persistent storage first.
    func mergeUpdate(for key: Key, mutate: @Sendable ([Value]) -> [Value]) async
}
