import Foundation
import GRDB

/// Retire une pièce du message, sur le compte qui l'a reçu (`attachment:deleted`).
///
/// La charge n'est pas crue sur parole : la ligne doit appartenir à `conversationId`, sinon rien n'est touché.
/// Plus ni texte ni pièce, le message devient une pierre tombale (`markDeleted`) ; sinon la ligne garde son texte.
/// Idempotent : une pièce déjà absente rend `.unchanged` sans écrire.
///
/// Un `message:new` passe par le flux d'écriture de l'acteur, l'annonce non : arrivée avant la ligne, elle est
/// gardée avec les autres événements en attente et rejouée quand la ligne atterrit, comme une suppression.
///
/// Un type à part, pas une extension de l'acteur : l'acteur est déjà bien au-delà du budget de cohésion.
public enum MessageAttachmentRemovalStore {

    @discardableResult
    public static func remove(
        attachmentId: String, fromMessage messageId: String, inConversation conversationId: String,
        at date: Date, using persistence: MessagePersistenceActor
    ) async throws -> AttachmentRemovalOutcome {
        let removal = PendingAttachmentRemoval(attachmentId: attachmentId, conversationId: conversationId, removedAt: date)
        return try await announce(removal, toMessage: messageId, on: persistence)
    }

    private static func announce(
        _ removal: PendingAttachmentRemoval, toMessage messageId: String, on persistence: isolated MessagePersistenceActor
    ) throws -> AttachmentRemovalOutcome {
        guard try persistence.rowExists(messageId) else {
            persistence.rememberPendingRowEvent(messageId) { $0.attachmentRemovals.append(removal) }
            return .unchanged
        }
        return try apply(removal, toMessage: messageId, on: persistence)
    }

    @discardableResult
    static func apply(
        _ removal: PendingAttachmentRemoval, toMessage messageId: String, on persistence: isolated MessagePersistenceActor
    ) throws -> AttachmentRemovalOutcome {
        let attachmentId = removal.attachmentId
        let verdict: (localId: String, leavesNothing: Bool)? = try persistence.dbWriter.write { db in
            guard var record = try MessageRecord
                .filter(Column("localId") == messageId || Column("serverId") == messageId)
                .fetchOne(db),
                record.conversationId == removal.conversationId,
                let data = record.attachmentsJson,
                let pieces = JSONDecoder().decodeOrLog(
                    [MeeshyMessageAttachment].self, from: data, field: "attachmentsJson(removal)", id: messageId),
                pieces.contains(where: { $0.id == attachmentId }),
                let encoded = JSONEncoder().encodeOrLog(
                    pieces.filter { $0.id != attachmentId }, field: "attachmentsJson(removal)", id: messageId)
            else { return nil }
            record.attachmentsJson = encoded
            record.updatedAt = removal.removedAt
            record.changeVersion += 1
            try record.update(db)
            let leavesNothing = record.deletedAt == nil && AttachmentRemoval.leavesNothing(
                text: record.content, isEncrypted: record.isEncrypted, remaining: pieces.count - 1)
            return (record.localId, leavesNothing)
        }
        guard let verdict else { return .unchanged }
        guard verdict.leavesNothing else {
            postMessageStoreRefresh(conversationIds: [removal.conversationId])
            return .removed
        }
        try persistence.markDeleted(localId: verdict.localId, deletedAt: removal.removedAt)
        return .tombstoned
    }
}
