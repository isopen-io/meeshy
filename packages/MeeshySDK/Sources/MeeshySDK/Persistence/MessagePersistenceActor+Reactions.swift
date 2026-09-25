import Foundation
import GRDB

// Extrait de `MessagePersistenceActor.swift` (hors budget 1000-1200 — un
// fichier hors budget est interdit d'ajout) pour #7927 : la loi des réactions
// reçues vit dans `ReactionLedger`, ces deux mutateurs ne font que la lire et
// l'écrire dans GRDB.

extension MessagePersistenceActor {

    /// Ajoute une réaction à un message persisté. La GRDB change la ligne, et
    /// l'observation du store redessine la bulle.
    ///
    /// - `maxCount` : le `aggregation.count` servi par le serveur, borne
    ///   autoritaire sur le nombre de lignes de `emoji`. `nil` pour les chemins
    ///   optimiste et rollback.
    /// - `ownerUserId` : le `User.id` de l'auteur, porté par l'écho socket.
    ///   Quand c'est l'utilisateur courant, la ligne s'écrit sous
    ///   `currentUserId` — la clé que la pastille teste pour « c'est moi »
    ///   (#7927) —, et l'écho de ma propre réaction optimiste ne double pas.
    public func appendReaction(localId: String, reactionId: String,
                                messageId: String, participantId: String?,
                                emoji: String, maxCount: Int? = nil,
                                ownerUserId: String? = nil) throws {
        let currentUserId = self.currentUserId
        try mutateReactions(localId: localId) { reactions in
            ReactionLedger.appending(
                reactions, reactionId: reactionId, messageId: messageId, emoji: emoji,
                participantId: participantId, ownerUserId: ownerUserId,
                currentUserId: currentUserId, maxCount: maxCount
            )
        }
    }

    /// Retire une réaction d'un message persisté.
    ///
    /// - `ownerUserId` : même identité stable que pour l'ajout.
    /// - `aggregateCount` / `aggregateParticipantIds` : l'agrégat servi APRÈS
    ///   le retrait. Les lignes rechargées depuis REST ou le cache ne portent
    ///   pas d'auteur ; seul l'agrégat sait donc les compter quand un tiers
    ///   retire sa réaction (#7927). Ma ligne n'est jamais touchée par le
    ///   retrait d'un autre.
    public func removeReaction(localId: String, emoji: String, participantId: String?,
                               ownerUserId: String? = nil,
                               aggregateCount: Int? = nil,
                               aggregateParticipantIds: [String]? = nil) throws {
        let currentUserId = self.currentUserId
        let aggregate = aggregateCount.map {
            ReactionLedger.Aggregate(count: $0, participantIds: aggregateParticipantIds)
        }
        try mutateReactions(localId: localId) { reactions in
            ReactionLedger.removing(
                reactions, emoji: emoji, participantId: participantId,
                ownerUserId: ownerUserId, currentUserId: currentUserId, aggregate: aggregate
            )
        }
    }

    /// Lit `reactionsJson`, applique `change` (`nil` ⇒ rien à écrire), réécrit
    /// la ligne et publie le rafraîchissement de SA conversation.
    private func mutateReactions(
        localId: String,
        change: @escaping @Sendable ([MeeshyReaction]) -> [MeeshyReaction]?
    ) throws {
        let affectedConversationId: String? = try dbWriter.write { db -> String? in
            guard var record = try MessageRecord
                .filter(Column("localId") == localId || Column("serverId") == localId)
                .fetchOne(db) else { return nil }
            // `reactionsJson == nil` (aucune réaction) est le cas nominal et ne
            // doit PAS être journalisé : on ne décode que s'il y a des octets.
            let reactions: [MeeshyReaction] = record.reactionsJson.flatMap {
                JSONDecoder().decodeOrLog([MeeshyReaction].self, from: $0,
                                          field: "reactionsJson", id: localId)
            } ?? []
            guard let updated = change(reactions) else { return nil }
            record.reactionsJson = try JSONEncoder().encode(updated)
            record.reactionCount = updated.count
            record.updatedAt = Date()
            record.changeVersion += 1
            try record.update(db)
            return record.conversationId
        }
        if let convId = affectedConversationId {
            postMessageStoreRefresh(conversationIds: [convId])
        }
    }
}
