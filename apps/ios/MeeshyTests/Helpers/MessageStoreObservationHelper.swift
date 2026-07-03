// apps/ios/MeeshyTests/Helpers/MessageStoreObservationHelper.swift
//
// Helper utilities for tests that interact with the GRDB-backed
// `MessagePersistenceActor` -> `MessageStore` -> `ConversationViewModel`
// pipeline (post Phase 1.5 store-only architecture).
//
// The pipeline involves several async hops:
//   1. Test writes a `MessageRecord` via persistence actor
//   2. Actor posts `messageStoreShouldRefresh` notification on main queue
//   3. `MessageStore` re-fetches DB, mutates `messages`, fires `messagesDidChange`
//   4. `ConversationViewModel.subscribeToMessageStore` dispatches via
//      `DispatchQueue.main.async` and replaces `@Published var messages`
//
// Each hop crosses at least one runloop tick, so tests must poll with a
// short timeout instead of asserting synchronously.

import XCTest
import Foundation
import GRDB
@testable import MeeshySDK
@testable import Meeshy

@MainActor
enum MessageStoreObservationHelper {

    // MARK: - In-memory database

    /// Build a fresh in-memory GRDB queue with all migrations applied.
    /// Each test should create its own isolated database.
    static func makeInMemoryDatabase() throws -> DatabaseQueue {
        let db = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: db)
        return db
    }

    // MARK: - Record factory

    /// Build a `MessageRecord` with sensible defaults for tests. Caller can
    /// override any field; defaults match a typical text message in the
    /// `.delivered` state (so it shows up in the store immediately).
    static func makeRecord(
        localId: String,
        conversationId: String,
        senderId: String = "other-user",
        content: String? = "Hello",
        state: MessageState = .delivered,
        createdAt: Date = Date(),
        deliveryStatus: DeliveryStatusInputs = .init(),
        reactions: [MeeshyReaction] = [],
        pinnedAt: Date? = nil,
        pinnedBy: String? = nil,
        isEdited: Bool = false,
        editedAt: Date? = nil,
        deletedAt: Date? = nil,
        expiresAt: Date? = nil,
        messageSource: String = "user"
    ) -> MessageRecord {
        let reactionsJson: Data? = reactions.isEmpty ? nil : try? JSONEncoder().encode(reactions)
        return MessageRecord(
            localId: localId,
            serverId: nil,
            conversationId: conversationId,
            senderId: senderId,
            content: content,
            originalLanguage: "fr",
            messageType: "text",
            messageSource: messageSource,
            contentType: "text",
            state: state,
            retryCount: 0,
            lastError: nil,
            isEncrypted: false,
            encryptionMode: nil,
            encryptedPayload: nil,
            replyToId: nil,
            storyReplyToId: nil,
            forwardedFromId: nil,
            forwardedFromConversationId: nil,
            replyToJson: nil,
            forwardedFromJson: nil,
            expiresAt: expiresAt,
            effectFlags: 0,
            maxViewOnceCount: nil,
            viewOnceCount: 0,
            isEdited: isEdited,
            editedAt: editedAt,
            deletedAt: deletedAt,
            pinnedAt: pinnedAt,
            pinnedBy: pinnedBy,
            senderName: nil,
            senderUsername: nil,
            senderColor: nil,
            senderAvatarURL: nil,
            deliveredCount: deliveryStatus.deliveredCount,
            readCount: deliveryStatus.readCount,
            deliveredToAllAt: deliveryStatus.deliveredToAllAt,
            readByAllAt: deliveryStatus.readByAllAt,
            createdAt: createdAt,
            sentAt: nil,
            deliveredAt: nil,
            readAt: nil,
            updatedAt: createdAt,
            attachmentsJson: nil,
            reactionsJson: reactionsJson,
            reactionCount: reactions.count,
            currentUserReactionsJson: nil,
            mentionedUsersJson: nil,
            cachedBubbleWidth: nil,
            cachedBubbleHeight: nil,
            cachedLastLineWidth: nil,
            cachedLineCount: nil,
            cachedTimestampInline: nil,
            layoutVersion: 0,
            layoutMaxWidth: nil,
            changeVersion: 0
        )
    }

    /// Convenience inputs for the delivery counters on a `MessageRecord`.
    struct DeliveryStatusInputs {
        var deliveredCount: Int = 0
        var readCount: Int = 0
        var deliveredToAllAt: Date? = nil
        var readByAllAt: Date? = nil
    }

    // MARK: - Insert through actor

    /// Insert a record via the persistence actor. The actor posts the
    /// `messageStoreShouldRefresh` notification synchronously on commit, so
    /// callers must wait for the propagation to surface in the store/view.
    static func insertRecord(
        _ record: MessageRecord,
        into actor: MessagePersistenceActor
    ) async throws {
        try await actor.insertOptimistic(record)
    }

    // MARK: - Wait helpers

    /// Default timeout used by the `await*` helpers. Long enough to absorb
    /// the two main-runloop hops + a comfortable safety margin without
    /// blowing test runtime when a condition is never met.
    static let defaultTimeout: TimeInterval = 1.5

    /// Poll until `condition()` returns `true` or `timeout` elapses.
    /// Returns the final value of `condition()` so callers can assert.
    static func awaitCondition(
        timeout: TimeInterval = defaultTimeout,
        pollInterval: UInt64 = 30_000_000, // 30 ms
        _ condition: () -> Bool
    ) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if condition() { return true }
            try? await Task.sleep(nanoseconds: pollInterval)
        }
        return condition()
    }

    /// Poll the `ConversationViewModel.messages` array for a matching message.
    /// Resolves to the first message satisfying `predicate`, or `nil` on timeout.
    static func awaitMessage(
        in viewModel: ConversationViewModel,
        timeout: TimeInterval = defaultTimeout,
        where predicate: (Message) -> Bool
    ) async -> Message? {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if let match = viewModel.messages.first(where: predicate) {
                return match
            }
            try? await Task.sleep(nanoseconds: 30_000_000)
        }
        return viewModel.messages.first(where: predicate)
    }

    /// Wait until `viewModel.messages.count == expectedCount`.
    /// Returns `true` if the count matches before timeout.
    @discardableResult
    static func awaitMessagesCount(
        equals expectedCount: Int,
        in viewModel: ConversationViewModel,
        timeout: TimeInterval = defaultTimeout
    ) async -> Bool {
        await awaitCondition(timeout: timeout) {
            viewModel.messages.count == expectedCount
        }
    }

    /// Wait until the message identified by `id` is present and reflects a
    /// caller-defined property check (e.g. content edit, deletedAt set).
    @discardableResult
    static func awaitMessageProperty(
        id: String,
        in viewModel: ConversationViewModel,
        timeout: TimeInterval = defaultTimeout,
        check: (Message) -> Bool
    ) async -> Bool {
        await awaitCondition(timeout: timeout) {
            guard let msg = viewModel.messages.first(where: { $0.id == id }) else {
                return false
            }
            return check(msg)
        }
    }

    // MARK: - Direct DB readback

    /// Fetch a `MessageRecord` straight from the in-memory database. Useful
    /// when assertions need to verify the persistence side-effect even when
    /// the store observation has not yet propagated to the view model.
    static func fetchRecord(
        localId: String,
        from dbQueue: DatabaseQueue
    ) async throws -> MessageRecord? {
        try await dbQueue.read { db in
            try MessageRecord.fetchOne(db, key: localId)
        }
    }

    /// Wait for a `MessageRecord` row to satisfy `predicate` or for the
    /// timeout to elapse. Returns the matching record if found.
    static func awaitRecord(
        localId: String,
        from dbQueue: DatabaseQueue,
        timeout: TimeInterval = defaultTimeout,
        where predicate: @escaping (MessageRecord) -> Bool
    ) async -> MessageRecord? {
        let deadline = Date().addingTimeInterval(timeout)
        while Date() < deadline {
            if let record = try? await dbQueue.read({ db in
                try MessageRecord.fetchOne(db, key: localId)
            }), predicate(record) {
                return record
            }
            try? await Task.sleep(nanoseconds: 30_000_000)
        }
        return try? await dbQueue.read { db in
            try MessageRecord.fetchOne(db, key: localId)
        }
    }
}
