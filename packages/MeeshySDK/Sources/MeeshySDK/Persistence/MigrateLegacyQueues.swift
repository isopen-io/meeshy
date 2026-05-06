import Foundation
import GRDB

/// One-time migration of legacy JSON-file queues into the unified `outbox` table.
/// Safe to call on every app launch — it's idempotent (skips already-migrated items).
public enum MigrateLegacyQueues {

    /// Migrates all pending items from `OfflineQueue` and `MessageRetryQueue`
    /// into the unified `outbox` SQLite table.
    ///
    /// Items already present in the outbox (matched by prefixed id) are silently
    /// skipped, making this call safe to invoke on every cold start.
    public static func migrateOnce(into pool: any DatabaseWriter) async {
        await OfflineQueue.shared.migrateToOutbox(pool: pool)
        await MessageRetryQueue.shared.migrateToOutbox(pool: pool)
    }
}
