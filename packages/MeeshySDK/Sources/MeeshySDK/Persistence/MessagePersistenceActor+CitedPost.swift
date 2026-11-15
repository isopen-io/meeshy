import Foundation
import GRDB

// Extrait de `MessagePersistenceActor.swift` (hors budget 1000-1200 — un
// fichier hors budget est interdit d'ajout) pour #7969. Responsabilité tenue
// ici : un post CITÉ par des messages a été retiré, et leurs citations
// gravées dans `replyToJson` doivent le dire.

extension MessagePersistenceActor {

    /// Rend « Story indisponible » chaque citation du post `postId` dans la
    /// conversation `conversationId`, en UNE écriture. Une ligne cite le post
    /// par sa colonne `storyReplyToId` ou, gravée avant que la colonne soit
    /// servie, par une citation de story dont l'identifiant est ce post. Seule
    /// une ligne qui change voit son `changeVersion` monter : la cellule se
    /// redessine, que la conversation soit ouverte (le fil observe GRDB) ou
    /// fermée (la prochaine ouverture lit la ligne).
    public func markCitedPostWithdrawn(postId: String, conversationId: String) throws {
        guard !postId.isEmpty else { return }
        let changed: Bool = try dbWriter.write { db -> Bool in
            let candidates = try MessageRecord
                .filter(Column("conversationId") == conversationId)
                .filter(
                    Column("storyReplyToId") == postId
                        || (Column("replyToId") == nil && Column("replyToJson") != nil)
                )
                .fetchAll(db)
            let unavailable = ReplyReference.unavailableStory(storyId: postId)
            let encoded = try JSONEncoder().encode(unavailable)
            let decoder = JSONDecoder()
            var touched = false
            for var row in candidates {
                let current = row.replyToJson.flatMap {
                    decoder.decodeOrLog(ReplyReference.self, from: $0, field: "replyToJson(withdrawn)", id: row.localId)
                }
                guard Self.citesWithdrawnPost(row: row, quote: current, postId: postId),
                      current != unavailable
                else { continue }
                row.replyToJson = encoded
                row.updatedAt = Date()
                row.changeVersion += 1
                try row.update(db)
                touched = true
            }
            return touched
        }
        if changed {
            postMessageStoreRefresh(conversationIds: [conversationId])
        }
    }

    nonisolated private static func citesWithdrawnPost(
        row: MessageRecord, quote: ReplyReference?, postId: String
    ) -> Bool {
        if row.storyReplyToId == postId { return true }
        guard let quote else { return false }
        return quote.isStoryReply && quote.messageId == postId
    }
}
