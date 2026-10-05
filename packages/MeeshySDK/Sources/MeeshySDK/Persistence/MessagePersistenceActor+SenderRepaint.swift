import Foundation
import GRDB

// #9307 — un pair renommé ou repeint (`user:updated`) se voit dans les bulles
// d'un fil OUVERT comme d'un fil EN CACHE : la table `messages` est ce que le
// fil lit, et ce que la réouverture sert sans réseau. Responsabilité tenue
// ici : réécrire l'expéditeur dénormalisé de ses messages, toutes
// conversations confondues, par la loi `UserUpdatedEvent.repainted(_:)`.

extension MessagePersistenceActor {

    /// Repeint l'expéditeur des messages de `event.userId` — et, depuis #9371,
    /// la citation et la référence de transfert qui GRAVENT son id — puis rend
    /// les conversations touchées. Seules les lignes qui CHANGENT sont écrites
    /// et voient leur `changeVersion` monter : le fil ne re-rend que leurs
    /// bulles.
    ///
    /// Les blobs ne sont décodés que pour les lignes qui CONTIENNENT l'id
    /// (`instr`) : un `user:updated` ne relit pas toute la table. Le filtre est
    /// large (l'id peut figurer dans une URL) ; c'est la loi, appliquée au blob
    /// décodé, qui décide.
    @discardableResult
    public func repaintSender(_ event: UserUpdatedEvent) throws -> Set<String> {
        let touched: Set<String> = try dbWriter.write { db in
            let rows = try MessageRecord
                .filter(sql: """
                    senderId = ? OR instr(CAST(replyToJson AS TEXT), ?) > 0
                    OR instr(CAST(forwardedFromJson AS TEXT), ?) > 0
                    """, arguments: [event.userId, event.userId, event.userId])
                .fetchAll(db)
            let decoder = JSONDecoder()
            let encoder = JSONEncoder()
            return try rows.reduce(into: Set<String>()) { conversations, row in
                let sender = event.repainted(row)
                let quotes = Self.repaintedQuotes(of: sender ?? row, by: event, decoder: decoder, encoder: encoder)
                guard var repainted = quotes ?? sender else { return }
                repainted.changeVersion += 1
                try repainted.update(db)
                conversations.insert(row.conversationId)
            }
        }
        if !touched.isEmpty {
            postMessageStoreRefresh(conversationIds: touched)
        }
        return touched
    }

    /// La citation et la référence de transfert de `record`, repeintes par la
    /// loi ; `nil` quand aucune ne désigne le pair.
    nonisolated static func repaintedQuotes(
        of record: MessageRecord, by event: UserUpdatedEvent,
        decoder: JSONDecoder, encoder: JSONEncoder
    ) -> MessageRecord? {
        let quote = record.replyToJson
            .flatMap { decoder.decodeOrLog(ReplyReference.self, from: $0, field: "replyToJson(repaint)", id: record.localId) }
            .flatMap(event.repainted)
        let forward = record.forwardedFromJson
            .flatMap { decoder.decodeOrLog(ForwardReference.self, from: $0, field: "forwardedFromJson(repaint)", id: record.localId) }
            .flatMap(event.repainted)
        guard quote != nil || forward != nil else { return nil }
        var repainted = record
        if let quote { repainted.replyToJson = encoder.encodeOrLog(quote, field: "replyToJson(repaint)", id: record.localId) ?? record.replyToJson }
        if let forward { repainted.forwardedFromJson = encoder.encodeOrLog(forward, field: "forwardedFromJson(repaint)", id: record.localId) ?? record.forwardedFromJson }
        return repainted
    }
}
