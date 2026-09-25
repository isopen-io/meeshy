import Foundation
import GRDB

// Extrait de `MessagePersistenceActor.swift` (hors budget 1000-1200 — un
// fichier hors budget est interdit d'ajout) pour #7927 : une modification et
// une suppression doivent désormais atteindre aussi les CITATIONS du message,
// gravées dans le `replyToJson` des réponses. Responsabilité tenue ici :
// modifier / supprimer un message, et faire suivre ses citations.

extension MessagePersistenceActor {

    /// Slack for the `markEdited` ordering guard — see its comment for why a
    /// strict `<` is unsafe across a GRDB `Date` round-trip.
    private static let editOrderingTolerance: TimeInterval = 0.05

    /// Applique une modification. Les citations du message suivent : leur
    /// texte devient le nouveau texte, sauf citation protégée (placeholder)
    /// ou déjà scellée. Ce texte est l'ORIGINAL ; la descente du Prisme de la
    /// citation se refait au prochain passage REST, qui la recompose.
    public func markEdited(localId: String, newContent: String, editedAt: Date) throws {
        let affectedConversationId: String? = try dbWriter.write { db -> String? in
            guard let existing = try MessageRecord
                .filter(Column("localId") == localId || Column("serverId") == localId)
                .fetchOne(db)
            else { return nil }
            // Ordering guard: `message:edited` carries no monotonic sequence, so a
            // delayed/duplicate socket delivery can arrive after a newer edit was
            // already applied. Comparing against the stored `editedAt` stops a
            // stale edit from permanently clobbering the current content.
            //
            // A tolerance (rather than a strict `<`) is required: GRDB round-trips
            // `Date` through a millisecond-precision text column, so re-applying
            // the exact same in-memory `Date` twice (e.g. an optimistic edit
            // followed by its own failure rollback, which reuses the same
            // `editedAt`) can read back a value a fraction of a millisecond off
            // from what was passed in — enough to misfire a strict comparison.
            // Genuine out-of-order deliveries differ by network-delay magnitudes
            // (well beyond this), so the tolerance doesn't weaken the guard.
            if let currentEditedAt = existing.editedAt,
               editedAt.timeIntervalSince(currentEditedAt) < -Self.editOrderingTolerance {
                return nil
            }
            try db.execute(
                sql: """
                    UPDATE messages SET content = ?, isEdited = 1, editedAt = ?,
                    updatedAt = ?, changeVersion = changeVersion + 1
                    WHERE localId = ? OR serverId = ?
                    """,
                arguments: [newContent, editedAt, Date(), localId, localId]
            )
            if !Self.holdsProtectedContent(existing) {
                try Self.followQuotes(of: existing, in: db) { quote in
                    quote.followsParentEdits ? quote.withPreviewText(newContent) : nil
                }
            }
            return existing.conversationId
        }
        if let convId = affectedConversationId {
            postMessageStoreRefresh(conversationIds: [convId])
        }
    }

    /// - Parameter sparingOpenedViewOnce: `true` pour une suppression annoncée
    ///   par le SERVEUR (`message:deleted`) : une VUE UNIQUE n'y devient pas
    ///   « Message supprimé » mais `(1) · Déjà ouvert`, contenu purgé (#7579) —
    ///   le serveur la détruit quand tous ses destinataires l'ont ouverte, et
    ///   ce n'est pas une suppression pour qui la voit passer. Une suppression
    ///   explicite de l'utilisateur passe `false`.
    ///
    /// Les citations du message supprimé sont SCELLÉES (#7927) : plus rien de
    /// lui ne se lit dans les réponses qui le citaient.
    public func markDeleted(localId: String, deletedAt: Date, sparingOpenedViewOnce: Bool = false) throws {
        let affectedConversationId: String? = try dbWriter.write { db -> String? in
            guard var record = try MessageRecord
                .filter(Column("localId") == localId || Column("serverId") == localId)
                .fetchOne(db) else { return nil }
            if sparingOpenedViewOnce, record.holdsViewOnce {
                record.sealAsOpenedViewOnce(at: deletedAt)
                record.updatedAt = Date()
                record.changeVersion += 1
                try record.update(db)
                return record.conversationId
            }
            try db.execute(
                sql: """
                    UPDATE messages SET deletedAt = ?, content = NULL,
                    updatedAt = ?, changeVersion = changeVersion + 1
                    WHERE localId = ? OR serverId = ?
                    """,
                arguments: [deletedAt, Date(), localId, localId]
            )
            try Self.followQuotes(of: record, in: db) { quote in
                quote.isQuotedMessageDeleted || quote.isStoryReply ? nil : quote.tombstoned(at: deletedAt)
            }
            return record.conversationId
        }
        if let convId = affectedConversationId {
            postMessageStoreRefresh(conversationIds: [convId])
        }
    }

    // MARK: - Les citations suivent leur message

    /// Réécrit la citation de chaque réponse à `parent` (par son id local OU
    /// serveur : une réponse cite l'id serveur, la ligne d'un message envoyé
    /// d'ici peut encore porter son id optimiste). `transform` rend `nil`
    /// quand la citation ne doit pas changer. Chaque ligne réécrite voit son
    /// `changeVersion` monter, pour que sa cellule se redessine.
    nonisolated static func followQuotes(
        of parent: MessageRecord,
        in db: Database,
        transform: (ReplyReference) -> ReplyReference?
    ) throws {
        let parentIds = [parent.localId, parent.serverId].compactMap { $0 }
        let citing = try MessageRecord
            .filter(parentIds.contains(Column("replyToId")))
            .fetchAll(db)
        let decoder = JSONDecoder()
        let encoder = JSONEncoder()
        for var row in citing {
            guard let blob = row.replyToJson,
                  let quote = decoder.decodeOrLog(ReplyReference.self, from: blob,
                                                  field: "replyToJson(follow)", id: row.localId),
                  let followed = transform(quote), followed != quote
            else { continue }
            row.replyToJson = try encoder.encode(followed)
            row.updatedAt = Date()
            row.changeVersion += 1
            try row.update(db)
        }
    }

    /// Date de suppression LOCALE du message cité par `replyToId`, s'il est
    /// déjà connu comme supprimé : une réponse ingérée APRÈS la suppression de
    /// son parent ne doit pas regraver son texte, même si le fil le sert
    /// encore (passerelle antérieure à #7927).
    nonisolated static func deletedAtOfQuotedMessage(_ replyToId: String?, in db: Database) throws -> Date? {
        guard let replyToId else { return nil }
        return try MessageRecord
            .filter(Column("localId") == replyToId || Column("serverId") == replyToId)
            .fetchOne(db)?
            .deletedAt
    }

    /// Le texte du message est-il un secret que la citation ne doit pas
    /// reprendre ? Même lecture que la passerelle (`quotedMessageIsProtected`).
    nonisolated private static func holdsProtectedContent(_ record: MessageRecord) -> Bool {
        let masking = MessageEffectFlags.viewOnce.rawValue | MessageEffectFlags.blurred.rawValue
        return record.isEncrypted || record.effectFlags & masking != 0 || record.holdsViewOnce
    }
}
