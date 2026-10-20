import Foundation
import GRDB

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

/// cache-01 — contrat minimal partagé par les 27 stores GRDB pour que
/// flushAll/evictUnderMemoryPressure/dirtyCountForTest itèrent une LISTE
/// unique au lieu d'énumérations divergentes (l'oubli du store notifications
/// perdait l'état « lu » au kill).
/// Les opérations que le coordinateur applique à TOUS ses stores GRDB d'un
/// bloc — flush différé, éviction sous pression mémoire, purge de session.
///
/// cache-09 (#7146) — `invalidateAll()` a rejoint le protocole pour que
/// `CacheCoordinator.reset()` et `invalidateAll()` puissent parcourir
/// `allGRDBStores` au lieu de renommer chaque store à la main. Trois
/// énumérations manuelles avaient divergé des propriétés déclarées, et un
/// store non nommé survivait à la déconnexion depuis que `deleteAllL2()` ne
/// purge plus que son propre namespace.
protocol GRDBDirtyFlushing: Sendable {
    func flushDirtyKeys(deadline: Date?) async
    func flushDirtyKeys() async
    func evictL1() async
    func dirtyKeyCount() async -> Int
    func invalidateAll() async
}

public actor GRDBCacheStore<Key, Value>: MutableCacheStore, GRDBDirtyFlushing
    where Key: Hashable & Sendable & CustomStringConvertible,
          Value: CacheIdentifiable & Codable
{
    public let policy: CachePolicy

    private let diskL2: GRDBCacheL2<Value>
    private let maxL1Keys: Int
    private let namespace: String

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
        self.diskL2 = GRDBCacheL2(db: db, namespace: namespace, encrypted: encrypted, encryption: encryption)
        self.namespace = namespace
        self.maxL1Keys = maxL1Keys
    }

    private func namespacedKey(_ key: String) -> String {
        namespace.isEmpty ? key : "\(namespace):\(key)"
    }

    public func save(_ items: [Value], for key: Key) async throws {
        try save(items, for: key, fetchedAt: Date())
    }

    /// #7809 — écriture d'un INSTANTANÉ qui ne vient pas d'un fetch réseau
    /// (préchargement de la NSE) : l'horloge SWR est datée juste au-delà de la
    /// fenêtre fraîche, donc `load` rend `.stale` — la donnée se peint tout de
    /// suite ET se revalide. Sans fenêtre `staleTTL`, il n'existe aucun état
    /// `.stale` : repli sur `save`.
    public func saveAsStale(_ items: [Value], for key: Key) async throws {
        try save(items, for: key, fetchedAt: Date().addingTimeInterval(-(policy.staleTTL ?? 0)))
    }

    private func save(_ items: [Value], for key: Key, fetchedAt: Date) throws {
        let trimmed: [Value]
        if let max = policy.maxItemCount, items.count > max {
            trimmed = Array(items.suffix(max))
        } else {
            trimmed = items
        }

        // Write to L2 BEFORE mutating L1 so a failed write (e.g. encryption
        // failure on an `encrypted: true` store) does not leave L1 caching
        // data that never reached persistent storage.
        try diskL2.writeToL2(trimmed, for: namespacedKey(key.description), fetchedAt: fetchedAt)

        memoryCache[key] = L1Entry(items: trimmed, loadedAt: fetchedAt)
        touchKey(key)
    }

    /// stores-08 — persistance d'une MUTATION LOCALE : mêmes écritures que
    /// save() mais `lastFetchedAt` est PRÉSERVÉ (contrat de flushKeyToL2 :
    /// seul un vrai fetch réseau fait avancer l'horloge SWR). Sans ça, un
    /// like/commentaire local rendait la clé faussement .fresh et supprimait
    /// la revalidation au cold start.
    public func savePreservingFreshness(_ items: [Value], for key: Key) async throws {
        let trimmed: [Value]
        if let max = policy.maxItemCount, items.count > max {
            trimmed = Array(items.suffix(max))
        } else {
            trimmed = items
        }
        let preservedAt = try diskL2.writeToL2PreservingFreshness(trimmed, for: namespacedKey(key.description))
        memoryCache[key] = L1Entry(items: trimmed, loadedAt: preservedAt)
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
                // cache-05 — même primitive que touchKey/evictL1 : une
                // mutation locale encore dans la fenêtre debounce serait
                // perdue si l'entrée franchit son TTL au load suivant.
                flushDirtyKeyForEviction(key)
                // Le flush a échoué (base suspendue en arrière-plan, chiffrement
                // indisponible) : L1 porte la SEULE copie de la mutation. La
                // jeter ici la perdait — servie périmée, elle repartira au
                // prochain flush, et l'appelant revalide.
                if dirtyKeys.contains(key) {
                    touchKey(key)
                    return .stale(l1.items, age: age)
                }
                memoryCache.removeValue(forKey: key)
                removeFromAccessOrder(key)
            }
        }

        let l2Result = diskL2.readFromL2(for: namespacedKey(key.description))
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

    /// Reset the freshness clock for `key` to "now" WITHOUT refetching, so a
    /// subsequent `load` returns `.fresh` and retention is extended on access.
    /// Bumps L1 `loadedAt` and L2 `lastFetchedAt`. No-op when no entry exists.
    public func touch(for key: Key) async {
        let now = Date()
        if var l1 = memoryCache[key] {
            l1.loadedAt = now
            memoryCache[key] = l1
            touchKey(key)
        }
        diskL2.bumpLastFetchedAtInL2(to: now, for: namespacedKey(key.description))
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
        guard let l2 = diskL2.readFromL2(for: namespacedKey(key.description)) else { return nil }
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
        diskL2.rewriteL2FetchTimestamp(backdated, for: namespacedKey(key.description))
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
        // stores-08 — reprendre le lastFetchedAt L2 : fabriquer loadedAt=now
        // ici rendait la clé faussement .fresh après une éviction L1.
        guard let l2 = diskL2.readFromL2(for: namespacedKey(key.description)) else { return }
        let entry = L1Entry(items: mutate(l2.items), loadedAt: l2.lastFetchedAt)
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
        let l2 = diskL2.readFromL2(for: keyStr)
        let merged = merge(l2?.items ?? [], item)
        // Une mutation LOCALE ne rajeunit pas l'horloge (stores-08) : l'entrée
        // L2 garde la sienne, et une liste NÉE d'un seul élément n'a jamais été
        // chargée — datée comme `saveAsStale`, elle se peint ET se revalide au
        // lieu de passer pour fraîche et de sauter le chargement réseau.
        let loadedAt = l2?.lastFetchedAt ?? Date().addingTimeInterval(-(policy.staleTTL ?? 0))
        memoryCache[key] = L1Entry(items: merged, loadedAt: loadedAt)
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
        guard let l2 = diskL2.readFromL2(for: keyStr) else { return }
        var items = l2.items
        if let idx = items.firstIndex(where: { $0.id == itemId }) {
            mutate(&items[idx])
            // stores-08 — l'horloge L2, pas maintenant.
            let entry = L1Entry(items: items, loadedAt: l2.lastFetchedAt)
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
        } else if let l2 = diskL2.readFromL2(for: namespacedKey(key.description)) {
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

    /// Prepends `item` (newest-first) to an EXISTING cached list without resetting
    /// the freshness clock, so a real-time event can durably append to a cache the
    /// user already populated — surviving an app restart — while a still-stale or
    /// -expired entry keeps triggering its normal background refresh.
    ///
    /// Strict no-op when no entry exists in L1 or L2: fabricating a single-item
    /// `.fresh` cache from empty would make a cache-first `load` return only that
    /// one item and SKIP the authoritative network refresh. De-dups by `id` (an
    /// already-present id leaves the list untouched). Trims the OLDEST (tail) past
    /// `maxItemCount`. The freshness timestamp is preserved (existing `loadedAt`).
    public func prependToExisting(_ item: Value, for key: Key) async {
        let existing: [Value]
        let loadedAt: Date
        if let l1 = memoryCache[key], !l1.items.isEmpty {
            existing = l1.items
            loadedAt = l1.loadedAt
        } else if let l2 = diskL2.readFromL2(for: namespacedKey(key.description)) {
            existing = l2.items
            loadedAt = l2.lastFetchedAt
        } else {
            return
        }
        guard !existing.contains(where: { $0.id == item.id }) else { return }
        var merged = [item] + existing
        if let max = policy.maxItemCount, merged.count > max {
            merged = Array(merged.prefix(max))
        }
        memoryCache[key] = L1Entry(items: merged, loadedAt: loadedAt)
        touchKey(key)
        markDirty(key)
    }

    public func invalidate(for key: Key) async {
        memoryCache.removeValue(forKey: key)
        removeFromAccessOrder(key)
        dirtyKeys.remove(key)
        diskL2.deleteL2(for: namespacedKey(key.description))
    }

    public func invalidateAll() async {
        memoryCache.removeAll()
        accessOrder.removeAll()
        dirtyKeys.removeAll()
        persistTask?.cancel()
        persistTask = nil
        firstDirtyAt = nil
        diskL2.deleteAllL2()
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

            let success = diskL2.flushKeyToL2(keyStr: keyStr, items: items)
            if success {
                dirtyKeys.remove(key)
                // Une entrée gardée en mémoire seulement parce que son flush
                // d'éviction avait échoué (`flushDirtyKeyForEviction`) : sauvée,
                // elle sort enfin de L1.
                if !accessOrder.contains(key) {
                    memoryCache.removeValue(forKey: key)
                }
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
        // Un flush raté (base suspendue, chiffrement indisponible) laisse la
        // clé sale : L1 porte alors la SEULE copie de la mutation, elle reste
        // en mémoire jusqu'au prochain flush réussi. Le reste part.
        memoryCache = memoryCache.filter { dirtyKeys.contains($0.key) }
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
        diskL2.writeCursorToL2(nextCursor: nextCursor, hasMore: hasMore, for: namespacedKey(key.description))
    }

    /// Load the persisted cursor + hasMore for a given key. Returns nil
    /// when no metadata row exists (cold cache or never persisted).
    public func loadCursor(for key: Key) async -> PaginationCursor? {
        diskL2.readCursorFromL2(for: namespacedKey(key.description))
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
            // Flush raté : la mutation n'existe qu'en L1. L'entrée quitte l'ordre
            // LRU (elle ne bloque pas la borne) mais reste en mémoire ; le
            // prochain `flushDirtyKeys` réussi l'en retire.
            if !dirtyKeys.contains(evicted) {
                memoryCache.removeValue(forKey: evicted)
            }
        }
    }

    /// Flush a single dirty key to L2 then drop it from the dirty set. Called by
    /// every eviction path (LRU in `touchKey`, bulk `evictL1`) so eviction never
    /// silently loses a local mutation that hasn't reached its debounce window.
    /// No-op when the key isn't dirty or has no L1 entry. A failed flush (e.g.
    /// encryption failure, suspended database) leaves the key dirty AND its L1
    /// entry in place — the callers keep it — for `flushDirtyKeys` to retry.
    /// Uses `flushKeyToL2`, which preserves `lastFetchedAt`.
    private func flushDirtyKeyForEviction(_ key: Key) {
        guard dirtyKeys.contains(key), let entry = memoryCache[key] else { return }
        if diskL2.flushKeyToL2(keyStr: namespacedKey(key.description), items: entry.items) {
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
            try? await Task.sleep(for: .seconds(2))
            guard !Task.isCancelled else { return }
            await self.flushDirtyKeys()
        }
    }
}

// MARK: - Patch multi-clés

extension GRDBCacheStore where Key == String {

    /// Applique `mutate` à l'item `itemId` dans **toutes** les clés qui le
    /// contiennent, en mémoire comme en base.
    ///
    /// Un même objet est couramment indexé sous plusieurs clés du même store —
    /// un post du feed vit sous `main-feed`, sous `<postId>` (écran de détail),
    /// sous la clé du pager de réels et sous `bookmarks`. `upsertPatch(for:)` ne
    /// touche qu'une clé : après un like, les autres gardaient l'ancien compteur
    /// et le ressortaient à la réouverture de l'écran.
    ///
    /// Balaie l'union des clés L1 (chargées) et L2 (persistées mais évincées) :
    /// se limiter à `loadedKeys()` laisserait périmée une clé que le prochain
    /// démarrage à froid relira depuis GRDB.
    ///
    /// Ne crée jamais d'entrée : une clé qui ne contient pas l'item est ignorée.
    /// La fraîcheur (`lastFetchedAt`) est préservée — elle appartient à `save()`.
    public func patchEverywhere(itemId: String, mutate: @Sendable (inout Value) -> Void) async {
        let l1Keys = loadedKeys().filter { key in
            memoryCache[key]?.items.contains(where: { $0.id == itemId }) ?? false
        }
        let keys = Set(l1Keys).union(diskL2.keysHolding(itemId: itemId))
        for key in keys {
            await upsertPatch(for: key, itemId: itemId, mutate: mutate)
        }
    }

    /// Retire l'item `itemId` de **toutes** les clés qui le contiennent, en
    /// mémoire comme en base — le pendant destructif de `patchEverywhere`.
    ///
    /// Un `post:deleted` reçu pendant que seul le feed est ouvert laissait le
    /// post fantôme sous sa clé détail et sous `bookmarks` : le prochain cold
    /// start le ressortait. Même balayage L1 ∪ L2, même préservation de la
    /// fraîcheur (`update` reprend le `lastFetchedAt` persistant).
    public func removeEverywhere(itemId: String) async {
        let l1Keys = loadedKeys().filter { key in
            memoryCache[key]?.items.contains(where: { $0.id == itemId }) ?? false
        }
        let keys = Set(l1Keys).union(diskL2.keysHolding(itemId: itemId))
        for key in keys {
            await update(for: key) { items in items.filter { $0.id != itemId } }
        }
    }

    /// Applique `rule` à chaque item de chaque clé, mémoire comme base (#9307).
    /// Le pendant de `patchEverywhere` quand l'item visé ne se reconnaît pas à
    /// son `id` — un participant à son `userId`, une demande d'ami à l'une de
    /// ses deux parties. `rule` rend `nil` pour un item intact : seules les
    /// clés où un item CHANGE sont réécrites, fraîcheur préservée.
    public func repaintEverywhere(_ rule: @escaping @Sendable (Value) -> Value?) async {
        let keys = Set(loadedKeys()).union(diskL2.keys())
        for key in keys {
            let items = memoryCache[key]?.items ?? diskL2.readFromL2(for: namespacedKey(key))?.items ?? []
            guard items.repaintedElements(by: rule) != nil else { continue }
            await update(for: key) { items in items.repaintedElements(by: rule) ?? items }
        }
    }
}

// MARK: - Inventaire pour la purge sélective

extension GRDBCacheStore {

    /// Toutes les valeurs persistées de CE store, toutes clés confondues, sans
    /// égard à la fraîcheur et dédupliquées par `itemId` (cf. `CacheMediaAttribution`).
    public func allCachedValues() async -> [Value] {
        await diskL2.allValues()
    }

    /// Octets occupés en base par les payloads de CE store (plancher exact du contenu).
    public func l2ByteSize() async -> Int {
        await diskL2.byteSize()
    }
}
