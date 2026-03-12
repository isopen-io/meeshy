import XCTest
import GRDB
@testable import MeeshySDK

final class CacheCoordinatorTests: XCTestCase {

    private func makeDB() throws -> DatabaseQueue {
        let dbQueue = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: dbQueue)
        return dbQueue
    }

    private func makeSUT(db: DatabaseQueue? = nil) throws -> (
        coordinator: CacheCoordinator,
        messageSocket: MockMessageSocket,
        socialSocket: MockSocialSocket
    ) {
        let database = try db ?? makeDB()
        let msgSocket = MockMessageSocket()
        let socialSocket = MockSocialSocket()
        let coordinator = CacheCoordinator(
            messageSocket: msgSocket,
            socialSocket: socialSocket,
            db: database
        )
        return (coordinator, msgSocket, socialSocket)
    }

    // MARK: - Store Access

    func test_stores_haveCorrectPolicies() async throws {
        let (sut, _, _) = try makeSUT()

        let convPolicy = await sut.conversations.policy
        XCTAssertEqual(convPolicy.storageLocation, .grdb)
        XCTAssertEqual(convPolicy.ttl, .hours(24))

        let msgPolicy = await sut.messages.policy
        XCTAssertEqual(msgPolicy.storageLocation, .grdb)
        XCTAssertEqual(msgPolicy.maxItemCount, 50)

        let partPolicy = await sut.participants.policy
        XCTAssertEqual(partPolicy.storageLocation, .grdb)

        let profilePolicy = await sut.profiles.policy
        XCTAssertEqual(profilePolicy.storageLocation, .grdb)
        XCTAssertEqual(profilePolicy.maxItemCount, 100)
    }

    // MARK: - Socket -> Cache: message:new

    func test_messageReceived_appendsToCache() async throws {
        let (sut, msgSocket, _) = try makeSUT()

        let existingMsg = TestFactories.makeMessage(id: "m1", conversationId: "conv-1", content: "First")
        await sut.messages.save([existingMsg], for: "conv-1")

        await sut.start()

        let apiMsg = TestFactories.makeAPIMessage(id: "m2", conversationId: "conv-1", content: "Second")
        msgSocket.messageReceived.send(apiMsg)

        try await Task.sleep(nanoseconds: 100_000_000)

        let result = await sut.messages.load(for: "conv-1")
        guard let items = result.value else {
            XCTFail("Expected cached messages"); return
        }
        XCTAssertEqual(items.count, 2)
        XCTAssertEqual(items.last?.content, "Second")
    }

    // MARK: - Socket -> Cache: message:deleted

    func test_messageDeleted_removesFromCache() async throws {
        let (sut, msgSocket, _) = try makeSUT()

        let m1 = TestFactories.makeMessage(id: "m1", conversationId: "conv-1", content: "Keep")
        let m2 = TestFactories.makeMessage(id: "m2", conversationId: "conv-1", content: "Delete")
        await sut.messages.save([m1, m2], for: "conv-1")

        await sut.start()

        msgSocket.messageDeleted.send(MessageDeletedEvent(messageId: "m2", conversationId: "conv-1"))

        try await Task.sleep(nanoseconds: 100_000_000)

        let result = await sut.messages.load(for: "conv-1")
        guard let items = result.value else {
            XCTFail("Expected cached messages"); return
        }
        XCTAssertEqual(items.count, 1)
        XCTAssertEqual(items.first?.id, "m1")
    }

    // MARK: - Socket -> Cache: unread update

    func test_unreadUpdated_mutatesConversationCache() async throws {
        let (sut, msgSocket, _) = try makeSUT()

        let conv = TestFactories.makeConversation(id: "conv-1", unreadCount: 0)
        await sut.conversations.save([conv], for: "list")

        await sut.start()

        msgSocket.unreadUpdated.send(UnreadUpdateEvent(conversationId: "conv-1", unreadCount: 5))

        try await Task.sleep(nanoseconds: 100_000_000)

        let result = await sut.conversations.load(for: "list")
        guard let items = result.value else {
            XCTFail("Expected cached conversations"); return
        }
        XCTAssertEqual(items.first?.unreadCount, 5)
    }

    // MARK: - Socket -> Cache: participant role update

    func test_participantRoleUpdated_mutatesCache() async throws {
        let (sut, msgSocket, _) = try makeSUT()

        let participant = TestFactories.makeParticipant(id: "p1", conversationRole: "MEMBER")
        await sut.participants.save([participant], for: "conv-1")

        await sut.start()

        let participantInfo = ParticipantRoleUpdatedParticipantInfo(
            id: "p1", role: "ADMIN", displayName: "Test", userId: nil
        )
        let event = ParticipantRoleUpdatedEvent(
            conversationId: "conv-1", userId: "u1",
            newRole: "ADMIN", updatedBy: "u2",
            participant: participantInfo
        )
        msgSocket.participantRoleUpdated.send(event)

        try await Task.sleep(nanoseconds: 100_000_000)

        let result = await sut.participants.load(for: "conv-1")
        guard let items = result.value else {
            XCTFail("Expected cached participants"); return
        }
        XCTAssertEqual(items.first?.conversationRole, "ADMIN")
    }

    // MARK: - Socket -> Cache: reconnect

    func test_didReconnect_invalidatesConversations() async throws {
        let (sut, msgSocket, _) = try makeSUT()

        let conv = TestFactories.makeConversation(id: "conv-1")
        await sut.conversations.save([conv], for: "list")

        await sut.start()

        msgSocket.didReconnect.send(())

        try await Task.sleep(nanoseconds: 100_000_000)

        let result = await sut.conversations.load(for: "list")
        switch result {
        case .empty:
            break
        default:
            XCTFail("Expected empty after invalidation, got \(result)")
        }
    }

    // MARK: - Flush + Invalidate

    func test_invalidateAll_clearsAllStores() async throws {
        let (sut, _, _) = try makeSUT()

        let conv = TestFactories.makeConversation(id: "conv-1")
        await sut.conversations.save([conv], for: "list")

        let msg = TestFactories.makeMessage(id: "m1", conversationId: "conv-1")
        await sut.messages.save([msg], for: "conv-1")

        await sut.invalidateAll()

        let convResult = await sut.conversations.load(for: "list")
        let msgResult = await sut.messages.load(for: "conv-1")

        switch convResult {
        case .empty: break
        default: XCTFail("Expected empty conversations")
        }

        switch msgResult {
        case .empty: break
        default: XCTFail("Expected empty messages")
        }
    }

    // MARK: - Conversation joined/left invalidate participants

    func test_conversationJoined_invalidatesParticipants() async throws {
        let (sut, msgSocket, _) = try makeSUT()

        let participant = TestFactories.makeParticipant(id: "p1")
        await sut.participants.save([participant], for: "conv-1")

        await sut.start()

        msgSocket.conversationJoined.send(ConversationParticipationEvent(conversationId: "conv-1", userId: "u-new"))

        try await Task.sleep(nanoseconds: 100_000_000)

        let result = await sut.participants.load(for: "conv-1")
        switch result {
        case .empty: break
        default: XCTFail("Expected empty after invalidation, got \(result)")
        }
    }
}
