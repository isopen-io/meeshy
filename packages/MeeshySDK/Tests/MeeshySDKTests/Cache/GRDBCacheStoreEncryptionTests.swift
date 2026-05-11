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
}
