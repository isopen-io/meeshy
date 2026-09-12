import Foundation
import GRDB
import os

private let dbMaintenanceLog = Logger(subsystem: "com.meeshy.sdk", category: "db-maintenance")

/// Tunes SQLite for the Meeshy access pattern (read-heavy with bursty writes
/// from socket events) and exposes maintenance hooks for periodic compaction.
public enum DatabaseMaintenance {

    /// Applies one-time SQLite tuning. Safe to call multiple times — each PRAGMA
    /// is idempotent. `auto_vacuum = INCREMENTAL` only takes effect on an empty
    /// database; for a database with existing data, callers should run a one-shot
    /// `VACUUM` before this on first migration to enable it (handled separately
    /// during database setup if needed).
    /// **Les réglages qui vivent sur la CONNEXION, à poser sur chacune** (#6221).
    ///
    /// `cache_size`, `mmap_size` et `temp_store` ne sont pas écrits dans le
    /// fichier : SQLite les applique à la connexion qui les exécute. Posés par
    /// `applyTuning(on:)`, qui prend le rédacteur via `pool.write`, ils
    /// n'atteignaient **aucune des seize connexions de LECTURE** du pool — dans
    /// une application que le commentaire de ce fichier décrit lui-même comme
    /// « read-heavy ». Tout le chemin de lecture travaillait sans les 64 Mo de
    /// `mmap` ni les ~32 Mo de cache de pages.
    ///
    /// À poser dans `Configuration.prepareDatabase`, qui court sur CHAQUE
    /// connexion ouverte par le pool — le geste que `DependencyContainer.dbConfig()`
    /// faisait déjà pour trois AUTRES pragmas, et où ces trois-ci n'avaient
    /// simplement pas été portés.
    ///
    /// Bénéfice second, et c'est celui qui se voyait au démarrage : plus aucune
    /// transaction d'ÉCRITURE n'est nécessaire pour régler la base. L'ancienne
    /// courait sur le thread principal, au boot, sur un fichier de groupe d'app
    /// que la NSE écrit aussi — avec `busyMode = .timeout(5)`, ouvrir l'app
    /// depuis une notification pendant que la NSE écrivait pouvait bloquer cinq
    /// secondes.
    public static func prepareTuning(_ db: Database) throws {
        try db.execute(sql: "PRAGMA cache_size = 8000")       // ~32 MB
        try db.execute(sql: "PRAGMA mmap_size = 67108864")     // 64 MB
        try db.execute(sql: "PRAGMA temp_store = MEMORY")
    }

    /// Variante HÉRITÉE, conservée pour les appelants qui n'ont qu'un pool déjà
    /// ouvert (les bancs de performance). Préférer `prepareTuning(_:)` dans la
    /// `Configuration` : elle atteint les lecteurs, et sans écriture.
    public static func applyTuning(on pool: any DatabaseWriter) {
        do {
            try pool.write { db in
                try db.execute(sql: "PRAGMA cache_size = 8000")             // ~32 MB
                try db.execute(sql: "PRAGMA mmap_size = 67108864")           // 64 MB
                try db.execute(sql: "PRAGMA temp_store = MEMORY")
                try db.execute(sql: "PRAGMA auto_vacuum = INCREMENTAL")
            }
        } catch {
            // La base reste fonctionnelle mais NON tunée : lectures plus
            // lentes et fichier qui ne se compacte jamais.
            dbMaintenanceLog.error("SQLite tuning PRAGMAs not applied, database runs untuned: \(error.localizedDescription, privacy: .public)")
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
