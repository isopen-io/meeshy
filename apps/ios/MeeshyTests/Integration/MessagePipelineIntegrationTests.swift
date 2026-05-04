import XCTest
import GRDB
@testable import MeeshySDK
@testable import Meeshy

final class MessagePipelineIntegrationTests: XCTestCase {

    private var dbQueue: DatabaseQueue!
    private var actor: MessagePersistenceActor!

    override func setUp() async throws {
        dbQueue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: dbQueue)
        actor = MessagePersistenceActor(dbWriter: dbQueue)
    }

    @MainActor
    func test_fullSendLifecycle_stateTransitionsReachStore() async throws {
        let store = MessageStore(conversationId: "conv_int", persistence: actor)
        store.startObserving(dbPool: dbQueue)

        // 1. Insert optimistic
        let record = MessageRecordFactory.make(
            localId: "temp_int_001", conversationId: "conv_int", state: .sending)
        try await actor.insertOptimistic(record)
        try await Task.sleep(for: .milliseconds(100))

        XCTAssertEqual(store.messages.count, 1)
        XCTAssertEqual(store.messages[0].state, .sending)

        // 2. Server ACK
        _ = try await actor.applyEvent(localId: "temp_int_001",
            event: .serverAck(serverId: "srv_int", at: Date()))
        try await Task.sleep(for: .milliseconds(100))

        XCTAssertEqual(store.messages[0].state, .sent)

        // 3. Delivered
        _ = try await actor.applyEvent(localId: "temp_int_001",
            event: .delivered(count: 1, at: Date()))
        try await Task.sleep(for: .milliseconds(100))

        XCTAssertEqual(store.messages[0].state, .delivered)

        // 4. Read
        _ = try await actor.applyEvent(localId: "temp_int_001",
            event: .readBy(userId: "reader", at: Date()))
        try await Task.sleep(for: .milliseconds(100))

        XCTAssertEqual(store.messages[0].state, .read)

        // Still 1 message (no duplicates)
        XCTAssertEqual(store.messages.count, 1)

        store.stopObserving()
    }

    @MainActor
    func test_messagesSurviveStoreRecreation() async throws {
        // Insert
        let record = MessageRecordFactory.make(
            localId: "survive_001", conversationId: "conv_survive")
        try await actor.insertOptimistic(record)

        // Create store, load, verify
        let store = MessageStore(conversationId: "conv_survive", persistence: actor)
        store.startObserving(dbPool: dbQueue)
        await store.loadInitial()
        try await Task.sleep(for: .milliseconds(100))

        XCTAssertEqual(store.messages.count, 1)
        XCTAssertEqual(store.messages[0].localId, "survive_001")

        store.stopObserving()
    }

    @MainActor
    func test_editReflectedInStore() async throws {
        let store = MessageStore(conversationId: "conv_edit", persistence: actor)
        store.startObserving(dbPool: dbQueue)

        let record = MessageRecordFactory.make(
            localId: "edit_int", conversationId: "conv_edit", content: "Original")
        try await actor.insertOptimistic(record)
        try await Task.sleep(for: .milliseconds(100))

        try await actor.markEdited(localId: "edit_int", newContent: "Edited", editedAt: Date())
        try await Task.sleep(for: .milliseconds(100))

        XCTAssertEqual(store.messages[0].content, "Edited")
        XCTAssertTrue(store.messages[0].isEdited)

        store.stopObserving()
    }

    @MainActor
    func test_deleteReflectedInStore() async throws {
        let store = MessageStore(conversationId: "conv_del", persistence: actor)
        store.startObserving(dbPool: dbQueue)

        let record = MessageRecordFactory.make(
            localId: "del_int", conversationId: "conv_del", content: "Delete me")
        try await actor.insertOptimistic(record)
        try await Task.sleep(for: .milliseconds(100))

        try await actor.markDeleted(localId: "del_int", deletedAt: Date())
        try await Task.sleep(for: .milliseconds(100))

        XCTAssertNil(store.messages[0].content)
        XCTAssertNotNil(store.messages[0].deletedAt)

        store.stopObserving()
    }

    func test_100ConcurrentInserts_allPersisted() async throws {
        try await withThrowingTaskGroup(of: Void.self) { group in
            for i in 0..<100 {
                group.addTask {
                    let record = MessageRecordFactory.make(
                        localId: "stress_\(i)", conversationId: "conv_stress")
                    try await self.actor.insertOptimistic(record)
                }
            }
            try await group.waitForAll()
        }

        let all = try actor.messages(for: "conv_stress", limit: 200)
        XCTAssertEqual(all.count, 100)
    }
}

// MARK: - Factory

private enum MessageRecordFactory {
    static func make(
        localId: String = "temp_\(UUID().uuidString)",
        conversationId: String = "conv_default",
        senderId: String = "user_me",
        content: String? = "Test message",
        state: MessageState = .sending,
        createdAt: Date = Date(),
        changeVersion: Int64 = 0
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
            changeVersion: changeVersion
        )
    }
}
