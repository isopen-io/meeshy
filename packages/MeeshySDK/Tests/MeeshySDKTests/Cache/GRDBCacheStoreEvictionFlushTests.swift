import XCTest
import GRDB
@testable import MeeshySDK

private struct EvictTestItem: CacheIdentifiable, Codable, Equatable {
    var id: String
    var name: String
}

/// T4 — Eviction must never silently drop a dirty L1 mutation.
///
/// `touchKey`'s LRU eviction and `evictL1` removed entries from memory without
/// flushing dirty ones to L2. A local mutation that hadn't reached its 2s
/// debounce window lived only in L1, so a burst of cross-key activity (e.g.
/// many conversations updated over the socket, maxL1Keys=20) could evict and
/// lose it. They also left the evicted keys in `dirtyKeys`, leaking the
/// debounce clock. Invariant under test: no eviction path drops a dirty L1
/// entry without first flushing it, and the dirty set never retains a key that
/// is no longer in L1.
final class GRDBCacheStoreEvictionFlushTests: XCTestCase {

    private func makeDB() throws -> DatabaseQueue {
        let dbQueue = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: dbQueue)
        return dbQueue
    }

    private func makeStore(maxL1Keys: Int, db: DatabaseQueue) -> GRDBCacheStore<String, EvictTestItem> {
        let policy = CachePolicy(ttl: .hours(1), staleTTL: .minutes(5), maxItemCount: nil, storageLocation: .grdb)
        return GRDBCacheStore(policy: policy, db: db, maxL1Keys: maxL1Keys)
    }

    private func l2Count(_ key: String, db: DatabaseQueue) async throws -> Int {
        try await db.read { db in
            try CacheEntry.filter(Column("key") == key).fetchCount(db)
        }
    }

    func test_lruEviction_flushesDirtyVictimToL2_andClearsDirtySet() async throws {
        let db = try makeDB()
        let store = makeStore(maxL1Keys: 2, db: db)

        // k1 saved (1 item in L2), then locally mutated (2 items in L1, dirty,
        // NOT yet flushed — the 2s debounce hasn't fired).
        try await store.save([EvictTestItem(id: "1", name: "A")], for: "k1")
        await store.update(for: "k1") { $0 + [EvictTestItem(id: "2", name: "B")] }

        // Touch two more keys so the LRU evicts k1.
        try await store.save([EvictTestItem(id: "3", name: "C")], for: "k2")
        try await store.save([EvictTestItem(id: "4", name: "D")], for: "k3")

        let k1L2 = try await l2Count("k1", db: db)
        XCTAssertEqual(k1L2, 2, "Evicting a dirty key must flush its mutation to L2 (not lose it)")

        let dirty = await store.dirtyKeyCount()
        XCTAssertEqual(dirty, 0, "A flushed-on-eviction key must be removed from the dirty set")
    }

    func test_evictL1_flushesDirtyToL2_andClearsDirtySet() async throws {
        let db = try makeDB()
        let store = makeStore(maxL1Keys: 20, db: db)

        try await store.save([EvictTestItem(id: "1", name: "A")], for: "k")
        await store.update(for: "k") { $0 + [EvictTestItem(id: "2", name: "B")] }

        await store.evictL1()

        let k1L2 = try await l2Count("k", db: db)
        XCTAssertEqual(k1L2, 2, "evictL1 must flush dirty mutations to L2 before dropping memory")

        let dirty = await store.dirtyKeyCount()
        XCTAssertEqual(dirty, 0, "evictL1 must not leave evicted keys in the dirty set")
    }

    // MARK: - cache-05 — la branche .expired de load() flushe la victime dirty

    func test_load_expiredEntryWithPendingDirtyMutation_flushesMutationToL2BeforeDropping() async throws {
        let db = try makeDB()
        let store = makeStore(maxL1Keys: 20, db: db)

        try await store.save([EvictTestItem(id: "1", name: "A")], for: "k")
        await store.debugRewindFetchTimestamp(by: .hours(1) + 1, for: "k")
        await store.update(for: "k") { items in
            items.map { item in EvictTestItem(id: item.id, name: "B") }
        }

        let result = await store.load(for: "k")
        guard case .expired = result else {
            return XCTFail("Expected .expired once the rewound entry crosses the TTL, got \(result)")
        }

        let recovered = await store.loadIgnoringExpiry(for: "k")
        XCTAssertEqual(recovered?.items, [EvictTestItem(id: "1", name: "B")],
                       "la mutation dirty en attente doit être flushée en L2 AVANT que la branche .expired ne jette L1")

        let dirty2 = await store.dirtyKeyCount()
        XCTAssertEqual(dirty2, 0, "la clé ne doit pas rester dirty après l'éviction-flush de load()")
    }

    func test_load_expiredEntry_stillReturnsExpiredAfterFlush() async throws {
        let db = try makeDB()
        let store = makeStore(maxL1Keys: 20, db: db)

        try await store.save([EvictTestItem(id: "1", name: "A")], for: "k")
        await store.debugRewindFetchTimestamp(by: .hours(1) + 1, for: "k")
        await store.update(for: "k") { items in
            items.map { item in EvictTestItem(id: item.id, name: "B") }
        }

        _ = await store.load(for: "k")

        let second = await store.load(for: "k")
        guard case .expired = second else {
            return XCTFail("lastFetchedAt doit survivre au flush d'éviction, got \(second)")
        }
    }

    // MARK: - Un flush d'éviction RATÉ ne jette plus la seule copie

    /// Chiffrement qu'on coupe et rétablit à volonté : la base suspendue en
    /// arrière-plan (`SQLITE_INTERRUPT`) ou une clé du trousseau indisponible
    /// font échouer le flush de la même façon.
    private final class SwitchableEncryption: DatabaseEncryptionProviding, @unchecked Sendable {
        private let lock = NSLock()
        private var failing = false
        func setFailing(_ value: Bool) { lock.lock(); failing = value; lock.unlock() }
        func encrypt(_ plaintext: Data) -> Data? {
            lock.lock(); defer { lock.unlock() }
            return failing ? nil : plaintext
        }
        func decrypt(_ ciphertext: Data) -> Data? { ciphertext }
        var keyFingerprint: String { "switchable" }
    }

    /// Une instance NEUVE sur la même base lit le disque, jamais la mémoire.
    private func makeEncryptedStore(maxL1Keys: Int, db: DatabaseQueue, encryption: SwitchableEncryption) -> GRDBCacheStore<String, EvictTestItem> {
        let policy = CachePolicy(ttl: .hours(1), staleTTL: .minutes(5), maxItemCount: nil, storageLocation: .grdb)
        return GRDBCacheStore(policy: policy, db: db, maxL1Keys: maxL1Keys, encrypted: true, encryption: encryption)
    }

    func test_evictL1_whenTheFlushFails_keepsTheMutation_andTheNextFlushSavesIt() async throws {
        let db = try makeDB()
        let encryption = SwitchableEncryption()
        let store = makeEncryptedStore(maxL1Keys: 20, db: db, encryption: encryption)

        try await store.save([EvictTestItem(id: "1", name: "A")], for: "k")
        await store.update(for: "k") { $0 + [EvictTestItem(id: "2", name: "B")] }

        encryption.setFailing(true)
        await store.evictL1()
        encryption.setFailing(false)
        await store.flushDirtyKeys(deadline: nil)

        let recovered = await makeEncryptedStore(maxL1Keys: 20, db: db, encryption: encryption).loadIgnoringExpiry(for: "k")
        XCTAssertEqual(recovered?.items.map(\.id), ["1", "2"],
                       "la mutation que le flush raté n'a pas écrite vivait seulement en L1 : l'éviction ne doit pas la jeter")
        let dirty = await store.dirtyKeyCount()
        XCTAssertEqual(dirty, 0)
    }

    func test_lruEviction_whenTheFlushFails_keepsTheMutation_andTheNextFlushSavesIt() async throws {
        let db = try makeDB()
        let encryption = SwitchableEncryption()
        let store = makeEncryptedStore(maxL1Keys: 1, db: db, encryption: encryption)

        try await store.save([EvictTestItem(id: "1", name: "A")], for: "k1")
        await store.update(for: "k1") { $0 + [EvictTestItem(id: "2", name: "B")] }

        encryption.setFailing(true)
        // k2 pousse k1 hors de l'ordre LRU pendant que la base refuse d'écrire.
        await store.upsert(item: EvictTestItem(id: "3", name: "C"), for: "k2") { $0 + [$1] }
        encryption.setFailing(false)
        await store.flushDirtyKeys(deadline: nil)

        let recovered = await makeEncryptedStore(maxL1Keys: 20, db: db, encryption: encryption).loadIgnoringExpiry(for: "k1")
        XCTAssertEqual(recovered?.items.map(\.id), ["1", "2"])
        let dirty = await store.dirtyKeyCount()
        XCTAssertEqual(dirty, 0)
    }

    func test_load_expiredEntry_whenTheFlushFails_servesTheMutationStale_insteadOfDroppingIt() async throws {
        let db = try makeDB()
        let encryption = SwitchableEncryption()
        let store = makeEncryptedStore(maxL1Keys: 20, db: db, encryption: encryption)

        try await store.save([EvictTestItem(id: "1", name: "A")], for: "k")
        await store.debugRewindFetchTimestamp(by: .hours(1) + 1, for: "k")
        await store.update(for: "k") { items in items.map { EvictTestItem(id: $0.id, name: "B") } }

        encryption.setFailing(true)
        let result = await store.load(for: "k")
        encryption.setFailing(false)

        guard case .stale(let items, _) = result else {
            return XCTFail("la seule copie de la mutation se sert périmée, got \(result)")
        }
        XCTAssertEqual(items.map(\.name), ["B"])

        await store.flushDirtyKeys(deadline: nil)
        let recovered = await makeEncryptedStore(maxL1Keys: 20, db: db, encryption: encryption).loadIgnoringExpiry(for: "k")
        XCTAssertEqual(recovered?.items.map(\.name), ["B"])
    }
}
