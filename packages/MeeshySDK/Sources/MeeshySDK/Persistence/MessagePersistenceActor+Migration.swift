import Foundation
import os
import GRDB

extension MessagePersistenceActor {
    // MARK: - Group B Migration APIs (cache/load/refresh paths)

    /// Upsert a batch of API messages into GRDB, preserving any richer local
    /// state (layout cache, optimistic fields) for rows that already exist.
    /// Called from load/refresh paths so the MessageStore observation surfaces
    /// the authoritative server data without a direct `messages = ...` write.
    /// `preferredLanguages` — le prisme ORDONNÉ du lecteur, par lequel la
    /// citation gravée dans `replyToJson` descend le Prisme (même descente que
    /// `APIMessage.toMessage(preferredLanguages:)`). Vide ⇒ l'original.
    public func upsertFromAPIMessages(_ apiMessages: [APIMessage], preferredLanguages: [String] = []) async throws {
        // Empty payloads are a routine outcome of pagination paths (e.g.
        // `loadOlderMessages` reaching the start of the conversation) — no
        // rows to write means no refresh to post.
        guard !apiMessages.isEmpty else { return }
        let encoder = JSONEncoder()
        // Capture the actor-isolated current user id into a Sendable local so
        // the GRDB write closure can tag the current user's own reactions
        // without reaching back across the actor isolation boundary.
        let currentUserId = self.currentUserId
        // Refresh ONLY the conversations where a row actually changed. The
        // same payload routinely reaches this upsert several times (open
        // conversation: per-conversation socket handler + the SyncEngine's
        // global persistor + observeSync's cache backfill; REST: the VM's
        // refresh + the SyncEngine's ensureMessages). The previous version
        // bumped `changeVersion`/`updatedAt` and posted a refresh on EVERY
        // pass — each no-op pass dirtied every row, defeated MessageStore's
        // `newRecords != messages` skip, and triggered a full applySnapshot
        // that reconfigured every visible cell. Repeated for every incoming
        // socket event, that cascade is main-thread work felt as jank while
        // typing. A no-op upsert must be exactly that: no write, no refresh.
        let changedConvIds: Set<String> = try await dbWriter.write { db -> Set<String> in
            var changedConvIds: Set<String> = []
            // T13 — message ids whose reaction toggle is still pending in the
            // outbox. Their local `reactionsJson` holds an optimistic add/remove
            // not yet on the server, so a stale REST snapshot must NOT clobber
            // it on upsert — otherwise the reaction visibly reverts until the
            // next post-sync refresh. One query per batch (a handful of rows).
            let pendingReactionMessageIds = Self.pendingOutboxMessageIds(
                db, kind: .sendReaction, payload: ReactionOutboxPayload.self
            ) { $0.messageId }
            // S2 — message ids whose edit/delete is still pending in the outbox.
            // Their local content/editedAt/deletedAt hold an optimistic mutation
            // not yet on the server, so a stale REST snapshot must NOT clobber
            // them — otherwise the edit reverts to the old text / the delete
            // un-deletes until the outbox drains (or forever if exhausted).
            // Mirrors the reaction guard above (one query each per batch).
            let pendingEditMessageIds = Self.pendingOutboxMessageIds(
                db, kind: .editMessage, payload: OfflineEditPayload.self
            ) { $0.messageId }
            let pendingDeleteMessageIds = Self.pendingOutboxMessageIds(
                db, kind: .deleteMessage, payload: OfflineDeletePayload.self
            ) { $0.messageId }
            for api in apiMessages {
                let senderName = api.sender?.name
                let senderUsername = api.sender?.username
                let senderAvatarURL = api.sender?.resolvedAvatar
                // The gateway returns `senderId` = conversation-membership id
                // (participantId), not the actual user id. The real user id
                // lives on `sender.userId` / `sender.user.id`. Store the
                // resolved user id in the record's `senderId` column so that
                // downstream `isMe` checks (record.toMessage → isMe = senderId
                // == currentUserId) work correctly. Fallback to `api.senderId`
                // when the gateway omits the sender envelope (older payloads,
                // system messages).
                let resolvedSenderUserId = api.sender?.resolvedUserId ?? api.senderId

                let attachmentsJson: Data? = {
                    guard let atts = api.attachments, !atts.isEmpty else { return nil }
                    let ui: [MeeshyMessageAttachment] = atts.map { apiAtt in
                        let thumbColor = senderName.map { DynamicColorGenerator.colorForName($0) }
                            ?? DynamicColorGenerator.colorForName("?")

                        // Embed transcription so GRDB load surfaces it instantly.
                        let embeddedTranscription: MeeshyMessageAttachment.EmbeddedTranscription? = apiAtt.transcription.flatMap { t in
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

                        // Embed audio translations keyed by language.
                        let embeddedAudioTranslations: [String: MeeshyMessageAttachment.EmbeddedAudioTranslation]? = apiAtt.translations.flatMap { dict in
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

                        return MeeshyMessageAttachment(
                            id: apiAtt.id,
                            fileName: apiAtt.fileName ?? "",
                            originalName: apiAtt.originalName ?? "",
                            mimeType: apiAtt.mimeType ?? "application/octet-stream",
                            fileSize: apiAtt.fileSize ?? 0,
                            fileUrl: apiAtt.fileUrl ?? "",
                            forwardedFromAttachmentId: apiAtt.forwardedFromAttachmentId,
                            isForwarded: apiAtt.isForwarded == true,
                            capturedInApp: apiAtt.capturedInApp == true,
                            // #7070 — même défaut que le chemin réseau
                            // (`APIMessage.toMessage`) : le décodage
                            // (`APIMessageAttachment`) portait déjà ces cinq
                            // familles, la PROJECTION au domaine gravée en
                            // cache ne les reprenait pas.
                            isViewOnce: apiAtt.isViewOnce == true,
                            maxViewOnceCount: apiAtt.maxViewOnceCount,
                            viewOnceCount: apiAtt.viewOnceCount ?? 0,
                            isBlurred: apiAtt.isBlurred == true,
                            effectFlags: apiAtt.effectFlags,
                            width: apiAtt.width,
                            height: apiAtt.height,
                            thumbnailUrl: apiAtt.thumbnailUrl,
                            thumbHash: apiAtt.thumbHash,
                            duration: apiAtt.duration,
                            uploadedBy: api.senderId,
                            isEncrypted: apiAtt.isEncrypted == true,
                            encryptionMode: apiAtt.encryptionMode,
                            latitude: apiAtt.latitude,
                            longitude: apiAtt.longitude,
                            thumbnailColor: thumbColor,
                            transcription: embeddedTranscription,
                            audioTranslations: embeddedAudioTranslations,
                            // #6793 — ce qui se GRAVE doit porter les réactions de
                            // la pièce, sans quoi le fil ROUVERT les perd même
                            // quand le serveur les sert. C'est cette projection-ci
                            // que la liste des bulles relit.
                            reactionSummary: apiAtt.reactionSummary,
                            currentUserReactions: apiAtt.currentUserReactions,
                            deliveredToAllAt: apiAtt.deliveredToAllAt,
                            viewedByAllAt: apiAtt.viewedByAllAt,
                            downloadedByAllAt: apiAtt.downloadedByAllAt,
                            listenedByAllAt: apiAtt.listenedByAllAt,
                            watchedByAllAt: apiAtt.watchedByAllAt,
                            viewedCount: apiAtt.viewedCount,
                            downloadedCount: apiAtt.downloadedCount,
                            consumedCount: apiAtt.consumedCount
                        )
                    }
                    return encoder.encodeOrLog(ui, field: "attachmentsJson", id: api.id)
                }()

                // The current user's own reaction is tagged with `currentUserId`
                // (NOT `api.senderId`, the message author's participantId) so the
                // downstream `participantId == currentUserId` ownership check
                // survives a cache reload. Shared helper keeps this in lockstep
                // with `APIMessage.toMessage(currentUserId:)`.
                let uiReactions = MeeshyReaction.reconstructFromSummary(
                    messageId: api.id,
                    reactionSummary: api.reactionSummary,
                    currentUserReactions: api.currentUserReactions,
                    currentUserId: currentUserId
                )
                let reactionsJson: Data? = uiReactions.isEmpty ? nil : encoder.encodeOrLog(uiReactions, field: "reactionsJson", id: api.id)

                let ingestedReply = Self.ingestedReply(
                    for: api, currentUserId: currentUserId,
                    preferredLanguages: preferredLanguages, encoder: encoder,
                    quotedDeletedAt: try Self.deletedAtOfQuotedMessage(api.replyToId, in: db)
                )

                let forwardedFromJson: Data? = api.forwardedFrom.flatMap { fwd in
                    let fwdSenderName = fwd.sender?.name ?? "?"
                    let firstAtt = fwd.attachments?.first
                    let ref = ForwardReference(
                        originalMessageId: fwd.id,
                        senderName: fwdSenderName,
                        senderAvatar: fwd.sender?.resolvedAvatar,
                        previewText: fwd.content ?? "",
                        conversationId: api.forwardedFromConversation?.id,
                        // Même repli et même type que le chemin réseau
                        // (`MessageModels.uiForwardRef`) : sans le type gravé,
                        // toute rangée relue du cache rendait la politique de
                        // badge aveugle — et elle échoue FERMÉE.
                        conversationName: api.forwardedFromConversation?.title
                            ?? api.forwardedFromConversation?.identifier,
                        attachmentType: firstAtt?.mimeType,
                        attachmentThumbnailUrl: firstAtt?.thumbnailUrl,
                        conversationType: api.forwardedFromConversation?.type, senderUserId: fwd.sender?.resolvedUserId
                    )
                    return encoder.encodeOrLog(ref, field: "forwardedFromJson", id: api.id)
                }

                let mentionedUsersJson: Data? = api.mentionedUsers.flatMap {
                    $0.isEmpty ? nil : encoder.encodeOrLog($0, field: "mentionedUsersJson", id: api.id)
                }

                // Structured call-summary metadata for system call messages —
                // persisted so the rich call bubble survives a cache reload.
                let callSummaryJson: Data? = api.callSummary.flatMap { encoder.encodeOrLog($0, field: "callSummaryJson", id: api.id) }

                // Avis d'arrivée OU de capture (#9617, `SystemNoticeColumn`) : sans
                // cette colonne, le fil ROUVERT perdait le sens de l'avis et
                // retombait sur le repli français générique.
                let joinNoticeJson: Data? = api.systemNoticeJson(encoder: encoder)

                // Lieu partagé — même mécanique que callSummaryJson : le
                // pipeline ne stocke pas l'`APIMessage` brut, seulement des
                // colonnes dérivées, donc une position affichée en ligne mais
                // jamais hissée ici disparaîtrait au prochain chargement du
                // cache (relaunch, pull-to-refresh).
                let locationJson = MessageRecord.encodeJSONText(api.location, field: "locationJson", id: api.id)

                // Sticker (#4823) — même mécanique et même raison que
                // `locationJson` juste au-dessus.
                let stickerJson = MessageRecord.encodeJSONText(api.sticker, field: "stickerJson", id: api.id)

                // Carte des liens suivis (#9104) — même mécanique, même coalescence.
                let trackedLinksJson = MessageRecord.encodeJSONText(
                    api.trackingLinks.flatMap { $0.isEmpty ? nil : $0 }, field: "trackedLinksJson", id: api.id)

                var effectFlags: UInt32 = api.effectFlags ?? 0
                if effectFlags == 0 {
                    var flags = MessageEffectFlags()
                    if api.isBlurred == true { flags.insert(.blurred) }
                    if api.isViewOnce == true { flags.insert(.viewOnce) }
                    if api.expiresAt != nil { flags.insert(.ephemeral) }
                    effectFlags = flags.rawValue
                }

                let deliveredCount = api.deliveredCount ?? 0
                let readCount = api.readCount ?? 0
                let computedState: MessageState = {
                    if readCount > 0 || api.readByAllAt != nil { return .delivered }
                    if deliveredCount > 0 || api.deliveredToAllAt != nil { return .delivered }
                    // No delivery signal yet → `.sent`, NOT `.delivered`. The
                    // old unconditional `.delivered` flipped a just-reconciled
                    // optimistic row straight to ✓✓ via
                    // `state = max(.sending, computedState)` before any
                    // recipient had actually received it. `MessageRecord.toMessage`
                    // derives the checkmark from the delivery counters first
                    // and only falls back to `state`, so this is the correct
                    // floor for a sent-but-unconfirmed message.
                    return .sent
                }()

                let timeString = MessageRecord.computeTimeString(for: api.createdAt)

                // Resolve the existing record using the same reconciliation
                // order as reconcileBatchSync (above). Optimistic sends live
                // in GRDB with `localId = "temp_xxxxx"` and `serverId = nil`
                // until the first ack arrives. A naive `fetchOne(key: api.id)`
                // (PK is `localId`) misses them, so the upsert falls into the
                // insert branch and produces a SECOND row with
                // `localId = api.id` — visible to the user as a duplicated
                // bubble whose original optimistic row stays stuck in
                // `.sending` forever (the clock indicator never clears).
                //
                // 1. PendingIdRecord — populated by applyEvent(.serverAck)
                //    immediately after a successful REST send. Same lookup
                //    used by reconcileBatchSync.
                // 2. Direct PK lookup — covers messages persisted with
                //    `localId = serverId` (incoming-from-others REST refresh
                //    on a first install).
                // 3. serverId column scan — final safety net for rows that
                //    ran serverAck on a build that didn't yet insert
                //    PendingIdRecord (legacy GRDB rows).
                // 0. clientMessageId — the optimistic row's primary key IS the
                //    `cid_*` (Phase 4). This catches an echo that races ahead
                //    of `applyEvent(.serverAck)` (which is what populates
                //    PendingIdRecord). Without it, an echo arriving before the
                //    REST ACK falls through to the insert branch and produces a
                //    duplicate `cid` / server-id pair (Sprint 2 RC2.3b).
                let cidMatch: MessageRecord?
                if let cid = api.clientMessageId, !cid.isEmpty {
                    cidMatch = try MessageRecord.fetchOne(db, key: cid)
                } else {
                    cidMatch = nil
                }
                let pendingMatch = try PendingIdRecord
                    .filter(Column("serverId") == api.id)
                    .fetchOne(db)
                let existingRecord: MessageRecord?
                if let cidMatch {
                    existingRecord = cidMatch
                } else if let pendingMatch,
                   let optimistic = try MessageRecord.fetchOne(db, key: pendingMatch.localId) {
                    existingRecord = optimistic
                } else if let direct = try MessageRecord.fetchOne(db, key: api.id) {
                    existingRecord = direct
                } else {
                    existingRecord = try MessageRecord
                        .filter(Column("serverId") == api.id)
                        .fetchOne(db)
                }
                if var existing = existingRecord {
                    // Snapshot BEFORE any mutation — compared after all field
                    // assignments to detect whether this upsert actually
                    // changes the row (most don't: echoes and refreshes
                    // re-deliver identical payloads).
                    let before = existing
                    // E2EE: when the local row already holds readable content
                    // (`isEncrypted == false`, non-empty) and the server now
                    // reports the message encrypted, the local copy is an own
                    // message we authored — we hold the plaintext while the
                    // server only has ciphertext we cannot decrypt (E2EE
                    // sessions are keyed by the peer, never self), or it is a
                    // legacy row decrypted on ingest. Keep the local readable
                    // content and do NOT flip `isEncrypted`, or the display
                    // pipeline would try (and fail) to decrypt readable text.
                    // A received encrypted message already has
                    // `isEncrypted == true` (set on insert), so this never
                    // blocks the normal decrypt path.
                    let keepLocalPlaintext = api.isEncrypted == true
                        && !existing.isEncrypted
                        && !(existing.content ?? "").isEmpty
                    // S2 — an edit/delete still pending in the outbox holds an
                    // optimistic mutation not yet on the server; a stale REST
                    // snapshot must NOT revert the local content/edit flag or
                    // un-delete the row.
                    let pendingEdit = pendingEditMessageIds.contains(api.id)
                    let pendingDelete = pendingDeleteMessageIds.contains(api.id)
                    // Live-call anti-régression : un snapshot REST sérialisé
                    // PENDANT l'appel peut être appliqué APRÈS l'édition
                    // terminale reçue par socket. Un résumé TERMINAL stocké
                    // n'est jamais régressé vers le live du même appel —
                    // ni sa métadonnée ni son content « en cours ».
                    let staleLiveCallSnapshot = Self.isStaleLiveCallSnapshot(
                        existing: existing.callSummaryJson,
                        incoming: callSummaryJson
                    )
                    // Update mutable fields; preserve layout cache.
                    if !keepLocalPlaintext && !pendingEdit && !pendingDelete && !staleLiveCallSnapshot {
                        existing.content = api.content
                    }
                    // Backfill the server id so future reconciliations can find
                    // the row via the serverId column or PendingIdRecord even
                    // if applyEvent(.serverAck) didn't run for some reason.
                    existing.serverId = api.id
                    // Authoritative send time. A row first written by the
                    // Notification Service Extension pre-persist (offline push,
                    // cold cache) only knows WHEN THE PUSH ARRIVED — i.e. when
                    // the device came back online — not the real send time,
                    // which it stamps as a `now` placeholder. The canonical
                    // REST/socket payload IS the source of truth, so adopt its
                    // `createdAt` here (and refresh the derived time-string the
                    // bubble renders) instead of treating the placeholder as
                    // immutable. Without this, a message received while offline
                    // is permanently branded with the data-reactivation time,
                    // contradicting its own notification timestamp and read
                    // receipts (status-management-inconsistency, 2026-06).
                    existing.createdAt = api.createdAt
                    existing.sentAt = api.createdAt
                    existing.cachedTimeString = timeString
                    if !pendingEdit {
                        existing.isEdited = api.isEdited ?? false
                        existing.editedAt = api.editedAt
                    }
                    if !pendingDelete {
                        existing.deletedAt = api.deletedAt
                    }
                    // **La NATURE du message est corrigible** (régression
                    // 2026-08-24). Une ligne née `"user"` — le chemin de
                    // réconciliation depuis le cache l'écrivait ainsi en dur —
                    // ne pouvait plus jamais redevenir `"system"` : cette
                    // branche affectait le contenu, les pièces jointes, les
                    // réactions, le chiffrement… mais NI la source, NI le type,
                    // NI le metadata système. La charge canonique portait la
                    // vérité, et rien ne l'écrivait. Résultat à l'écran : un
                    // avis d'arrivée rendu comme une parole, avec avatar et
                    // nom, et le texte de repli du gateway en guise de bulle.
                    //
                    // `??` et non affectation sèche pour le metadata : une
                    // charge qui n'en porte pas ne doit pas effacer celui d'un
                    // avis déjà reconnu — même discipline que les pièces
                    // jointes juste en dessous.
                    existing.messageSource = api.messageSource ?? existing.messageSource
                    existing.messageType = api.messageType ?? existing.messageType
                    existing.joinNoticeJson = joinNoticeJson ?? existing.joinNoticeJson
                    // `callSummaryJson` N'EST PAS touché ici : il a déjà sa
                    // règle, plus fine (`isStaleLiveCallSnapshot`), qui refuse
                    // qu'un snapshot REST sérialisé PENDANT l'appel fasse
                    // régresser un résumé TERMINAL reçu par socket. Ma première
                    // version l'écrasait — et le test de cette règle a rougi,
                    // exactement comme il devait.
                    // Preserve existing attachments when the payload carries
                    // none: a media echo that races server-side processing can
                    // arrive attachment-less, and a hard overwrite would blank
                    // the optimistic file:// preview into an empty bubble.
                    existing.attachmentsJson = attachmentsJson ?? existing.attachmentsJson
                    // T13 — preserve a locally-mutated reactionsJson (+ count) while
                    // its toggle is still pending in the outbox; otherwise this stale
                    // REST snapshot reverts the optimistic reaction until the next
                    // post-sync refresh. When nothing is pending, take the server state.
                    if !pendingReactionMessageIds.contains(api.id) {
                        existing.reactionsJson = reactionsJson
                        existing.reactionCount = uiReactions.count
                    }
                    if !keepLocalPlaintext {
                        // Keep the encryption flags coherent so the display
                        // pipeline knows to decrypt — a row first inserted via
                        // the legacy socket path may have had them cleared.
                        existing.isEncrypted = api.isEncrypted ?? existing.isEncrypted
                        existing.encryptionMode = api.encryptionMode ?? existing.encryptionMode
                    }
                    existing.adoptServedReceipts(
                        deliveredCount: deliveredCount, readCount: readCount,
                        recipientCount: api.recipientCount,
                        deliveredToAllAt: api.deliveredToAllAt, readByAllAt: api.readByAllAt,
                        computedState: computedState
                    )
                    // Self-heal rows that were upserted before we resolved
                    // sender.userId — their `senderId` column held the
                    // gateway's participantId, breaking `isMe` checks. Each
                    // refresh from the API now backfills the correct user id.
                    existing.senderId = resolvedSenderUserId
                    existing.senderName = senderName
                    existing.senderUsername = senderUsername
                    existing.senderAvatarURL = senderAvatarURL
                    // Préserve le ReplyReference riche déjà persisté quand le
                    // payload serveur ne porte aucune réponse — même garde que
                    // `attachmentsJson`. Couvre la phase optimiste avant le 1er
                    // refresh enrichi.
                    existing.replyToJson = ingestedReply.persisted(over: existing.replyToJson)
                    existing.forwardedFromJson = forwardedFromJson
                    // Backfill forwarded-from IDs (bug user 2026-05-29) :
                    // l'optimistic row inséré localement quand le user appuie
                    // sur "Transférer" ne portait pas ces champs (cf.
                    // `ForwardPickerSheet` qui POST /messages avec
                    // `forwardedFromId` mais MessageStore append l'optimistic
                    // avant la confirmation serveur). Sans ce backfill, le
                    // check `BubbleContentBuilder.isForwarded =
                    // message.forwardedFromId != nil` reste false sur le
                    // forward de l'auteur lui-même → badge "Transferred"
                    // jamais affiché. Coalescing : on garde la valeur
                    // existante si l'API n'en renvoie pas (payload partiel).
                    existing.forwardedFromId = api.forwardedFromId ?? existing.forwardedFromId
                    existing.forwardedFromConversationId = api.forwardedFromConversationId ?? existing.forwardedFromConversationId
                    // Symétrie pour replyToId — évite que les optimistic
                    // replies perdent leur référence au msg cité au upsert.
                    existing.replyToId = api.replyToId ?? existing.replyToId
                    existing.storyReplyToId = api.storyReplyToId ?? existing.storyReplyToId
                    existing.mentionedUsersJson = mentionedUsersJson
                    existing.callSummaryJson = staleLiveCallSnapshot
                        ? existing.callSummaryJson
                        : (callSummaryJson ?? existing.callSummaryJson)
                    // Coalesce like attachmentsJson/replyToJson above: a
                    // refresh that omits `location` (older gateway payload,
                    // partial socket event) must not erase a position already
                    // persisted from an earlier, richer snapshot.
                    existing.locationJson = locationJson ?? existing.locationJson
                    // Même coalescence : un écho partiel sans `sticker` ne doit
                    // pas effacer celui qu'un instantané plus riche a persisté.
                    existing.stickerJson = stickerJson ?? existing.stickerJson
                    existing.trackedLinksJson = trackedLinksJson ?? existing.trackedLinksJson
                    existing.senderIsAnonymous = api.sender.map(\.isAnonymous) ?? existing.senderIsAnonymous; existing.senderHasAccount = api.sender.map(\.hasAccount) ?? existing.senderHasAccount
                    existing.senderRingJson = MessageRecord.servedSenderRingJson(api.sender, id: api.id) ?? existing.senderRingJson
                    existing.effectFlags = effectFlags; existing.adoptServedOriginalLanguage(api.originalLanguage)
                    // #7508 — l'horloge d'un éphémère COALESCE. Ses deux
                    // porteurs arrivent par des chemins différents et jamais
                    // ensemble : la DURÉE par `message:new` (sans échéance,
                    // contrat #7451 point 4), `D(lecteur)` par REST. Le temps
                    // réel écrivant la ligne en premier, la revalidation tombe
                    // ici — et cette branche n'en touchait AUCUN.
                    existing.expiresAt = api.expiresAt ?? existing.expiresAt
                    existing.ephemeralDuration = api.ephemeralDuration ?? existing.ephemeralDuration
                    // Write ONLY when something actually changed: either a
                    // mirrored field differs from the pre-mutation snapshot,
                    // or the server reports a newer `updatedAt` (it may bump
                    // it for fields we don't mirror here, and the bubble's
                    // Equatable gate keys on `updatedAt` for content/edit
                    // invalidation). A byte-identical echo writes nothing and
                    // posts no refresh — killing the redundant full-list
                    // reconfigure that every duplicate delivery used to cost.
                    //
                    // #7579 — une vue unique DÉJÀ OUVERTE par ce lecteur ne
                    // renaît pas : ni contenu, ni pièce, ni suppression servie.
                    // Le serveur servait encore le texte au consommateur
                    // (recette 2026-09-23) ; la colonne locale fait foi.
                    if existing.viewOnceOpenedAt != nil || api.consumedByMe == true {
                        existing.sealAsOpenedViewOnce(at: Date())
                        existing.deletedAt = before.deletedAt
                    }
                    let rowChanged = !upsertMutatedFieldsEqual(existing, before)
                        || (api.updatedAt != nil && api.updatedAt != before.updatedAt)
                    if rowChanged {
                        existing.updatedAt = api.updatedAt ?? Date()
                        existing.changeVersion += 1
                        try existing.update(db)
                        changedConvIds.insert(api.conversationId)
                        // When this upsert reconciled an optimistic row (its PK is
                        // the `cid`, not the server id), keep PendingIdRecord
                        // coherent so `resolveServerId` / future reconciliations
                        // resolve the server id even when the row landed purely via
                        // the socket path (no `applyEvent(.serverAck)` ran). The
                        // first reconciliation IS a row change (serverId backfill),
                        // so gating this on `rowChanged` never skips a needed save.
                        if existing.localId != api.id {
                            // Purge a racing mirror row (localId == api.id) left
                            // by an earlier echo that missed the cid match: this
                            // reconcile promotes the optimistic row (localId ==
                            // cid) to own the server id, so the server-keyed
                            // mirror is now a duplicate bubble.
                            try MessageRecord.deleteOne(db, key: api.id)
                            try PendingIdRecord(
                                localId: existing.localId, serverId: api.id,
                                conversationId: api.conversationId, reconciledAt: Date()
                            ).save(db)
                        }
                    }
                } else {
                    var record = MessageRecord(
                        localId: api.id, serverId: api.id,
                        conversationId: api.conversationId,
                        senderId: resolvedSenderUserId,
                        content: api.content,
                        originalLanguage: api.originalLanguage ?? "fr",
                        messageType: api.messageType ?? "text",
                        messageSource: api.messageSource ?? "user",
                        contentType: "text",
                        state: computedState,
                        retryCount: 0, lastError: nil,
                        isEncrypted: api.isEncrypted ?? false,
                        encryptionMode: api.encryptionMode,
                        encryptedPayload: nil,
                        replyToId: api.replyToId,
                        storyReplyToId: api.storyReplyToId,
                        forwardedFromId: api.forwardedFromId,
                        forwardedFromConversationId: api.forwardedFromConversationId,
                        replyToJson: ingestedReply.persisted(over: nil),
                        forwardedFromJson: forwardedFromJson,
                        expiresAt: api.expiresAt,
                        effectFlags: effectFlags,
                        maxViewOnceCount: nil,
                        viewOnceCount: 0,
                        isEdited: api.isEdited ?? false,
                        editedAt: api.editedAt,
                        deletedAt: api.deletedAt,
                        pinnedAt: nil,
                        pinnedBy: nil,
                        senderName: senderName,
                        senderUsername: senderUsername,
                        senderColor: nil,
                        senderAvatarURL: senderAvatarURL,
                        deliveredCount: deliveredCount,
                        readCount: readCount,
                        deliveredToAllAt: api.deliveredToAllAt,
                        readByAllAt: api.readByAllAt,
                        createdAt: api.createdAt,
                        sentAt: api.createdAt,
                        deliveredAt: api.deliveredToAllAt,
                        readAt: api.readByAllAt,
                        updatedAt: api.updatedAt ?? Date(),
                        attachmentsJson: attachmentsJson,
                        reactionsJson: reactionsJson,
                        reactionCount: uiReactions.count,
                        currentUserReactionsJson: nil,
                        mentionedUsersJson: mentionedUsersJson,
                        cachedBubbleWidth: nil, cachedBubbleHeight: nil,
                        cachedLastLineWidth: nil, cachedLineCount: nil,
                        cachedTimestampInline: nil,
                        layoutVersion: 0, layoutMaxWidth: nil,
                        cachedTimeString: timeString,
                        changeVersion: 0,
                        callSummaryJson: callSummaryJson,
                        joinNoticeJson: joinNoticeJson,
                        recipientCount: api.recipientCount ?? 0,
                        locationJson: locationJson,
                        stickerJson: stickerJson,
                        // #7508 — le seul porteur d'horloge du temps réel.
                        ephemeralDuration: api.ephemeralDuration,
                        trackedLinksJson: trackedLinksJson,
                        senderIsAnonymous: api.sender.map(\.isAnonymous), senderHasAccount: api.sender.map(\.hasAccount),
                        senderRingJson: MessageRecord.servedSenderRingJson(api.sender, id: api.id) ?? nil
                    )
                    if api.consumedByMe == true {
                        record.sealAsOpenedViewOnce(at: Date())
                    }
                    try record.insert(db)
                    changedConvIds.insert(api.conversationId)
                    // `save` (upsert): a dangling PendingIdRecord from a
                    // previously purged message row must not roll back this
                    // fresh insert on a PK clash.
                    try PendingIdRecord(
                        localId: api.id, serverId: api.id,
                        conversationId: api.conversationId,
                        reconciledAt: Date()
                    ).save(db)
                }

                // Persist text translations from REST into GRDB so they
                // survive app restarts and are available on cold-start load.
                let viewOnceOpenedForReader = try api.consumedByMe == true
                    || MessageRecord
                        .filter(Column("localId") == api.id || Column("serverId") == api.id)
                        .filter(Column("viewOnceOpenedAt") != nil)
                        .fetchCount(db) > 0
                if !viewOnceOpenedForReader, let apiTranslations = api.translations, !apiTranslations.isEmpty {
                    let now = Date()
                    for t in apiTranslations {
                        let record = TranslationRecord(
                            id: t.id,
                            messageLocalId: api.id,
                            messageServerId: api.id,
                            targetLanguage: t.targetLanguage,
                            translatedContent: t.translatedContent,
                            // La colonne locale est `notNull` et AUCUNE surface
                            // ne la lit : la chaîne vide y dit « le serveur n'a
                            // pas déclaré de modèle », sans imposer une
                            // reconstruction de table pour une métadonnée morte.
                            translationModel: t.translationModel ?? "",
                            confidenceScore: t.confidenceScore,
                            sourceLanguage: t.sourceLanguage,
                            receivedAt: now
                        )
                        try Self.upsertTranslationRecord(record, in: db)
                    }
                }
            }
            return changedConvIds
        }
        if !changedConvIds.isEmpty {
            postMessageStoreRefresh(conversationIds: changedConvIds)
        }
    }
}
