import Foundation
import os
import GRDB

extension MessagePersistenceActor {
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
        let didChange: Bool
        do {
            didChange = try dbWriter.write { db -> Bool in
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
                .updateAll(db,
                    Column("state").set(to: MessageState.failed.rawValue),
                    // grdb-04 — invariant : toute écriture visible bump
                    // changeVersion, sinon le diff O(1) du MessageStore
                    // (Equatable localId+changeVersion) l'avale.
                    Column("changeVersion").set(to: Column("changeVersion") + 1))
            return updated > 0
            }
        } catch {
            Logger.messages.error("reconcileFailedFromOutbox write failed for conv=\(conversationId, privacy: .public), stale states left as-is: \(error.localizedDescription, privacy: .public)")
            didChange = false
        }
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
        let didChange: Bool
        do {
            didChange = try dbWriter.write { db -> Bool in
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
                .updateAll(db,
                    Column("state").set(to: MessageState.failed.rawValue),
                    Column("changeVersion").set(to: Column("changeVersion") + 1))
            return updated > 0
            }
        } catch {
            Logger.messages.error("reconcileStuckSending write failed for conv=\(conversationId, privacy: .public), stale states left as-is: \(error.localizedDescription, privacy: .public)")
            didChange = false
        }
        if didChange {
            postMessageStoreRefresh(conversationIds: [conversationId])
        }
    }
}
