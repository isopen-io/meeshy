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
        let erased = try eraseGoneContent(localId: record.localId, serverId: record.serverId, in: db)
        if erased, let death = quoteDeath(of: record, now: now) {
            try MessagePersistenceActor.followQuotes(of: record, in: db) { quote in
                quote.isQuotedMessageDeleted || quote.isStoryReply ? nil : quote.tombstoned(at: death.at, expired: death.expired)
            }
        }
        return erased
    }

    /// Quand la mort d'un message se lit dans les réponses qui le citent : une suppression ou une échéance. Une vue
    /// unique ouverte n'en est pas une — sa citation est déjà masquée (`APIMessageReplyTo.isProtected`).
    private static func quoteDeath(of record: MessageRecord, now: Date) -> (at: Date, expired: Bool)? {
        guard record.viewOnceOpenedAt == nil || record.deletedAt != nil else { return nil }
        return (record.deletedAt ?? now, record.deletedAt == nil)
    }

    private static func eraseGoneContent(localId: String, serverId: String?, in db: Database) throws -> Bool {
        let enrichmentsGone = try erase(enrichmentsOfLocalId: localId, serverId: serverId, in: db)
        let neighboursGone = try scrubContent(whereClause: "localId = ?", arguments: [localId], in: db)
        return enrichmentsGone || neighboursGone
    }

    /// Les voisins d'un contenu parti : pièces, lieu, autocollant, liens suivis, ET le transfert — son aperçu redit le
    /// texte et la vignette du message d'origine (la pierre tombale de la passerelle le retire aussi, ATTAQUE A2).
    /// Appelé par la confirmation d'une suppression que le serveur vient d'accepter (`confirmDeletion`).
    @discardableResult
    static func scrubNeighbours(ofMessage messageId: String, in db: Database) throws -> Bool {
        try scrubContent(whereClause: "(localId = ? OR serverId = ?) AND deletedAt IS NOT NULL", arguments: [messageId, messageId], in: db)
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

    /// Le texte, les pièces, le lieu, l'autocollant, les liens suivis et le transfert d'une ligne dont le contenu est
    /// parti. Seule l'enveloppe reste : identifiant, auteur, heure, type, drapeaux. Sans effet (et sans écriture) sur
    /// une ligne déjà vide. `updatedAt` garde l'horloge du serveur : daté de l'horloge locale, le vidage faisait
    /// réécrire la ligne par chaque page qui la ressert.
    private static func scrubContent(whereClause: String, arguments: StatementArguments, in db: Database) throws -> Bool {
        try db.execute(
            sql: """
                UPDATE messages SET content = NULL\(neighbourErasureAssignments), changeVersion = changeVersion + 1
                WHERE (\(whereClause)) AND \(readableContentPredicate)
                """,
            arguments: arguments
        )
        return db.changesCount > 0
    }

    /// Les affectations des voisins du texte, à la suite de `content = NULL`. Une suppression que le serveur n'a pas
    /// encore acceptée ne les applique PAS : un refus, une erreur réseau ou une file épuisée rend le message
    /// (`markUndeleted`), et ils ne se relisent pas du serveur. Ils partent à `confirmDeletion` (`scrubNeighbours`).
    static let neighbourErasureAssignments = ", attachmentsJson = NULL, stickerJson = NULL, locationJson = NULL, trackedLinksJson = NULL, forwardedFromJson = NULL"

    static let readableContentPredicate = """
        (content IS NOT NULL OR attachmentsJson IS NOT NULL OR stickerJson IS NOT NULL OR locationJson IS NOT NULL \
        OR trackedLinksJson IS NOT NULL OR forwardedFromJson IS NOT NULL)
        """

    /// **Le balayage unique de l'existant** : les lignes déjà scellées sur les appareils actuels portent encore leurs
    /// traductions et leurs champs voisins. Appelé par `MessagesEnrichmentSweepMigration`, une fois au premier
    /// lancement qui suit la mise à jour.
    /// - Returns: le nombre de lignes scellées qui ont changé.
    ///
    /// Une migration ne décode jamais `MessageRecord` : elle tourne avant celles qui ajouteront ses colonnes
    /// futures. Les lignes se lisent par colonnes nommées, et se jugent par la même loi (`EphemeralExpiry`).
    ///
    /// **Ensembliste, jamais ligne à ligne** : la migration tourne sur le fil principal au lancement. Les lignes
    /// scellées se jugent en Swift, puis s'effacent PAR LOTS (`UPDATE … IN`, `DELETE … IN`, index posés par
    /// `MessagesErasureIndexesMigration`). Les octets libérés sont mis à zéro (`secure_delete`) et l'index plein texte
    /// est compacté ; le journal se tronque au lancement suivant, hors transaction.
    @discardableResult
    static func sweep(
        in db: Database, ledger: EphemeralReceiptRecording = EphemeralReceiptLedger.shared, now: Date = Date()
    ) throws -> Int {
        let sealed = try sealedRows(in: db, ledger: ledger, now: now)
        guard !sealed.isEmpty else { return 0 }
        return try db.withSecureDelete {
            var changed = 0
            for chunk in sealed.chunked(by: sweepBatchSize) {
                changed += try erase(batch: chunk, in: db)
            }
            try followQuotes(ofSealed: sealed, now: now, in: db)
            if changed > 0 { try db.execute(sql: "INSERT INTO messages_fts(messages_fts) VALUES('optimize')") }
            return changed
        }
    }

    struct SealedRow {
        let localId: String
        let serverId: String?
        let deletedAt: Date?
        let viewOnceOpenedAt: Date?
        var keys: [String] { [localId, serverId].compactMap { $0 } }
    }

    private static let sweepBatchSize = 300

    private static func sealedRows(in db: Database, ledger: EphemeralReceiptRecording, now: Date) throws -> [SealedRow] {
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
        return candidates.compactMap { row in
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
            return sealed ? SealedRow(localId: localId, serverId: serverId, deletedAt: deletedAt, viewOnceOpenedAt: openedAt) : nil
        }
    }

    /// Les trois tables d'enrichissements d'un message, y compris les héritées (`message_transcriptions.text`,
    /// `message_audio_translations`) qu'une base ancienne peut porter encore.
    private static let enrichmentTables = ["message_translations", "message_transcriptions", "message_audio_translations"]

    private static func erase(batch: [SealedRow], in db: Database) throws -> Int {
        let localIds = batch.map(\.localId)
        let keys = batch.flatMap(\.keys)
        let localMarks = localIds.map { _ in "?" }.joined(separator: ",")
        let keyMarks = keys.map { _ in "?" }.joined(separator: ",")
        var touched = Set(try String.fetchAll(
            db,
            sql: "SELECT localId FROM messages WHERE localId IN (\(localMarks)) AND \(readableContentPredicate)",
            arguments: StatementArguments(localIds)
        ))
        for table in enrichmentTables {
            touched.formUnion(try String.fetchAll(
                db, sql: "SELECT messageLocalId FROM \(table) WHERE messageLocalId IN (\(localMarks))",
                arguments: StatementArguments(localIds)
            ))
        }
        let byServerId = try String.fetchAll(
            db, sql: "SELECT messageLocalId FROM message_translations WHERE messageServerId IN (\(keyMarks))",
            arguments: StatementArguments(keys)
        )
        touched.formUnion(byServerId)
        try db.execute(
            sql: """
                UPDATE messages SET content = NULL\(neighbourErasureAssignments), changeVersion = changeVersion + 1
                WHERE localId IN (\(localMarks)) AND \(readableContentPredicate)
                """,
            arguments: StatementArguments(localIds)
        )
        try db.execute(
            sql: "DELETE FROM message_translations WHERE messageLocalId IN (\(localMarks)) OR messageServerId IN (\(keyMarks))",
            arguments: StatementArguments(localIds) + StatementArguments(keys)
        )
        for table in enrichmentTables.dropFirst() {
            try db.execute(
                sql: "DELETE FROM \(table) WHERE messageLocalId IN (\(localMarks))", arguments: StatementArguments(localIds)
            )
        }
        return touched.count
    }

    /// Les réponses qui citaient un message supprimé ou échu perdent son texte et ses URL, d'UNE lecture de la table :
    /// les citations se rangent par identifiant du message cité, puis se réécrivent seulement quand elles changent.
    private static func followQuotes(ofSealed sealed: [SealedRow], now: Date, in db: Database) throws {
        var deaths: [String: (at: Date, expired: Bool)] = [:]
        for row in sealed where row.viewOnceOpenedAt == nil || row.deletedAt != nil {
            let death = (at: row.deletedAt ?? now, expired: row.deletedAt == nil)
            for key in row.keys { deaths[key] = death }
        }
        guard !deaths.isEmpty else { return }
        let citing = try Row.fetchAll(
            db, sql: "SELECT localId, replyToId, replyToJson FROM messages WHERE replyToId IS NOT NULL AND replyToJson IS NOT NULL"
        )
        let decoder = JSONDecoder()
        let encoder = JSONEncoder()
        for row in citing {
            let parentId: String = row["replyToId"]
            let blob: Data = row["replyToJson"]
            guard let death = deaths[parentId],
                  let quote = try? decoder.decode(ReplyReference.self, from: blob),
                  !quote.isQuotedMessageDeleted, !quote.isStoryReply else { continue }
            let followed = quote.tombstoned(at: death.at, expired: death.expired)
            guard followed != quote else { continue }
            try db.execute(
                sql: "UPDATE messages SET replyToJson = ?, changeVersion = changeVersion + 1 WHERE localId = ?",
                arguments: [try encoder.encode(followed), row["localId"] as String]
            )
        }
    }
}

private extension Array {
    func chunked(by size: Int) -> [[Element]] {
        stride(from: 0, to: count, by: size).map { Array(self[$0..<Swift.min($0 + size, count)]) }
    }
}

extension MessageEnrichmentLaw {

    /// **La mort locale d'un éphémère s'écrit dans la base** (#19437). L'écran retire la ligne dès que
    /// `EphemeralExpiry` la juge morte (échéance atteinte, combustion), mais ne touchait pas à la base : hors ligne,
    /// ou absent plus longtemps que l'heure de grâce de la passerelle, la ligne gardait son texte, ses pièces et ses
    /// traductions tant que le registre de réception s'en souvenait — puis, le registre purgé, revenait lisible.
    /// Chaque identifiant est jugé par la loi (`enforce`) : un message encore vivant ne perd rien.
    /// - Returns: les effacements annoncés aux caches (cache de fil, traductions).
    @discardableResult
    public static func enforceLocalDeath(
        ofMessages ids: [String], on persistence: MessagePersistenceActor,
        ledger: EphemeralReceiptRecording = EphemeralReceiptLedger.shared, now: Date = Date()
    ) async throws -> [MessageContentErasure] {
        guard !ids.isEmpty else { return [] }
        let erasures: [MessageContentErasure] = try await persistence.dbWriter.write { db in
            try ids.compactMap { try enforce(onMessage: $0, in: db, ledger: ledger, now: now) }
        }
        guard !erasures.isEmpty else { return [] }
        MessageContentErasure.announce(erasures)
        postMessageStoreRefresh(conversationIds: Set(erasures.map(\.conversationId)))
        return erasures
    }
}

extension MessageRecord {

    /// La ligne garde-t-elle encore quelque chose de lisible : texte, pièces, lieu, autocollant, liens suivis, transfert ?
    var holdsReadableContent: Bool {
        content != nil || attachmentsJson != nil || stickerJson != nil || locationJson != nil || trackedLinksJson != nil
            || forwardedFromJson != nil
    }

    /// Vide ce que le message contenait en clair. L'enveloppe — identifiant, auteur, heure, type, drapeaux — reste.
    mutating func eraseReadableContent() {
        content = nil
        attachmentsJson = nil
        stickerJson = nil
        locationJson = nil
        trackedLinksJson = nil
        forwardedFromJson = nil
    }
}
