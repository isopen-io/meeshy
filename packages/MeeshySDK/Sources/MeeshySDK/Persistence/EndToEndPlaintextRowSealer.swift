import Foundation
import GRDB

/// Le rescellement, dans la base des messages, des lignes de messages chiffrés
/// de bout en bout qu'une version antérieure a écrites avec leur clair.
public struct EndToEndPlaintextRowSealer: Sendable {
    let dbWriter: any DatabaseWriter

    /// Ce que le rescellement a touché : les lignes, et leurs conversations,
    /// dont les caches gardent peut-être le clair.
    public struct Outcome: Equatable, Sendable {
        public let rows: Int
        public let conversationIds: Set<String>
    }

    /// Rescelle les lignes de messages chiffrés de bout en bout qu'une version
    /// antérieure a écrites avec leur clair (#12999) : `messageKeys` sont les
    /// identifiants (local ou serveur) dont le coffre E2EE tient le clair ;
    /// s'y ajoute toute ligne déclarée chiffrée de bout en bout. Le
    /// texte devient le littéral servi, la ligne se déclare chiffrée, et la
    /// citation qu'une réponse optimiste en gardait perd son aperçu. Les octets
    /// libérés sont mis à zéro (`secure_delete`), l'index plein texte compacté
    /// et le journal tronqué (au mieux : un lecteur actif le retarde).
    @discardableResult
    public func seal(messageKeys: [String]) async throws -> Outcome {
        try await dbWriter.writeWithoutTransaction { db -> Outcome in
            try db.execute(sql: "PRAGMA secure_delete = ON")
            var rows = 0
            var conversations: Set<String> = []
            try db.inTransaction {
                for chunk in messageKeys.chunkedForSQL() + [[]] {
                    conversations.formUnion(try Self.conversations(sealing: chunk, in: db))
                    try Self.sealRows(chunk, in: db)
                    rows += db.changesCount
                    try Self.sealQuotes(of: chunk, in: db)
                }
                return .commit
            }
            try db.execute(sql: "INSERT INTO messages_fts(messages_fts) VALUES('optimize')")
            if try String.fetchOne(db, sql: "PRAGMA journal_mode") == "wal" {
                _ = try? db.checkpoint(.truncate)
            }
            try db.execute(sql: "PRAGMA secure_delete = OFF")
            return Outcome(rows: rows, conversationIds: conversations)
        }
    }

    private static func target(_ keys: [String]) -> (filter: String, arguments: StatementArguments) {
        let flagged = "(isEncrypted = 1 AND encryptionMode = '\(E2EEWire.mode)')"
        guard !keys.isEmpty else { return (flagged, []) }
        let placeholders = keys.map { _ in "?" }.joined(separator: ",")
        return ("(((localId IN (\(placeholders)) OR serverId IN (\(placeholders))) AND messageSource = 'user') OR \(flagged))",
                StatementArguments(keys) + StatementArguments(keys))
    }

    private static func conversations(sealing keys: [String], in db: Database) throws -> Set<String> {
        let (filter, arguments) = target(keys)
        return try String.fetchSet(db, sql: """
            SELECT DISTINCT conversationId FROM messages
            WHERE \(filter) AND content IS NOT NULL AND content != ?
            """, arguments: arguments + [E2EEWire.contentPlaceholder])
    }

    private static func sealRows(_ keys: [String], in db: Database) throws {
        let (filter, arguments) = target(keys)
        try db.execute(
            sql: """
                UPDATE messages SET content = ?, isEncrypted = 1, encryptionMode = ?
                WHERE \(filter) AND content IS NOT NULL AND content != ?
                """,
            arguments: StatementArguments([E2EEWire.contentPlaceholder, E2EEWire.mode]) + arguments
                + StatementArguments([E2EEWire.contentPlaceholder])
        )
    }
}

extension EndToEndPlaintextRowSealer {
    /// L'aperçu de citation du littéral « verrou » que `QuotedReferenceFactory`
    /// pose pour un message chiffré : une réponse ne garde pas le texte cité.
    static let sealedQuotePreview = "🔒 💬"

    private static func sealQuotes(of keys: [String], in db: Database) throws {
        guard !keys.isEmpty else { return }
        let placeholders = keys.map { _ in "?" }.joined(separator: ",")
        let quoting = try Row.fetchAll(
            db,
            sql: "SELECT localId, replyToJson FROM messages WHERE replyToJson IS NOT NULL AND replyToId IN (\(placeholders))",
            arguments: StatementArguments(keys)
        )
        for row in quoting {
            let localId: String = row["localId"]
            guard let json: Data = row["replyToJson"],
                  var quote = try JSONSerialization.jsonObject(with: json) as? [String: Any],
                  quote["previewText"] as? String != sealedQuotePreview else { continue }
            quote["previewText"] = sealedQuotePreview
            try db.execute(
                sql: "UPDATE messages SET replyToJson = ? WHERE localId = ?",
                arguments: [try JSONSerialization.data(withJSONObject: quote), localId]
            )
        }
    }
}

extension MessagePersistenceActor {
    public nonisolated var endToEndRowSealer: EndToEndPlaintextRowSealer { EndToEndPlaintextRowSealer(dbWriter: dbWriter) }
}

private extension Array where Element == String {
    func chunkedForSQL() -> [[String]] {
        stride(from: 0, to: count, by: 400).map { Array(self[$0..<Swift.min($0 + 400, count)]) }
    }
}
