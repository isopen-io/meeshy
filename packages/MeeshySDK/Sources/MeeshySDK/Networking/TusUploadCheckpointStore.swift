import Foundation
import GRDB
import os

/// Thread-safe persistence layer for `TusUploadCheckpoint`. All writes go
/// through this actor so concurrent TUS PATCH callbacks cannot race on
/// `byteOffset` updates.
///
/// Singleton wraps `AppDatabase.shared.databaseWriter`; tests instantiate
/// their own with an in-memory `DatabaseQueue`.
public actor TusUploadCheckpointStore {
    public static let shared = TusUploadCheckpointStore(pool: AppDatabase.shared.databaseWriter)

    private let pool: any DatabaseWriter
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "tus-checkpoint")

    public init(pool: any DatabaseWriter) {
        self.pool = pool
    }

    // MARK: - Read

    /// Returns the checkpoint for the given key if one exists, else `nil`.
    /// Failures (DB locked, schema mismatch, …) are logged and surface as
    /// `nil` so the caller falls through to the fresh-upload path — no
    /// retry budget is burned on a recoverable persistence error.
    public func find(checkpointKey: String) async -> TusUploadCheckpoint? {
        do {
            return try await pool.read { db in
                try TusUploadCheckpoint.fetchOne(db, key: checkpointKey)
            }
        } catch {
            logger.error("find(\(checkpointKey, privacy: .public)) failed: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    // MARK: - Write

    /// Inserts or replaces (by primary key) the supplied checkpoint.
    public func save(_ checkpoint: TusUploadCheckpoint) async {
        do {
            try await pool.write { db in
                try checkpoint.insert(db, onConflict: .replace)
            }
        } catch {
            logger.error("save(\(checkpoint.checkpointKey, privacy: .public)) failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Updates the `byteOffset` (and `updatedAt`) on the checkpoint matching
    /// `checkpointKey`. No-op if the key is unknown.
    public func updateOffset(checkpointKey: String, offset: Int64) async {
        let now = Date()
        do {
            try await pool.write { db in
                try db.execute(
                    sql: """
                        UPDATE tus_upload_checkpoint
                        SET byteOffset = ?, updatedAt = ?
                        WHERE checkpointKey = ?
                        """,
                    arguments: [offset, now, checkpointKey]
                )
            }
        } catch {
            logger.error("updateOffset(\(checkpointKey, privacy: .public), \(offset, privacy: .public)) failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Removes the checkpoint with the given key. Idempotent.
    public func delete(checkpointKey: String) async {
        do {
            try await pool.write { db in
                try db.execute(
                    sql: "DELETE FROM tus_upload_checkpoint WHERE checkpointKey = ?",
                    arguments: [checkpointKey]
                )
            }
        } catch {
            logger.error("delete(\(checkpointKey, privacy: .public)) failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Sweeps checkpoints whose `updatedAt` is older than `maxAgeDays` ago.
    /// `@tus/server` defaults to GC'ing abandoned upload sessions at 24 h ;
    /// keeping ours at 48 h gives a safety buffer where a still-living
    /// session may continue, while bounding the table at a few rows.
    public func purgeStale(maxAgeDays: Int = 2) async {
        let cutoff = Date().addingTimeInterval(-Double(maxAgeDays * 86400))
        do {
            try await pool.write { db in
                try db.execute(
                    sql: "DELETE FROM tus_upload_checkpoint WHERE updatedAt < ?",
                    arguments: [cutoff]
                )
            }
        } catch {
            logger.error("purgeStale failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - Test surface

    /// Returns the entire table (for tests / debug). Unbounded — do not
    /// call from production paths.
    public func allCheckpoints() async -> [TusUploadCheckpoint] {
        (try? await pool.read { db in
            try TusUploadCheckpoint.fetchAll(db)
        }) ?? []
    }
}
