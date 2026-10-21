import Foundation
import GRDB

extension MessagePersistenceActor {
    // MARK: - Group B Migration APIs (cache/load/refresh paths)

    /// Upsert a batch of API messages into GRDB, preserving any richer local
    /// state (layout cache, optimistic fields) for rows that already exist.
    /// Called from load/refresh paths so the MessageStore observation surfaces
    /// the authoritative server data without a direct `messages = ...` write.
    /// `preferredLanguages` — le prisme ORDONNÉ du lecteur, par lequel la
    /// citation gravée dans `replyToJson` descend le Prisme (même descente que
    /// `APIMessage.toMessage(preferredLanguages:)`). Vide ⇒ l'original.
    ///
    /// Seules les conversations où une ligne a réellement changé sont
    /// rafraîchies : un upsert sans effet n'écrit rien et ne poste rien.
    public func upsertFromAPIMessages(_ apiMessages: [APIMessage], preferredLanguages: [String] = []) async throws {
        guard !apiMessages.isEmpty else { return }
        let context = APIMessageUpsert.Context(
            currentUserId: currentUserId,
            preferredLanguages: preferredLanguages
        )
        let changedConvIds = try await dbWriter.write { db -> Set<String> in
            try APIMessageUpsert.upsertBatch(apiMessages, context: context, in: db)
        }
        if !changedConvIds.isEmpty {
            postMessageStoreRefresh(conversationIds: changedConvIds)
        }
    }
}
