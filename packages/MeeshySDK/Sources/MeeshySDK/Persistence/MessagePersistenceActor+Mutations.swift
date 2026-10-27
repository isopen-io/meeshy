import Foundation
import os
import GRDB

extension MessagePersistenceActor {
    // MARK: - Translation / Transcription writes

    public func saveTranslation(_ translation: TranslationRecord) throws {
        try dbWriter.write { db in try TranslationRecordWriter.upsert(translation, in: db) }
    }

    /// Supprime les traductions persistées d'un message dont le CONTENU a
    /// changé (édition locale ou `message:edited`). Sans elle, l'hydratation
    /// au démarrage relit la traduction du texte d'AVANT et la sert comme si
    /// elle décrivait le nouveau.
    ///
    /// Résolution par `messageLocalId` OU `messageServerId`, comme les mutateurs
    /// pilotés par le socket : un message « own » garde sa ligne optimiste
    /// `cid_*` en local alors que l'événement porte l'id SERVEUR — filtrer sur
    /// la seule colonne locale ne toucherait alors AUCUNE ligne. Les deux
    /// espaces d'identifiants ne se recouvrent jamais.
    public func deleteTranslations(messageLocalId: String) throws {
        try dbWriter.write { db in
            _ = try TranslationRecord
                .filter(Column("messageLocalId") == messageLocalId
                        || Column("messageServerId") == messageLocalId)
                .deleteAll(db)
        }
    }

    // MARK: - Edit / Delete / Reactions / ViewOnce

    // The socket-driven mutators below (`markEdited` / `markDeleted` /
    // `appendReaction` / `removeReaction` / `updateViewOnceCount` /
    // `touchUpdatedAt`) are fed by `message:edited` / `message:deleted` /
    // `reaction:*` / attachment-status events, which all carry the SERVER
    // message id. A received message's row is keyed by that id
    // (`localId == serverId`), but an OWN message's row keeps its optimistic
    // `localId` (the `cid_*`); its server id lives only in the `serverId`
    // column. Resolving by `localId == ? OR serverId == ?` lets a
    // server-id-keyed event reach an own optimistic row — without it, an
    // edit / delete / reaction on one of the user's own messages (e.g. made
    // from another device) silently no-ops. `localId` (`cid_*` or an
    // ObjectId) and `serverId` (an ObjectId) never collide, so the OR
    // resolves at most one row.

    /// In-place update of a call system message when its state changes on the
    /// server — the live "Appel … en cours" bubble becoming the terminal
    /// summary ("Appel audio · 04:32", "Appel manqué", …) via a
    /// `message:edited` carrying call metadata. Applies content +
    /// `callSummaryJson` + `updatedAt` + `changeVersion` WITHOUT touching
    /// `isEdited`/`editedAt`: this is a server-authored state transition, not
    /// a user edit, and must not brand the bubble "modifié".
    public func applyCallNoticeUpdate(
        localId: String,
        content: String,
        callSummaryJson: Data?,
        serverUpdatedAt: Date
    ) throws {
        var affectedConversationId: String?
        var didApply = false
        try dbWriter.write { db in
            guard let existing = try MessageRecord
                .filter(Column("localId") == localId || Column("serverId") == localId)
                .fetchOne(db)
            else { return }
            affectedConversationId = existing.conversationId
            try db.execute(
                sql: """
                    UPDATE messages SET \(EndToEndContentSeal.sealedContentAssignment), callSummaryJson = ?,
                    updatedAt = ?, changeVersion = changeVersion + 1
                    WHERE localId = ? OR serverId = ?
                    """,
                arguments: [content, callSummaryJson, serverUpdatedAt, localId, localId]
            )
            didApply = true
        }
        if didApply, let convId = affectedConversationId {
            postMessageStoreRefresh(conversationIds: [convId])
        }
    }

    /// Retirer des messages du stockage local, LIGNES COMPRISES.
    ///
    /// Le pendant dur de `markDeleted`, et la distinction est le produit :
    /// `markDeleted` pose une pierre tombale (`deletedAt` + contenu vidé) parce
    /// que le message a disparu POUR TOUS et que le fil doit en garder la trace
    /// (« ce message a été supprimé »). Ici le message reste vivant pour les
    /// autres participants — c'est CE lecteur qui l'a retiré de sa vue. Il ne
    /// doit rien laisser derrière lui, pas même une tombstone : le serveur ne le
    /// renverra plus jamais à ce lecteur (`personalHistoryFilter`), donc une
    /// ligne « supprimée » resterait affichée à vie.
    ///
    /// Résolution par `localId` OU `serverId`, comme `markDeleted` : l'événement
    /// nomme l'id SERVEUR, et la ligne locale d'un message qu'on a soi-même
    /// envoyé peut encore porter son id optimiste.
    ///
    /// Les tables filles sont balayées avec les lignes, exactement comme
    /// `deleteAll` — sans quoi traductions, transcriptions et audios traduits
    /// survivraient à leur message, invisibles et jamais collectés.
    ///
    /// Un rafraîchissement PAR conversation touchée, jamais un global : les
    /// observateurs de `MessageStore` filtrent par `conversationId`, et un lot
    /// peut traverser plusieurs fils.
    public func purgeMessages(ids: [String]) async throws {
        try await purgeMessages(ids: ids, origin: .announced)
    }

    /// `.announced` (retrait annoncé par la passerelle) garde le clair E2EE au coffre (#13060).
    public func purgeMessages(ids: [String], origin: PlaintextErasureOrigin) async throws {
        guard !ids.isEmpty else { return }
        let affectedConvIds: Set<String> = try await dbWriter.write { db -> Set<String> in
            let matching = MessageRecord.filter(
                ids.contains(Column("localId")) || ids.contains(Column("serverId"))
            )
            let rows = try matching.fetchAll(db)
            guard !rows.isEmpty else { return [] }
            // Les tables filles sont clées sur le localId RÉEL de la ligne, pas
            // sur l'identifiant reçu — c'est pourquoi elles se purgent depuis
            // les lignes retrouvées, jamais depuis `ids`.
            let localIds = rows.map { $0.localId }
            try MessageChildRows.delete(ofLocalIds: localIds, in: db)
            try MessagePlaintextErasures.record(localIds, cause: .removedForMe, in: db)
            if origin == .authenticated { try MessagePlaintextErasures.authenticate(localIds, cause: .removedForMe, in: db) }
            _ = try matching.deleteAll(db)
            return Set(rows.map { $0.conversationId })
        }
        if !affectedConvIds.isEmpty {
            postMessageStoreRefresh(conversationIds: affectedConvIds)
        }
    }

    /// Undo a soft-delete, restoring the message to a non-deleted state.
    /// Used as the optimistic rollback when a delete network call fails.
    // `localId` OU `serverId` (comme les mutateurs socket plus haut) : l'interface désigne un message
    // « own » par son id serveur, et sa ligne garde son `cid_*` — viser `localId` seul n'écrivait rien.
    public func markUndeleted(localId: String) throws {
        var affectedConversationId: String?
        try dbWriter.write { db in
            affectedConversationId = try MessageRecord
                .filter(Column("localId") == localId || Column("serverId") == localId)
                .fetchOne(db)?.conversationId
            try MessagePlaintextErasures.cancelDeletion(of: localId, now: Date(), in: db)
            try db.execute(
                sql: """
                    UPDATE messages SET deletedAt = NULL,
                    updatedAt = ?, changeVersion = changeVersion + 1 WHERE localId = ? OR serverId = ?
                    """,
                arguments: [Date(), localId, localId]
            )
        }
        if let convId = affectedConversationId {
            postMessageStoreRefresh(conversationIds: [convId])
        }
    }

    /// Optimistically update the pin state of a message.
    /// Pass `pinnedAt: nil, pinnedBy: nil` to unpin.
    public func updatePinned(localId: String, pinnedAt: Date?, pinnedBy: String?) throws {
        var affectedConversationId: String?
        try dbWriter.write { db in
            affectedConversationId = try MessageRecord
                .filter(Column("localId") == localId || Column("serverId") == localId)
                .fetchOne(db)?.conversationId
            try db.execute(
                sql: """
                    UPDATE messages SET pinnedAt = ?, pinnedBy = ?,
                    updatedAt = ?, changeVersion = changeVersion + 1 WHERE localId = ? OR serverId = ?
                    """,
                arguments: [pinnedAt, pinnedBy, Date(), localId, localId]
            )
        }
        if let convId = affectedConversationId {
            postMessageStoreRefresh(conversationIds: [convId])
        }
    }

    /// Set or clear the blurred effect flag on a message.
    /// Reads the current `effectFlags`, toggles the `.blurred` bit, and writes back.
    public func updateBlurred(localId: String, isBlurred: Bool) throws {
        let blurredBit: UInt32 = 1 << 1
        var affectedConversationId: String?
        try dbWriter.write { db in
            guard var record = try MessageRecord.fetchOne(db, key: localId) else { return }
            affectedConversationId = record.conversationId
            if isBlurred {
                record.effectFlags |= blurredBit
            } else {
                record.effectFlags &= ~blurredBit
            }
            record.updatedAt = Date()
            record.changeVersion += 1
            try record.update(db)
        }
        if let convId = affectedConversationId {
            postMessageStoreRefresh(conversationIds: [convId])
        }
    }

    /// Mark a view-once message as consumed: set `isBlurred` and blank the content.
    /// The view-once count update is handled separately via `updateViewOnceCount`.
    public func markConsumed(localId: String) throws {
        let blurredBit: UInt32 = 1 << 1
        var affectedConversationId: String?
        try dbWriter.write { db in
            guard var record = try MessageRecord.fetchOne(db, key: localId) else { return }
            affectedConversationId = record.conversationId
            record.effectFlags |= blurredBit
            record.content = nil
            record.updatedAt = Date()
            record.changeVersion += 1
            try record.update(db)
        }
        if let convId = affectedConversationId {
            postMessageStoreRefresh(conversationIds: [convId])
        }
    }

    public func updateReactions(localId: String, reactionsJson: Data,
                                 reactionCount: Int, currentUserReactionsJson: Data?) throws {
        var affectedConversationId: String?
        try dbWriter.write { db in
            affectedConversationId = try MessageRecord
                .filter(Column("localId") == localId)
                .fetchOne(db)?.conversationId
            try db.execute(
                sql: """
                    UPDATE messages SET reactionsJson = ?, reactionCount = ?,
                    currentUserReactionsJson = ?, updatedAt = ?,
                    changeVersion = changeVersion + 1 WHERE localId = ?
                    """,
                arguments: [reactionsJson, reactionCount, currentUserReactionsJson, Date(), localId]
            )
        }
        if let convId = affectedConversationId {
            postMessageStoreRefresh(conversationIds: [convId])
        }
    }

    public func updateViewOnceCount(localId: String, count: Int) throws {
        var affectedConversationId: String?
        try dbWriter.write { db in
            affectedConversationId = try MessageRecord
                .filter(Column("localId") == localId || Column("serverId") == localId)
                .fetchOne(db)?.conversationId
            try db.execute(
                sql: """
                    UPDATE messages SET viewOnceCount = ?, updatedAt = ?,
                    changeVersion = changeVersion + 1
                    WHERE localId = ? OR serverId = ?
                    """,
                arguments: [count, Date(), localId, localId]
            )
        }
        if let convId = affectedConversationId {
            postMessageStoreRefresh(conversationIds: [convId])
        }
    }

    /// Update server-confirmed fields on an optimistic row after server ACK.
    /// Called when the server echoes back our sent message — reconciles content,
    /// attachments, reactions, pin state and delivery counters in GRDB so the
    /// store observation surfaces the ground-truth values without a Path A write.
    public func updateServerAckedFields(
        localId: String,
        content: String?,
        attachmentsJson: Data?,
        reactionsJson: Data?,
        pinnedAt: Date?,
        pinnedBy: String?,
        isEdited: Bool,
        editedAt: Date?,
        deletedAt: Date?,
        deliveredCount: Int,
        readCount: Int,
        deliveredToAllAt: Date?,
        readByAllAt: Date?,
        updatedAt: Date
    ) async throws {
        // Snapshot the optimistic attachments BEFORE the UPDATE overwrites
        // them — adoption pairs each new attachment with the optimistic
        // file:// URL we just replaced. A pre-write read is safe: adoption
        // is idempotent and the worst race (row gone) yields a no-op.
        // Return values from the read block so the closure stays @Sendable —
        // Swift 6 picks the async overload of `dbWriter.write` in async actor
        // context, which forbids `inout`-style captures.
        let snapshot: (json: Data?, convId: String?) = try await dbWriter.write { db -> (Data?, String?) in
            let existing = try MessageRecord
                .filter(Column("localId") == localId)
                .fetchOne(db)
            return (existing?.attachmentsJson, existing?.conversationId)
        }
        let optimisticAttachmentsJson = snapshot.json
        let affectedConversationId = snapshot.convId
        // PR B+: adopt the local bytes into the canonical typed cache
        // BEFORE the UPDATE + store refresh so the very first re-render
        // that observes `fileUrl = https://...` finds the bytes already
        // sitting under `SHA256(https://...)`. The `file://` URL never
        // outlives the optimistic phase — the HTTPS URL becomes the
        // canonical cache key the moment the server hands it back.
        if let newAtts = attachmentsJson, let oldAtts = optimisticAttachmentsJson {
            await Self.adoptChangedAttachments(oldJson: oldAtts, newJson: newAtts)
        }
        try await dbWriter.write { db in
            // `COALESCE(?, col)` keeps the existing blob when the caller passes
            // `nil`. A server ACK echo never *removes* a message's attachments
            // or reactions; a media echo that races server-side processing can
            // legitimately arrive attachment-less, and a hard overwrite would
            // blank the optimistic file:// preview into an empty bubble.
            try db.execute(
                sql: """
                    UPDATE messages
                    SET \(EndToEndContentSeal.sealedContentAssignment),
                    attachmentsJson = COALESCE(?, attachmentsJson),
                    reactionsJson = COALESCE(?, reactionsJson),
                    pinnedAt = ?, pinnedBy = ?,
                    isEdited = ?, editedAt = ?, deletedAt = ?,
                    deliveredCount = ?, readCount = ?,
                    deliveredToAllAt = ?, readByAllAt = ?,
                    updatedAt = ?, changeVersion = changeVersion + 1
                    WHERE localId = ?
                    """,
                arguments: [
                    content, attachmentsJson, reactionsJson,
                    pinnedAt, pinnedBy,
                    isEdited ? 1 : 0, editedAt, deletedAt,
                    deliveredCount, readCount,
                    deliveredToAllAt, readByAllAt,
                    updatedAt, localId
                ]
            )
        }
        if let convId = affectedConversationId {
            postMessageStoreRefresh(conversationIds: [convId])
        }
    }

    /// Pair each new attachment with the optimistic one it replaces — by id,
    /// then by index, then by `originalName + mimeType` — and adopt the local
    /// file into the typed cache when the URL flips `file://` → `https://`.
    private static func adoptChangedAttachments(oldJson: Data, newJson: Data) async {
        let decoder = JSONDecoder()
        guard let oldAtts = decoder.decodeOrLog([MeeshyMessageAttachment].self, from: oldJson, field: "attachmentsJson(old)"),
              let newAtts = decoder.decodeOrLog([MeeshyMessageAttachment].self, from: newJson, field: "attachmentsJson(new)"),
              !newAtts.isEmpty else { return }

        for (newIdx, newAtt) in newAtts.enumerated() {
            let pairedById = oldAtts.first(where: { $0.id == newAtt.id })
            let pairedByIndex: MeeshyMessageAttachment? = newIdx < oldAtts.count ? oldAtts[newIdx] : nil
            let pairedByMeta = oldAtts.first(where: {
                $0.originalName == newAtt.originalName && $0.mimeType == newAtt.mimeType
            })
            guard let previous = pairedById ?? pairedByIndex ?? pairedByMeta else { continue }
            await Self.adoptSDKLevel(new: newAtt, previousFileUrl: previous.fileUrl)
        }
    }

    /// SDK-level mirror of `OptimisticAttachmentAdopter.adoptIfNeeded` (the app
    /// helper). Lives here because the SDK cannot import the app target; the
    /// app helper remains useful for call sites that do not flow through this
    /// persistence actor.
    private static func adoptSDKLevel(new: MeeshyMessageAttachment, previousFileUrl: String?) async {
        guard let previous = previousFileUrl,
              previous.hasPrefix("file://"),
              new.fileUrl.hasPrefix("http") else { return }

        guard let localURL = URL(string: previous),
              FileManager.default.fileExists(atPath: localURL.path) else { return }

        let canonicalKey = MeeshyConfig.resolveMediaURL(new.fileUrl)?.absoluteString ?? new.fileUrl

        switch new.type {
        case .audio:
            await CacheCoordinator.shared.audio.adopt(localFile: localURL, for: canonicalKey)
        case .image:
            await CacheCoordinator.shared.images.adoptImage(localFile: localURL, for: canonicalKey)
        case .video:
            await CacheCoordinator.shared.video.adopt(localFile: localURL, for: canonicalKey)
        case .file, .location:
            return
        }
    }

    /// Overwrite the attachments blob for an already-persisted message.
    /// Used when the server echoes back an existing message with enriched
    /// attachment data (e.g. processed media URLs).
    public func updateAttachmentsJson(localId: String, attachmentsJson: Data?) throws {
        var affectedConversationId: String?
        try dbWriter.write { db in
            affectedConversationId = try MessageRecord
                .filter(Column("localId") == localId || Column("serverId") == localId)
                .fetchOne(db)?.conversationId
            try db.execute(
                sql: """
                    UPDATE messages SET attachmentsJson = ?,
                    updatedAt = ?, changeVersion = changeVersion + 1
                    WHERE localId = ? OR serverId = ?
                    """,
                arguments: [attachmentsJson, Date(), localId, localId]
            )
        }
        if let convId = affectedConversationId {
            postMessageStoreRefresh(conversationIds: [convId])
        }
    }


    /// Merge a server-pushed attachment enrichment (transcription and/or
    /// audio translations) into the persisted `attachmentsJson` blob.
    /// Used by the `message:attachment-updated` socket handler to write
    /// through the delta so a subsequent conversation open surfaces the
    /// enrichment from cache instead of pop-in-then-replace when
    /// `refreshMessagesFromAPI` finally runs.
    ///
    /// The other attachment fields (fileUrl, fileSize, dimensions, ...)
    /// are preserved. If the attachment id is not found in the blob, the
    /// call is a no-op (the message either isn't in this window or hasn't
    /// been hydrated yet — the next REST pass will pick the enrichment up).
    public func applyAttachmentEnrichment(
        messageId: String,
        attachmentId: String,
        transcription: APIAttachmentTranscription?,
        translations: [String: APIAttachmentTranslation]?
    ) throws {
        var affectedConversationId: String?
        var didMutate = false
        try dbWriter.write { db in
            guard var record = try MessageRecord
                .filter(Column("localId") == messageId || Column("serverId") == messageId)
                .fetchOne(db) else { return }
            affectedConversationId = record.conversationId

            guard let data = record.attachmentsJson else { return }
            let decoder = JSONDecoder()
            let encoder = JSONEncoder()
            guard var attachments = decoder.decodeOrLog(
                    [MeeshyMessageAttachment].self,
                    from: data,
                    field: "attachmentsJson(enrich)",
                    id: messageId
                  ),
                  let idx = attachments.firstIndex(where: { $0.id == attachmentId })
            else { return }

            // API → Embedded conversions (mirror of the mapping in
            // upsertFromAPIMessages around line 865-898).
            let embeddedTranscription: MeeshyMessageAttachment.EmbeddedTranscription? = transcription.flatMap { t in
                guard let text = t.text ?? t.transcribedText, !text.isEmpty else { return nil }
                return .init(
                    text: text,
                    language: t.language ?? "unknown",
                    confidence: t.confidence,
                    durationMs: t.durationMs,
                    speakerCount: t.speakerCount,
                    segments: t.segments?.map { s in
                        .init(text: s.text, startTime: s.startTime, endTime: s.endTime, speakerId: s.speakerId)
                    }
                )
            }
            let embeddedAudioTranslations: [String: MeeshyMessageAttachment.EmbeddedAudioTranslation]? = translations.flatMap { dict in
                let mapped: [String: MeeshyMessageAttachment.EmbeddedAudioTranslation] = dict.compactMapValues { t in
                    guard let url = t.url, !url.isEmpty else { return nil }
                    return .init(
                        url: url,
                        transcription: t.transcription,
                        durationMs: t.durationMs,
                        format: t.format,
                        cloned: t.cloned,
                        quality: t.quality,
                        voiceModelId: t.voiceModelId,
                        ttsModel: t.ttsModel,
                        segments: t.segments?.map { s in
                            .init(text: s.text, startTime: s.startTime, endTime: s.endTime, speakerId: s.speakerId)
                        }
                    )
                }
                return mapped.isEmpty ? nil : mapped
            }

            // Merge non-destructively — keep existing values when the new
            // payload doesn't carry an enrichment for that slot.
            var enriched = attachments[idx]
            if let new = embeddedTranscription { enriched.transcription = new }
            if let new = embeddedAudioTranslations { enriched.audioTranslations = new }
            attachments[idx] = enriched

            // Un encodage raté écrivait `nil` ici, ce qui EFFAÇAIT tous les
            // attachments du message — l'inverse exact du merge non destructif
            // annoncé. On préfère abandonner l'enrichissement.
            guard let encoded = encoder.encodeOrLog(
                attachments,
                field: "attachmentsJson(enrich)",
                id: messageId
            ) else { return }
            record.attachmentsJson = encoded
            record.updatedAt = Date()
            record.changeVersion += 1
            try record.update(db)
            didMutate = true
        }
        if didMutate, let convId = affectedConversationId {
            postMessageStoreRefresh(conversationIds: [convId])
        }
    }

    /// Bump `updatedAt` + `changeVersion` for a message without changing its
    /// content — used when an attachment status event (listened/watched/viewed)
    /// arrives so the store fires and bubbles re-render.
    public func touchUpdatedAt(localId: String) throws {
        var affectedConversationId: String?
        try dbWriter.write { db in
            affectedConversationId = try MessageRecord
                .filter(Column("localId") == localId || Column("serverId") == localId)
                .fetchOne(db)?.conversationId
            try db.execute(
                sql: """
                    UPDATE messages SET updatedAt = ?,
                    changeVersion = changeVersion + 1
                    WHERE localId = ? OR serverId = ?
                    """,
                arguments: [Date(), localId, localId]
            )
        }
        if let convId = affectedConversationId {
            postMessageStoreRefresh(conversationIds: [convId])
        }
    }

    public func updateLayout(localId: String, width: Double, height: Double,
                              lastLineWidth: Double, lineCount: Int, timestampInline: Bool,
                              epoch: Int, maxWidth: Double) throws {
        // grdb-04 — pas de bump changeVersion, pas de refresh : le cache de
        // layout est relu au prochain fetch et un refresh ici était un no-op
        // prouvé (MessageRecord == ne compare que localId+changeVersion) qui
        // coûtait fetch+compare à chaque écriture de layout.
        try dbWriter.write { db in
            try db.execute(
                sql: """
                    UPDATE messages SET cachedBubbleWidth = ?, cachedBubbleHeight = ?,
                    cachedLastLineWidth = ?, cachedLineCount = ?, cachedTimestampInline = ?,
                    layoutVersion = ?, layoutMaxWidth = ? WHERE localId = ?
                    """,
                arguments: [width, height, lastLineWidth, lineCount, timestampInline,
                           epoch, maxWidth, localId]
            )
        }
    }
}
