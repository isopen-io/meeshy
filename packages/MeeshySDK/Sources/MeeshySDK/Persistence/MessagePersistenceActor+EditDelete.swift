import Foundation
import GRDB
import os

// Extrait de `MessagePersistenceActor.swift` (hors budget 1000-1200 — un
// fichier hors budget est interdit d'ajout) pour #7927 : une modification et
// une suppression doivent désormais atteindre aussi les CITATIONS du message,
// gravées dans le `replyToJson` des réponses. Responsabilité tenue ici :
// modifier / supprimer un message, et faire suivre ses citations.

extension MessagePersistenceActor {

    /// Applique une modification. Les citations du message suivent : leur
    /// texte devient le nouveau texte, sauf citation protégée (placeholder)
    /// ou déjà scellée. Ce texte est l'ORIGINAL ; la descente du Prisme de la
    /// citation se refait au prochain passage REST, qui la recompose.
    /// `marksEdited: false` — un avis que le serveur complète sur place
    /// (#8633) : le contenu et l'horloge d'ordre suivent, `isEdited` reste tel
    /// quel. `editedAt` n'est ici que l'horloge de la garde d'ordre ; ce qui
    /// dit « modifié » est `isEdited`.
    /// `arrivalsNotice` — la ligne d'arrivées complétée (#7759) : sa
    /// métadonnée suit son contenu, sans quoi la bulle composée chez le
    /// lecteur dirait l'ancien compte sous le nouveau repli.
    public func markEdited(
        localId: String, newContent: String, editedAt: Date, marksEdited: Bool = true,
        arrivalsNotice: ArrivalsNoticeMetadata? = nil
    ) throws {
        try markEdited(localId: localId, newContent: newContent, editedAt: editedAt, marksEdited: marksEdited,
                       arrivalsNotice: arrivalsNotice, authorship: .untouched)
    }

    /// #11375 — la même modification, avec l'auteur que la passerelle a SERVI
    /// (`message:edited.editedById`) : un modérateur de plateforme est gravé,
    /// `.served(editedById: nil)` (l'auteur a réécrit) efface la mention,
    /// `.untouched` (la charge ne le dit pas) laisse la colonne.
    public func markEdited(
        localId: String, newContent: String, editedAt: Date, marksEdited: Bool = true,
        arrivalsNotice: ArrivalsNoticeMetadata? = nil, authorship: EditAuthorship
    ) throws {
        let noticeJson = arrivalsNotice.flatMap {
            JSONEncoder().encodeOrLog($0, field: "joinNoticeJson", id: localId)
        }
        // Une modification arrivée avant son message (encore dans le flux
        // d'écriture) est gardée et rejouée à l'arrivée de la ligne.
        guard try rowExists(localId) else {
            rememberPendingRowEvent(localId) { events in
                let edit = PendingEdit(newContent: newContent, editedAt: editedAt,
                                       marksEdited: marksEdited, noticeJson: noticeJson, authorship: authorship)
                if let kept = events.edit, kept.editedAt > edit.editedAt { return }
                events.edit = edit
            }
            return
        }
        try applyServerEdit(localId: localId, newContent: newContent, editedAt: editedAt,
                            marksEdited: marksEdited, noticeJson: noticeJson, authorship: authorship)
    }

    /// Une modification servie, sous la garde d'ordre.
    private func applyServerEdit(
        localId: String, newContent: String, editedAt: Date, marksEdited: Bool, noticeJson: Data?,
        authorship: EditAuthorship = .untouched
    ) throws {
        try applyEdit(localId: localId, newContent: newContent, marksEdited: marksEdited, noticeJson: noticeJson,
                      authorship: authorship) { stored in
            MessageEditOrdering.servedStamp(editedAt: editedAt, after: stored)
        }
    }

    /// Édition de l'APPAREIL (optimiste, ou retour arrière d'une édition hors
    /// ligne abandonnée). Elle s'applique toujours : c'est l'utilisateur qui
    /// vient d'écrire. Mais la date stockée peut venir du SERVEUR (#9997 —
    /// chemin REST et socket), et l'horloge de l'appareil peut retarder sur
    /// lui : dater l'édition de `now` la ferait refuser par la garde d'ordre.
    /// Elle est donc datée juste après la date stockée quand celle-ci est en
    /// avance. Rend la date posée — un retour arrière la réutilise pour passer
    /// la garde — ou `nil` si le message est inconnu.
    @discardableResult
    public func markEditedLocally(localId: String, newContent: String, now: Date = Date()) throws -> Date? {
        try applyEdit(localId: localId, newContent: newContent, marksEdited: true) { stored in
            MessageEditOrdering.localStamp(now: now, after: stored)
        }
    }

    /// `stamp` lit la date stockée et rend celle de l'édition, ou `nil` pour
    /// la refuser. Rend la date posée.
    @discardableResult
    private func applyEdit(
        localId: String, newContent: String, marksEdited: Bool, noticeJson: Data? = nil,
        authorship: EditAuthorship = .untouched,
        stamp: @Sendable (Date?) -> Date?
    ) throws -> Date? {
        let applied: (conversationId: String, editedAt: Date)? = try dbWriter.write { db in
            guard let existing = try MessageRecord
                .filter(Column("localId") == localId || Column("serverId") == localId)
                .fetchOne(db),
                  let editedAt = stamp(existing.editedAt)
            else { return nil }
            try db.execute(
                sql: """
                    UPDATE messages SET content = ?, isEdited = (isEdited OR ?), editedAt = ?,
                    joinNoticeJson = COALESCE(?, joinNoticeJson),
                    editedById = CASE WHEN ? THEN ? ELSE editedById END,
                    updatedAt = ?, changeVersion = changeVersion + 1
                    WHERE localId = ? OR serverId = ?
                    """,
                arguments: [newContent, marksEdited, editedAt, noticeJson,
                            authorship.servesEditor, authorship.servedEditorId, Date(), localId, localId]
            )
            if !Self.holdsProtectedContent(existing) {
                try Self.followQuotes(of: existing, in: db) { quote in
                    quote.followsParentEdits ? quote.withPreviewText(newContent) : nil
                }
            }
            return (existing.conversationId, editedAt)
        }
        guard let applied else { return nil }
        postMessageStoreRefresh(conversationIds: [applied.conversationId])
        return applied.editedAt
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
    ///
    /// - Parameter expired: `true` quand la mort est une EXPIRATION
    ///   (`message:expired`) : les citations se scellent alors « expirées »
    ///   et se lisent « Message éphémère expiré », pas « supprimé » (#8631).
    public func markDeleted(localId: String, deletedAt: Date, sparingOpenedViewOnce: Bool = false, expired: Bool = false) throws {
        guard try rowExists(localId) else {
            rememberPendingRowEvent(localId) { events in
                events.tombstone = PendingTombstone(
                    deletedAt: deletedAt, sparingOpenedViewOnce: sparingOpenedViewOnce, expired: expired)
            }
            return
        }
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
                quote.isQuotedMessageDeleted || quote.isStoryReply ? nil : quote.tombstoned(at: deletedAt, expired: expired)
            }
            return record.conversationId
        }
        if let convId = affectedConversationId {
            postMessageStoreRefresh(conversationIds: [convId])
        }
    }

    // MARK: - Événements arrivés avant leur message
    //
    // Un `message:new` passe par le flux d'écriture ; `message:deleted`,
    // `message:edited` et `reaction:*` s'écrivent tout de suite. Ils trouvaient
    // la table sans la ligne, ne faisaient rien, puis l'insertion posait le
    // message intact : « supprimé pour tous », il restait lisible ; modifié,
    // il gardait l'ancien texte ; la réaction n'apparaissait jamais. Ces
    // événements sont gardés et rejoués quand la ligne arrive. Bornés en
    // NOMBRE (le plus ancien part) et en DURÉE : ceux d'un message qu'on ne
    // recevra jamais — hors de la fenêtre chargée — ne s'accumulent pas.

    func rowExists(_ localId: String) throws -> Bool {
        try dbWriter.read { db in
            try MessageRecord.filter(Column("localId") == localId || Column("serverId") == localId).fetchCount(db) > 0
        }
    }

    func rememberPendingRowEvent(_ id: String, now: Date = Date(), _ update: (inout PendingRowEvents) -> Void) {
        pendingRowEvents.remember(id, now: now, update)
    }

    /// Les messages visés viennent d'être écrits : ce qui leur est arrivé
    /// avant eux s'applique.
    func replayPendingRowEvents(for ids: [String], now: Date = Date()) {
        guard !pendingRowEvents.isEmpty else { return }
        pendingRowEvents.dropExpired(now: now)
        for id in ids {
            guard let events = pendingRowEvents.take(id) else { continue }
            do {
                if let edit = events.edit {
                    try applyServerEdit(localId: id, newContent: edit.newContent, editedAt: edit.editedAt,
                                        marksEdited: edit.marksEdited, noticeJson: edit.noticeJson,
                                        authorship: edit.authorship)
                }
                for change in events.reactions {
                    try mutateReactions(localId: id, change: change)
                }
                if let tombstone = events.tombstone {
                    try markDeleted(localId: id, deletedAt: tombstone.deletedAt,
                                    sparingOpenedViewOnce: tombstone.sparingOpenedViewOnce, expired: tombstone.expired)
                }
            } catch {
                Logger.messages.error("replayPendingRowEvents failed for \(id, privacy: .public): \(error.localizedDescription, privacy: .public)")
            }
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
