import Foundation
import GRDB
import os

/// Local FTS5 search index for conversations and users.
///
/// Backed by two standalone (contentless) FTS5 virtual tables created by
/// `SearchIndexMigrations`. The cache (`CacheCoordinator.shared.conversations`
/// / `.profiles`) remains the source of truth; this actor maintains a
/// projection-only index keyed on `id` so the UI can answer offline search
/// queries with BM25-ranked hits.
///
/// Pairs with `GlobalSearchViewModel` which calls `searchConversations`/
/// `searchUsers` to seed local results before the REST round-trip lands.
public actor SearchIndex {
    public static let shared = SearchIndex(pool: AppDatabase.shared.databaseWriter)

    private let pool: any DatabaseWriter
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "searchindex")

    public init(pool: any DatabaseWriter) {
        self.pool = pool
    }

    // MARK: - Indexing

    /// Upserts the supplied conversations into `conversations_fts`. Each
    /// conversation is indexed by `id`; subsequent calls overwrite the
    /// previous projection (DELETE-then-INSERT) so the index stays in sync
    /// with the cache.
    public func indexConversations(_ conversations: [MeeshyConversation]) async {
        guard !conversations.isEmpty else { return }
        do {
            try await pool.write { db in
                for conv in conversations {
                    try db.execute(
                        sql: "DELETE FROM conversations_fts WHERE id = ?",
                        arguments: [conv.id]
                    )
                    try db.execute(
                        sql: """
                            INSERT INTO conversations_fts(
                                id, title, description, identifier,
                                lastMessagePreview, participantUsername
                            ) VALUES (?, ?, ?, ?, ?, ?)
                            """,
                        arguments: [
                            conv.id,
                            conv.title ?? "",
                            conv.description ?? "",
                            conv.identifier,
                            conv.lastMessagePreview ?? "",
                            conv.participantUsername ?? ""
                        ]
                    )
                }
            }
        } catch {
            logger.error("indexConversations failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Upserts the supplied users into `users_fts`.
    public func indexUsers(_ users: [MeeshyUser]) async {
        guard !users.isEmpty else { return }
        do {
            try await pool.write { db in
                for user in users {
                    try db.execute(
                        sql: "DELETE FROM users_fts WHERE id = ?",
                        arguments: [user.id]
                    )
                    try db.execute(
                        sql: """
                            INSERT INTO users_fts(
                                id, username, displayName, firstName, lastName, bio
                            ) VALUES (?, ?, ?, ?, ?, ?)
                            """,
                        arguments: [
                            user.id,
                            user.username,
                            user.displayName ?? "",
                            user.firstName ?? "",
                            user.lastName ?? "",
                            user.bio ?? ""
                        ]
                    )
                }
            }
        } catch {
            logger.error("indexUsers failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    public func removeConversation(id: String) async {
        do {
            try await pool.write { db in
                try db.execute(sql: "DELETE FROM conversations_fts WHERE id = ?", arguments: [id])
            }
        } catch {
            logger.error("removeConversation failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    public func removeUser(id: String) async {
        do {
            try await pool.write { db in
                try db.execute(sql: "DELETE FROM users_fts WHERE id = ?", arguments: [id])
            }
        } catch {
            logger.error("removeUser failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// Wipes both indexes — useful for tests and for a forced rebuild after
    /// the tokenizer or schema changes.
    public func clearAll() async {
        do {
            try await pool.write { db in
                try db.execute(sql: "DELETE FROM conversations_fts")
                try db.execute(sql: "DELETE FROM users_fts")
            }
        } catch {
            logger.error("clearAll failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    // MARK: - Search

    /// Runs a BM25-ranked search against `conversations_fts`. Returns the
    /// matching conversation `id`s ordered best-first. The caller resolves
    /// the IDs to `MeeshyConversation` values via the cache (already loaded
    /// in memory at search time).
    public func searchConversations(query: String, limit: Int = 50) async throws -> [String] {
        try await runSearch(table: "conversations_fts", query: query, limit: limit)
    }

    /// Runs a BM25-ranked search against `users_fts`. Returns matching
    /// user `id`s.
    public func searchUsers(query: String, limit: Int = 50) async throws -> [String] {
        try await runSearch(table: "users_fts", query: query, limit: limit)
    }

    // MARK: - Private

    private func runSearch(table: String, query: String, limit: Int) async throws -> [String] {
        let cleaned = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return [] }

        // Same FTS5 sanitization as MessageSearchService: escape double
        // quotes, wrap, and append `*` for prefix match. Ensures the user's
        // query never injects raw FTS5 operators.
        let escaped = cleaned.replacingOccurrences(of: "\"", with: "\"\"")
        let ftsQuery = "\"\(escaped)\"*"

        return try await pool.read { db in
            let sql = """
                SELECT id FROM \(table)
                WHERE \(table) MATCH ?
                ORDER BY bm25(\(table))
                LIMIT ?
                """
            return try String.fetchAll(db, sql: sql, arguments: [ftsQuery, limit])
        }
    }
}
