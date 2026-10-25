import Foundation
import GRDB

extension MessagePersistenceActor {
    /// Les identifiants (local et serveur) des messages effacés sur cet
    /// appareil dont le coffre E2EE n'a pas encore retiré le clair (#13001),
    /// inscrits avant `recordedBefore` : une suppression qui échoue sur le
    /// réseau se rétablit (`markUndeleted`) dans ce délai, et son clair avec.
    public func pendingPlaintextErasures(recordedBefore: Date, limit: Int = 500) async throws -> [String] {
        try await dbWriter.read { db in
            try String.fetchAll(
                db,
                sql: "SELECT messageKey FROM \(MessagePlaintextErasures.table) WHERE recordedAt <= ? ORDER BY rowid LIMIT ?",
                arguments: [recordedBefore, limit]
            )
        }
    }

    /// Le moment de la plus ancienne inscription, `nil` si la file est vide.
    public func oldestPendingPlaintextErasure() async throws -> Date? {
        try await dbWriter.read { db in
            try Date.fetchOne(db, sql: "SELECT MIN(recordedAt) FROM \(MessagePlaintextErasures.table)")
        }
    }

    /// Le coffre a retiré ces clairs : leurs identifiants quittent la file.
    public func acknowledgePlaintextErasures(_ keys: [String]) async throws {
        guard !keys.isEmpty else { return }
        try await dbWriter.write { db in
            try keys.chunked(into: 500).forEach { chunk in
                let placeholders = chunk.map { _ in "?" }.joined(separator: ",")
                try db.execute(
                    sql: "DELETE FROM \(MessagePlaintextErasures.table) WHERE messageKey IN (\(placeholders))",
                    arguments: StatementArguments(chunk)
                )
            }
        }
    }
}

private extension Array {
    func chunked(into size: Int) -> [[Element]] {
        stride(from: 0, to: count, by: size).map { Array(self[$0..<Swift.min($0 + size, count)]) }
    }
}
