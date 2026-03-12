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
}
