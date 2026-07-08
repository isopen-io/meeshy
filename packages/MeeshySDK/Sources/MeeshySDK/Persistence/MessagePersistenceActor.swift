import Foundation
import os
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
///
/// `MessageStore.startObserving(...)` filters notifications by
/// `userInfo["conversationId"]` and silently rejects anything else, so
/// posting with an empty set is a programming error: the GRDB row is
/// updated but no observer ever fires. We assert in DEBUG to catch
/// mistakes early (see fix 6c6270d1 + the 15-method follow-up) and
/// no-op in release rather than emit the misleading wildcard notif
/// the previous implementation produced.
fileprivate func postMessageStoreRefresh(conversationIds: Set<String>) {
    assert(!conversationIds.isEmpty,
           "postMessageStoreRefresh called with empty Set<String> — every mutation method on MessagePersistenceActor must scope its refresh to the affected conversationId. Otherwise MessageStore observers drop the notification and the UI freezes on its last cached state.")
    guard !conversationIds.isEmpty else { return }
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

/// Field-level equality over exactly the columns the `upsertFromAPIMessages`
/// update branch mutates. CANNOT use `MessageRecord ==` here: that
/// conformance is intentionally O(1) (`localId` + `changeVersion` only, for
/// MessageStore's refresh skip) and the comparison runs BEFORE the
/// changeVersion bump — it would report every mutation as "unchanged" and
/// silently drop real content/reaction/state updates.
fileprivate func upsertMutatedFieldsEqual(_ a: MessageRecord, _ b: MessageRecord) -> Bool {
    let contentAndState = a.content == b.content && a.serverId == b.serverId
        && a.state == b.state && a.isEdited == b.isEdited
        && a.editedAt == b.editedAt && a.deletedAt == b.deletedAt
        // `createdAt` is the immutable server send time, but a row first
        // written by the Notification Service Extension pre-persist carries a
        // PLACEHOLDER value (the push-receipt time). Comparing it here lets the
        // canonical reconcile detect — and persist — the correction.
        && a.createdAt == b.createdAt && a.cachedTimeString == b.cachedTimeString
    let attachmentsAndReactions = a.attachmentsJson == b.attachmentsJson
        && a.reactionsJson == b.reactionsJson && a.reactionCount == b.reactionCount
    let encryptionAndDelivery = a.isEncrypted == b.isEncrypted && a.encryptionMode == b.encryptionMode
        && a.deliveredCount == b.deliveredCount && a.readCount == b.readCount
        && a.deliveredToAllAt == b.deliveredToAllAt && a.readByAllAt == b.readByAllAt
    let sender = a.senderId == b.senderId && a.senderName == b.senderName
        && a.senderUsername == b.senderUsername && a.senderAvatarURL == b.senderAvatarURL
    let replyAndForward = a.replyToId == b.replyToId && a.storyReplyToId == b.storyReplyToId
        && a.replyToJson == b.replyToJson && a.forwardedFromId == b.forwardedFromId
        && a.forwardedFromConversationId == b.forwardedFromConversationId
        && a.forwardedFromJson == b.forwardedFromJson
    let extras = a.mentionedUsersJson == b.mentionedUsersJson
        && a.callSummaryJson == b.callSummaryJson && a.effectFlags == b.effectFlags
    return contentAndState && attachmentsAndReactions && encryptionAndDelivery
        && sender && replyAndForward && extras
}

public actor MessagePersistenceActor {
    private let dbWriter: any DatabaseWriter

    private let writeStream: AsyncStream<WriteOperation>
    private let writeContinuation: AsyncStream<WriteOperation>.Continuation
    private var processorTask: Task<Void, Never>?

    /// The authenticated user's id. The on-device DB has no userId column and
    /// the aggregated reaction payload only flags WHICH emojis the current user
    /// reacted with (`currentUserReactions`), not the reactor's id — so the
    /// actor must know who "the current user" is to tag their reconstructed
    /// reaction with the right owner. Set by the app at auth time (see
    /// `DependencyContainer`); `nil` until then (cold-start reactions simply
    /// carry no ownership until the next refresh, never the wrong owner).
    private var currentUserId: String?

    enum WriteOperation: Sendable {
        case reconcileBatch([IncomingMessageData])
        /// Buffered ingestion of fully-decoded `APIMessage` payloads. Routes
        /// through `upsertFromAPIMessages` — the same path REST uses — so
        /// attachments, reactions, reply/forward refs, encryption flags and
        /// mentions are all persisted. The 6-field `IncomingMessageData` path
        /// below drops every one of them (a media-only or encrypted message
        /// ingested that way renders as an empty bubble — Sprint 2 RC2.2).
        case upsertAPIMessages([APIMessage])
        case batchDeliveryUpdate(conversationId: String, event: MessageEvent)
    }

    /// Minimal-data ingestion payload. Use ONLY when the caller genuinely has
    /// nothing richer than these six fields (e.g. a NotificationServiceExtension
    /// pre-persist). Any caller holding a decoded `APIMessage` MUST go through
    /// `bufferIncomingAPIMessages` instead — `reconcileBatchSync` hard-codes
    /// `attachmentsJson/reactionsJson/replyToJson = nil`, `messageType = "text"`
    /// and `isEncrypted = false`, so media / encrypted / reply messages lose
    /// their payload here.
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

    public init(dbWriter: any DatabaseWriter, currentUserId: String? = nil) {
        self.dbWriter = dbWriter
        self.currentUserId = currentUserId
        let (stream, continuation) = AsyncStream.makeStream(of: WriteOperation.self)
        self.writeStream = stream
        self.writeContinuation = continuation
        self.processorTask = nil
    }

    /// Update the authenticated user's id (login / account switch / logout=nil).
    /// Used to tag the current user's own reactions during REST ingestion so the
    /// "I reacted" highlight survives a cache reload.
    public func setCurrentUserId(_ userId: String?) {
        currentUserId = userId
    }

    // MARK: - Session quiesce (P1 Q3 — logout)

    /// Purge atomique de toute la table outbox au logout. La table outbox
    /// **n'a pas de colonne userId** (cf. `MessageDatabaseMigrations.swift`
    /// migration "outbox") — il est donc impossible de filtrer par user.
    /// Approche safe-by-construction : drop tous les rows. Décision Q3
    /// actée dans le design doc UserSession (2026-05-26). Sans ça, un
    /// message enqueued offline par user A serait envoyé sous l'identité
    /// du user B après un logout+login rapide sur le même device.
    /// Câblée depuis `DependencyContainer.wireOutboxLogoutHook`.
    public func clearOutbox() async throws {
        try await dbWriter.write { db in
            try db.execute(sql: "DELETE FROM outbox")
        }
    }

    /// Full purge of every on-device message table at logout. The persistence
    /// DB has **no userId column** on any table (cf. `MessageDatabaseMigrations`)
    /// and the file is shared across accounts, so the only safe-by-construction
    /// boundary is to drop everything. Without this, the authoritative
    /// `messages` table (received + optimistic bodies, read first by
    /// `MessageStore.loadInitialSnapshot`) would render user A's content to
    /// user B after a logout+login on the same device — the cache `msg`
    /// namespace purged by `CacheCoordinator.reset()` is a SEPARATE store.
    /// Atomic single transaction; child tables carry no FK constraints so order
    /// is irrelevant. Supersedes `clearOutbox()` on the logout path. Wired from
    /// `DependencyContainer.wireOutboxLogoutHook`.
    public func clearAllMessagesForLogout() async throws {
        try await dbWriter.write { db in
            try db.execute(sql: "DELETE FROM message_translations")
            try db.execute(sql: "DELETE FROM message_transcriptions")
            try db.execute(sql: "DELETE FROM message_audio_translations")
            try db.execute(sql: "DELETE FROM local_attachments")
            try db.execute(sql: "DELETE FROM pending_ids")
            try db.execute(sql: "DELETE FROM messages")
            try db.execute(sql: "DELETE FROM outbox")
        }
    }

    /// Retention window (days) for terminal `.exhausted` outbox rows. They are
    /// kept briefly so the user can still see / manually retry a permanently
    /// failed mutation, then GC'd — a row that hit `maxAttempts` is otherwise
    /// only ever deleted at logout, so without this the outbox grows without
    /// bound across sessions (T14).
    public static let exhaustedRetentionDays = 7

    /// Delete `.exhausted` outbox rows older than `days`, returning how many
    /// were removed. Runs once at boot (see `start()`); cheap + idempotent.
    /// Bounded retention rather than delete-on-exhaust so a recent permanent
    /// failure stays visible/retriable for a week before it is reclaimed.
    @discardableResult
    public func purgeExhaustedOlderThan(days: Int = exhaustedRetentionDays) async throws -> Int {
        let cutoff = Date().addingTimeInterval(-TimeInterval(days) * 86_400)
        return try await dbWriter.write { db in
            try OutboxRecord
                .filter(Column("status") == OutboxStatus.exhausted.rawValue)
                .filter(Column("createdAt") < cutoff)
                .deleteAll(db)
        }
    }

    /// Call after init to start the background write processor.
    public func start() {
        guard processorTask == nil else { return }
        // T14 — one-shot GC of stale terminal (`.exhausted`) outbox rows so the
        // table can't grow without bound across sessions. Fire-and-forget: a
        // failure here is non-fatal and retried next boot.
        Task { [weak self] in try? await self?.purgeExhaustedOlderThan() }
        processorTask = Task { [weak self, writeStream] in
            for await op in writeStream {
                guard let self else { break }
                switch op {
                case .reconcileBatch(let messages):
                    guard !messages.isEmpty else { continue }
                    // Post the refresh AFTER the write completes — buffer
                    // callers used to post the notification immediately on
                    // enqueue, but the worker that does the actual GRDB write
                    // runs async on this stream, so MessageStore observers
                    // fired against an empty database and silently dropped
                    // the new row. Scoped to the conversations whose rows
                    // actually changed: a re-delivered identical payload must
                    // not trigger the MessageStore → applySnapshot cascade.
                    if let changed = try? await self.reconcileBatchSync(messages),
                       !changed.isEmpty {
                        postMessageStoreRefresh(conversationIds: changed)
                    }
                case .upsertAPIMessages(let messages):
                    guard !messages.isEmpty else { continue }
                    // `upsertFromAPIMessages` posts its own refresh, scoped to
                    // the conversations with real row changes — do NOT re-post
                    // here or observers refresh twice.
                    try? await self.upsertFromAPIMessages(messages)
                case .batchDeliveryUpdate(let convId, let event):
                    if (try? await self.batchDeliverySync(conversationId: convId, event: event)) == true {
                        postMessageStoreRefresh(conversationIds: [convId])
                    }
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

    /// Flip an existing optimistic row to `.failed` after an offline-enqueue
    /// or fire-and-forget write blew up. Mirrors the `.sendFailed` branch of
    /// `applyEvent` but bypasses the state machine because the caller already
    /// knows the row never reached the network and needs a deterministic
    /// `.failed` regardless of `MessageState`'s monotone transitions.
    public func markOptimisticFailed(localId: String, reason: String) throws {
        var affectedConversationId: String?
        try dbWriter.write { db in
            guard var record = try MessageRecord.fetchOne(db, key: localId) else { return }
            affectedConversationId = record.conversationId
            record.state = .failed
            record.lastError = reason
            record.updatedAt = Date()
            record.changeVersion += 1
            try record.update(db)
        }
        if let convId = affectedConversationId {
            postMessageStoreRefresh(conversationIds: [convId])
        }
    }

    /// Journalise une tentative d'envoi (spec 2026-07-08
    /// message-send-failure-retry-flow). `attemptNumber` est monotone par
    /// message ; l'historique survit au `serverAck` pour la vue détails.
    public func recordSendAttempt(
        localId: String,
        transport: SendAttemptRecord.Transport,
        startedAt: Date,
        outcome: SendAttemptRecord.Outcome,
        errorMessage: String? = nil
    ) throws {
        try dbWriter.write { db in
            _ = try SendAttemptRecord.log(
                db,
                localId: localId,
                transport: transport,
                startedAt: startedAt,
                outcome: outcome,
                errorMessage: errorMessage
            )
        }
    }

    /// Historique des tentatives d'envoi d'un message, ordonné par tentative.
    /// `messageId` accepte indifféremment le `localId` (`cid_…`) ou le
    /// `serverId` (la vue détails ne connaît que `message.id`, qui bascule sur
    /// l'id serveur après réconciliation).
    public func sendAttempts(messageId: String) throws -> [SendAttemptRecord] {
        try dbWriter.read { db in
            let localId = try String.fetchOne(
                db,
                sql: "SELECT localId FROM messages WHERE localId = ? OR serverId = ? LIMIT 1",
                arguments: [messageId, messageId]
            ) ?? messageId
            return try SendAttemptRecord
                .filter(Column("localId") == localId)
                .order(Column("attemptNumber").asc)
                .fetchAll(db)
        }
    }

    public func applyEvent(localId: String, event: MessageEvent) throws -> MessageState? {
        // We need the record's conversationId outside the write block so we
        // can post a *targeted* refresh notification. MessageStore observers
        // filter notifications by conversationId — a notification without
        // one is silently dropped, leaving the bubble stuck in `.sending`.
        var affectedConversationId: String?
        var priorState: MessageState?
        let result = try dbWriter.write { db -> MessageState? in
            guard var record = try MessageRecord.fetchOne(db, key: localId) else {
                // Record missing — most common cause of the ⏱→✓ flow
                // breaking. The optimistic insert either failed silently
                // (PK collision) or was reconciled away by the socket
                // path before this applyEvent ran. Caller's `try?` would
                // hide the nil return otherwise.
                Logger.messages.error("[StateMachine] applyEvent localId=\(localId) event=\(String(describing: event)) → record NOT FOUND in GRDB")
                return nil
            }
            affectedConversationId = record.conversationId
            priorState = record.state

            var machine = MessageStateMachine(
                state: record.state,
                retryCount: record.retryCount,
                serverId: record.serverId,
                lastError: record.lastError,
                deliveredAt: record.deliveredAt,
                readAt: record.readAt
            )

            guard let newState = machine.apply(event) else {
                // Transition rejected by the state machine — e.g. a stale
                // .serverAck arriving on an already-sent record (no-op in
                // theory but worth logging while we debug the ⏱→✓ flow).
                Logger.messages.warning("[StateMachine] applyEvent localId=\(localId) event=\(String(describing: event)) → transition REJECTED from priorState=\(String(describing: record.state))")
                return nil
            }

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
                // Purge a racing mirror row: an echo that reached
                // `upsertFromAPIMessages` BEFORE this ACK and missed the cid
                // match inserted a second row keyed on the server id
                // (localId == serverId). Now that this optimistic row
                // (localId == cid) owns the serverId, that mirror is a duplicate
                // bubble — delete it so a single row survives per serverId.
                // Guarded on `localId != serverId` so a normal received row
                // (inserted with localId == serverId) never deletes itself.
                if localId != serverId {
                    try MessageRecord.deleteOne(db, key: serverId)
                }
                // `save` (upsert) not `insert`: the socket ingestion path may
                // have already reconciled this optimistic row and written its
                // PendingIdRecord (echo racing ahead of the REST ACK). A raw
                // `insert` would hit the PK and roll back the whole state
                // transition with it.
                try PendingIdRecord(
                    localId: localId, serverId: serverId,
                    conversationId: record.conversationId, reconciledAt: nil
                ).save(db)
            }

            try record.update(db)
            return newState
        }
        // Post a refresh scoped to the record's conversation so MessageStore
        // observers actually re-read. Skip when the row was missing or the
        // transition was rejected (no DB write happened).
        if let result, let convId = affectedConversationId, let prior = priorState {
            Logger.messages.debug("[StateMachine] applyEvent localId=\(localId) event=\(String(describing: event)) → \(String(describing: prior)) → \(String(describing: result)) (conv=\(convId))")
            postMessageStoreRefresh(conversationIds: [convId])
        }
        return result
    }

    // MARK: - Outbox Reconciliation

    /// Réconcilie l'état des messages depuis l'outbox.
    ///
    /// Tout `MessageRecord` encore `.sending` ou `.queued` dont le record
    /// outbox `.sendMessage` correspondant est `.exhausted` passe `.failed`.
    /// Sans ça, un message dont les tentatives d'envoi s'épuisent pendant que
    /// la conversation est fermée — aucun `ConversationViewModel` vivant abonné
    /// au signal `retryExhausted` — restait bloqué sur un spinner `.sending`
    /// à la réouverture. Appelé au chargement d'une conversation : l'état
    /// affiché est ainsi toujours juste, indépendamment du cycle de vie des
    /// ViewModels.
    public func reconcileFailedFromOutbox(conversationId: String) {
        let didChange = (try? dbWriter.write { db -> Bool in
            let exhaustedLocalIds = try OutboxRecord
                .filter(Column("conversationId") == conversationId)
                .filter(Column("kind") == OutboxKind.sendMessage.rawValue)
                .filter(Column("status") == OutboxStatus.exhausted.rawValue)
                .fetchAll(db)
                .compactMap(\.messageLocalId)
            guard !exhaustedLocalIds.isEmpty else { return false }
            let stuckStates = [MessageState.sending.rawValue, MessageState.queued.rawValue]
            let updated = try MessageRecord
                .filter(exhaustedLocalIds.contains(Column("localId")))
                .filter(stuckStates.contains(Column("state")))
                .updateAll(db, Column("state").set(to: MessageState.failed.rawValue))
            return updated > 0
        }) ?? false
        if didChange {
            postMessageStoreRefresh(conversationIds: [conversationId])
        }
    }

    /// Réconcilie les lignes optimistes ORPHELINES — `.sending`/`.queued` sans
    /// `serverId` ET sans record outbox vivant (pending/inflight/failed) qui
    /// les rejouerait. Ces lignes naissent quand le process est tué (ou la
    /// Task d'envoi annulée) entre l'insert optimiste et la transition
    /// `serverAck`/`sendFailed` : aucun chemin ne les fera jamais évoluer, et
    /// l'utilisateur revoyait l'horloge `.sending` à CHAQUE réouverture de la
    /// conversation, indéfiniment. Passées `.failed`, elles exposent enfin
    /// l'affordance de retry manuel. La fenêtre de grâce évite de faucher un
    /// envoi légitimement en vol pendant que l'écran se rouvre.
    ///
    /// Complète `reconcileFailedFromOutbox` (qui ne couvre que les outbox
    /// `.exhausted`) ; appelé au même point du chargement de conversation.
    public func reconcileOrphanedSendingRows(
        conversationId: String,
        olderThan age: TimeInterval = 120
    ) {
        let cutoff = Date().addingTimeInterval(-age)
        let didChange = (try? dbWriter.write { db -> Bool in
            let stuckStates = [MessageState.sending.rawValue, MessageState.queued.rawValue]
            let stuckIds = try MessageRecord
                .filter(Column("conversationId") == conversationId)
                .filter(stuckStates.contains(Column("state")))
                .filter(Column("serverId") == nil)
                .filter(Column("createdAt") < cutoff)
                .fetchAll(db)
                .map(\.localId)
            guard !stuckIds.isEmpty else { return false }

            let liveStatuses = [
                OutboxStatus.pending.rawValue,
                OutboxStatus.inflight.rawValue,
                OutboxStatus.failed.rawValue
            ]
            let liveOutboxLocalIds = Set(try OutboxRecord
                .filter(Column("conversationId") == conversationId)
                .filter(Column("kind") == OutboxKind.sendMessage.rawValue)
                .filter(liveStatuses.contains(Column("status")))
                .fetchAll(db)
                .compactMap(\.messageLocalId))

            let orphanIds = stuckIds.filter { !liveOutboxLocalIds.contains($0) }
            guard !orphanIds.isEmpty else { return false }
            let updated = try MessageRecord
                .filter(orphanIds.contains(Column("localId")))
                .updateAll(db, Column("state").set(to: MessageState.failed.rawValue))
            return updated > 0
        }) ?? false
        if didChange {
            postMessageStoreRefresh(conversationIds: [conversationId])
        }
    }

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
    public func bufferIncomingAPIMessages(_ messages: [APIMessage]) {
        writeContinuation.yield(.upsertAPIMessages(messages))
    }

    public func bufferBatchDelivery(conversationId: String, event: MessageEvent) {
        // Notification is posted by the worker AFTER the GRDB write completes
        // (see `start()`).
        writeContinuation.yield(.batchDeliveryUpdate(conversationId: conversationId, event: event))
    }

    /// Returns the conversations where a row was actually written, so the
    /// worker only posts refreshes for real changes — a re-delivered payload
    /// that matches the stored row must not dirty it (`changeVersion` bump)
    /// nor trigger the MessageStore → applySnapshot reconfigure cascade.
    private func reconcileBatchSync(_ messages: [IncomingMessageData]) throws -> Set<String> {
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
                    changedConvIds.insert(msg.conversationId)
                }
            }
            return changedConvIds
        }
    }

    /// Returns whether any row actually transitioned, so the worker only
    /// posts a refresh for real changes — delivery/read events routinely
    /// target conversations whose rows are already past the transition.
    private func batchDeliverySync(conversationId: String, event: MessageEvent) throws -> Bool {
        // Read frontier carried by the event (the peer's read/deliver moment).
        // A message created AFTER it cannot have been received/read yet, so it
        // must be skipped — otherwise a message sent right after the peer read
        // would falsely advance to delivered/read. Mirrors the frontier guard in
        // ConversationSyncEngine.applyReadReceipt (the cache path).
        let frontier: Date? = {
            switch event {
            case .delivered(_, let at): return at
            case .readBy(_, let at): return at
            default: return nil
            }
        }()
        return try dbWriter.write { db -> Bool in
            let records = try MessageRecord
                .filter(Column("conversationId") == conversationId)
                .filter([MessageState.sending.rawValue, MessageState.sent.rawValue]
                    .contains(Column("state")))
                .fetchAll(db)

            var didChange = false
            for var record in records {
                if let frontier, record.createdAt > frontier { continue }
                var machine = MessageStateMachine(
                    state: record.state, retryCount: record.retryCount,
                    serverId: record.serverId
                )
                if let _ = machine.apply(event) {
                    record.state = machine.state
                    record.deliveredAt = machine.deliveredAt
                    record.readAt = machine.readAt
                    // The caller (ConversationSocketHandler) only feeds this batch
                    // a delivered/read event once the WHOLE group has received /
                    // read (all-or-nothing). This path advances `state` but does
                    // NOT carry per-row counters, so stamp the unambiguous "all"
                    // markers the display resolver trusts — otherwise a real-time
                    // group delivery/read would transiently regress to a single
                    // check until the sibling counters write lands.
                    if machine.state == .read {
                        let at = machine.readAt ?? Date()
                        record.readByAllAt = at
                        record.deliveredToAllAt = record.deliveredToAllAt ?? machine.deliveredAt ?? at
                    } else if machine.state == .delivered {
                        record.deliveredToAllAt = machine.deliveredAt ?? Date()
                    }
                    record.updatedAt = Date()
                    record.changeVersion += 1
                    try record.update(db)
                    didChange = true
                }
            }
            return didChange
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

    /// Slack for the `markEdited` ordering guard — see its comment for why a
    /// strict `<` is unsafe across a GRDB `Date` round-trip.
    private static let editOrderingTolerance: TimeInterval = 0.05

    public func markEdited(localId: String, newContent: String, editedAt: Date) throws {
        var affectedConversationId: String?
        var didApply = false
        try dbWriter.write { db in
            guard let existing = try MessageRecord
                .filter(Column("localId") == localId || Column("serverId") == localId)
                .fetchOne(db)
            else { return }
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
                return
            }
            affectedConversationId = existing.conversationId
            try db.execute(
                sql: """
                    UPDATE messages SET content = ?, isEdited = 1, editedAt = ?,
                    updatedAt = ?, changeVersion = changeVersion + 1
                    WHERE localId = ? OR serverId = ?
                    """,
                arguments: [newContent, editedAt, Date(), localId, localId]
            )
            didApply = true
        }
        if didApply, let convId = affectedConversationId {
            postMessageStoreRefresh(conversationIds: [convId])
        }
    }

    public func markDeleted(localId: String, deletedAt: Date) throws {
        var affectedConversationId: String?
        try dbWriter.write { db in
            affectedConversationId = try MessageRecord
                .filter(Column("localId") == localId || Column("serverId") == localId)
                .fetchOne(db)?.conversationId
            try db.execute(
                sql: """
                    UPDATE messages SET deletedAt = ?, content = NULL,
                    updatedAt = ?, changeVersion = changeVersion + 1
                    WHERE localId = ? OR serverId = ?
                    """,
                arguments: [deletedAt, Date(), localId, localId]
            )
        }
        if let convId = affectedConversationId {
            postMessageStoreRefresh(conversationIds: [convId])
        }
    }

    /// Undo a soft-delete, restoring the message to a non-deleted state.
    /// Used as the optimistic rollback when a delete network call fails.
    public func markUndeleted(localId: String) throws {
        var affectedConversationId: String?
        try dbWriter.write { db in
            affectedConversationId = try MessageRecord
                .filter(Column("localId") == localId)
                .fetchOne(db)?.conversationId
            try db.execute(
                sql: """
                    UPDATE messages SET deletedAt = NULL,
                    updatedAt = ?, changeVersion = changeVersion + 1 WHERE localId = ?
                    """,
                arguments: [Date(), localId]
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
                .filter(Column("localId") == localId)
                .fetchOne(db)?.conversationId
            try db.execute(
                sql: """
                    UPDATE messages SET pinnedAt = ?, pinnedBy = ?,
                    updatedAt = ?, changeVersion = changeVersion + 1 WHERE localId = ?
                    """,
                arguments: [pinnedAt, pinnedBy, Date(), localId]
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
                    SET content = ?,
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
        guard let oldAtts = try? decoder.decode([MeeshyMessageAttachment].self, from: oldJson),
              let newAtts = try? decoder.decode([MeeshyMessageAttachment].self, from: newJson),
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
                .filter(Column("localId") == localId)
                .fetchOne(db)?.conversationId
            try db.execute(
                sql: """
                    UPDATE messages SET attachmentsJson = ?,
                    updatedAt = ?, changeVersion = changeVersion + 1
                    WHERE localId = ?
                    """,
                arguments: [attachmentsJson, Date(), localId]
            )
        }
        if let convId = affectedConversationId {
            postMessageStoreRefresh(conversationIds: [convId])
        }
    }


    /// Append a reaction to a persisted message, deduplicating by emoji+participantId.
    /// The GRDB change triggers store observation so the view re-renders.
    /// Appends a reaction row to a message.
    ///
    /// `maxCount` is an optional authoritative cap on the number of rows for
    /// `emoji` (the server's `aggregation.count` from a `reaction:added`
    /// broadcast). When set, the append is skipped if the message already holds
    /// `maxCount` rows for that emoji — this stops a server echo of the user's
    /// OWN reaction (keyed by the resolved `Participant.id`) from double-counting
    /// on top of the optimistic row (keyed by the `currentUserId` sentinel),
    /// which made a single tap render as "2". `nil` (the default) keeps the
    /// legacy unbounded behaviour for the optimistic and rollback write paths.
    public func appendReaction(localId: String, reactionId: String,
                                messageId: String, participantId: String?,
                                emoji: String, maxCount: Int? = nil) throws {
        var affectedConversationId: String?
        var didMutate = false
        try dbWriter.write { db in
            guard var record = try MessageRecord
                .filter(Column("localId") == localId || Column("serverId") == localId)
                .fetchOne(db) else { return }
            affectedConversationId = record.conversationId
            var reactions = (try? JSONDecoder().decode([MeeshyReaction].self,
                                from: record.reactionsJson ?? Data())) ?? []
            let alreadyExists = reactions.contains {
                $0.emoji == emoji && $0.participantId == participantId
            }
            guard !alreadyExists else { return }
            if let cap = maxCount {
                let currentEmojiCount = reactions.filter { $0.emoji == emoji }.count
                guard currentEmojiCount < cap else { return }
            }
            let reaction = MeeshyReaction(id: reactionId, messageId: messageId,
                                          participantId: participantId, emoji: emoji)
            reactions.append(reaction)
            record.reactionsJson = try JSONEncoder().encode(reactions)
            record.reactionCount = reactions.count
            record.updatedAt = Date()
            record.changeVersion += 1
            try record.update(db)
            didMutate = true
        }
        if didMutate, let convId = affectedConversationId {
            postMessageStoreRefresh(conversationIds: [convId])
        }
    }

    /// Remove a reaction from a persisted message, matched by emoji+participantId.
    /// The GRDB change triggers store observation so the view re-renders.
    public func removeReaction(localId: String, emoji: String, participantId: String?) throws {
        var affectedConversationId: String?
        var didMutate = false
        try dbWriter.write { db in
            guard var record = try MessageRecord
                .filter(Column("localId") == localId || Column("serverId") == localId)
                .fetchOne(db) else { return }
            affectedConversationId = record.conversationId
            var reactions = (try? JSONDecoder().decode([MeeshyReaction].self,
                                from: record.reactionsJson ?? Data())) ?? []
            let countBefore = reactions.count
            reactions.removeAll { $0.emoji == emoji && $0.participantId == participantId }
            guard reactions.count != countBefore else { return }
            record.reactionsJson = try JSONEncoder().encode(reactions)
            record.reactionCount = reactions.count
            record.updatedAt = Date()
            record.changeVersion += 1
            try record.update(db)
            didMutate = true
        }
        if didMutate, let convId = affectedConversationId {
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
            guard var attachments = try? decoder.decode([MeeshyMessageAttachment].self, from: data),
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

            record.attachmentsJson = try? encoder.encode(attachments)
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
        var affectedConversationId: String?
        try dbWriter.write { db in
            affectedConversationId = try MessageRecord
                .filter(Column("localId") == localId)
                .fetchOne(db)?.conversationId
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
        if let convId = affectedConversationId {
            postMessageStoreRefresh(conversationIds: [convId])
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
            let pendingReactionMessageIds: Set<String> = {
                guard let rows = try? OutboxRecord
                    .filter(Column("kind") == OutboxKind.sendReaction.rawValue)
                    .filter(Column("status") == OutboxStatus.pending.rawValue)
                    .fetchAll(db) else { return [] }
                let payloadDecoder = JSONDecoder()
                payloadDecoder.dateDecodingStrategy = .iso8601
                var ids = Set<String>()
                for row in rows {
                    if let payload = try? payloadDecoder.decode(ReactionOutboxPayload.self, from: row.payload) {
                        ids.insert(payload.messageId)
                    }
                }
                return ids
            }()
            // S2 — message ids whose edit/delete is still pending in the outbox.
            // Their local content/editedAt/deletedAt hold an optimistic mutation
            // not yet on the server, so a stale REST snapshot must NOT clobber
            // them — otherwise the edit reverts to the old text / the delete
            // un-deletes until the outbox drains (or forever if exhausted).
            // Mirrors the reaction guard above (one query each per batch).
            let pendingEditMessageIds: Set<String> = {
                guard let rows = try? OutboxRecord
                    .filter(Column("kind") == OutboxKind.editMessage.rawValue)
                    .filter(Column("status") == OutboxStatus.pending.rawValue)
                    .fetchAll(db) else { return [] }
                let payloadDecoder = JSONDecoder()
                payloadDecoder.dateDecodingStrategy = .iso8601
                var ids = Set<String>()
                for row in rows {
                    if let payload = try? payloadDecoder.decode(OfflineEditPayload.self, from: row.payload) {
                        ids.insert(payload.messageId)
                    }
                }
                return ids
            }()
            let pendingDeleteMessageIds: Set<String> = {
                guard let rows = try? OutboxRecord
                    .filter(Column("kind") == OutboxKind.deleteMessage.rawValue)
                    .filter(Column("status") == OutboxStatus.pending.rawValue)
                    .fetchAll(db) else { return [] }
                let payloadDecoder = JSONDecoder()
                payloadDecoder.dateDecodingStrategy = .iso8601
                var ids = Set<String>()
                for row in rows {
                    if let payload = try? payloadDecoder.decode(OfflineDeletePayload.self, from: row.payload) {
                        ids.insert(payload.messageId)
                    }
                }
                return ids
            }()
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
                            width: apiAtt.width,
                            height: apiAtt.height,
                            thumbnailUrl: apiAtt.thumbnailUrl,
                            thumbHash: apiAtt.thumbHash,
                            duration: apiAtt.duration,
                            uploadedBy: api.senderId,
                            latitude: apiAtt.latitude,
                            longitude: apiAtt.longitude,
                            thumbnailColor: thumbColor,
                            transcription: embeddedTranscription,
                            audioTranslations: embeddedAudioTranslations,
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
                    return try? encoder.encode(ui)
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
                let reactionsJson: Data? = uiReactions.isEmpty ? nil : try? encoder.encode(uiReactions)

                let replyToJson: Data? = {
                    // Réponse à un post : snapshot figé `postReplyTo` (survit à
                    // l'expiration). On construit un ReplyReference riche pour la
                    // citation (mood : emoji+contenu+date ; story : aperçu+compteurs).
                    if let story = api.postReplyTo {
                        let trimmed = story.previewText.trimmingCharacters(in: .whitespacesAndNewlines)
                        // Réponse à un mood : rendu dédié (emoji + contenu + date).
                        if let emoji = story.moodEmoji {
                            let ref = ReplyReference(
                                messageId: story.id,
                                authorName: "",
                                previewText: trimmed,
                                isMe: false,
                                isStoryReply: true,
                                storyPublishedAt: story.createdAt,
                                moodEmoji: emoji
                            )
                            return try? encoder.encode(ref)
                        }
                        let ref = ReplyReference(
                            messageId: story.id,
                            authorName: "",
                            previewText: trimmed.isEmpty ? "\u{1F4F7} Story" : trimmed,
                            isMe: false,
                            isStoryReply: true,
                            storyPublishedAt: story.createdAt,
                            storyReactionCount: story.reactionCount,
                            storyCommentCount: story.commentCount,
                            storyShareCount: story.shareCount,
                            storyThumbnailUrl: story.thumbnailUrl
                        )
                        return try? encoder.encode(ref)
                    }
                    // Réponse à un message : chemin historique inchangé.
                    return api.replyTo.flatMap { reply in
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
                }()

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

                // Structured call-summary metadata for system call messages —
                // persisted so the rich call bubble survives a cache reload.
                let callSummaryJson: Data? = api.callSummary.flatMap { try? encoder.encode($0) }

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
                    // Update mutable fields; preserve layout cache.
                    if !keepLocalPlaintext && !pendingEdit && !pendingDelete {
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
                        existing.editedAt = nil
                    }
                    if !pendingDelete {
                        existing.deletedAt = api.deletedAt
                    }
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
                    existing.deliveredCount = deliveredCount
                    existing.readCount = readCount
                    // `deliveredToAllAt` / `readByAllAt` are the unambiguous
                    // "every recipient has received / read" markers that the live
                    // all-or-nothing path stamps locally (and that the delivery
                    // resolver trusts). Coalesce rather than hard-assign so a REST
                    // refresh — which currently returns null for these (the
                    // gateway no longer computes them under the cursor model) —
                    // never CLEARS a marker the live path already confirmed. A
                    // genuine server value, if ever provided, still wins.
                    existing.deliveredToAllAt = api.deliveredToAllAt ?? existing.deliveredToAllAt
                    existing.readByAllAt = api.readByAllAt ?? existing.readByAllAt
                    // Authoritative recipient denominator: adopt a positive server
                    // value, but never let a refresh that omits it (socket-origin
                    // row, older gateway) clear a count already learned.
                    if let rc = api.recipientCount, rc > 0 { existing.recipientCount = rc }
                    existing.state = max(existing.state, computedState)
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
                    existing.replyToJson = replyToJson ?? existing.replyToJson
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
                    existing.callSummaryJson = callSummaryJson ?? existing.callSummaryJson
                    existing.effectFlags = effectFlags
                    // Write ONLY when something actually changed: either a
                    // mirrored field differs from the pre-mutation snapshot,
                    // or the server reports a newer `updatedAt` (it may bump
                    // it for fields we don't mirror here, and the bubble's
                    // Equatable gate keys on `updatedAt` for content/edit
                    // invalidation). A byte-identical echo writes nothing and
                    // posts no refresh — killing the redundant full-list
                    // reconfigure that every duplicate delivery used to cost.
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
                        changeVersion: 0,
                        callSummaryJson: callSummaryJson,
                        recipientCount: api.recipientCount ?? 0
                    )
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
                if let apiTranslations = api.translations, !apiTranslations.isEmpty {
                    let now = Date()
                    for t in apiTranslations {
                        let record = TranslationRecord(
                            id: t.id,
                            messageLocalId: api.id,
                            messageServerId: api.id,
                            targetLanguage: t.targetLanguage,
                            translatedContent: t.translatedContent,
                            translationModel: t.translationModel,
                            confidenceScore: t.confidenceScore,
                            sourceLanguage: t.sourceLanguage,
                            receivedAt: now
                        )
                        try record.save(db)
                    }
                }
            }
            return changedConvIds
        }
        if !changedConvIds.isEmpty {
            postMessageStoreRefresh(conversationIds: changedConvIds)
        }
    }

    /// Delete all message records for a conversation (called on 403/access revoked).
    public func deleteAll(conversationId: String) async throws {
        try await dbWriter.write { db in
            _ = try MessageRecord
                .filter(Column("conversationId") == conversationId)
                .deleteAll(db)
        }
        // Post a refresh notification scoped to the affected conversation so
        // MessageStore observers re-read and clear the now-deleted rows from
        // their in-memory caches. Without this the UI still renders the
        // revoked conversation's messages until the user navigates away.
        postMessageStoreRefresh(conversationIds: [conversationId])
    }

    /// Delete ephemeral messages whose expiry has passed.
    public func deleteExpiredEphemeral(before: Date) async throws {
        // Collect the affected conversationIds BEFORE the delete so we can
        // post one targeted refresh per conversation. A single sweep may
        // touch multiple conversations at once, and MessageStore observers
        // filter notifications by conversationId — posting nothing leaves
        // expired rows rendering until the conversation reloads from
        // another path. We return the set from the write closure rather
        // than mutating an outer var (Swift 6 strict concurrency rejects
        // the latter inside a Sendable closure).
        let affectedConvIds: Set<String> = try await dbWriter.write { db in
            let expired = try MessageRecord
                .filter(Column("expiresAt") != nil)
                .filter(Column("expiresAt") <= before)
                .fetchAll(db)
            let ids = Set(expired.map { $0.conversationId })
            try MessageRecord
                .filter(Column("expiresAt") != nil)
                .filter(Column("expiresAt") <= before)
                .deleteAll(db)
            return ids
        }
        if !affectedConvIds.isEmpty {
            postMessageStoreRefresh(conversationIds: affectedConvIds)
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
        var affectedConversationId: String?
        var didMutate = false
        try dbWriter.write { db in
            guard var record = try MessageRecord.fetchOne(db, key: localId) else { return }
            guard deliveredCount > record.deliveredCount
                || readCount > record.readCount
                || (deliveredToAllAt != nil && record.deliveredToAllAt == nil)
                || (readByAllAt != nil && record.readByAllAt == nil)
            else { return }
            affectedConversationId = record.conversationId
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
            didMutate = true
        }
        if didMutate, let convId = affectedConversationId {
            postMessageStoreRefresh(conversationIds: [convId])
        }
    }

    // MARK: - Retention Policy

    /// Default retention period for locally cached messages.
    /// Messages older than this are purged on app launch to keep the database
    /// lean. The server remains the authoritative source — purged messages
    /// can be re-fetched on demand via pagination.
    public static let defaultRetentionMonths: Int = 6

    /// Deletes all message records whose `createdAt` is older than
    /// `retentionMonths` months from now. Also removes associated rows in
    /// `message_translations` and `translation_cache` to avoid orphans.
    ///
    /// Returns the number of message rows deleted so callers can log it.
    ///
    /// - Parameter retentionMonths: How many months of history to keep.
    ///   Defaults to ``defaultRetentionMonths`` (6).
    @discardableResult
    public func purgeOldMessages(retentionMonths: Int = defaultRetentionMonths) async throws -> Int {
        let calendar = Calendar.current
        guard let cutoff = calendar.date(byAdding: .month, value: -retentionMonths, to: Date()) else {
            return 0
        }

        let (deletedCount, affectedConvIds): (Int, Set<String>) = try await dbWriter.write { db in
            // Collect affected conversation IDs before deleting so we can post
            // targeted refresh notifications.
            let affected = try String.fetchSet(db, sql: """
                SELECT DISTINCT conversationId FROM messages
                WHERE createdAt < ?
            """, arguments: [cutoff])

            // Collect message IDs for cascade cleanup of translation tables
            let expiredIds = try String.fetchAll(db, sql: """
                SELECT localId FROM messages WHERE createdAt < ?
            """, arguments: [cutoff])

            if !expiredIds.isEmpty {
                // Delete associated translation cache entries
                let placeholders = expiredIds.map { _ in "?" }.joined(separator: ",")
                try db.execute(
                    sql: "DELETE FROM translation_cache WHERE messageId IN (\(placeholders))",
                    arguments: StatementArguments(expiredIds)
                )

                // Delete message_translations if the table exists
                if try db.tableExists("message_translations") {
                    try db.execute(
                        sql: "DELETE FROM message_translations WHERE messageId IN (\(placeholders))",
                        arguments: StatementArguments(expiredIds)
                    )
                }
            }

            // Delete the messages themselves
            let count = try MessageRecord
                .filter(Column("createdAt") < cutoff)
                .deleteAll(db)

            return (count, affected)
        }

        if !affectedConvIds.isEmpty {
            postMessageStoreRefresh(conversationIds: affectedConvIds)
        }

        return deletedCount
    }

    deinit {
        writeContinuation.finish()
        processorTask?.cancel()
    }
}
