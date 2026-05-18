import XCTest
import GRDB
import MeeshySDK
@testable import Meeshy

/// Integration test: an optimistic send written through `MessagePersistenceActor`
/// surfaces in `MessageStore` via GRDB observation, and subsequent lifecycle
/// events (`serverAck`, `sendFailed`) mutate the same store row in place.
@MainActor
final class MessageSendFlowTests: XCTestCase {

    /// Verifies that an optimistic send written via `MessagePersistenceActor.insertOptimistic`
    /// surfaces in the `MessageStore` via GRDB observation — and that a subsequent
    /// `applyEvent(.serverAck(...))` swaps the state to `.sent` in the same store slot.
    /// This is the invariant Task 1.5 enforces: `sendMessage` no longer appends to
    /// `self.messages` directly; the UI update flows through persistence → store → VM.
    func test_optimisticSend_appearsImmediatelyViaStore() async throws {
        let dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)
        let persistence = MessagePersistenceActor(dbWriter: dbQueue)

        let store = MessageStore(conversationId: "conv_t15_send", persistence: persistence)
        store.startObserving(dbPool: dbQueue)

        let beforeCount = store.messages.count

        let tempId = "offline_t15"
        let record = SendFlowMessageRecordFactory.make(
            localId: tempId,
            conversationId: "conv_t15_send",
            content: "hello",
            state: .sending
        )
        try await persistence.insertOptimistic(record)

        try await Task.sleep(for: .milliseconds(150))

        XCTAssertEqual(store.messages.count, beforeCount + 1)
        XCTAssertEqual(store.messages.last?.content, "hello")
        XCTAssertEqual(store.messages.last?.state, .sending)

        _ = try await persistence.applyEvent(
            localId: tempId,
            event: .serverAck(serverId: "server-t15", at: Date())
        )

        try await Task.sleep(for: .milliseconds(150))

        XCTAssertEqual(store.messages.count, beforeCount + 1,
                       "no duplicate — same row updated in place")
        XCTAssertEqual(store.messages.last?.serverId, "server-t15")
        XCTAssertEqual(store.messages.last?.state, .sent)

        store.stopObserving()
    }

    /// Verifies that a `sendFailed` event transitions the record from `.sending`
    /// to `.queued` (first retry) rather than disappearing from the store.
    func test_optimisticSend_onFailure_stateBecomesQueued() async throws {
        let dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)
        let persistence = MessagePersistenceActor(dbWriter: dbQueue)

        let store = MessageStore(conversationId: "conv_t15_fail", persistence: persistence)
        store.startObserving(dbPool: dbQueue)

        let tempId = "offline_t15_fail"
        let record = SendFlowMessageRecordFactory.make(
            localId: tempId,
            conversationId: "conv_t15_fail",
            content: "will fail",
            state: .sending
        )
        try await persistence.insertOptimistic(record)
        try await Task.sleep(for: .milliseconds(100))

        struct TestSendError: Error, Sendable { let msg: String }
        _ = try await persistence.applyEvent(
            localId: tempId,
            event: .sendFailed(TestSendError(msg: "network error"))
        )
        try await Task.sleep(for: .milliseconds(100))

        XCTAssertEqual(store.messages.count, 1, "row must remain (not removed)")
        // First failure: retryCount < maxRetries → state becomes .queued
        XCTAssertEqual(store.messages.last?.state, .queued)

        store.stopObserving()
    }
}

// MARK: - Factory

private enum SendFlowMessageRecordFactory {
    static func make(
        localId: String,
        conversationId: String,
        senderId: String = "user_me",
        content: String? = "Test",
        state: MessageState = .sending,
        createdAt: Date = Date()
    ) -> MessageRecord {
        MessageRecord(
            localId: localId,
            serverId: nil,
            conversationId: conversationId,
            senderId: senderId,
            content: content,
            originalLanguage: "fr",
            messageType: "text",
            messageSource: "user",
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
            expiresAt: nil,
            effectFlags: 0,
            maxViewOnceCount: nil,
            viewOnceCount: 0,
            isEdited: false,
            editedAt: nil,
            deletedAt: nil,
            pinnedAt: nil,
            pinnedBy: nil,
            senderName: nil,
            senderUsername: nil,
            senderColor: nil,
            senderAvatarURL: nil,
            deliveredCount: 0,
            readCount: 0,
            deliveredToAllAt: nil,
            readByAllAt: nil,
            createdAt: createdAt,
            sentAt: nil,
            deliveredAt: nil,
            readAt: nil,
            updatedAt: createdAt,
            attachmentsJson: nil,
            reactionsJson: nil,
            reactionCount: 0,
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
}
