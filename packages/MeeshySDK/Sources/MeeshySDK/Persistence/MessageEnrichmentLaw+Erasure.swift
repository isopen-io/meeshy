import Foundation
import GRDB

/// **La loi APPLIQUÉE à une ligne** (#19437) : ce que `keepsEnrichments` condamne, `enforce` l'efface — et, quand le
/// CONTENU lui-même est parti (vue unique ouverte, message supprimé, éphémère échu), tout ce qui l'accompagnait en
/// clair.
///
/// Les effaceurs historiques (`markDeleted`, `markViewOnceOpened`) agissent au moment où CET appareil apprend la
/// transition par le socket. Une transition apprise par le REST — absence de plus de 48 heures, file hors ligne pleine,
/// événement perdu — passait par l'upsert, qui gravait `deletedAt` ou scellait la ligne sans rien retirer de ce que la
/// ligne gardait. `enforce` ferme ce chemin : l'upsert l'appelle APRÈS avoir écrit la ligne, et la loi juge la ligne
/// telle qu'elle est devenue.
extension MessageEnrichmentLaw {

    /// Efface ce que la loi condamne sur la ligne `messageId` (identifiant local OU serveur).
    /// - Returns: de quoi purger les caches qui doublaient la ligne, ou `nil` quand la base n'a pas changé.
    static func enforce(
        onMessage messageId: String, in db: Database,
        ledger: EphemeralReceiptRecording = EphemeralReceiptLedger.shared, now: Date = Date()
    ) throws -> MessageContentErasure? {
        guard let record = try row(of: messageId, in: db),
              try enforce(on: record, in: db, ledger: ledger, now: now) else { return nil }
        return MessageContentErasure(
            messageId: record.serverId ?? record.localId,
            conversationId: record.conversationId,
            viewOnceOpenedAt: record.viewOnceOpenedAt,
            deletedAt: record.deletedAt ?? (record.viewOnceOpenedAt == nil ? now : nil)
        )
    }

    @discardableResult
    static func enforce(
        on record: MessageRecord, in db: Database,
        ledger: EphemeralReceiptRecording = EphemeralReceiptLedger.shared, now: Date = Date()
    ) throws -> Bool {
        guard contentIsGone(of: record, ledger: ledger, now: now) else { return false }
        let enrichmentsGone = try erase(enrichmentsOf: record, in: db)
        let neighboursGone = try scrubContent(of: record, in: db)
        return enrichmentsGone || neighboursGone
    }

    /// Le texte, les pièces, le lieu, l'autocollant et les liens suivis d'une ligne dont le contenu est parti. Seule
    /// l'enveloppe reste : identifiant, auteur, heure, type, drapeaux. Sans effet (et sans écriture) sur une ligne
    /// déjà vide.
    private static func scrubContent(of record: MessageRecord, in db: Database) throws -> Bool {
        try db.execute(
            sql: """
                UPDATE messages SET content = NULL, attachmentsJson = NULL, stickerJson = NULL, locationJson = NULL,
                trackedLinksJson = NULL, updatedAt = ?, changeVersion = changeVersion + 1
                WHERE localId = ?
                AND (content IS NOT NULL OR attachmentsJson IS NOT NULL OR stickerJson IS NOT NULL
                     OR locationJson IS NOT NULL OR trackedLinksJson IS NOT NULL)
                """,
            arguments: [Date(), record.localId]
        )
        return db.changesCount > 0
    }

    /// **Le balayage unique de l'existant** : les lignes déjà scellées sur les appareils actuels portent encore leurs
    /// traductions et leurs champs voisins. Appelé par `MessagesEnrichmentSweepMigration`, une fois au premier
    /// lancement qui suit la mise à jour.
    /// - Returns: le nombre de lignes qui ont changé.
    @discardableResult
    static func sweep(
        in db: Database, ledger: EphemeralReceiptRecording = EphemeralReceiptLedger.shared, now: Date = Date()
    ) throws -> Int {
        let candidates = try String.fetchAll(
            db,
            sql: """
                SELECT localId FROM messages
                WHERE viewOnceOpenedAt IS NOT NULL OR deletedAt IS NOT NULL OR expiresAt IS NOT NULL
                OR ephemeralDuration IS NOT NULL OR (effectFlags & ?) != 0
                """,
            arguments: [MessageEffectFlags.ephemeral.rawValue]
        )
        var changed = 0
        for localId in candidates {
            guard let record = try MessageRecord.fetchOne(db, key: localId),
                  try enforce(on: record, in: db, ledger: ledger, now: now) else { continue }
            changed += 1
        }
        return changed
    }
}
