import Foundation
import GRDB

/// Full-text search over locally cached messages, backed by FTS5.
/// Results are ordered by BM25 rank.
public struct MessageSearchService: Sendable {

    private let reader: any DatabaseReader

    public init(reader: any DatabaseReader) {
        self.reader = reader
    }

    /// Searches `messages` via the `messages_fts` external-content FTS5 table.
    ///
    /// - Parameters:
    ///   - query: free-text query. Whitespace/double-quote sanitized for FTS5 syntax.
    ///   - limit: max rows to return.
    ///   - conversationId: optional scope. When `nil`, searches across all conversations.
    /// - Returns: `[MessageRecord]` ordered by relevance (best match first). Soft-deleted rows are excluded.
    public func search(
        query: String,
        limit: Int = 50,
        conversationId: String? = nil
    ) async throws -> [MessageRecord] {
        let cleaned = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return [] }

        // Sanitize FTS5 query: escape double quotes, wrap, and append `*` for prefix match
        let escaped = cleaned.replacingOccurrences(of: "\"", with: "\"\"")
        let ftsQuery = "\"\(escaped)\"*"

        return try await reader.read { db in
            var sql = """
                SELECT m.*
                FROM messages m
                INNER JOIN messages_fts fts ON fts.rowid = m.rowid
                WHERE messages_fts MATCH ?
                  AND m.deletedAt IS NULL
                """
            var arguments: [DatabaseValueConvertible] = [ftsQuery]
            if let conversationId {
                sql += " AND m.conversationId = ?"
                arguments.append(conversationId)
            }
            sql += " ORDER BY bm25(messages_fts) LIMIT ?"
            arguments.append(limit)

            return try MessageRecord.fetchAll(db, sql: sql, arguments: StatementArguments(arguments))
        }
    }
}
