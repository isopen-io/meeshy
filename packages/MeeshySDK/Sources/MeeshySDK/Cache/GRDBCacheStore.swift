import Foundation
import GRDB
import os

/// Errors thrown by `GRDBCacheStore` write paths. Task 1.1 of the iOS
/// Local-First Wave 1 plan introduces `.encryptionFailed` so the previous
/// silent plaintext fallback (`encrypt(json) ?? json`) no longer leaks
/// unencrypted data into SQLite when the Keychain key is corrupted or
/// otherwise unavailable.
///
/// Decryption-on-read failures intentionally do NOT throw — `readFromL2`
/// returns nil so the caller falls through to network (SWR alignment).
/// Pool configuration is mandatory at construction time so no runtime
/// `poolNotConfigured` case is needed here (cf. `OfflineQueueError` which
/// owns its own variant).
public enum GRDBCacheError: Error, Sendable {
    case encryptionFailed
}

public actor GRDBCacheStore<Key, Value>: MutableCacheStore
    where Key: Hashable & Sendable & CustomStringConvertible,
          Value: CacheIdentifiable & Codable
{
    public let policy: CachePolicy

    private let db: any DatabaseWriter
    private let maxL1Keys: Int
    private let namespace: String
    private let encrypted: Bool
    private let encryption: any DatabaseEncryptionProviding
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

    public init(
        policy: CachePolicy,
        db: any DatabaseWriter,
        namespace: String = "",
        maxL1Keys: Int = 20,
        encrypted: Bool = false,
        encryption: any DatabaseEncryptionProviding = DatabaseEncryption.shared
    ) {
        self.policy = policy
        self.db = db
        self.namespace = namespace
        self.maxL1Keys = maxL1Keys
        self.encrypted = encrypted
        self.encryption = encryption
    }

    private func namespacedKey(_ key: String) -> String {
        namespace.isEmpty ? key : "\(namespace):\(key)"
    }

    public func save(_ items: [Value], for key: Key) async throws {
        let trimmed: [Value]
        if let max = policy.maxItemCount, items.count > max {
            trimmed = Array(items.suffix(max))
        } else {
            trimmed = items
        }

        // Write to L2 BEFORE mutating L1 so a failed write (e.g. encryption
        // failure on an `encrypted: true` store) does not leave L1 caching
        // data that never reached persistent storage.
        try writeToL2(trimmed, for: namespacedKey(key.description))

        memoryCache[key] = L1Entry(items: trimmed, loadedAt: Date())
        touchKey(key)
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

        let l2Result = readFromL2(for: namespacedKey(key.description))
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

    /// Best-effort recovery for the `.expired` branch of `load(for:)`.
    ///
    /// `load()` intentionally returns a data-less `.expired` once an entry
    /// crosses the policy's expiry threshold — it signals "don't trust
    /// this, go resync" to every consumer across the app, and changing
    /// that contract would ripple through dozens of unrelated call sites
    /// that pattern-match on the bare `.expired` case. But a resync that
    /// FAILS (offline) must not leave a caller with nothing when the disk
    /// genuinely still has the last-known-good payload. Callers that want
    /// "paint what's on disk, then try to resync" semantics read this
    /// alongside `load()`'s `.expired` case instead of accepting an empty
    /// screen. Returns `nil` only when there is truly no persisted
    /// payload (mirrors `.empty`).
    public func loadIgnoringExpiry(for key: Key) async -> (items: [Value], age: TimeInterval)? {
        if let l1 = memoryCache[key] {
            return (l1.items, Date().timeIntervalSince(l1.loadedAt))
        }
        guard let l2 = readFromL2(for: namespacedKey(key.description)) else { return nil }
        return (l2.items, Date().timeIntervalSince(l2.lastFetchedAt))
    }

    /// Test-only seam: rewinds a key's freshness clock (L1 `loadedAt` +
    /// persisted L2 `lastFetchedAt`) by `age` seconds without touching the
    /// stored payload. `DBCacheMetadata` is SDK-internal, so integration
    /// tests living outside this module (e.g. a `ConversationListViewModel`
    /// test driving the real `CacheCoordinator.shared.conversations` store,
    /// 24h TTL) have no other way to exercise `.stale`/`.expired` against a
    /// singleton-backed store deterministically — waiting out the real TTL
    /// isn't practical, and reaching into the private storage types isn't
    /// possible from outside the module. No-op when `key` was never saved.
    /// Never called from production code.
    public func debugRewindFetchTimestamp(by age: TimeInterval, for key: Key) async {
        let backdated = Date().addingTimeInterval(-age)
        if var l1 = memoryCache[key] {
            l1.loadedAt = backdated
            memoryCache[key] = l1
        }
        rewriteL2FetchTimestamp(backdated, for: namespacedKey(key.description))
    }

    public func update(for key: Key, mutate: @Sendable ([Value]) -> [Value]) async {
        if var l1 = memoryCache[key] {
            l1.items = mutate(l1.items)
            memoryCache[key] = l1
            touchKey(key)
            markDirty(key)
            return
        }
        // L1 miss: hydrate from L2 so the mutation is applied to the persisted
        // set instead of being silently dropped after a memory eviction (mirrors
        // `upsert` / `upsertPatch`). NO `maxItemCount` trim here — `update`
        // preserves the full set; callers like the conversation list keep it
        // newest-first, where a `suffix` trim would drop the newest entries.
        guard let l2items = readFromL2(for: namespacedKey(key.description))?.items else { return }
        let entry = L1Entry(items: mutate(l2items), loadedAt: Date())
        memoryCache[key] = entry
        touchKey(key)
        markDirty(key)
    }

    public func upsert(item: Value, for key: Key, merge: @Sendable ([Value], Value) -> [Value]) async {
        if var l1 = memoryCache[key] {
            l1.items = merge(l1.items, item)
            memoryCache[key] = l1
            touchKey(key)
            markDirty(key)
            return
        }
        let keyStr = namespacedKey(key.description)
        let existing = readFromL2(for: keyStr)?.items ?? []
        let merged = merge(existing, item)
        let entry = L1Entry(items: merged, loadedAt: Date())
        memoryCache[key] = entry
        touchKey(key)
        markDirty(key)
    }

    public func upsertPatch(for key: Key, itemId: String, mutate: @Sendable (inout Value) -> Void) async {
        if var l1 = memoryCache[key] {
            if let idx = l1.items.firstIndex(where: { $0.id == itemId }) {
                mutate(&l1.items[idx])
                memoryCache[key] = l1
                touchKey(key)
                markDirty(key)
            }
            return
        }
        let keyStr = namespacedKey(key.description)
        guard var items = readFromL2(for: keyStr)?.items else { return }
        if let idx = items.firstIndex(where: { $0.id == itemId }) {
            mutate(&items[idx])
            let entry = L1Entry(items: items, loadedAt: Date())
            memoryCache[key] = entry
            touchKey(key)
            markDirty(key)
        }
    }

    public func mergeUpdate(for key: Key, mutate: @Sendable ([Value]) -> [Value]) async {
        let existing: [Value]
        let loadedAt: Date
        if let l1 = memoryCache[key] {
            existing = l1.items
            loadedAt = l1.loadedAt
        } else if let l2 = readFromL2(for: namespacedKey(key.description)) {
            existing = l2.items
            loadedAt = l2.lastFetchedAt
        } else {
            existing = []
            loadedAt = Date()
        }
        var mutated = mutate(existing)
        if let max = policy.maxItemCount, mutated.count > max {
            mutated = Array(mutated.suffix(max))
        }
        memoryCache[key] = L1Entry(items: mutated, loadedAt: loadedAt)
        touchKey(key)
        markDirty(key)
    }

    public func invalidate(for key: Key) async {
        memoryCache.removeValue(forKey: key)
        removeFromAccessOrder(key)
        dirtyKeys.remove(key)
        deleteL2(for: namespacedKey(key.description))
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
        await flushDirtyKeys(deadline: nil)
    }

    /// Deadline-aware variant used by the BGProcessingTask path. When the
    /// provided deadline elapses mid-iteration we stop scheduling new
    /// `db.write` calls — keys that have not yet been flushed stay dirty
    /// so the next opportunity (cold start or next background submission)
    /// picks them up. A `nil` deadline matches the legacy unbounded
    /// behavior (used by the 2-second debounce path).
    public func flushDirtyKeys(deadline: Date?) async {
        guard !dirtyKeys.isEmpty else {
            firstDirtyAt = nil
            return
        }

        let keysToFlush = dirtyKeys

        for key in keysToFlush {
            if let deadline, Date() >= deadline { break }
            guard let l1 = memoryCache[key] else {
                // The key lost its L1 entry without being flushed. There is
                // nothing to persist, so drop it from the dirty set rather than
                // leaving it to leak `firstDirtyAt` and re-arm the debounce
                // against a phantom key forever.
                dirtyKeys.remove(key)
                continue
            }
            let keyStr = namespacedKey(key.description)
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

    /// Number of dirty keys awaiting flush. Exposed for the background
    /// flush test harness in `CacheBackgroundFlushTests`; production
    /// callers should not need to introspect this.
    public func dirtyKeyCount() -> Int {
        dirtyKeys.count
    }

    /// Inject `count` synthetic dirty entries for tests. Each entry is a
    /// fresh `L1Entry` keyed by its insertion index — the data shape is
    /// irrelevant, only the bookkeeping (dirty set + access order) is
    /// exercised by the flush path under test. Bypasses the `maxL1Keys`
    /// LRU cap (which would otherwise evict the early seeds before the
    /// flush observes them) — production callers should never need this.
    public func seedDirtyForTest(items: [(Key, [Value])]) {
        for (key, values) in items {
            memoryCache[key] = L1Entry(items: values, loadedAt: Date())
            removeFromAccessOrder(key)
            accessOrder.append(key)
            dirtyKeys.insert(key)
        }
        if firstDirtyAt == nil, !dirtyKeys.isEmpty {
            firstDirtyAt = Date()
        }
    }

    public func evictL1() {
        // Flush any dirty mutations before dropping them from memory — a direct
        // evictL1 (e.g. memory pressure) must not lose a mutation that landed
        // after the caller's own flush. Snapshot the set since the flush
        // mutates it.
        for key in Array(dirtyKeys) {
            flushDirtyKeyForEviction(key)
        }
        memoryCache.removeAll()
        accessOrder.removeAll()
        if dirtyKeys.isEmpty { firstDirtyAt = nil }
    }

    public func loadedKeys() -> [Key] {
        Array(memoryCache.keys)
    }

    // MARK: - Pagination cursor persistence
    //
    // Cursor pagination metadata (`nextCursor` + `hasMore`) is persisted
    // alongside the cached items so a cold-start can resume scrolling
    // from where the user last reached, instead of refetching page 1
    // on the next `loadMore()`. The data lives in the existing
    // `cache_metadata` table — same row as the items' `lastFetchedAt`
    // — so we read/merge to avoid clobbering the timestamp.

    /// Persist the cursor + hasMore for a given key. Merges with any
    /// existing metadata so we don't reset `lastFetchedAt` (which is
    /// owned by `save()` / `flushKeyToL2`).
    public func saveCursor(nextCursor: String?, hasMore: Bool, for key: Key) async {
        writeCursorToL2(nextCursor: nextCursor, hasMore: hasMore, for: namespacedKey(key.description))
    }

    /// Load the persisted cursor + hasMore for a given key. Returns nil
    /// when no metadata row exists (cold cache or never persisted).
    public func loadCursor(for key: Key) async -> PaginationCursor? {
        readCursorFromL2(for: namespacedKey(key.description))
    }

    // MARK: - Private actor-isolated

    private func touchKey(_ key: Key) {
        removeFromAccessOrder(key)
        accessOrder.append(key)

        while accessOrder.count > maxL1Keys, let evicted = accessOrder.first {
            accessOrder.removeFirst()
            // Flush a dirty victim before dropping it from memory — otherwise a
            // local mutation that hasn't reached its 2s debounce window is
            // silently lost (it lived only in L1).
            flushDirtyKeyForEviction(evicted)
            memoryCache.removeValue(forKey: evicted)
        }
    }

    /// Flush a single dirty key to L2 then drop it from the dirty set. Called by
    /// every eviction path (LRU in `touchKey`, bulk `evictL1`) so eviction never
    /// silently loses a local mutation that hasn't reached its debounce window.
    /// No-op when the key isn't dirty or has no L1 entry. A failed flush (e.g.
    /// encryption failure) leaves the key dirty for `flushDirtyKeys` to retry or
    /// GC. Uses `flushKeyToL2`, which preserves `lastFetchedAt`.
    private func flushDirtyKeyForEviction(_ key: Key) {
        guard dirtyKeys.contains(key), let entry = memoryCache[key] else { return }
        if flushKeyToL2(keyStr: namespacedKey(key.description), items: entry.items) {
            dirtyKeys.remove(key)
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

    private nonisolated func writeToL2(_ items: [Value], for keyStr: String) throws {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let encrypt = encrypted
        let encryption = self.encryption
        let namespace = self.namespace
        let logger = self.logger
        do {
            try db.write { db in
                try CacheEntry.filter(Column("key") == keyStr).deleteAll(db)

                let now = Date()
                for item in items {
                    let json = try encoder.encode(item)
                    let data: Data
                    if encrypt {
                        guard let encryptedData = encryption.encrypt(json) else {
                            logger.error("Encryption failed for store \(namespace, privacy: .public), refusing to persist")
                            throw GRDBCacheError.encryptionFailed
                        }
                        data = encryptedData
                    } else {
                        data = json
                    }
                    let entry = CacheEntry(key: keyStr, itemId: item.id, encodedData: data, updatedAt: now)
                    try entry.save(db)
                }

                // Preserve any cursor state that callers persisted via
                // `saveCursor` — `save()` only owns lastFetchedAt and
                // totalCount, not the pagination metadata.
                let existingCursor = try DBCacheMetadata.filter(Column("key") == keyStr).fetchOne(db)
                let meta = DBCacheMetadata(
                    key: keyStr,
                    nextCursor: existingCursor?.nextCursor,
                    hasMore: existingCursor?.hasMore ?? false,
                    totalCount: items.count,
                    lastFetchedAt: now
                )
                try meta.save(db)
            }
        } catch let cacheError as GRDBCacheError {
            // Propagate the strict encryption error so callers can react
            // (e.g. show a recovery flow). The DB write was rolled back by
            // GRDB's transaction wrapper.
            throw cacheError
        } catch {
            self.logger.error("Failed to persist to L2 for key \(keyStr, privacy: .public): \(error.localizedDescription, privacy: .public)")
            throw error
        }
    }

    private nonisolated func readFromL2(for keyStr: String) -> (items: [Value], lastFetchedAt: Date)? {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let encrypt = encrypted
        let encryption = self.encryption
        let logger = self.logger
        do {
            return try db.read { db in
                guard let meta = try DBCacheMetadata.filter(Column("key") == keyStr).fetchOne(db) else {
                    return nil
                }

                let entries = try CacheEntry.filter(Column("key") == keyStr).fetchAll(db)
                guard !entries.isEmpty else { return nil }

                let items: [Value] = entries.compactMap { entry in
                    // On encrypted stores, a `nil` decrypt result means the
                    // row is unreadable (corrupted key, wrong-key tampering,
                    // or a leftover row written under a previous identity).
                    // Skip it instead of feeding garbage ciphertext to the
                    // JSON decoder — the caller will treat the key as empty.
                    let raw: Data
                    if encrypt {
                        guard let decrypted = encryption.decrypt(entry.encodedData) else {
                            logger.warning("Decryption failed for key \(keyStr, privacy: .public), skipping entry")
                            return nil
                        }
                        raw = decrypted
                    } else {
                        raw = entry.encodedData
                    }
                    return try? decoder.decode(Value.self, from: raw)
                }

                return items.isEmpty ? nil : (items, meta.lastFetchedAt)
            }
        } catch {
            self.logger.error("Failed to load from L2 for key \(keyStr, privacy: .public): \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    /// Backing write for `debugRewindFetchTimestamp` — updates only the
    /// `lastFetchedAt` column of an existing metadata row. No-op (does not
    /// synthesize a row) when `keyStr` has no persisted metadata, mirroring
    /// `loadIgnoringExpiry`'s "nil when never saved" contract.
    private nonisolated func rewriteL2FetchTimestamp(_ date: Date, for keyStr: String) {
        do {
            try db.write { db in
                guard var meta = try DBCacheMetadata.filter(Column("key") == keyStr).fetchOne(db) else { return }
                meta.lastFetchedAt = date
                try meta.save(db)
            }
        } catch {
            logger.error("Failed to rewind lastFetchedAt for key \(keyStr, privacy: .public): \(error.localizedDescription, privacy: .public)")
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

    private nonisolated func writeCursorToL2(nextCursor: String?, hasMore: Bool, for keyStr: String) {
        do {
            try db.write { db in
                if var meta = try DBCacheMetadata.filter(Column("key") == keyStr).fetchOne(db) {
                    // Merge: keep existing lastFetchedAt/totalCount, only
                    // update the cursor fields. This preserves the
                    // freshness signal owned by `save()`.
                    meta.nextCursor = nextCursor
                    meta.hasMore = hasMore
                    try meta.save(db)
                } else {
                    // No prior metadata row — synthesise one with a
                    // current timestamp so reads know when the cursor
                    // was first observed.
                    let meta = DBCacheMetadata(
                        key: keyStr,
                        nextCursor: nextCursor,
                        hasMore: hasMore,
                        totalCount: nil,
                        lastFetchedAt: Date()
                    )
                    try meta.save(db)
                }
            }
        } catch {
            logger.error("Failed to persist cursor for key \(keyStr): \(error)")
        }
    }

    private nonisolated func readCursorFromL2(for keyStr: String) -> PaginationCursor? {
        do {
            return try db.read { db in
                guard let meta = try DBCacheMetadata.filter(Column("key") == keyStr).fetchOne(db) else {
                    return nil
                }
                return PaginationCursor(nextCursor: meta.nextCursor, hasMore: meta.hasMore)
            }
        } catch {
            logger.error("Failed to load cursor from L2 for key \(keyStr): \(error)")
            return nil
        }
    }

    private nonisolated func flushKeyToL2(keyStr: String, items: [Value]) -> Bool {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let encrypt = encrypted
        let encryption = self.encryption
        let namespace = self.namespace
        let logger = self.logger
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
                    let json = try encoder.encode(item)
                    let data: Data
                    if encrypt {
                        guard let encryptedData = encryption.encrypt(json) else {
                            logger.error("Encryption failed for store \(namespace, privacy: .public) during flush, refusing to persist")
                            throw GRDBCacheError.encryptionFailed
                        }
                        data = encryptedData
                    } else {
                        data = json
                    }
                    let entry = CacheEntry(key: keyStr, itemId: item.id, encodedData: data, updatedAt: now)
                    try entry.save(db)
                }

                // Preserve cursor state AND the network-fetch freshness clock
                // across flushes. A dirty flush is triggered by purely-LOCAL
                // mutations (update/upsert/mergeUpdate), so resetting
                // `lastFetchedAt` to `now` here would make stale data read as
                // `.fresh` after L1 eviction / restart and suppress the
                // stale-while-revalidate refresh. Only `save()` (a genuine
                // network fetch, see writeToL2) may advance lastFetchedAt; we
                // fall back to `now` only when no prior metadata exists (a key
                // created purely locally with no network counterpart).
                let existingMeta = try DBCacheMetadata.filter(Column("key") == keyStr).fetchOne(db)
                let meta = DBCacheMetadata(
                    key: keyStr,
                    nextCursor: existingMeta?.nextCursor,
                    hasMore: existingMeta?.hasMore ?? false,
                    totalCount: items.count,
                    lastFetchedAt: existingMeta?.lastFetchedAt ?? now
                )
                try meta.save(db)
            }
            return true
        } catch {
            // Returning `false` keeps the dirty key in the set so the next
            // flush window retries. On encryption failure this means the
            // mutation stays in L1 (visible to the user) but never reaches
            // disk — preferable to a silent plaintext leak.
            self.logger.error("Failed to flush dirty key \(keyStr, privacy: .public): \(error.localizedDescription, privacy: .public)")
            return false
        }
    }
}
