import Foundation
import os
import GRDB

extension MessagePersistenceActor {
    // MARK: - Buffered Writes

    public func bufferIncoming(_ messages: [IncomingMessageData]) {
        // Notification is posted by the worker AFTER the GRDB write completes
        // (see `start()`). Posting here would race the async write — observers
        // would refresh against an empty database and never see the new row.
        writeContinuation.yield(.reconcileBatch(messages))
    }

    /// Buffered ingestion of fully-decoded `APIMessage` payloads — the socket
    /// `message:new` path. Routes through `upsertFromAPIMessages` (the REST
    /// path) on the serial write stream, so attachments, reactions, reply /
    /// forward refs, encryption flags and mentions all land in GRDB. The
    /// upsert reconciles an optimistic row by `clientMessageId`, server id or
    /// `PendingIdRecord`, so a same-user echo never duplicates a pending send.
    /// The refresh notification is posted by `upsertFromAPIMessages` itself.
    public func bufferIncomingAPIMessages(_ messages: [APIMessage], preferredLanguages: [String]) {
        writeContinuation.yield(.upsertAPIMessages(messages, preferredLanguages: preferredLanguages))
    }

    /// Ordonné avec les autres écritures du flux : un accusé qui suit de près
    /// l'ack d'envoi trouve la ligne déjà réconciliée sous son id serveur.
    public func bufferReadStatusSummary(conversationId: String, summary: ReadStatusSummary, currentUserId: String) {
        // Notification is posted by the worker AFTER the GRDB write completes
        // (see `start()`).
        writeContinuation.yield(.readStatusSummary(conversationId: conversationId, summary: summary, currentUserId: currentUserId))
    }

    /// Message ids carrying a still-pending outbox mutation of `kind`.
    ///
    /// Callers use the result to keep a stale REST snapshot from clobbering an
    /// optimistic local change. Returning `[]` therefore DISABLES that guard —
    /// the edit reverts, the delete un-deletes, the reaction flickers back — so
    /// neither the query nor the payload decode may fail silently here.
    nonisolated static func pendingOutboxMessageIds<P: Decodable>(
        _ db: Database,
        kind: OutboxKind,
        payload: P.Type,
        messageId: (P) -> String
    ) -> Set<String> {
        let rows: [OutboxRecord]
        do {
            rows = try OutboxRecord
                .filter(Column("kind") == kind.rawValue)
                .filter(Column("status") == OutboxStatus.pending.rawValue)
                .fetchAll(db)
        } catch {
            Logger.messages.error(
                "Pending \(kind.rawValue, privacy: .public) lookup failed — anti-clobber guard disabled, optimistic changes may revert: \(error.localizedDescription, privacy: .public)"
            )
            return []
        }
        let payloadDecoder = JSONDecoder()
        payloadDecoder.dateDecodingStrategy = .iso8601
        var ids = Set<String>()
        for row in rows {
            guard let decoded = payloadDecoder.decodeOrLog(
                P.self,
                from: row.payload,
                field: "\(kind.rawValue) payload",
                id: row.id
            ) else { continue }
            ids.insert(messageId(decoded))
        }
        return ids
    }

    /// `reconcileBatchSync` for the fire-and-forget stream worker: a write
    /// failure means the batch is NOT persisted and no observer will ever be
    /// refreshed for it, so it must leave a trace rather than vanish.
    func reconcileBatchSyncOrLog(_ messages: [IncomingMessageData]) -> Set<String> {
        do {
            return try reconcileBatchSync(messages)
        } catch {
            Logger.messages.error(
                "reconcileBatchSync dropped \(messages.count, privacy: .public) message(s), no refresh posted: \(error.localizedDescription, privacy: .public)"
            )
            return []
        }
    }

    /// Returns the conversations where a row was actually written, so the
    /// worker only posts refreshes for real changes — a re-delivered payload
    /// that matches the stored row must not dirty it (`changeVersion` bump)
    /// nor trigger the MessageStore → applySnapshot reconfigure cascade.
    func reconcileBatchSync(_ messages: [IncomingMessageData]) throws -> Set<String> {
        try dbWriter.write { db -> Set<String> in
            var changedConvIds: Set<String> = []
            for msg in messages {
                let existingLocalId = try PendingIdRecord
                    .filter(Column("serverId") == msg.id)
                    .fetchOne(db)?.localId

                if let localId = existingLocalId,
                   var existing = try MessageRecord.fetchOne(db, key: localId) {
                    let newState = max(existing.state, msg.computedState)
                    guard newState != existing.state || existing.content != msg.content else {
                        continue
                    }
                    existing.state = newState
                    existing.content = msg.content
                    existing.updatedAt = Date()
                    existing.changeVersion += 1
                    try existing.update(db)
                    changedConvIds.insert(msg.conversationId)
                } else {
                    let record = MessageRecord(
                        localId: msg.id, serverId: msg.id,
                        conversationId: msg.conversationId,
                        senderId: msg.senderId,
                        content: msg.content,
                        originalLanguage: "fr", messageType: msg.messageType,
                        messageSource: msg.messageSource, contentType: "text",
                        state: msg.computedState, retryCount: 0, lastError: nil,
                        isEncrypted: false, encryptionMode: nil, encryptedPayload: nil,
                        replyToId: nil, storyReplyToId: nil,
                        forwardedFromId: nil, forwardedFromConversationId: nil,
                        replyToJson: nil, forwardedFromJson: nil,
                        expiresAt: msg.expiresAt, effectFlags: msg.effectFlags,
                        maxViewOnceCount: nil, viewOnceCount: 0,
                        isEdited: false, editedAt: nil, deletedAt: nil,
                        pinnedAt: nil, pinnedBy: nil,
                        senderName: nil, senderUsername: nil,
                        senderColor: nil, senderAvatarURL: nil,
                        deliveredCount: 0, readCount: 0,
                        deliveredToAllAt: nil, readByAllAt: nil,
                        createdAt: msg.createdAt, sentAt: nil,
                        deliveredAt: nil, readAt: nil, updatedAt: Date(),
                        attachmentsJson: nil, reactionsJson: nil,
                        reactionCount: 0, currentUserReactionsJson: nil,
                        mentionedUsersJson: nil,
                        cachedBubbleWidth: nil, cachedBubbleHeight: nil,
                        cachedLastLineWidth: nil, cachedLineCount: nil,
                        cachedTimestampInline: nil,
                        layoutVersion: 0, layoutMaxWidth: nil,
                        cachedTimeString: MessageRecord.computeTimeString(for: msg.createdAt),
                        changeVersion: 0,
                        ephemeralDuration: msg.ephemeralDuration
                    )
                    try record.insert(db)
                    changedConvIds.insert(msg.conversationId)
                }
            }
            return changedConvIds
        }
    }
}
