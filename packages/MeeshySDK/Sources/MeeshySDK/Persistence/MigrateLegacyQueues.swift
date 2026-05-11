import Foundation
import GRDB

/// One-time migration of legacy JSON-file queues into the unified `outbox` table.
/// Safe to call on every app launch — it's idempotent (skips already-migrated items).
///
/// Wave 1 Task 3.6 — the `MessageRetryQueue` and `ReactionQueue` actors were
/// folded into `OfflineQueue`. Their `migrateToOutbox` helpers no longer exist
/// because both queues now share `OfflineQueue`'s outbox-backed persistence
/// from the first enqueue call, so there is nothing to migrate FROM. The
/// `OfflineQueue.migrateToOutbox` call is kept here for tests that exercise
/// the in-memory mirror → outbox bridge ; the production cold-start path no
/// longer invokes this entry point.
public enum MigrateLegacyQueues {

    /// Migrates the in-memory mirror of `OfflineQueue` into the unified
    /// `outbox` SQLite table. Idempotent (rows already present are skipped).
    public static func migrateOnce(into pool: any DatabaseWriter) async {
        await OfflineQueue.shared.migrateToOutbox(pool: pool)
    }
}
