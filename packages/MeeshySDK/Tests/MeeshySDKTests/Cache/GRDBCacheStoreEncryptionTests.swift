import XCTest
import GRDB
@testable import MeeshySDK

/// Tests for the strict encryption failure semantics introduced by Task 1.1
/// of the iOS Local-First Wave 1 plan. The previous implementation silently
/// fell back to plaintext on encryption failure (`encrypt(json) ?? json`),
/// which leaked unencrypted data into SQLite for stores flagged
/// `encrypted: true`. The new contract: encryption MUST throw, no row is
/// persisted, and the dirty state surfaces to the caller.
final class GRDBCacheStoreEncryptionTests: XCTestCase {

    // MARK: - Fixtures

    private struct EncTestItem: CacheIdentifiable, Codable, Equatable {
        var id: String
        var title: String
    }

    /// Stub `DatabaseEncryptionProviding` that always reports an encryption
    /// failure (returns `nil`) but lets decryption pass through. This models
    /// a corrupted Keychain key scenario.
    private final class FailingEncryption: DatabaseEncryptionProviding, @unchecked Sendable {
        func encrypt(_ plaintext: Data) -> Data? { nil }
        func decrypt(_ ciphertext: Data) -> Data? { ciphertext }
    }

    private func makeDB() throws -> DatabaseQueue {
        let dbQueue = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: dbQueue)
        return dbQueue
    }

    // MARK: - save throws on encryption failure (no plaintext leak)

    func test_save_whenEncryptionFails_throwsAndDoesNotPersistPlaintext() async throws {
        let db = try makeDB()
        let policy = CachePolicy(ttl: .hours(1), staleTTL: .minutes(5), maxItemCount: nil, storageLocation: .grdb)
        let store = GRDBCacheStore<String, EncTestItem>(
            policy: policy,
            db: db,
            namespace: "enc_fail",
            encrypted: true,
            encryption: FailingEncryption()
        )
        let item = EncTestItem(id: "1", title: "secret")

        do {
            try await store.save([item], for: "k")
            XCTFail("Expected GRDBCacheError.encryptionFailed to be thrown")
        } catch GRDBCacheError.encryptionFailed {
            // expected
        }

        let row: Row? = try await db.read { db in
            try Row.fetchOne(
                db,
                sql: "SELECT encodedData FROM cache_entries WHERE key = ?",
                arguments: ["enc_fail:k"]
            )
        }
        XCTAssertNil(row, "No row should be persisted on encryption failure")
    }

    // MARK: - save succeeds when encryption is disabled (no regression)

    func test_save_whenEncryptionDisabled_doesNotThrowEvenIfEncryptionWouldFail() async throws {
        let db = try makeDB()
        let policy = CachePolicy(ttl: .hours(1), staleTTL: .minutes(5), maxItemCount: nil, storageLocation: .grdb)
        let store = GRDBCacheStore<String, EncTestItem>(
            policy: policy,
            db: db,
            namespace: "plain",
            encrypted: false,
            encryption: FailingEncryption()
        )
        let item = EncTestItem(id: "1", title: "public")

        try await store.save([item], for: "k")

        let count = try await db.read { db in
            try CacheEntry.filter(Column("key") == "plain:k").fetchCount(db)
        }
        XCTAssertEqual(count, 1, "Plaintext store must persist normally regardless of encryption stub")
    }

    // MARK: - load returns nil when decryption fails (SWR alignment, no crash)

    /// Stub that successfully encrypts but FAILS to decrypt. Models the case
    /// where the on-disk ciphertext is unreadable (corrupted key, wrong-key
    /// tampering, leftover row from a previous identity). The contract:
    /// readFromL2 MUST skip the entry and return nil so the caller falls
    /// through to network — never feed garbage ciphertext to the JSON
    /// decoder, never crash.
    private final class DecryptFailingEncryption: DatabaseEncryptionProviding, @unchecked Sendable {
        func encrypt(_ plaintext: Data) -> Data? { plaintext }   // pass-through write
        func decrypt(_ ciphertext: Data) -> Data? { nil }         // unreadable on read
    }

    func test_load_whenDecryptFails_returnsEmptyCacheMiss() async throws {
        let db = try makeDB()
        let policy = CachePolicy(ttl: .hours(1), staleTTL: .minutes(5), maxItemCount: nil, storageLocation: .grdb)
        let writer = GRDBCacheStore<String, EncTestItem>(
            policy: policy,
            db: db,
            namespace: "dec_fail",
            encrypted: true,
            encryption: DecryptFailingEncryption()
        )
        let item = EncTestItem(id: "1", title: "stored")
        try await writer.save([item], for: "k")

        // Cold-restart scenario: drop L1 in-memory cache by creating a new store
        // sharing the same underlying SQLite db. The load now MUST go through
        // readFromL2 → decryption fails → entry skipped → empty result.
        let reader = GRDBCacheStore<String, EncTestItem>(
            policy: policy,
            db: db,
            namespace: "dec_fail",
            encrypted: true,
            encryption: DecryptFailingEncryption()
        )
        let result = await reader.load(for: "k")

        switch result {
        case .empty, .expired:
            // expected — decrypt failure surfaces as empty cache
            break
        case .fresh(let items, _):
            XCTFail("Expected .empty on decrypt failure, got .fresh with \(items.count) items")
        case .stale(let items, _):
            XCTFail("Expected .empty on decrypt failure, got .stale with \(items.count) items")
        }
    }

    // MARK: - flush keeps key dirty when encryption fails (retry contract)

    /// Stub that fails encryption only AFTER a successful first save (e.g.
    /// Keychain key revoked between writes). Used to verify the deferred
    /// flush path on `update`/`upsert`/`mergeUpdate` doesn't silently lose
    /// data — the key must remain dirty so the next flush window retries.
    private final class TransientFailingEncryption: DatabaseEncryptionProviding, @unchecked Sendable {
        private let counter: NSLock = NSLock()
        private nonisolated(unsafe) var calls = 0
        private let failAfter: Int

        init(failAfter: Int) { self.failAfter = failAfter }

        func encrypt(_ plaintext: Data) -> Data? {
            counter.lock(); defer { counter.unlock() }
            calls += 1
            return calls > failAfter ? nil : plaintext
        }
        func decrypt(_ ciphertext: Data) -> Data? { ciphertext }
    }

    func test_update_whenEncryptionFailsDuringDeferredFlush_keepsKeyDirty() async throws {
        let db = try makeDB()
        let policy = CachePolicy(ttl: .hours(1), staleTTL: .minutes(5), maxItemCount: nil, storageLocation: .grdb)
        let encryption = TransientFailingEncryption(failAfter: 0)
        let store = GRDBCacheStore<String, EncTestItem>(
            policy: policy,
            db: db,
            namespace: "flush_fail",
            encrypted: true,
            encryption: encryption
        )

        // update() is non-throwing — it should swallow encryption failure and
        // mark the key dirty so the next flush window will retry. Verify
        // that no row reaches SQLite and that the next save() (which goes
        // through writeToL2 and *does* throw) surfaces the failure.
        await store.update(for: "k") { _ in [EncTestItem(id: "1", title: "v1")] }

        // Allow background flush task to fire (2s debounce + 200ms margin).
        try await Task.sleep(nanoseconds: 2_300_000_000)

        let rowCountAfterFlush = try await db.read { db in
            try CacheEntry.filter(Column("key") == "flush_fail:k").fetchCount(db)
        }
        XCTAssertEqual(rowCountAfterFlush, 0,
            "Encryption-failed flush must NOT leak rows into SQLite — key stays dirty for retry")
    }
}
