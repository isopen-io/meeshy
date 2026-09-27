import Foundation
import GRDB

// MARK: - L'enregistrement d'un appel rejoint sa bulle (#8064)
//
// La passerelle rediffuse la bulle de l'appel (`message:edited`) quand
// l'enregistreur y rattache son fichier. `applyCallNoticeUpdate` ne réécrit
// que le texte et la métadonnée : sans ce complément, la pièce jointe
// n'apparaîtrait qu'au prochain rechargement REST du fil.

extension MessagePersistenceActor {

    /// Remplace les pièces de la bulle d'appel par celles qu'elle porte
    /// désormais. Une rediffusion SANS pièce ne retire rien : seule la
    /// transition live → terminal l'envoie ainsi, et elle ne dit rien des
    /// pièces déjà liées.
    public func applyCallNoticeAttachments(from message: APIMessage) throws {
        let attachments = message.toMessage(currentUserId: "").attachments
        guard !attachments.isEmpty,
              let json = JSONEncoder().encodeOrLog(attachments, field: "attachmentsJson", id: message.id)
        else { return }
        let messageId = message.id
        var affectedConversationId: String?
        try dbWriter.write { db in
            guard let existing = try MessageRecord
                .filter(Column("localId") == messageId || Column("serverId") == messageId)
                .fetchOne(db)
            else { return }
            affectedConversationId = existing.conversationId
            try db.execute(
                sql: """
                    UPDATE messages SET attachmentsJson = ?,
                    changeVersion = changeVersion + 1
                    WHERE localId = ? OR serverId = ?
                    """,
                arguments: [json, messageId, messageId]
            )
        }
        if let conversationId = affectedConversationId {
            postMessageStoreRefresh(conversationIds: [conversationId])
        }
    }
}
