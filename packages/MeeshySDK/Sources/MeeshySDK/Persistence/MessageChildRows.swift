import Foundation
import GRDB

/// Les tables filles d'un message (traductions, transcriptions, audios
/// traduits, correspondances d'identifiant, tentatives d'envoi), clées sur le
/// `localId` RÉEL de la ligne (grdb-02, grdb-09) : un message retiré n'y laisse
/// aucun orphelin. Un seul site pour les trois retraits qui le recopiaient.
enum MessageChildRows {
    static func delete(ofLocalIds localIds: [String], in db: Database) throws {
        guard !localIds.isEmpty else { return }
        let placeholders = localIds.map { _ in "?" }.joined(separator: ",")
        let arguments = StatementArguments(localIds)
        for table in ["message_translations", "message_transcriptions", "message_audio_translations"] {
            try db.execute(sql: "DELETE FROM \(table) WHERE messageLocalId IN (\(placeholders))", arguments: arguments)
        }
        for table in ["pending_ids", "send_attempts"] {
            try db.execute(sql: "DELETE FROM \(table) WHERE localId IN (\(placeholders))", arguments: arguments)
        }
    }
}
