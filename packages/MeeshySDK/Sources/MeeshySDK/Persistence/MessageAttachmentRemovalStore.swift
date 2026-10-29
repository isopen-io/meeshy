import Foundation
import GRDB

/// Retire une pièce du message, sur le compte qui l'a reçu (`attachment:deleted`).
///
/// La charge n'est pas crue sur parole : la ligne doit appartenir à `conversationId`, sinon rien n'est touché.
/// Plus ni texte ni pièce, le message devient une pierre tombale (`markDeleted`) ; sinon la ligne garde son texte.
/// Idempotent : une pièce déjà absente rend `.unchanged` sans écrire.
///
/// Un type à part, pas une extension de l'acteur : l'acteur est déjà bien au-delà du budget de cohésion.
public enum MessageAttachmentRemovalStore {

    @discardableResult
    public static func remove(
        attachmentId: String, fromMessage messageId: String, inConversation conversationId: String,
        at date: Date, using persistence: MessagePersistenceActor
    ) async throws -> AttachmentRemovalOutcome {
        let verdict: (localId: String, leavesNothing: Bool)? = try await persistence.dbWriter.write { db in
            guard var record = try MessageRecord
                .filter(Column("localId") == messageId || Column("serverId") == messageId)
                .fetchOne(db),
                record.conversationId == conversationId,
                let data = record.attachmentsJson,
                let pieces = JSONDecoder().decodeOrLog(
                    [MeeshyMessageAttachment].self, from: data, field: "attachmentsJson(removal)", id: messageId),
                pieces.contains(where: { $0.id == attachmentId }),
                let encoded = JSONEncoder().encodeOrLog(
                    pieces.filter { $0.id != attachmentId }, field: "attachmentsJson(removal)", id: messageId)
            else { return nil }
            record.attachmentsJson = encoded
            record.updatedAt = date
            record.changeVersion += 1
            try record.update(db)
            let leavesNothing = record.deletedAt == nil && AttachmentRemoval.leavesNothing(
                text: record.content, isEncrypted: record.isEncrypted, remaining: pieces.count - 1)
            return (record.localId, leavesNothing)
        }
        guard let verdict else { return .unchanged }
        guard verdict.leavesNothing else {
            postMessageStoreRefresh(conversationIds: [conversationId])
            return .removed
        }
        try await persistence.markDeleted(localId: verdict.localId, deletedAt: date)
        return .tombstoned
    }
}
