import Foundation
import GRDB

/// Migrations dedicated to the local FTS5 search index used by
/// `SearchIndex`. The index lives in two standalone (contentless) FTS5
/// virtual tables so it does not depend on a relational mirror of the
/// `MeeshyConversation` / `MeeshyUser` cache (which is JSON-encoded inside
/// `cache_entries`). The cache stays the source of truth; this index is a
/// pure search-side projection that the writer maintains explicitly via
/// DELETE-then-INSERT.
///
/// Tokenizer matches the `messages_fts` table (`unicode61 remove_diacritics 2`)
/// so French-accented queries fold consistently across all three scopes
/// (messages, conversations, users).
public enum SearchIndexMigrations {

    /// Run all search-index migrations on the given database. Used by
    /// production callers (DependencyContainer / NotificationService) and
    /// tests that build a fresh DatabaseQueue.
    public static func runAll(on db: any DatabaseWriter) throws {
        var migrator = DatabaseMigrator()
        registerAll(in: &migrator)
        try migrator.migrate(db)
    }

    /// Register migrations without running — for use with a shared migrator.
    public static func registerAll(in migrator: inout DatabaseMigrator) {
        migrator.registerMigration("search_idx_v1_conversations_users_fts5") { db in
            // Standalone FTS5 (no `content=…`): the FTS table itself stores
            // the searchable columns. UPSERT semantics are emulated in Swift
            // via DELETE-then-INSERT keyed on `id` (UNINDEXED).
            try db.execute(sql: """
                CREATE VIRTUAL TABLE IF NOT EXISTS conversations_fts USING fts5(
                    id UNINDEXED,
                    title,
                    description,
                    identifier,
                    lastMessagePreview,
                    participantUsername,
                    tokenize='unicode61 remove_diacritics 2'
                )
                """)

            try db.execute(sql: """
                CREATE VIRTUAL TABLE IF NOT EXISTS users_fts USING fts5(
                    id UNINDEXED,
                    username,
                    displayName,
                    firstName,
                    lastName,
                    bio,
                    tokenize='unicode61 remove_diacritics 2'
                )
                """)
        }
    }
}
