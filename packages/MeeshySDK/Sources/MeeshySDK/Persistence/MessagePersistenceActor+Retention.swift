import Foundation
import GRDB

// La politique de rétention du cache local de messages, sortie de
// `MessagePersistenceActor.swift` (relocalisation pure, #10713) : le fichier
// hôte était hors budget, et le contour de l'auteur devait y entrer.
extension MessagePersistenceActor {

    // MARK: - Retention Policy

    /// Default retention period for locally cached messages.
    /// Messages older than this are purged on app launch to keep the database
    /// lean. The server remains the authoritative source — purged messages
    /// can be re-fetched on demand via pagination.
    public static let defaultRetentionMonths: Int = 6

    /// Deletes all message records whose `createdAt` is older than
    /// `retentionMonths` months from now. Also cascades to the child rows
    /// keyed on those messages — `message_translations`,
    /// `message_transcriptions`, `message_audio_translations`, `pending_ids`,
    /// `send_attempts` (grdb-02/grdb-09). `translation_cache` lives in the
    /// OTHER SQLite file (AppDatabase/meeshy.sqlite, GC au boot par
    /// `loadTranslationCaches`) and is out of scope here.
    ///
    /// Returns the number of message rows deleted so callers can log it.
    ///
    /// - Parameter retentionMonths: How many months of history to keep.
    ///   Defaults to ``defaultRetentionMonths`` (6).
    @discardableResult
    public func purgeOldMessages(retentionMonths: Int = defaultRetentionMonths) async throws -> Int {
        let calendar = Calendar.current
        guard let cutoff = calendar.date(byAdding: .month, value: -retentionMonths, to: Date()) else {
            return 0
        }

        let (deletedCount, affectedConvIds): (Int, Set<String>) = try await dbWriter.write { db in
            // Collect affected conversation IDs before deleting so we can post
            // targeted refresh notifications.
            let affected = try String.fetchSet(db, sql: """
                SELECT DISTINCT conversationId FROM messages
                WHERE createdAt < ?
            """, arguments: [cutoff])

            // Collect message IDs for cascade cleanup of translation tables
            let expiredIds = try String.fetchAll(db, sql: """
                SELECT localId FROM messages WHERE createdAt < ?
            """, arguments: [cutoff])

            if !expiredIds.isEmpty {
                // grdb-02 — cascade sur la clé RÉELLE (messageLocalId, pas
                // messageId) et uniquement sur les tables de CETTE base.
                try MessageChildRows.delete(ofLocalIds: expiredIds, in: db)
            }

            // Delete the messages themselves
            let count = try MessageRecord
                .filter(Column("createdAt") < cutoff)
                .deleteAll(db)

            return (count, affected)
        }

        if !affectedConvIds.isEmpty {
            postMessageStoreRefresh(conversationIds: affectedConvIds)
        }

        return deletedCount
    }
}
