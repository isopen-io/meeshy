import XCTest
import Combine
import GRDB
import MeeshySDK
@testable import Meeshy

/// Integration test: sendMessage -> optimistic update -> confirmation -> finalized
@MainActor
final class MessageSendFlowTests: XCTestCase {

    // MARK: - Helpers

    private func makeConversation(id: String = "000000000000000000000002") -> Conversation {
        Conversation(id: id, identifier: id, type: .direct, title: "Test Convo", lastMessageAt: Date(), createdAt: Date(), updatedAt: Date())
    }

    private func makeMessageService() -> MockMessageService {
        MockMessageService()
    }

    private func makeMessageSocket() -> MockMessageSocket {
        MockMessageSocket()
    }

    // MARK: - Send via REST

    func test_sendMessage_callsServiceWithContent() async {
        let service = makeMessageService()
        let convId = "000000000000000000000002"

        service.sendResult = .success(JSONStub.decode("""
        {"id":"000000000000000000000010","conversationId":"\(convId)","senderId":"000000000000000000000001","content":"Hello world","createdAt":"2026-01-01T00:00:00.000Z"}
        """))

        let result = try? await service.send(
            conversationId: convId,
            request: SendMessageRequest(content: "Hello world")
        )

        XCTAssertEqual(service.sendCallCount, 1)
        XCTAssertEqual(service.lastSendConversationId, convId)
        XCTAssertNotNil(result)
        XCTAssertEqual(result?.id, "000000000000000000000010")
    }

    func test_sendMessage_failure_propagatesError() async {
        let service = makeMessageService()
        service.sendResult = .failure(NSError(domain: "test", code: 500, userInfo: [NSLocalizedDescriptionKey: "Server error"]))

        do {
            _ = try await service.send(
                conversationId: "conv123",
                request: SendMessageRequest(content: "Hello")
            )
            XCTFail("Expected error to be thrown")
        } catch {
            XCTAssertEqual(service.sendCallCount, 1)
        }
    }

    // MARK: - Socket message receipt simulation

    func test_socketReceivesMessage_publishesOnSubject() {
        let socket = makeMessageSocket()
        var received: [APIMessage] = []
        let cancellable = socket.messageReceived.sink { msg in
            received.append(msg)
        }

        let apiMessage: APIMessage = JSONStub.decode("""
        {"id":"msg001","conversationId":"conv001","senderId":"user001","content":"Socket hello","createdAt":"2026-01-01T00:00:00.000Z"}
        """)
        socket.simulateMessage(apiMessage)

        XCTAssertEqual(received.count, 1)
        XCTAssertEqual(received.first?.content, "Socket hello")
        cancellable.cancel()
    }

    // MARK: - Edit message flow

    func test_editMessage_callsServiceAndReturnsUpdated() async {
        let service = makeMessageService()
        service.editResult = .success(JSONStub.decode("""
        {"id":"msg001","conversationId":"conv001","senderId":"user001","content":"Edited content","isEdited":true,"createdAt":"2026-01-01T00:00:00.000Z"}
        """))

        let result = try? await service.edit(messageId: "msg001", content: "Edited content")

        XCTAssertEqual(service.editCallCount, 1)
        XCTAssertEqual(service.lastEditMessageId, "msg001")
        XCTAssertEqual(service.lastEditContent, "Edited content")
        XCTAssertEqual(result?.content, "Edited content")
    }

    // MARK: - Delete message flow

    func test_deleteMessage_callsServiceSuccessfully() async {
        let service = makeMessageService()
        service.deleteResult = .success(())

        do {
            try await service.delete(conversationId: "conv001", messageId: "msg001")
            XCTAssertEqual(service.deleteCallCount, 1)
            XCTAssertEqual(service.lastDeleteMessageId, "msg001")
        } catch {
            XCTFail("Delete should not throw: \(error)")
        }
    }

    // MARK: - Socket send with attachments

    func test_sendWithAttachments_incrementsCallCount() {
        let socket = makeMessageSocket()
        socket.sendWithAttachments(
            conversationId: "conv001",
            content: "Photo",
            attachmentIds: ["att001"],
            replyToId: nil,
            storyReplyToId: nil,
            originalLanguage: "fr",
            isEncrypted: false
        )

        XCTAssertEqual(socket.sendWithAttachmentsCallCount, 1)
    }

    // MARK: - Task 1.5 — optimistic send through persistence + store observation

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

// MARK: - Factory (Task 1.5)

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
