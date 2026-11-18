import Foundation
import GRDB

/// **La loi APPLIQUÉE à une ligne** (#19437) : ce que `keepsEnrichments` condamne, `enforce` l'efface — et, quand le
/// CONTENU lui-même est parti (vue unique ouverte, message supprimé, éphémère échu), tout ce qui l'accompagnait en
/// clair.
///
/// Les effaceurs historiques (`markDeleted`, `markViewOnceOpened`) agissent au moment où CET appareil apprend la
/// transition par le socket. Une transition apprise par le REST — absence de plus de 48 heures, file hors ligne pleine,
/// événement perdu — passait par l'upsert, qui gravait `deletedAt` ou scellait la ligne sans rien retirer de ce que la
/// ligne gardait. L'upsert ferme ce chemin en deux temps : il écrit la ligne déjà vide (`withoutGoneContent`), puis
/// `enforce` juge la ligne telle qu'elle est devenue et retire ce qui doublait son contenu.
extension MessageEnrichmentLaw {

    /// Efface ce que la loi condamne sur la ligne `messageId` (identifiant local OU serveur).
    /// - Parameter contentAlreadyLeft: l'appelant vient lui-même de retirer le contenu de la ligne
    ///   (`withoutGoneContent`) : les caches qui le doublaient sont à purger même si la base n'a plus rien à effacer.
    /// - Returns: de quoi purger les caches qui doublaient la ligne, ou `nil` quand rien n'est parti.
    static func enforce(
        onMessage messageId: String, in db: Database,
        ledger: EphemeralReceiptRecording = EphemeralReceiptLedger.shared, now: Date = Date(),
        contentAlreadyLeft: Bool = false
    ) throws -> MessageContentErasure? {
        guard let record = try row(of: messageId, in: db) else { return nil }
        let erased = try enforce(on: record, in: db, ledger: ledger, now: now)
        guard erased || contentAlreadyLeft else { return nil }
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
        return try eraseGoneContent(localId: record.localId, serverId: record.serverId, in: db)
    }

    private static func eraseGoneContent(localId: String, serverId: String?, in db: Database) throws -> Bool {
        let enrichmentsGone = try erase(enrichmentsOfLocalId: localId, serverId: serverId, in: db)
        let neighboursGone = try scrubContent(ofLocalId: localId, in: db)
        return enrichmentsGone || neighboursGone
    }

    /// La ligne telle qu'elle doit s'écrire : sans contenu quand la loi le dit parti, inchangée sinon.
    static func withoutGoneContent(
        _ record: MessageRecord, ledger: EphemeralReceiptRecording = EphemeralReceiptLedger.shared, now: Date = Date()
    ) -> MessageRecord {
        guard contentIsGone(of: record, ledger: ledger, now: now) else { return record }
        var bare = record
        bare.eraseReadableContent()
        return bare
    }

    /// Le texte, les pièces, le lieu, l'autocollant et les liens suivis d'une ligne dont le contenu est parti. Seule
    /// l'enveloppe reste : identifiant, auteur, heure, type, drapeaux. Sans effet (et sans écriture) sur une ligne
    /// déjà vide. `updatedAt` garde l'horloge du serveur : daté de l'horloge locale, le vidage faisait réécrire la
    /// ligne par chaque page qui la ressert.
    private static func scrubContent(ofLocalId localId: String, in db: Database) throws -> Bool {
        try db.execute(
            sql: """
                UPDATE messages SET content = NULL, attachmentsJson = NULL, stickerJson = NULL, locationJson = NULL,
                trackedLinksJson = NULL, changeVersion = changeVersion + 1
                WHERE localId = ?
                AND (content IS NOT NULL OR attachmentsJson IS NOT NULL OR stickerJson IS NOT NULL
                     OR locationJson IS NOT NULL OR trackedLinksJson IS NOT NULL)
                """,
            arguments: [localId]
        )
        return db.changesCount > 0
    }

    /// **Le balayage unique de l'existant** : les lignes déjà scellées sur les appareils actuels portent encore leurs
    /// traductions et leurs champs voisins. Appelé par `MessagesEnrichmentSweepMigration`, une fois au premier
    /// lancement qui suit la mise à jour.
    /// - Returns: le nombre de lignes qui ont changé.
    ///
    /// Une migration ne décode jamais `MessageRecord` : elle tourne avant celles qui ajouteront ses colonnes
    /// futures. Les lignes se lisent par colonnes nommées, et se jugent par la même loi (`EphemeralExpiry`).
    @discardableResult
    static func sweep(
        in db: Database, ledger: EphemeralReceiptRecording = EphemeralReceiptLedger.shared, now: Date = Date()
    ) throws -> Int {
        let candidates = try Row.fetchAll(
            db,
            sql: """
                SELECT localId, serverId, viewOnceOpenedAt, deletedAt, expiresAt, ephemeralDuration, effectFlags
                FROM messages
                WHERE viewOnceOpenedAt IS NOT NULL OR deletedAt IS NOT NULL OR expiresAt IS NOT NULL
                OR ephemeralDuration IS NOT NULL OR (effectFlags & ?) != 0
                """,
            arguments: [MessageEffectFlags.ephemeral.rawValue]
        )
        return try candidates.reduce(into: 0) { changed, row in
            let localId: String = row["localId"]
            let serverId: String? = row["serverId"]
            let openedAt: Date? = row["viewOnceOpenedAt"]
            let deletedAt: Date? = row["deletedAt"]
            let expiresAt: Date? = row["expiresAt"]
            let duration: Int? = row["ephemeralDuration"]
            let flags: UInt32 = row["effectFlags"] ?? 0
            let sealed = openedAt != nil || deletedAt != nil || EphemeralExpiry.isGone(
                id: serverId ?? localId, flags: MessageEffectFlags(rawValue: flags),
                expiresAt: expiresAt, ephemeralDuration: duration, ledger: ledger, now: now
            )
            guard sealed, try eraseGoneContent(localId: localId, serverId: serverId, in: db) else { return }
            changed += 1
        }
    }
}

extension MessageRecord {

    /// La ligne garde-t-elle encore quelque chose de lisible : texte, pièces, lieu, autocollant, liens suivis ?
    var holdsReadableContent: Bool {
        content != nil || attachmentsJson != nil || stickerJson != nil || locationJson != nil || trackedLinksJson != nil
    }

    /// Vide ce que le message contenait en clair. L'enveloppe — identifiant, auteur, heure, type, drapeaux — reste.
    mutating func eraseReadableContent() {
        content = nil
        attachmentsJson = nil
        stickerJson = nil
        locationJson = nil
        trackedLinksJson = nil
    }
}
