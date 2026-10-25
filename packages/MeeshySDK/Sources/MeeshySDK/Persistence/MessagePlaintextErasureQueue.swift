import Foundation
import GRDB

/// La file des messages effacés sur cet appareil dont le coffre E2EE doit
/// retirer le clair (#13001), dans la base de `account`. Identifiants seuls.
public struct MessagePlaintextErasureQueue: Sendable {
    let dbWriter: any DatabaseWriter
    /// Le compte à qui cette base appartient : le coffre ne se vide que pour lui.
    public let account: String?

    /// Les identifiants (local et serveur) des messages dont l'effacement est
    /// CONFIRMÉ et dont le coffre n'a pas encore retiré le clair. Un
    /// identifiant inscrit pour plusieurs causes ne sort qu'une fois.
    public func pending(limit: Int = 500) async throws -> [String] {
        try await dbWriter.read { db in
            try String.fetchAll(
                db,
                sql: """
                    SELECT messageKey FROM \(MessagePlaintextErasures.table) WHERE confirmed = 1 AND acknowledgedAt IS NULL
                    GROUP BY messageKey ORDER BY MIN(rowid) LIMIT ?
                    """,
                arguments: [limit]
            )
        }
    }

    /// Combien de temps une inscription retirée du coffre reste connue : une
    /// enveloppe du même message encore en file sur la passerelle peut s'ouvrir
    /// APRÈS l'effacement (appareil hors ligne), et son clair doit repartir.
    public static let retention: TimeInterval = 30 * 86_400

    /// Le coffre a retiré ces clairs : leurs identifiants sortent de la file,
    /// mais restent connus pendant `retention` (`isErased`).
    public func acknowledge(_ keys: [String], now: Date = Date()) async throws {
        guard !keys.isEmpty else { return }
        try await dbWriter.write { db in
            for start in stride(from: 0, to: keys.count, by: 500) {
                let chunk = Array(keys[start..<min(start + 500, keys.count)])
                let placeholders = chunk.map { _ in "?" }.joined(separator: ",")
                try db.execute(
                    sql: "UPDATE \(MessagePlaintextErasures.table) SET acknowledgedAt = ? WHERE messageKey IN (\(placeholders))",
                    arguments: [now] + StatementArguments(chunk)
                )
            }
            try db.execute(
                sql: "DELETE FROM \(MessagePlaintextErasures.table) WHERE acknowledgedAt IS NOT NULL AND acknowledgedAt < ?",
                arguments: [now.addingTimeInterval(-Self.retention)]
            )
        }
    }

    /// Ce message a-t-il été effacé (effacement confirmé) sur cet appareil ?
    public func isErased(_ messageKey: String) async throws -> Bool {
        try await dbWriter.read { db in
            try Bool.fetchOne(db, sql: """
                SELECT EXISTS (SELECT 1 FROM \(MessagePlaintextErasures.table) WHERE messageKey = ? AND confirmed = 1)
                """, arguments: [messageKey]) ?? false
        }
    }

    /// Le serveur a accepté la suppression : le clair peut quitter le coffre.
    public func confirmDeletion(localId: String) async throws {
        let conversationId = try await dbWriter.write { db -> String? in
            try MessagePlaintextErasures.confirmDeletion(of: localId, in: db)
            return try String.fetchOne(
                db, sql: "SELECT conversationId FROM messages WHERE localId = ? OR serverId = ?", arguments: [localId, localId]
            )
        }
        if let conversationId { postMessageStoreRefresh(conversationIds: [conversationId]) }
    }
}

extension MessagePersistenceActor {
    public var plaintextErasures: MessagePlaintextErasureQueue {
        MessagePlaintextErasureQueue(dbWriter: dbWriter, account: currentUserId)
    }

    /// La suppression que cet appareil a lancée, avant la réponse du serveur :
    /// le message quitte le fil, son clair reste au coffre (#13001).
    public func markDeletedAwaitingConfirmation(localId: String, deletedAt: Date) async throws {
        try markDeleted(localId: localId, deletedAt: deletedAt, sparingOpenedViewOnce: false, expired: false, awaitingConfirmation: true)
    }

    public func confirmDeletion(localId: String) async throws {
        try await plaintextErasures.confirmDeletion(localId: localId)
    }
}
