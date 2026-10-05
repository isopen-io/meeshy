import Foundation
import GRDB

// #9307 — un pair renommé ou repeint (`user:updated`) se voit dans les bulles
// d'un fil OUVERT comme d'un fil EN CACHE : la table `messages` est ce que le
// fil lit, et ce que la réouverture sert sans réseau. Responsabilité tenue
// ici : réécrire l'expéditeur dénormalisé de ses messages, toutes
// conversations confondues, par la loi `UserUpdatedEvent.repainted(_:)`.

extension MessagePersistenceActor {

    /// Repeint l'expéditeur des messages de `event.userId` et rend les
    /// conversations touchées. Seules les lignes qui CHANGENT sont écrites et
    /// voient leur `changeVersion` monter : le fil ne re-rend que leurs bulles.
    @discardableResult
    public func repaintSender(_ event: UserUpdatedEvent) throws -> Set<String> {
        let touched: Set<String> = try dbWriter.write { db in
            let rows = try MessageRecord.filter(Column("senderId") == event.userId).fetchAll(db)
            return try rows.reduce(into: Set<String>()) { conversations, row in
                guard var repainted = event.repainted(row) else { return }
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
}
