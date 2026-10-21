import Foundation
import Combine
import GRDB
import os

extension OfflineQueue {
    // MARK: - Non-message mutation enqueue (Wave 1 Task 3.x)

    /// Sentinel `conversationId` used for outbox rows that don't belong to a
    /// specific conversation (profile updates, block/unblock, friend requests,
    /// settings, etc.). The schema requires a non-null value ; a stable
    /// sentinel keeps queries that filter by conversation from accidentally
    /// matching these rows.
    public static let globalConversationSentinel = "_global"

    /// Generic enqueue path for non-message outbox kinds (block, friend
    /// request, profile update, settings, etc.). Encodes the typed payload
    /// once, writes a single `OutboxRecord` to the outbox table, and returns
    /// immediately — the `OutboxFlusher` picks the record up on its next
    /// drain pass and routes it to the corresponding `OutboxDispatcher` arm.
    ///
    /// Unlike `enqueue(_:)` (sendMessage path) this method does NOT apply
    /// the message-coalescing state machine. Each call inserts a fresh row ;
    /// dedup is the gateway's job via `clientMutationId` + `MutationLog`.
    ///
    /// `clientMutationId` is extracted from the payload by encoding-then-
    /// decoding through a minimal envelope. This keeps the call site simple
    /// (`enqueue(.blockUser, payload: BlockUserPayload(...))`) without
    /// requiring a new protocol on every payload struct.
    ///
    /// - Parameters:
    ///   - kind: the outbox kind ; MUST be one of the non-message kinds.
    ///     Calling with `.sendMessage`/`.editMessage`/etc. is a programming
    ///     error and asserts in debug builds.
    ///   - payload: any `Codable & Sendable` mutation payload that carries
    ///     a `clientMutationId` field.
    ///   - conversationId: optional anchor conversation. Pass `nil` (the
    ///     default) to use the `_global` sentinel.
    /// - Returns: the outbox record id, so callers can correlate with
    ///   downstream events.
    @discardableResult
    public func enqueue<P: Codable & Sendable>(
        _ kind: OutboxKind,
        payload: P,
        conversationId: String? = nil
    ) async throws -> String {
        switch kind {
        case .createComment:
            // Un commentaire n'entre que par `enqueueComment` /
            // `enqueueCommentMedia`, qui prouvent sa base et son auteur (#9743).
            logger.error("enqueue(.createComment) refusé : un commentaire n'entre que par enqueueComment")
            throw CommentOwnership.Refusal.notTheAuthor
        case .sendMessage, .editMessage, .deleteMessage, .sendReaction:
            assertionFailure("enqueue(kind:payload:) is for non-message outbox kinds. Use the dedicated enqueue/enqueueEdit/enqueueDelete paths for \(kind).")
        default:
            break
        }

        guard let pool = outboxPool else {
            logger.error("enqueue(kind:payload:) called before configure(pool:) — refusing to drop the mutation silently")
            throw OfflineQueueError.poolNotConfigured
        }

        let encoded: Data
        do {
            encoded = try encoder.encode(payload)
        } catch {
            logger.error("Failed to encode payload for \(kind.rawValue, privacy: .public): \(error.localizedDescription, privacy: .public)")
            throw OfflineQueueError.payloadCodingFailed(underlying: error)
        }

        // Extract clientMutationId from the encoded payload — every non-message
        // mutation payload carries one (see `MutationPayloads.swift`). We avoid
        // a new protocol by reading the JSON object directly. If extraction
        // fails or the value is malformed, we still write the row but with a
        // freshly minted cmid so the row remains observable in the outbox.
        let cmid = OutboxMutationRules.extractClientMutationId(from: encoded) ?? ClientMutationId.generate()
        let outboxId = "ofqm_\(cmid)"
        let anchor = conversationId ?? Self.globalConversationSentinel
        let now = Date()
        let shouldCoalesce = OutboxMutationRules.coalescesByAnchor(kind: kind)

        do {
            try await pool.write { db in
                var finalPayload: Data = encoded
                if shouldCoalesce {
                    // Latest-state-wins kinds (e.g. `markStoryViewed`): drop
                    // every earlier `.pending` / `.failed` row for the same
                    // anchor. `.markAsRead` est l'exception (outbox-05) : ses
                    // messageIds sont des REÇUS de lecture exacte, pas un état
                    // à jeter — ils sont fusionnés (union) dans le payload
                    // survivant avant la suppression des rows périmées.
                    let stale: [OutboxRecord] = try OutboxRecord
                        .filter(Column("kind") == kind.rawValue)
                        .filter(Column("conversationId") == anchor)
                        .filter([OutboxStatus.pending.rawValue, OutboxStatus.failed.rawValue]
                            .contains(Column("status")))
                        .fetchAll(db)
                    if !stale.isEmpty {
                        if kind == .markAsRead {
                            finalPayload = OutboxMutationRules.mergeMarkAsReadPayloads(
                                newest: encoded,
                                stale: stale.map(\.payload)
                            )
                        }
                        let staleIds = stale.map(\.id)
                        try OutboxRecord
                            .filter(staleIds.contains(Column("id")))
                            .deleteAll(db)
                    }
                }
                try OutboxRecord(
                    id: outboxId,
                    kind: kind,
                    conversationId: anchor,
                    messageLocalId: nil,
                    clientMessageId: cmid,
                    payload: finalPayload,
                    status: .pending,
                    createdAt: now
                ).insert(db)
            }
        } catch {
            logger.error("Outbox write failed for \(kind.rawValue, privacy: .public): \(error.localizedDescription, privacy: .public)")
            throw OfflineQueueError.writeFailed(underlying: error)
        }

        logger.info("Enqueued \(kind.rawValue, privacy: .public) outbox row \(outboxId, privacy: .public)")
        await refreshPendingCount()
        mutationEnqueued.send(())
        return outboxId
    }

    /// See `OfflineQueueing.hasUnsentRow(kind:anchor:)`.
    ///
    /// Lecture SEULE, et volontairement sans effet de bord : c'est une question
    /// posée à la file, pas une réservation. Ce qu'elle rend est vrai de la
    /// table SQLite — donc du magasin qui survit à la mort de l'app —, jamais
    /// d'un état de processus.
    ///
    /// `.exhausted` est EXCLU des statuts comptés : le flusher a renoncé sur
    /// cette ligne, elle n'ira nulle part sans une reprise manuelle depuis la
    /// pastille de synchro. La compter figerait le geste de l'auteur sur une
    /// ligne morte.
    public func hasUnsentRow(kind: OutboxKind, anchor: String) async -> Bool {
        guard let pool = outboxPool else { return false }
        let enRoute = [
            OutboxStatus.pending.rawValue,
            OutboxStatus.inflight.rawValue,
            OutboxStatus.failed.rawValue
        ]
        do {
            return try await pool.read { db in
                try OutboxRecord
                    .filter(Column("kind") == kind.rawValue)
                    .filter(Column("conversationId") == anchor)
                    .filter(enRoute.contains(Column("status")))
                    .fetchCount(db) > 0
            }
        } catch {
            // Une panne de LECTURE ne doit pas retenir un geste : rendre `true`
            // par prudence avalerait un repartage que personne n'a doublé.
            logger.error("hasUnsentRow(\(kind.rawValue, privacy: .public)) read failed: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    /// Persists an `editMessage` request, applying the coalescing rules from
    /// spec §6.3 (merge into a pending sendMessage, merge into a pending edit,
    /// drop after a pending delete).
    public func enqueueEdit(_ payload: OfflineEditPayload) async throws {
        guard let pool = outboxPool else { throw OfflineQueueError.poolNotConfigured }
        let encoded: Data
        do {
            encoded = try encoder.encode(payload)
        } catch {
            throw OfflineQueueError.payloadCodingFailed(underlying: error)
        }
        let recordId = "ofqe_\(UUID().uuidString)"
        let now = Date()
        let conversationId = payload.conversationId
        let clientMessageId = payload.clientMessageId
        let log = logger
        let dec = decoder
        let enc = encoder
        do {
            try await pool.write { db in
                let existing = try OutboxRecord
                    .filter(Column("conversationId") == conversationId)
                    .filter(Column("clientMessageId") == clientMessageId)
                    .filter(Column("status") == OutboxStatus.pending.rawValue)
                    .order(Column("createdAt").desc)
                    .fetchOne(db)

                switch existing?.kind {
                case .none:
                    try OutboxRecord(
                        id: recordId,
                        kind: .editMessage,
                        conversationId: conversationId,
                        messageLocalId: clientMessageId,
                        clientMessageId: clientMessageId,
                        payload: encoded,
                        status: .pending,
                        createdAt: now
                    ).insert(db)

                case .sendMessage:
                    // Merge edit into pending send: rewrite the send's content.
                    guard let send = existing else {
                        log.error("Cannot merge edit — no pending sendMessage record, dropping edit")
                        return
                    }
                    let item: OfflineQueueItem
                    do {
                        item = try dec.decode(OfflineQueueItem.self, from: send.payload)
                    } catch {
                        log.error("Cannot merge edit — corrupt sendMessage payload, dropping edit: \(error.localizedDescription, privacy: .public)")
                        return
                    }
                    let merged = OfflineQueueItem(
                        id: item.id,
                        clientMessageId: item.clientMessageId,
                        conversationId: item.conversationId,
                        content: payload.content,
                        originalLanguage: item.originalLanguage,
                        replyToId: item.replyToId,
                        forwardedFromId: item.forwardedFromId,
                        forwardedFromConversationId: item.forwardedFromConversationId,
                        attachmentIds: item.attachmentIds,
                        attachmentKinds: item.attachmentKinds,
                        localAudioPath: item.localAudioPath,
                        localAudioPaths: item.localAudioPaths,
                        localMediaPaths: item.localMediaPaths,
                        // L'édition ne porte que le texte : le lieu du send en
                        // attente est conservé, pas silencieusement perdu.
                        location: item.location,
                        // Et le sticker : le PNG rejoué garde ce qu'il représente.
                        sticker: item.sticker,
                        // Idem pour le fan-out de partage : éditer un envoi en
                        // attente ne doit pas lui faire perdre sa copie de
                        // pièces jointes.
                        copyAttachmentsFromClientMessageId: item.copyAttachmentsFromClientMessageId,
                        protectionFlags: item.protectionFlags, ephemeralDuration: item.ephemeralDuration, createdAt: item.createdAt
                    )
                    let mergedPayload: Data
                    do {
                        mergedPayload = try enc.encode(merged)
                    } catch {
                        // Réécrire l'ancien payload en remettant `lastError` à
                        // NULL ferait passer l'édition pour appliquée alors
                        // qu'elle ne partira jamais. On laisse le record
                        // intact : le message original s'envoie normalement.
                        log.error("Cannot merge edit — merged payload encode failed, keeping original send intact: \(error.localizedDescription, privacy: .public)")
                        return
                    }
                    try db.execute(sql: """
                        UPDATE outbox
                        SET payload = ?, updatedAt = ?, lastError = NULL
                        WHERE id = ?
                        """, arguments: [mergedPayload, now, send.id])

                case .editMessage:
                    // Latest edit wins — replace payload.
                    try db.execute(sql: """
                        UPDATE outbox
                        SET payload = ?, updatedAt = ?, lastError = NULL
                        WHERE id = ?
                        """, arguments: [encoded, now, existing!.id])

                case .deleteMessage:
                    // Edit-after-delete is impossible; drop with a warning.
                    log.warning("editMessage after deleteMessage on \(clientMessageId, privacy: .public), dropping")

                case .sendReaction:
                    // Edit alongside a pending reaction is fine — INSERT.
                    try OutboxRecord(
                        id: recordId,
                        kind: .editMessage,
                        conversationId: conversationId,
                        messageLocalId: clientMessageId,
                        clientMessageId: clientMessageId,
                        payload: encoded,
                        status: .pending,
                        createdAt: now
                    ).insert(db)

                case .some(let other):
                    // Wave 1 Task 3.2 — non-message outbox kinds. Should not
                    // share a message `clientMessageId` ; if it ever does,
                    // insert alongside and log so the inconsistency surfaces.
                    log.error("editMessage collides with non-message outbox kind \(String(describing: other), privacy: .public) on \(clientMessageId, privacy: .public) — inserting alongside")
                    try OutboxRecord(
                        id: recordId,
                        kind: .editMessage,
                        conversationId: conversationId,
                        messageLocalId: clientMessageId,
                        clientMessageId: clientMessageId,
                        payload: encoded,
                        status: .pending,
                        createdAt: now
                    ).insert(db)
                }
            }
        } catch {
            throw OfflineQueueError.writeFailed(underlying: error)
        }
        await refreshPendingCount()
        mutationEnqueued.send(())
    }

    /// Persists a `deleteMessage` request. If a pending `sendMessage` or
    /// `editMessage` exists for the same `clientMessageId`, the local record
    /// is removed (no server roundtrip needed) per spec §6.3.
    public func enqueueDelete(_ payload: OfflineDeletePayload) async throws {
        guard let pool = outboxPool else { throw OfflineQueueError.poolNotConfigured }
        let encoded: Data
        do {
            encoded = try encoder.encode(payload)
        } catch {
            throw OfflineQueueError.payloadCodingFailed(underlying: error)
        }
        let recordId = "ofqd_\(UUID().uuidString)"
        let now = Date()
        let conversationId = payload.conversationId
        let clientMessageId = payload.clientMessageId
        let dec = decoder
        do {
            let filesToSweep: [String] = try await pool.write { db -> [String] in
                let existing = try OutboxRecord
                    .filter(Column("conversationId") == conversationId)
                    .filter(Column("clientMessageId") == clientMessageId)
                    .filter(Column("status") == OutboxStatus.pending.rawValue)
                    .order(Column("createdAt").desc)
                    .fetchOne(db)

                switch existing?.kind {
                case .none:
                    try OutboxRecord(
                        id: recordId,
                        kind: .deleteMessage,
                        conversationId: conversationId,
                        messageLocalId: clientMessageId,
                        clientMessageId: clientMessageId,
                        payload: encoded,
                        status: .pending,
                        createdAt: now
                    ).insert(db)
                    return []

                case .sendMessage:
                    // Send + delete on the same pending id = no-op locally.
                    // Collect the cancelled send's pending media/audio files so
                    // they can be swept AFTER commit — otherwise the row vanishes
                    // but its files orphan under Documents/pending-*/ forever
                    // (parity with cancelCreatePost).
                    let sweep: [String]
                    do {
                        sweep = try existing
                            .map { try dec.decode(OfflineQueueItem.self, from: $0.payload) }
                            .map { Self.pendingLocalFileAbsolutePaths(for: $0) } ?? []
                    } catch {
                        // Sans la liste des fichiers, ils orphelinent sous
                        // Documents/pending-*/ — exactement ce que ce bloc
                        // existe pour éviter.
                        MeeshyLog.logger(.offlinequeue, subsystem: .legacySDK)
                            .error("enqueueDelete: cancelled send payload undecodable, its media files will orphan: \(error.localizedDescription, privacy: .public)")
                        sweep = []
                    }
                    _ = try OutboxRecord.deleteOne(db, key: existing!.id)
                    return sweep

                case .editMessage:
                    // Pending edit becomes irrelevant; replace with a delete.
                    _ = try OutboxRecord.deleteOne(db, key: existing!.id)
                    try OutboxRecord(
                        id: recordId,
                        kind: .deleteMessage,
                        conversationId: conversationId,
                        messageLocalId: clientMessageId,
                        clientMessageId: clientMessageId,
                        payload: encoded,
                        status: .pending,
                        createdAt: now
                    ).insert(db)
                    return []

                case .deleteMessage:
                    // Already pending — idempotent, refresh timestamp only.
                    try db.execute(sql: """
                        UPDATE outbox SET updatedAt = ? WHERE id = ?
                        """, arguments: [now, existing!.id])
                    return []

                case .sendReaction:
                    // Delete alongside a pending reaction — INSERT.
                    try OutboxRecord(
                        id: recordId,
                        kind: .deleteMessage,
                        conversationId: conversationId,
                        messageLocalId: clientMessageId,
                        clientMessageId: clientMessageId,
                        payload: encoded,
                        status: .pending,
                        createdAt: now
                    ).insert(db)
                    return []

                case .some(let other):
                    // Wave 1 Task 3.2 — non-message outbox kinds. Should not
                    // share a message `clientMessageId` ; if collision happens,
                    // INSERT the delete alongside and log for diagnostics.
                    MeeshyLog.logger(.offlinequeue, subsystem: .legacySDK)
                        .error("deleteMessage collides with non-message outbox kind \(String(describing: other), privacy: .public) on \(clientMessageId, privacy: .public) — inserting alongside")
                    try OutboxRecord(
                        id: recordId,
                        kind: .deleteMessage,
                        conversationId: conversationId,
                        messageLocalId: clientMessageId,
                        clientMessageId: clientMessageId,
                        payload: encoded,
                        status: .pending,
                        createdAt: now
                    ).insert(db)
                    return []
                }
            }
            // Sweep AFTER the row is durably gone, so a rolled-back write never
            // orphans a still-live send's files.
            for path in filesToSweep {
                FileManager.default.removeItemLogging(atPath: path, context: "post-delete file sweep")
            }
        } catch {
            throw OfflineQueueError.writeFailed(underlying: error)
        }

        // Mirror the GRDB transaction in the in-memory queue used by the hot
        // retry path: a delete that collapsed a pending sendMessage must not
        // leave a phantom item in `items`, otherwise `retryAll()` will replay
        // a logically-deleted message until the next app restart. The gateway
        // dedup catches the duplicate but the optimistic row would flicker.
        items.removeAll { $0.clientMessageId == clientMessageId }
        await refreshPendingCount()
        mutationEnqueued.send(())
    }

    public func dequeue(_ itemId: String) async {
        let outboxId = "ofq_\(itemId)"
        items.removeAll { $0.id == itemId }
        guard let pool = outboxPool else {
            await refreshPendingCount()
            return
        }
        do {
            try await pool.write { db in
                _ = try OutboxRecord.deleteOne(db, key: outboxId)
            }
        } catch {
            logger.error("dequeue failed: \(error.localizedDescription, privacy: .public)")
        }
        await refreshPendingCount()
    }

    // MARK: - Reaction Enqueue (Wave 1 Task 3.6 — ports ReactionQueue.enqueue)

    /// Persists a reaction mutation as an `OutboxRecord` of kind
    /// `.sendReaction`, applying the same coalescing state machine that
    /// previously lived in `ReactionQueue.enqueue`:
    ///
    /// - `(none)` + `add`/`remove` → INSERT
    /// - `add` already pending + `remove` → DELETE existing (round-trip avoided)
    /// - `remove` already pending + `add` → DELETE existing (round-trip avoided)
    /// - same action already pending → DROP the new record (idempotent dedup)
    ///
    /// The SELECT-existing read and the INSERT/DELETE write happen in the
    /// same GRDB transaction — there is no race between detection and merge.
    /// Drop / cancel outcomes fire `retryDropped` so optimistic UI hints can
    /// be reverted without a server roundtrip.
    ///
    /// Wave 1 Task 3.6 — this method replaces the actor-private
    /// `ReactionQueue.enqueue` ; behavior is preserved byte-for-byte, only the
    /// signaling target changes (unified `retryDropped` instead of the legacy
    /// per-queue `ReactionQueue.retryDropped`).
    public func enqueueReaction(
        messageId: String,
        emoji: String,
        action: ReactionAction,
        conversationId: String,
        clientMessageId: String? = nil
    ) async throws {
        guard let pool = outboxPool else {
            logger.error("enqueueReaction called before configure(pool:) — refusing to drop the reaction silently")
            throw OfflineQueueError.poolNotConfigured
        }

        let cid = clientMessageId ?? ClientMessageId.generate()
        // Match the legacy `rxq_<uuid>` namespace so any in-flight rows
        // written by the deleted `ReactionQueue` continue to be drained
        // correctly by the existing dispatcher (which routes by `kind`, not
        // by id prefix). The UUID is generated fresh per call ; collisions
        // on the same `(messageId, emoji)` are caught by the coalescing
        // state machine below.
        let outboxId = "rxq_\(UUID().uuidString)"
        let createdAt = Date()
        let payloadStruct = ReactionOutboxPayload(
            messageId: messageId,
            emoji: emoji,
            action: action,
            conversationId: conversationId,
            clientMessageId: cid
        )

        let payloadData: Data
        do {
            payloadData = try encoder.encode(payloadStruct)
        } catch {
            logger.error("Failed to encode ReactionOutboxPayload: \(error.localizedDescription, privacy: .public)")
            throw OfflineQueueError.payloadCodingFailed(underlying: error)
        }

        let dec = decoder
        let log = logger

        // Drop reasons emitted after the transaction commits. Inside the
        // closure we cannot emit Combine values without re-entering the actor;
        // we collect the snapshot and fire it post-commit.
        enum CoalesceOutcome: Sendable {
            case inserted
            case droppedNew(matched: ReactionOutboxPayload)
            case cancelledBoth(matched: ReactionOutboxPayload)
        }

        let outcome: CoalesceOutcome
        do {
            outcome = try await pool.write { db in
                // Find any pending sendReaction record on the same conversation
                // that matches `(messageId, emoji)`. Pending reaction queues are
                // typically tiny so decoding the payloads inline stays fast.
                let candidates = try OutboxRecord
                    .filter(Column("conversationId") == conversationId)
                    .filter(Column("kind") == OutboxKind.sendReaction.rawValue)
                    .filter(Column("status") == OutboxStatus.pending.rawValue)
                    .order(Column("createdAt").asc)
                    .fetchAll(db)

                let match: (record: OutboxRecord, payload: ReactionOutboxPayload)? = candidates.lazy
                    .compactMap { record -> (OutboxRecord, ReactionOutboxPayload)? in
                        let decoded: ReactionOutboxPayload
                        do {
                            decoded = try dec.decode(ReactionOutboxPayload.self, from: record.payload)
                        } catch {
                            log.error("enqueueReaction: skipping undecodable reaction row \(record.id, privacy: .public): \(error.localizedDescription, privacy: .public)")
                            return nil
                        }
                        guard decoded.messageId == messageId, decoded.emoji == emoji else { return nil }
                        return (record, decoded)
                    }
                    .first

                if let match {
                    if match.payload.action == action {
                        // Idempotent re-enqueue (same direction). Drop the new
                        // record, keep the existing one untouched.
                        log.info("Reaction \(action.rawValue, privacy: .public) \(emoji, privacy: .public) on \(messageId, privacy: .public) already pending — deduped")
                        return .droppedNew(matched: match.payload)
                    } else {
                        // Opposite directions cancel. Delete the existing
                        // pending record so neither hits the server.
                        _ = try OutboxRecord.deleteOne(db, key: match.record.id)
                        log.info("Reaction toggle cancelled in queue: \(match.payload.action.rawValue, privacy: .public) + \(action.rawValue, privacy: .public) on \(emoji, privacy: .public)/\(messageId, privacy: .public)")
                        return .cancelledBoth(matched: match.payload)
                    }
                }

                try OutboxRecord(
                    id: outboxId,
                    kind: .sendReaction,
                    conversationId: conversationId,
                    messageLocalId: cid,
                    clientMessageId: cid,
                    payload: payloadData,
                    status: .pending,
                    createdAt: createdAt
                ).insert(db)
                return .inserted
            }
        } catch {
            logger.error("Outbox write failed for reaction: \(error.localizedDescription, privacy: .public)")
            throw OfflineQueueError.writeFailed(underlying: error)
        }

        switch outcome {
        case .inserted:
            logger.info("Enqueued reaction \(action.rawValue, privacy: .public) \(emoji, privacy: .public) for message \(messageId, privacy: .public)")
            mutationEnqueued.send(())
        case .droppedNew(let matched):
            // Surface the duplicate as a drop so optimistic UI can reconcile
            // (e.g. if the caller had already painted a "pending" badge for
            // this very tap, the existing pending record will resolve it).
            retryDropped.send(OfflineRetryDropped(
                kind: .sendReaction,
                clientMessageId: cid,
                conversationId: conversationId,
                reaction: OfflineRetrySuccess.ReactionContext(
                    messageId: messageId, emoji: emoji, action: action
                )
            ))
            _ = matched
        case .cancelledBoth(let matched):
            // Both the existing pending record and the new mutation are gone:
            // emit a drop for each side so callers can revert optimistic
            // visuals. The existing record is keyed off `matched`, the new one
            // off the freshly built payload.
            retryDropped.send(OfflineRetryDropped(
                kind: .sendReaction,
                clientMessageId: matched.clientMessageId,
                conversationId: matched.conversationId,
                reaction: OfflineRetrySuccess.ReactionContext(
                    messageId: matched.messageId,
                    emoji: matched.emoji,
                    action: matched.action
                )
            ))
            retryDropped.send(OfflineRetryDropped(
                kind: .sendReaction,
                clientMessageId: cid,
                conversationId: conversationId,
                reaction: OfflineRetrySuccess.ReactionContext(
                    messageId: messageId, emoji: emoji, action: action
                )
            ))
        }
    }

    /// Convenience accessor for tests / ViewModels that want to read the
    /// current pending reaction backlog without going through the generic
    /// outbox query. Decodes each `.sendReaction` payload and surfaces the
    /// `(messageId, emoji, action)` triple plus the outbox row id.
    public var pendingReactions: [ReactionOutboxPayload] {
        get async {
            guard let pool = outboxPool else { return [] }
            do {
                let dec = decoder
                let log = logger
                return try await pool.read { db in
                    let records = try OutboxRecord
                        .filter(Column("kind") == OutboxKind.sendReaction.rawValue)
                        .filter(Column("status") == OutboxStatus.pending.rawValue)
                        .order(Column("createdAt").asc)
                        .fetchAll(db)
                    return records.compactMap { record -> ReactionOutboxPayload? in
                        do {
                            return try dec.decode(ReactionOutboxPayload.self, from: record.payload)
                        } catch {
                            log.error("pendingReactions: skipping undecodable row \(record.id, privacy: .public): \(error.localizedDescription, privacy: .public)")
                            return nil
                        }
                    }
                }
            } catch {
                logger.error("pendingReactions read failed: \(error.localizedDescription, privacy: .public)")
                return []
            }
        }
    }

    /// Internal helper used by the dispatcher (and the unified retry path) to
    /// emit a `retryExhausted` event without re-entering the actor. Lives on
    /// `OfflineQueue` itself so the signal stays a `nonisolated let` accessed
    /// from anywhere (including `OutboxFlusher` and `OutboxDispatcher`) with
    /// no actor-hop overhead.
    public nonisolated func emitRetryExhausted(_ payload: OfflineRetryExhausted) {
        retryExhausted.send(payload)
    }

    public var pendingItems: [OfflineQueueItem] {
        items
    }

    public var count: Int {
        items.count
    }

    public var isEmpty: Bool {
        items.isEmpty
    }
}
