import Foundation
import GRDB

// MARK: - L'échéance SERVIE d'un éphémère, dans la base (#8905)

extension MessagePersistenceActor {

    /// Grave l'échéance que la passerelle SERT à ce lecteur
    /// (`message:countdown-started`, contrat #7451 point 5).
    ///
    /// Elle REMPLACE la colonne, y compris vers plus TARD : pour l'expéditeur,
    /// l'échéance servie est `max D(u)`, qui recule à chaque destinataire qui
    /// reçoit après les autres ; pour un destinataire, elle vaut `D(u)`, et la
    /// projection (`EphemeralDeadline.resolve`) la tient en concurrence avec
    /// sa réception locale — la plus proche gagne. Écrite en mémoire seule,
    /// elle s'effaçait à la première écriture GRDB du fil, et l'expéditeur
    /// retombait « en attente de réception » sur un message qui décomptait.
    ///
    /// - Returns: `true` quand la ligne a changé.
    @discardableResult
    public func applyServedEphemeralDeadline(messageId: String, expiresAt: Date) throws -> Bool {
        var affectedConversationId: String?
        try dbWriter.write { db in
            guard var record = try MessageRecord
                .filter(Column("localId") == messageId || Column("serverId") == messageId)
                .fetchOne(db),
                  record.expiresAt != expiresAt else { return }
            record.expiresAt = expiresAt
            record.updatedAt = Date()
            record.changeVersion += 1
            try record.update(db)
            affectedConversationId = record.conversationId
        }
        guard let affectedConversationId else { return false }
        postMessageStoreRefresh(conversationIds: [affectedConversationId])
        return true
    }
}
