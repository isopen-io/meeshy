import Foundation
import GRDB

// MARK: - read-status:updated → les compteurs d'UN message (#7433)
//
// Remplace `batchDeliverySync`, qui avançait la machine d'état de TOUTES les
// lignes de la conversation créées avant l'instant d'émission de l'événement
// et y gravait `.read` + `readByAllAt` — un état terminal que le REST ne
// pouvait plus défaire. La règle vit dans `ReadStatusReceipt` ; ce fichier ne
// fait que la poser sur la ligne décrite.

extension MessagePersistenceActor {

    /// Pose un résumé d'accusé sur la ligne qu'il décrit, si elle est à
    /// `currentUserId`. Rend `true` quand la ligne a réellement changé, pour que
    /// le worker ne publie un rafraîchissement que sur un vrai changement.
    func applyReadStatusSummarySync(
        conversationId: String,
        summary: ReadStatusSummary,
        currentUserId: String
    ) throws -> Bool {
        guard summary.totalMembers > 0 else { return false }
        return try dbWriter.write { db -> Bool in
            guard var record = try Self.recordDescribed(by: summary, in: conversationId, db: db),
                  record.senderId == currentUserId
            else { return false }
            let current = ReadStatusReceipt.Counters(
                deliveredCount: record.deliveredCount,
                readCount: record.readCount,
                recipientCount: record.recipientCount,
                readByAllAt: record.readByAllAt
            )
            let next = ReadStatusReceipt.merged(current, with: summary)
            guard next != current else { return false }
            record.deliveredCount = next.deliveredCount
            record.readCount = next.readCount
            record.recipientCount = next.recipientCount
            record.readByAllAt = next.readByAllAt
            record.updatedAt = Date()
            record.changeVersion += 1
            try record.update(db)
            return true
        }
    }

    /// La ligne que le résumé décrit. Nommée : par son id serveur (ou local,
    /// pour une ligne déjà réconciliée sous cet id). Non nommée — passerelle
    /// d'avant #7433 — : le dernier message ACQUITTÉ du fil, qui est celui que
    /// la passerelle a résumé ; un envoi encore en vol n'a pas d'id serveur et
    /// ne peut pas être ce message-là.
    nonisolated static func recordDescribed(
        by summary: ReadStatusSummary,
        in conversationId: String,
        db: Database
    ) throws -> MessageRecord? {
        let inConversation = MessageRecord.filter(Column("conversationId") == conversationId)
        guard let messageId = summary.messageId else {
            return try inConversation
                .filter(Column("serverId") != nil)
                .filter(Column("deletedAt") == nil)
                .order(Column("createdAt").desc)
                .fetchOne(db)
        }
        return try inConversation
            .filter(Column("serverId") == messageId || Column("localId") == messageId)
            .fetchOne(db)
    }
}

extension MessageRecord {

    /// Pose les accusés que le REST sert pour CE message. Un dénominateur servi
    /// (`recipientCount > 0`) dit que le serveur a calculé les compteurs de la
    /// ligne : ils font alors autorité à la baisse comme à la hausse, marqueurs
    /// « tous » compris. C'est ce qui défait un faux « Lu » gravé par l'ancien
    /// chemin temps réel (`state = .read`, terminal, et `readByAllAt` qu'une
    /// fusion `api ?? existant` n'effaçait jamais) — la bulle retombe sur ce que
    /// la fiche « Vu par » affiche (#7433).
    ///
    /// Sans dénominateur (passerelle ancienne, ligne servie sans compteurs), la
    /// fusion d'avant tient : rien de déjà confirmé n'est effacé.
    mutating func adoptServedReceipts(
        deliveredCount: Int,
        readCount: Int,
        recipientCount: Int?,
        deliveredToAllAt: Date?,
        readByAllAt: Date?,
        computedState: MessageState
    ) {
        self.deliveredCount = deliveredCount
        self.readCount = readCount
        guard let recipientCount, recipientCount > 0 else {
            self.deliveredToAllAt = deliveredToAllAt ?? self.deliveredToAllAt
            self.readByAllAt = readByAllAt ?? self.readByAllAt
            state = max(state, computedState)
            return
        }
        self.recipientCount = recipientCount
        self.deliveredToAllAt = deliveredToAllAt
        self.readByAllAt = readByAllAt
        let pastSending = state == .delivered || state == .read
        state = pastSending ? computedState : max(state, computedState)
    }
}
