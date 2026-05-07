import Foundation
import GRDB

/// Notification posted after MessagePersistenceActor commits a write that may
/// have changed the messages of a conversation. MessageStore listens for this
/// notification instead of using GRDB observation, which crashes under Swift 6
/// strict concurrency interop with the GRDB Swift module.
/// The notification's `userInfo["conversationId"]` is a `String` identifying
/// the conversation. `nil` means "may affect any conversation".
public extension Notification.Name {
    static let messageStoreShouldRefresh = Notification.Name("me.meeshy.messageStore.shouldRefresh")
}

/// Posts the `messageStoreShouldRefresh` notification on the main thread for
/// the given conversation IDs. Called after any write through
/// MessagePersistenceActor that may affect the displayed message list.
fileprivate func postMessageStoreRefresh(conversationIds: Set<String>) {
    guard !conversationIds.isEmpty else {
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: .messageStoreShouldRefresh, object: nil)
        }
        return
    }
    DispatchQueue.main.async {
        for convId in conversationIds {
            NotificationCenter.default.post(
                name: .messageStoreShouldRefresh,
                object: nil,
                userInfo: ["conversationId": convId]
            )
        }
    }
}

public actor MessagePersistenceActor {
    private let dbWriter: any DatabaseWriter

    private let writeStream: AsyncStream<WriteOperation>
    private let writeContinuation: AsyncStream<WriteOperation>.Continuation
    private var processorTask: Task<Void, Never>?

    enum WriteOperation: Sendable {
        case reconcileBatch([IncomingMessageData])
        case batchDeliveryUpdate(conversationId: String, event: MessageEvent)
    }

    public struct IncomingMessageData: Sendable {
        public let id: String
        public let conversationId: String
        public let senderId: String
        public let content: String?
        public let createdAt: Date
        public let computedState: MessageState

        public init(id: String, conversationId: String, senderId: String,
                    content: String?, createdAt: Date, computedState: MessageState) {
            self.id = id
            self.conversationId = conversationId
            self.senderId = senderId
            self.content = content
            self.createdAt = createdAt
            self.computedState = computedState
        }
    }

    public init(dbWriter: any DatabaseWriter) {
        self.dbWriter = dbWriter
        let (stream, continuation) = AsyncStream.makeStream(of: WriteOperation.self)
        self.writeStream = stream
        self.writeContinuation = continuation
        self.processorTask = nil
    }

    /// Call after init to start the background write processor.
    public func start() {
        guard processorTask == nil else { return }
        processorTask = Task { [weak self, writeStream] in
            for await op in writeStream {
                guard let self else { break }
                switch op {
                case .reconcileBatch(let messages):
                    try? await self.reconcileBatchSync(messages)
                case .batchDeliveryUpdate(let convId, let event):
                    try? await self.batchDeliverySync(conversationId: convId, event: event)
                }
            }
        }
    }

    // MARK: - Synchronous Writes

    public func insertOptimistic(_ record: MessageRecord) throws {
        var r = record
        r.cachedTimeString = MessageRecord.computeTimeString(for: r.createdAt)
        try dbWriter.write { db in try r.insert(db) }
        postMessageStoreRefresh(conversationIds: [r.conversationId])
    }

    public func applyEvent(localId: String, event: MessageEvent) throws -> MessageState? {
        // We need the record's conversationId outside the write block so we
        // can post a *targeted* refresh notification. MessageStore observers
        // filter notifications by conversationId — a notification without
        // one is silently dropped, leaving the bubble stuck in `.sending`.
        var affectedConversationId: String?
        let result = try dbWriter.write { db -> MessageState? in
            guard var record = try MessageRecord.fetchOne(db, key: localId) else { return nil }
            affectedConversationId = record.conversationId

            var machine = MessageStateMachine(
                state: record.state,
                retryCount: record.retryCount,
                serverId: record.serverId,
                lastError: record.lastError,
                deliveredAt: record.deliveredAt,
                readAt: record.readAt
            )

            guard let newState = machine.apply(event) else { return nil }

            record.state = newState
            record.retryCount = machine.retryCount
            record.serverId = machine.serverId
            record.lastError = machine.lastError
            record.deliveredAt = machine.deliveredAt ?? record.deliveredAt
            record.readAt = machine.readAt ?? record.readAt
            record.updatedAt = Date()
            record.changeVersion += 1

            if case .serverAck(let serverId, let at) = event {
                record.serverId = serverId
                record.sentAt = at
                try PendingIdRecord(
                    localId: localId, serverId: serverId,
                    conversationId: record.conversationId, reconciledAt: nil
                ).insert(db)
            }

            try record.update(db)
            return newState
        }
        // Post a refresh scoped to the record's conversation so MessageStore
        // observers actually re-read. Skip when the row was missing or the
        // transition was rejected (no DB write happened).
        if result != nil, let convId = affectedConversationId {
            postMessageStoreRefresh(conversationIds: [convId])
        }
        return result
    }

    // MARK: - Buffered Writes

    public func bufferIncoming(_ messages: [IncomingMessageData]) {
        writeContinuation.yield(.reconcileBatch(messages))
        let convIds = Set(messages.map(\.conversationId))
        postMessageStoreRefresh(conversationIds: convIds)
    }

    public func bufferBatchDelivery(conversationId: String, event: MessageEvent) {
        writeContinuation.yield(.batchDeliveryUpdate(conversationId: conversationId, event: event))
        postMessageStoreRefresh(conversationIds: [conversationId])
    }

    private func reconcileBatchSync(_ messages: [IncomingMessageData]) throws {
        try dbWriter.write { db in
            for msg in messages {
                let existingLocalId = try PendingIdRecord
                    .filter(Column("serverId") == msg.id)
                    .fetchOne(db)?.localId

                if let localId = existingLocalId,
                   var existing = try MessageRecord.fetchOne(db, key: localId) {
                    existing.state = max(existing.state, msg.computedState)
                    existing.content = msg.content
                    existing.updatedAt = Date()
                    existing.changeVersion += 1
                    try existing.update(db)
                } else {
                    let record = MessageRecord(
                        localId: msg.id, serverId: msg.id,
                        conversationId: msg.conversationId,
                        senderId: msg.senderId,
                        content: msg.content,
                        originalLanguage: "fr", messageType: "text",
                        messageSource: "user", contentType: "text",
                        state: msg.computedState, retryCount: 0, lastError: nil,
                        isEncrypted: false, encryptionMode: nil, encryptedPayload: nil,
                        replyToId: nil, storyReplyToId: nil,
                        forwardedFromId: nil, forwardedFromConversationId: nil,
                        replyToJson: nil, forwardedFromJson: nil,
                        expiresAt: nil, effectFlags: 0,
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
                        changeVersion: 0
                    )
                    try record.insert(db)
                }
            }
        }
    }

    private func batchDeliverySync(conversationId: String, event: MessageEvent) throws {
        try dbWriter.write { db in
            let records = try MessageRecord
                .filter(Column("conversationId") == conversationId)
                .filter([MessageState.sending.rawValue, MessageState.sent.rawValue]
                    .contains(Column("state")))
                .fetchAll(db)

            for var record in records {
                var machine = MessageStateMachine(
                    state: record.state, retryCount: record.retryCount,
                    serverId: record.serverId
                )
                if let _ = machine.apply(event) {
                    record.state = machine.state
                    record.deliveredAt = machine.deliveredAt
                    record.readAt = machine.readAt
                    record.updatedAt = Date()
                    record.changeVersion += 1
                    try record.update(db)
                }
            }
        }
    }

    // MARK: - Translation / Transcription writes

    public func saveTranslation(_ translation: TranslationRecord) throws {
        try dbWriter.write { db in try translation.save(db) }
    }

    public func saveTranscription(_ transcription: TranscriptionRecord) throws {
        try dbWriter.write { db in try transcription.save(db) }
    }

    public func saveAudioTranslation(_ audio: AudioTranslationRecord) throws {
        try dbWriter.write { db in try audio.save(db) }
    }

    // MARK: - Edit / Delete / Reactions / ViewOnce

    public func markEdited(localId: String, newContent: String, editedAt: Date) throws {
        try dbWriter.write { db in
            try db.execute(
                sql: """
                    UPDATE messages SET content = ?, isEdited = 1, editedAt = ?,
                    updatedAt = ?, changeVersion = changeVersion + 1 WHERE localId = ?
                    """,
                arguments: [newContent, editedAt, Date(), localId]
            )
        }
    }

    public func markDeleted(localId: String, deletedAt: Date) throws {
        try dbWriter.write { db in
            try db.execute(
                sql: """
                    UPDATE messages SET deletedAt = ?, content = NULL,
                    updatedAt = ?, changeVersion = changeVersion + 1 WHERE localId = ?
                    """,
                arguments: [deletedAt, Date(), localId]
            )
        }
    }

    /// Undo a soft-delete, restoring the message to a non-deleted state.
    /// Used as the optimistic rollback when a delete network call fails.
    public func markUndeleted(localId: String) throws {
        try dbWriter.write { db in
            try db.execute(
                sql: """
                    UPDATE messages SET deletedAt = NULL,
                    updatedAt = ?, changeVersion = changeVersion + 1 WHERE localId = ?
                    """,
                arguments: [Date(), localId]
            )
        }
    }

    /// Optimistically update the pin state of a message.
    /// Pass `pinnedAt: nil, pinnedBy: nil` to unpin.
    public func updatePinned(localId: String, pinnedAt: Date?, pinnedBy: String?) throws {
        try dbWriter.write { db in
            try db.execute(
                sql: """
                    UPDATE messages SET pinnedAt = ?, pinnedBy = ?,
                    updatedAt = ?, changeVersion = changeVersion + 1 WHERE localId = ?
                    """,
                arguments: [pinnedAt, pinnedBy, Date(), localId]
            )
        }
    }

    /// Set or clear the blurred effect flag on a message.
    /// Reads the current `effectFlags`, toggles the `.blurred` bit, and writes back.
    public func updateBlurred(localId: String, isBlurred: Bool) throws {
        let blurredBit: UInt32 = 1 << 1
        try dbWriter.write { db in
            guard var record = try MessageRecord.fetchOne(db, key: localId) else { return }
            if isBlurred {
                record.effectFlags |= blurredBit
            } else {
                record.effectFlags &= ~blurredBit
            }
            record.updatedAt = Date()
            record.changeVersion += 1
            try record.update(db)
        }
    }

    /// Mark a view-once message as consumed: set `isBlurred` and blank the content.
    /// The view-once count update is handled separately via `updateViewOnceCount`.
    public func markConsumed(localId: String) throws {
        let blurredBit: UInt32 = 1 << 1
        try dbWriter.write { db in
            guard var record = try MessageRecord.fetchOne(db, key: localId) else { return }
            record.effectFlags |= blurredBit
            record.content = nil
            record.updatedAt = Date()
            record.changeVersion += 1
            try record.update(db)
        }
    }

    public func updateReactions(localId: String, reactionsJson: Data,
                                 reactionCount: Int, currentUserReactionsJson: Data?) throws {
        try dbWriter.write { db in
            try db.execute(
                sql: """
                    UPDATE messages SET reactionsJson = ?, reactionCount = ?,
                    currentUserReactionsJson = ?, updatedAt = ?,
                    changeVersion = changeVersion + 1 WHERE localId = ?
                    """,
                arguments: [reactionsJson, reactionCount, currentUserReactionsJson, Date(), localId]
            )
        }
    }

    public func updateViewOnceCount(localId: String, count: Int) throws {
        try dbWriter.write { db in
            try db.execute(
                sql: """
                    UPDATE messages SET viewOnceCount = ?, updatedAt = ?,
                    changeVersion = changeVersion + 1 WHERE localId = ?
                    """,
                arguments: [count, Date(), localId]
            )
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
    ) throws {
        try dbWriter.write { db in
            try db.execute(
                sql: """
                    UPDATE messages
                    SET content = ?, attachmentsJson = ?, reactionsJson = ?,
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
    }

    /// Overwrite the attachments blob for an already-persisted message.
    /// Used when the server echoes back an existing message with enriched
    /// attachment data (e.g. processed media URLs).
    public func updateAttachmentsJson(localId: String, attachmentsJson: Data?) throws {
        try dbWriter.write { db in
            try db.execute(
                sql: """
                    UPDATE messages SET attachmentsJson = ?,
                    updatedAt = ?, changeVersion = changeVersion + 1
                    WHERE localId = ?
                    """,
                arguments: [attachmentsJson, Date(), localId]
            )
        }
    }

    /// Append a reaction to a persisted message, deduplicating by emoji+participantId.
    /// The GRDB change triggers store observation so the view re-renders.
    public func appendReaction(localId: String, reactionId: String,
                                messageId: String, participantId: String?,
                                emoji: String) throws {
        try dbWriter.write { db in
            guard var record = try MessageRecord.filter(Column("localId") == localId).fetchOne(db) else { return }
            var reactions = (try? JSONDecoder().decode([MeeshyReaction].self,
                                from: record.reactionsJson ?? Data())) ?? []
            let alreadyExists = reactions.contains {
                $0.emoji == emoji && $0.participantId == participantId
            }
            guard !alreadyExists else { return }
            let reaction = MeeshyReaction(id: reactionId, messageId: messageId,
                                          participantId: participantId, emoji: emoji)
            reactions.append(reaction)
            record.reactionsJson = try JSONEncoder().encode(reactions)
            record.reactionCount = reactions.count
            record.updatedAt = Date()
            record.changeVersion += 1
            try record.update(db)
        }
    }

    /// Remove a reaction from a persisted message, matched by emoji+participantId.
    /// The GRDB change triggers store observation so the view re-renders.
    public func removeReaction(localId: String, emoji: String, participantId: String?) throws {
        try dbWriter.write { db in
            guard var record = try MessageRecord.filter(Column("localId") == localId).fetchOne(db) else { return }
            var reactions = (try? JSONDecoder().decode([MeeshyReaction].self,
                                from: record.reactionsJson ?? Data())) ?? []
            reactions.removeAll { $0.emoji == emoji && $0.participantId == participantId }
            record.reactionsJson = try JSONEncoder().encode(reactions)
            record.reactionCount = reactions.count
            record.updatedAt = Date()
            record.changeVersion += 1
            try record.update(db)
        }
    }

    /// Bump `updatedAt` + `changeVersion` for a message without changing its
    /// content — used when an attachment status event (listened/watched/viewed)
    /// arrives so the store fires and bubbles re-render.
    public func touchUpdatedAt(localId: String) throws {
        try dbWriter.write { db in
            try db.execute(
                sql: """
                    UPDATE messages SET updatedAt = ?,
                    changeVersion = changeVersion + 1 WHERE localId = ?
                    """,
                arguments: [Date(), localId]
            )
        }
    }

    public func updateLayout(localId: String, width: Double, height: Double,
                              lastLineWidth: Double, lineCount: Int, timestampInline: Bool,
                              epoch: Int, maxWidth: Double) throws {
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

    // MARK: - Reads (nonisolated — zero contention with writer)

    public nonisolated var reader: any DatabaseWriter { dbWriter }

    public nonisolated func messages(for conversationId: String, before: Date? = nil,
                                      after: Date? = nil, limit: Int = 50) throws -> [MessageRecord] {
        try dbWriter.read { db in
            var query = MessageRecord
                .filter(Column("conversationId") == conversationId)
                .order(Column("createdAt").desc)
                .limit(limit)
            if let before { query = query.filter(Column("createdAt") < before) }
            if let after { query = query.filter(Column("createdAt") > after) }
            return try query.fetchAll(db)
        }
    }

    public nonisolated func translations(for messageLocalId: String) throws -> [TranslationRecord] {
        try dbWriter.read { db in
            try TranslationRecord.filter(Column("messageLocalId") == messageLocalId).fetchAll(db)
        }
    }

    public nonisolated func resolveServerId(for localId: String) throws -> String? {
        try dbWriter.read { db in
            try PendingIdRecord.fetchOne(db, key: localId)?.serverId
        }
    }

    public nonisolated func resolveLocalId(forServerId serverId: String) throws -> String? {
        try dbWriter.read { db in
            try PendingIdRecord.filter(Column("serverId") == serverId).fetchOne(db)?.localId
        }
    }

    // MARK: - Group B Migration APIs (cache/load/refresh paths)

    /// Upsert a batch of API messages into GRDB, preserving any richer local
    /// state (layout cache, optimistic fields) for rows that already exist.
    /// Called from load/refresh paths so the MessageStore observation surfaces
    /// the authoritative server data without a direct `messages = ...` write.
    public func upsertFromAPIMessages(_ apiMessages: [APIMessage]) async throws {
        let encoder = JSONEncoder()
        let convIds = Set(apiMessages.map(\.conversationId))
        defer { postMessageStoreRefresh(conversationIds: convIds) }
        try await dbWriter.write { db in
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
                        return MeeshyMessageAttachment(
                            id: apiAtt.id,
                            fileName: apiAtt.fileName ?? "",
                            originalName: apiAtt.originalName ?? "",
                            mimeType: apiAtt.mimeType ?? "application/octet-stream",
                            fileSize: apiAtt.fileSize ?? 0,
                            fileUrl: apiAtt.fileUrl ?? "",
                            width: apiAtt.width,
                            height: apiAtt.height,
                            thumbnailUrl: apiAtt.thumbnailUrl,
                            thumbHash: apiAtt.thumbHash,
                            duration: apiAtt.duration,
                            uploadedBy: api.senderId,
                            latitude: apiAtt.latitude,
                            longitude: apiAtt.longitude,
                            thumbnailColor: thumbColor
                        )
                    }
                    return try? encoder.encode(ui)
                }()

                let reactionSummary = api.reactionSummary ?? [:]
                let userReactions = Set(api.currentUserReactions ?? [])
                let uiReactions: [MeeshyReaction] = reactionSummary.flatMap { emoji, count in
                    (0..<count).map { index in
                        MeeshyReaction(
                            messageId: api.id,
                            participantId: (userReactions.contains(emoji) && index == 0) ? api.senderId : nil,
                            emoji: emoji
                        )
                    }
                }
                let reactionsJson: Data? = uiReactions.isEmpty ? nil : try? encoder.encode(uiReactions)

                let replyToJson: Data? = api.replyTo.flatMap { reply in
                    let isMe = reply.senderId == nil
                    let authorName = reply.sender?.name ?? "?"
                    let firstAtt = reply.attachments?.first
                    let ref = ReplyReference(
                        messageId: reply.id,
                        authorName: authorName,
                        previewText: reply.content ?? "",
                        isMe: isMe,
                        attachmentType: firstAtt?.mimeType,
                        attachmentThumbnailUrl: firstAtt?.thumbnailUrl
                    )
                    return try? encoder.encode(ref)
                }

                let forwardedFromJson: Data? = api.forwardedFrom.flatMap { fwd in
                    let fwdSenderName = fwd.sender?.name ?? "?"
                    let firstAtt = fwd.attachments?.first
                    let ref = ForwardReference(
                        originalMessageId: fwd.id,
                        senderName: fwdSenderName,
                        senderAvatar: fwd.sender?.resolvedAvatar,
                        previewText: fwd.content ?? "",
                        conversationId: api.forwardedFromConversation?.id,
                        conversationName: api.forwardedFromConversation?.title,
                        attachmentType: firstAtt?.mimeType,
                        attachmentThumbnailUrl: firstAtt?.thumbnailUrl
                    )
                    return try? encoder.encode(ref)
                }

                let mentionedUsersJson: Data? = api.mentionedUsers.flatMap {
                    $0.isEmpty ? nil : try? encoder.encode($0)
                }

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
                    return .delivered
                }()

                let timeString = MessageRecord.computeTimeString(for: api.createdAt)

                if var existing = try MessageRecord.fetchOne(db, key: api.id) {
                    // Update mutable fields; preserve layout cache
                    existing.content = api.content
                    existing.isEdited = api.isEdited ?? false
                    existing.editedAt = nil
                    existing.deletedAt = api.deletedAt
                    existing.attachmentsJson = attachmentsJson
                    existing.reactionsJson = reactionsJson
                    existing.reactionCount = uiReactions.count
                    existing.deliveredCount = deliveredCount
                    existing.readCount = readCount
                    existing.deliveredToAllAt = api.deliveredToAllAt
                    existing.readByAllAt = api.readByAllAt
                    existing.state = max(existing.state, computedState)
                    // Self-heal rows that were upserted before we resolved
                    // sender.userId — their `senderId` column held the
                    // gateway's participantId, breaking `isMe` checks. Each
                    // refresh from the API now backfills the correct user id.
                    existing.senderId = resolvedSenderUserId
                    existing.senderName = senderName
                    existing.senderUsername = senderUsername
                    existing.senderAvatarURL = senderAvatarURL
                    existing.replyToJson = replyToJson
                    existing.forwardedFromJson = forwardedFromJson
                    existing.mentionedUsersJson = mentionedUsersJson
                    existing.effectFlags = effectFlags
                    existing.updatedAt = api.updatedAt ?? Date()
                    existing.changeVersion += 1
                    try existing.update(db)
                } else {
                    let record = MessageRecord(
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
                        replyToJson: replyToJson,
                        forwardedFromJson: forwardedFromJson,
                        expiresAt: api.expiresAt,
                        effectFlags: effectFlags,
                        maxViewOnceCount: nil,
                        viewOnceCount: 0,
                        isEdited: api.isEdited ?? false,
                        editedAt: nil,
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
                        changeVersion: 0
                    )
                    try record.insert(db)
                    try PendingIdRecord(
                        localId: api.id, serverId: api.id,
                        conversationId: api.conversationId,
                        reconciledAt: Date()
                    ).insert(db)
                }
            }
        }
    }

    /// Delete all message records for a conversation (called on 403/access revoked).
    public func deleteAll(conversationId: String) async throws {
        try await dbWriter.write { db in
            try MessageRecord
                .filter(Column("conversationId") == conversationId)
                .deleteAll(db)
        }
    }

    /// Delete ephemeral messages whose expiry has passed.
    public func deleteExpiredEphemeral(before: Date) async throws {
        try await dbWriter.write { db in
            try MessageRecord
                .filter(Column("expiresAt") != nil)
                .filter(Column("expiresAt") <= before)
                .deleteAll(db)
        }
    }

    /// Update delivery counters on a set of message records, merging only
    /// when the new values are strictly better than what is stored.
    public func updateDeliveryCounters(
        localId: String,
        deliveredCount: Int,
        readCount: Int,
        deliveredToAllAt: Date?,
        readByAllAt: Date?
    ) throws {
        try dbWriter.write { db in
            guard var record = try MessageRecord.fetchOne(db, key: localId) else { return }
            guard deliveredCount > record.deliveredCount
                || readCount > record.readCount
                || (deliveredToAllAt != nil && record.deliveredToAllAt == nil)
                || (readByAllAt != nil && record.readByAllAt == nil)
            else { return }
            record.deliveredCount = max(record.deliveredCount, deliveredCount)
            record.readCount = max(record.readCount, readCount)
            if let dAt = deliveredToAllAt, record.deliveredToAllAt == nil {
                record.deliveredToAllAt = dAt
            }
            if let rAt = readByAllAt, record.readByAllAt == nil {
                record.readByAllAt = rAt
            }
            record.updatedAt = Date()
            record.changeVersion += 1
            try record.update(db)
        }
    }

    deinit {
        writeContinuation.finish()
        processorTask?.cancel()
    }
}
