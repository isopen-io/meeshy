import Foundation
import GRDB

/// Tunes SQLite for the Meeshy access pattern (read-heavy with bursty writes
/// from socket events) and exposes maintenance hooks for periodic compaction.
public enum DatabaseMaintenance {

    /// Applies one-time SQLite tuning. Safe to call multiple times — each PRAGMA
    /// is idempotent. `auto_vacuum = INCREMENTAL` only takes effect on an empty
    /// database; for a database with existing data, callers should run a one-shot
    /// `VACUUM` before this on first migration to enable it (handled separately
    /// during database setup if needed).
    public static func applyTuning(on pool: any DatabaseWriter) {
        try? pool.write { db in
            try db.execute(sql: "PRAGMA cache_size = 8000")             // ~32 MB
            try db.execute(sql: "PRAGMA mmap_size = 67108864")           // 64 MB
            try db.execute(sql: "PRAGMA temp_store = MEMORY")
            try db.execute(sql: "PRAGMA auto_vacuum = INCREMENTAL")
        }
    }

    /// One-shot migration that enables `auto_vacuum = INCREMENTAL` on a database
    /// that may have been created before INCREMENTAL was the default.
    ///
    /// SQLite silently ignores `PRAGMA auto_vacuum = INCREMENTAL` on a non-empty
    /// database unless followed by a full VACUUM that rewrites the file. This
    /// method sets the PRAGMA and then performs the VACUUM so the mode persists
    /// across subsequent opens.
    ///
    /// Gate this call via `UserDefaults` so it runs exactly once per install:
    /// ```swift
    /// let key = "meeshy.db.autoVacuumOneShotDone"
    /// if !UserDefaults.standard.bool(forKey: key) {
    ///     Task.detached(priority: .background) {
    ///         try? DatabaseMaintenance.enableIncrementalAutoVacuumOneShot(on: pool)
    ///         await MainActor.run { UserDefaults.standard.set(true, forKey: key) }
    ///     }
    /// }
    /// ```
    public static func enableIncrementalAutoVacuumOneShot(on pool: any DatabaseWriter) throws {
        try pool.write { db in
            try db.execute(sql: "PRAGMA auto_vacuum = INCREMENTAL")
        }
        // VACUUM must run outside of any transaction — GRDB's `vacuum()` method
        // uses `writeWithoutTransaction` internally, satisfying this requirement.
        try pool.vacuum()
    }

    /// Reclaims free pages incrementally. Designed to run during app
    /// background transitions — yields to the system after each page batch.
    public static func runIncrementalVacuum(on pool: any DatabaseWriter, pages: Int = 1000) throws {
        try pool.write { db in
            try db.execute(sql: "PRAGMA incremental_vacuum(\(pages))")
        }
    }

    /// Updates SQLite's query planner statistics. Cheap; run periodically.
    public static func runOptimize(on pool: any DatabaseWriter) throws {
        try pool.write { db in
            try db.execute(sql: "PRAGMA optimize")
        }
    }
}
