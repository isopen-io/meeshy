import Foundation
import os
import GRDB

/// Lecture de l'outbox : quels messages portent une mutation encore en attente.
enum PendingOutboxLookup {
    /// Message ids carrying a still-pending outbox mutation of `kind`.
    ///
    /// Callers use the result to keep a stale REST snapshot from clobbering an
    /// optimistic local change. Returning `[]` therefore DISABLES that guard —
    /// the edit reverts, the delete un-deletes, the reaction flickers back — so
    /// neither the query nor the payload decode may fail silently here.
    static func messageIds<P: Decodable>(
        _ db: Database,
        kind: OutboxKind,
        payload: P.Type,
        messageId: (P) -> String
    ) -> Set<String> {
        let rows: [OutboxRecord]
        do {
            rows = try OutboxRecord
                .filter(Column("kind") == kind.rawValue)
                .filter(Column("status") == OutboxStatus.pending.rawValue)
                .fetchAll(db)
        } catch {
            Logger.messages.error(
                "Pending \(kind.rawValue, privacy: .public) lookup failed — anti-clobber guard disabled, optimistic changes may revert: \(error.localizedDescription, privacy: .public)"
            )
            return []
        }
        let payloadDecoder = JSONDecoder()
        payloadDecoder.dateDecodingStrategy = .iso8601
        var ids = Set<String>()
        for row in rows {
            guard let decoded = payloadDecoder.decodeOrLog(
                P.self,
                from: row.payload,
                field: "\(kind.rawValue) payload",
                id: row.id
            ) else { continue }
            ids.insert(messageId(decoded))
        }
        return ids
    }
}
