import Foundation
import GRDB

// Extrait de `MessagePersistenceActor.swift`, déjà hors budget (plafond 1200
// lignes) : on n'y ajoute plus, on pose l'écriture à côté (#7360).
extension MessagePersistenceActor {

    /// I4 (#7360) — marks an attachment's PRIMARY consumption action (per
    /// `AttachmentConsumptionResolver.primaryAction(forMimeType:)`) as
    /// confirmed by every recipient, from a live `attachment-status:updated`
    /// reported by the sole OTHER participant of a 1:1 conversation.
    ///
    /// The CALLER (`ConversationSocketHandler`) is the judge — it already ran
    /// the event through `AttachmentConsumptionResolver.resolve(...)` and
    /// only reaches here once `.isCompleteByAll` held; this method is the
    /// WRITE side, mirroring `applyAttachmentEnrichment`'s read-modify-write
    /// on the same `attachmentsJson` blob. A group conversation cannot say
    /// WHICH member reported from a single wire event — G-6 (#7359) will add
    /// the aggregate counts that make a group-safe write possible — so
    /// callers only reach here for a 1:1.
    ///
    /// A future full resync from the server (`upsertFromAPIMessages`) will
    /// overwrite this local write with the server's own computed truth, the
    /// same bridging relationship `bufferBatchDelivery` already has with
    /// delivery status: this is a live bridge, not a competing source.
    public func markAttachmentConsumedByAll(
        messageId: String,
        attachmentId: String,
        action: AttachmentConsumptionResolver.Action,
        at date: Date
    ) throws {
        var affectedConversationId: String?
        var didMutate = false
        try dbWriter.write { db in
            guard var record = try MessageRecord
                .filter(Column("localId") == messageId || Column("serverId") == messageId)
                .fetchOne(db) else { return }
            affectedConversationId = record.conversationId

            guard let data = record.attachmentsJson else { return }
            let decoder = JSONDecoder()
            let encoder = JSONEncoder()
            guard var attachments = decoder.decodeOrLog(
                    [MeeshyMessageAttachment].self,
                    from: data,
                    field: "attachmentsJson(consumedByAll)",
                    id: messageId
                  ),
                  let idx = attachments.firstIndex(where: { $0.id == attachmentId })
            else { return }

            var updated = attachments[idx]
            switch action {
            case .viewed:
                updated.viewedByAllAt = date
                updated.viewedCount = max(updated.viewedCount ?? 0, 1)
            case .downloaded:
                updated.downloadedByAllAt = date
                updated.downloadedCount = max(updated.downloadedCount ?? 0, 1)
            case .listened:
                updated.listenedByAllAt = date
                updated.consumedCount = max(updated.consumedCount ?? 0, 1)
            case .watched:
                updated.watchedByAllAt = date
                updated.consumedCount = max(updated.consumedCount ?? 0, 1)
            }
            attachments[idx] = updated

            // Un encodage raté écrivait `nil` ici, ce qui EFFAÇAIT tous les
            // attachments du message (leçon reprise d'`applyAttachmentEnrichment`
            // ci-dessus) — on préfère abandonner l'écriture.
            guard let encoded = encoder.encodeOrLog(
                attachments,
                field: "attachmentsJson(consumedByAll)",
                id: messageId
            ) else { return }
            record.attachmentsJson = encoded
            record.updatedAt = date
            record.changeVersion += 1
            try record.update(db)
            didMutate = true
        }
        if didMutate, let convId = affectedConversationId {
            postMessageStoreRefresh(conversationIds: [convId])
        }
    }
}
