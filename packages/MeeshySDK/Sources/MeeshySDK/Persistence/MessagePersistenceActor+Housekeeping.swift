import Foundation
import os
import GRDB

extension MessagePersistenceActor {
    /// Delete all message records for a conversation (called on 403/access revoked).
    /// grdb-09 — cascade aux tables enfants scopées sur les messages de la
    /// conversation : une conversation révoquée ne laisse aucun orphelin.
    public func deleteAll(conversationId: String) async throws {
        try await dbWriter.write { db in
            let ids = try String.fetchAll(
                db,
                sql: "SELECT localId FROM messages WHERE conversationId = ?",
                arguments: [conversationId]
            )
            if !ids.isEmpty {
                let placeholders = ids.map { _ in "?" }.joined(separator: ",")
                try db.execute(
                    sql: "DELETE FROM message_translations WHERE messageLocalId IN (\(placeholders))",
                    arguments: StatementArguments(ids)
                )
                try db.execute(
                    sql: "DELETE FROM message_transcriptions WHERE messageLocalId IN (\(placeholders))",
                    arguments: StatementArguments(ids)
                )
                try db.execute(
                    sql: "DELETE FROM message_audio_translations WHERE messageLocalId IN (\(placeholders))",
                    arguments: StatementArguments(ids)
                )
                try db.execute(
                    sql: "DELETE FROM pending_ids WHERE localId IN (\(placeholders))",
                    arguments: StatementArguments(ids)
                )
                try db.execute(
                    sql: "DELETE FROM send_attempts WHERE localId IN (\(placeholders))",
                    arguments: StatementArguments(ids)
                )
            }
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
            try MessagePlaintextErasures.record(
                rowsMatching: "expiresAt IS NOT NULL AND expiresAt <= ?", arguments: [before], in: db
            )
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
        try updateDeliveryCounters([DeliveryCounterUpdate(
            localId: localId,
            deliveredCount: deliveredCount,
            readCount: readCount,
            deliveredToAllAt: deliveredToAllAt,
            readByAllAt: readByAllAt
        )])
    }

    /// One delivery-counter mutation for the batched
    /// `updateDeliveryCounters(_:)` — same better-only merge semantics as the
    /// single-record overload.
    public struct DeliveryCounterUpdate: Sendable {
        public let localId: String
        public let deliveredCount: Int
        public let readCount: Int
        public let deliveredToAllAt: Date?
        public let readByAllAt: Date?

        public init(
            localId: String,
            deliveredCount: Int,
            readCount: Int,
            deliveredToAllAt: Date?,
            readByAllAt: Date?
        ) {
            self.localId = localId
            self.deliveredCount = deliveredCount
            self.readCount = readCount
            self.deliveredToAllAt = deliveredToAllAt
            self.readByAllAt = readByAllAt
        }
    }

    /// Batched variant : une réconciliation de sync peut améliorer les
    /// compteurs de N messages d'un coup — N transactions + N notifications
    /// de refresh devenaient 1 + 1. Merge « better-only » identique à
    /// l'overload unitaire.
    public func updateDeliveryCounters(_ updates: [DeliveryCounterUpdate]) throws {
        guard !updates.isEmpty else { return }
        var affectedConvIds: Set<String> = []
        try dbWriter.write { db in
            for update in updates {
                guard var record = try MessageRecord.fetchOne(db, key: update.localId) else { continue }
                guard update.deliveredCount > record.deliveredCount
                    || update.readCount > record.readCount
                    || (update.deliveredToAllAt != nil && record.deliveredToAllAt == nil)
                    || (update.readByAllAt != nil && record.readByAllAt == nil)
                else { continue }
                record.deliveredCount = max(record.deliveredCount, update.deliveredCount)
                record.readCount = max(record.readCount, update.readCount)
                if let dAt = update.deliveredToAllAt, record.deliveredToAllAt == nil {
                    record.deliveredToAllAt = dAt
                }
                if let rAt = update.readByAllAt, record.readByAllAt == nil {
                    record.readByAllAt = rAt
                }
                record.updatedAt = Date()
                record.changeVersion += 1
                try record.update(db)
                affectedConvIds.insert(record.conversationId)
            }
        }
        if !affectedConvIds.isEmpty {
            postMessageStoreRefresh(conversationIds: affectedConvIds)
        }
    }
}
