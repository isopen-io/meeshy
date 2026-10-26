import Foundation
import GRDB

extension MessagePersistenceActor {
    /// La conversation de la ligne locale de chacun de ces messages, sous
    /// l'identifiant demandé (local ou serveur). Un signal chiffré (#13142) ne
    /// s'applique qu'à un message de SA conversation : c'est la ligne qui le dit
    /// quand le coffre n'en tient pas de clair.
    public func conversationIds(of messageIds: [String]) throws -> [String: String] {
        guard !messageIds.isEmpty else { return [:] }
        return try dbWriter.read { db in
            let rows = try MessageRecord
                .filter(messageIds.contains(Column("localId")) || messageIds.contains(Column("serverId")))
                .fetchAll(db)
            return rows.reduce(into: [String: String]()) { found, row in
                [row.localId, row.serverId].compactMap { $0 }.filter(messageIds.contains).forEach { found[$0] = row.conversationId }
            }
        }
    }
}
