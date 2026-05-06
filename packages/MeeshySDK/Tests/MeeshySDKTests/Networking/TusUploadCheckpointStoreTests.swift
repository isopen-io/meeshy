import XCTest
import GRDB
@testable import MeeshySDK

/// Tests for `TusUploadCheckpointStore` and the underlying GRDB migration.
/// Each test builds an in-memory `DatabaseQueue`, runs the migration that
/// creates `tus_upload_checkpoint`, and exercises the actor's API on a
/// fresh table — no global singleton state leaks across tests.
final class TusUploadCheckpointStoreTests: XCTestCase {

    // MARK: - Migration

    func test_migration_createsCheckpointTable() throws {
        let pool = try makePool()
        let exists = try pool.read { db in
            try Bool.fetchOne(db, sql: """
                SELECT EXISTS(SELECT 1 FROM sqlite_master
                              WHERE type='table' AND name='tus_upload_checkpoint')
                """) ?? false
        }
        XCTAssertTrue(exists,
            "v6 migration must create the tus_upload_checkpoint table")
    }

    // MARK: - Save / Find

    func test_save_thenFind_returnsCheckpoint() async throws {
        let pool = try makePool()
        let store = TusUploadCheckpointStore(pool: pool)
        let cp = makeCheckpoint(key: "abc123", offset: 0)

        await store.save(cp)
        let found = await store.find(checkpointKey: "abc123")

        XCTAssertNotNil(found)
        XCTAssertEqual(found?.checkpointKey, "abc123")
        XCTAssertEqual(found?.uploadURL, "/api/v1/uploads/abc")
        XCTAssertEqual(found?.byteOffset, 0)
        XCTAssertEqual(found?.fileSize, 100_000)
    }

    func test_find_unknownKey_returnsNil() async throws {
        let pool = try makePool()
        let store = TusUploadCheckpointStore(pool: pool)

        let found = await store.find(checkpointKey: "no-such-key")

        XCTAssertNil(found)
    }

    func test_save_replaceOnConflict_keepsLatest() async throws {
        let pool = try makePool()
        let store = TusUploadCheckpointStore(pool: pool)
        let key = "k1"
        await store.save(makeCheckpoint(key: key, offset: 1_000))
        await store.save(makeCheckpoint(key: key, offset: 5_000))

        let all = await store.allCheckpoints()
        XCTAssertEqual(all.count, 1, "PRIMARY KEY conflict should replace not duplicate")
        XCTAssertEqual(all.first?.byteOffset, 5_000)
    }

    // MARK: - Update

    func test_updateOffset_persistsNewOffset() async throws {
        let pool = try makePool()
        let store = TusUploadCheckpointStore(pool: pool)
        let key = "k-update"
        await store.save(makeCheckpoint(key: key, offset: 0))

        await store.updateOffset(checkpointKey: key, offset: 42_000)

        let found = await store.find(checkpointKey: key)
        XCTAssertEqual(found?.byteOffset, 42_000)
    }

    func test_updateOffset_unknownKey_isNoOp() async throws {
        let pool = try makePool()
        let store = TusUploadCheckpointStore(pool: pool)

        await store.updateOffset(checkpointKey: "ghost", offset: 999)

        let all = await store.allCheckpoints()
        XCTAssertTrue(all.isEmpty, "Updating an unknown key must not insert a row")
    }

    // MARK: - Delete

    func test_delete_removesCheckpoint() async throws {
        let pool = try makePool()
        let store = TusUploadCheckpointStore(pool: pool)
        let key = "k-delete"
        await store.save(makeCheckpoint(key: key, offset: 0))

        await store.delete(checkpointKey: key)

        let found = await store.find(checkpointKey: key)
        XCTAssertNil(found)
    }

    // MARK: - PurgeStale

    func test_purgeStale_removesCheckpointsOlderThanCutoff() async throws {
        let pool = try makePool()
        let store = TusUploadCheckpointStore(pool: pool)
        // Insert a checkpoint whose `updatedAt` is 5 days in the past via a
        // direct SQL UPDATE — actor methods always stamp `Date()`.
        let key = "old-key"
        await store.save(makeCheckpoint(key: key, offset: 0))
        let staleDate = Date().addingTimeInterval(-5 * 86400)
        try await pool.write { db in
            try db.execute(
                sql: "UPDATE tus_upload_checkpoint SET updatedAt = ? WHERE checkpointKey = ?",
                arguments: [staleDate, key]
            )
        }

        // And a fresh one to verify the cutoff respects the boundary.
        await store.save(makeCheckpoint(key: "fresh-key", offset: 0))

        await store.purgeStale(maxAgeDays: 2)

        let stale = await store.find(checkpointKey: key)
        let fresh = await store.find(checkpointKey: "fresh-key")
        XCTAssertNil(stale, "5-day-old checkpoint must be purged when cutoff = 2 days")
        XCTAssertNotNil(fresh, "Fresh checkpoint must survive")
    }

    // MARK: - Helpers

    private func makePool() throws -> DatabaseQueue {
        let queue = try DatabaseQueue()
        var migrator = DatabaseMigrator()
        migrator.registerMigration("v6_tus_upload_checkpoint") { db in
            try db.create(table: "tus_upload_checkpoint") { t in
                t.column("checkpointKey", .text).primaryKey()
                t.column("uploadURL", .text).notNull()
                t.column("byteOffset", .integer).notNull()
                t.column("fileSize", .integer).notNull()
                t.column("fileName", .text).notNull()
                t.column("mimeType", .text).notNull()
                t.column("uploadContext", .text)
                t.column("thumbHash", .text)
                t.column("createdAt", .datetime).notNull()
                t.column("updatedAt", .datetime).notNull()
            }
            try db.create(
                index: "idx_tus_upload_checkpoint_updatedAt",
                on: "tus_upload_checkpoint",
                columns: ["updatedAt"]
            )
        }
        try migrator.migrate(queue)
        return queue
    }

    private func makeCheckpoint(
        key: String,
        offset: Int64,
        fileSize: Int64 = 100_000,
        uploadURL: String = "/api/v1/uploads/abc"
    ) -> TusUploadCheckpoint {
        TusUploadCheckpoint(
            checkpointKey: key,
            uploadURL: uploadURL,
            byteOffset: offset,
            fileSize: fileSize,
            fileName: "test.jpg",
            mimeType: "image/jpeg",
            uploadContext: "story",
            thumbHash: nil
        )
    }
}
