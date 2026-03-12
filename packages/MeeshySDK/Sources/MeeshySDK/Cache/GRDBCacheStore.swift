import Foundation
import GRDB
import os

public actor GRDBCacheStore<Key, Value>: MutableCacheStore
    where Key: Hashable & Sendable & CustomStringConvertible,
          Value: CacheIdentifiable & Codable
{
    public let policy: CachePolicy

    private let db: any DatabaseWriter
    private let maxL1Keys: Int
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "grdb-cache-store")

    private var memoryCache: [Key: L1Entry] = [:]
    private var accessOrder: [Key] = []
    private var dirtyKeys: Set<Key> = []
    private var persistTask: Task<Void, Never>?
    private var firstDirtyAt: Date?

    struct L1Entry {
        var items: [Value]
        var loadedAt: Date
    }

    public init(policy: CachePolicy, db: any DatabaseWriter, maxL1Keys: Int = 20) {
        self.policy = policy
        self.db = db
        self.maxL1Keys = maxL1Keys
    }

    public func save(_ items: [Value], for key: Key) async {
        let trimmed: [Value]
        if let max = policy.maxItemCount, items.count > max {
            trimmed = Array(items.prefix(max))
        } else {
            trimmed = items
        }

        memoryCache[key] = L1Entry(items: trimmed, loadedAt: Date())
        touchKey(key)

        writeToL2(trimmed, for: key.description)
    }

    public func load(for key: Key) async -> CacheResult<[Value]> {
        if let l1 = memoryCache[key] {
            let age = Date().timeIntervalSince(l1.loadedAt)
            let freshness = policy.freshness(age: age)
            switch freshness {
            case .fresh:
                touchKey(key)
                return .fresh(l1.items, age: age)
            case .stale:
                touchKey(key)
                return .stale(l1.items, age: age)
            case .expired:
                memoryCache.removeValue(forKey: key)
                removeFromAccessOrder(key)
            }
        }

        let l2Result = readFromL2(for: key.description)
        guard let l2Result else { return .empty }

        let age = Date().timeIntervalSince(l2Result.lastFetchedAt)
        let freshness = policy.freshness(age: age)

        switch freshness {
        case .fresh:
            memoryCache[key] = L1Entry(items: l2Result.items, loadedAt: l2Result.lastFetchedAt)
            touchKey(key)
            return .fresh(l2Result.items, age: age)
        case .stale:
            memoryCache[key] = L1Entry(items: l2Result.items, loadedAt: l2Result.lastFetchedAt)
            touchKey(key)
            return .stale(l2Result.items, age: age)
        case .expired:
            return .expired
        }
    }

    public func update(for key: Key, mutate: @Sendable ([Value]) -> [Value]) async {
        guard var l1 = memoryCache[key] else { return }
        l1.items = mutate(l1.items)
        memoryCache[key] = l1
        touchKey(key)
        markDirty(key)
    }

    public func invalidate(for key: Key) async {
        memoryCache.removeValue(forKey: key)
        removeFromAccessOrder(key)
        dirtyKeys.remove(key)
        deleteL2(for: key.description)
    }

    public func invalidateAll() async {
        memoryCache.removeAll()
        accessOrder.removeAll()
        dirtyKeys.removeAll()
        persistTask?.cancel()
        persistTask = nil
        firstDirtyAt = nil
        deleteAllL2()
    }

    public func flushDirtyKeys() async {
        guard !dirtyKeys.isEmpty else { return }

        let keysToFlush = dirtyKeys

        for key in keysToFlush {
            guard let l1 = memoryCache[key] else { continue }
            let keyStr = key.description
            let items = l1.items

            let success = flushKeyToL2(keyStr: keyStr, items: items)
            if success {
                dirtyKeys.remove(key)
            }
        }

        if dirtyKeys.isEmpty {
            firstDirtyAt = nil
        }
    }

    public func loadedKeys() -> [Key] {
        Array(memoryCache.keys)
    }

    // MARK: - Private actor-isolated

    private func touchKey(_ key: Key) {
        removeFromAccessOrder(key)
        accessOrder.append(key)

        while accessOrder.count > maxL1Keys, let evicted = accessOrder.first {
            accessOrder.removeFirst()
            memoryCache.removeValue(forKey: evicted)
        }
    }

    private func removeFromAccessOrder(_ key: Key) {
        accessOrder.removeAll { $0 == key }
    }

    private func markDirty(_ key: Key) {
        dirtyKeys.insert(key)
        let now = Date()
        if firstDirtyAt == nil {
            firstDirtyAt = now
        }

        if let first = firstDirtyAt, now.timeIntervalSince(first) >= 10 {
            persistTask?.cancel()
            persistTask = Task { await self.flushDirtyKeys() }
            return
        }

        persistTask?.cancel()
        persistTask = Task {
            try? await Task.sleep(nanoseconds: 2_000_000_000)
            guard !Task.isCancelled else { return }
            await self.flushDirtyKeys()
        }
    }

    // MARK: - nonisolated DB operations

    private nonisolated func writeToL2(_ items: [Value], for keyStr: String) {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        do {
            try db.write { db in
                try CacheEntry.filter(Column("key") == keyStr).deleteAll(db)

                let now = Date()
                for item in items {
                    let data = try encoder.encode(item)
                    let entry = CacheEntry(key: keyStr, itemId: item.id, encodedData: data, updatedAt: now)
                    try entry.save(db)
                }

                let meta = DBCacheMetadata(key: keyStr, nextCursor: nil, hasMore: false, totalCount: items.count, lastFetchedAt: now)
                try meta.save(db)
            }
        } catch {
            logger.error("Failed to persist to L2 for key \(keyStr): \(error)")
        }
    }

    private nonisolated func readFromL2(for keyStr: String) -> (items: [Value], lastFetchedAt: Date)? {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        do {
            return try db.read { db in
                guard let meta = try DBCacheMetadata.filter(Column("key") == keyStr).fetchOne(db) else {
                    return nil
                }

                let entries = try CacheEntry.filter(Column("key") == keyStr).fetchAll(db)
                guard !entries.isEmpty else { return nil }

                let items: [Value] = try entries.compactMap { entry in
                    try decoder.decode(Value.self, from: entry.encodedData)
                }

                return (items, meta.lastFetchedAt)
            }
        } catch {
            logger.error("Failed to load from L2 for key \(keyStr): \(error)")
            return nil
        }
    }

    private nonisolated func deleteL2(for keyStr: String) {
        do {
            try db.write { db in
                try CacheEntry.filter(Column("key") == keyStr).deleteAll(db)
                try DBCacheMetadata.filter(Column("key") == keyStr).deleteAll(db)
            }
        } catch {
            logger.error("Failed to invalidate L2 for key \(keyStr): \(error)")
        }
    }

    private nonisolated func deleteAllL2() {
        do {
            try db.write { db in
                try CacheEntry.deleteAll(db)
                try DBCacheMetadata.deleteAll(db)
            }
        } catch {
            logger.error("Failed to invalidate all L2: \(error)")
        }
    }

    private nonisolated func flushKeyToL2(keyStr: String, items: [Value]) -> Bool {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        do {
            try db.write { db in
                let existingIds = try String.fetchAll(db, sql: "SELECT itemId FROM cache_entries WHERE key = ?", arguments: [keyStr])
                let currentIds = Set(items.map(\.id))

                let removedIds = existingIds.filter { !currentIds.contains($0) }
                for removedId in removedIds {
                    try CacheEntry.filter(Column("key") == keyStr && Column("itemId") == removedId).deleteAll(db)
                }

                let now = Date()
                for item in items {
                    let data = try encoder.encode(item)
                    let entry = CacheEntry(key: keyStr, itemId: item.id, encodedData: data, updatedAt: now)
                    try entry.save(db)
                }

                let meta = DBCacheMetadata(key: keyStr, nextCursor: nil, hasMore: false, totalCount: items.count, lastFetchedAt: now)
                try meta.save(db)
            }
            return true
        } catch {
            logger.error("Failed to flush dirty key \(keyStr): \(error)")
            return false
        }
    }
}
