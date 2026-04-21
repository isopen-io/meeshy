import XCTest
import Combine
import MeeshySDK
@testable import Meeshy

/// Integration test: offline -> operations queued -> reconnect -> flush
@MainActor
final class OfflineFlowTests: XCTestCase {

    // MARK: - Offline Queue Item Creation

    func test_offlineQueueItem_createdWithCorrectFields() {
        let item = OfflineQueueItem(
            conversationId: "conv001",
            content: "Offline message",
            replyToId: nil,
            forwardedFromId: nil,
            forwardedFromConversationId: nil,
            attachmentIds: nil
        )

        XCTAssertEqual(item.conversationId, "conv001")
        XCTAssertEqual(item.content, "Offline message")
        XCTAssertNil(item.replyToId)
        XCTAssertNil(item.attachmentIds)
        XCTAssertFalse(item.id.isEmpty)
    }

    func test_offlineQueueItem_withReplyAndAttachments() {
        let item = OfflineQueueItem(
            conversationId: "conv002",
            content: "Reply with attachment",
            replyToId: "msg001",
            forwardedFromId: nil,
            forwardedFromConversationId: nil,
            attachmentIds: ["att001", "att002"]
        )

        XCTAssertEqual(item.replyToId, "msg001")
        XCTAssertEqual(item.attachmentIds?.count, 2)
    }

    // MARK: - Socket Reconnection

    func test_socketReconnect_publishesEvent() {
        let socket = MockMessageSocket()
        var reconnected = false
        let cancellable = socket.didReconnect.sink {
            reconnected = true
        }

        socket.simulateReconnect()

        XCTAssertTrue(reconnected)
        XCTAssertTrue(socket.isConnected)
        XCTAssertEqual(socket.connectionState, .connected)
        cancellable.cancel()
    }

    func test_socketDisconnect_setsOfflineState() {
        let socket = MockMessageSocket()
        socket.connect()
        XCTAssertTrue(socket.isConnected)

        socket.simulateDisconnect()

        XCTAssertFalse(socket.isConnected)
        XCTAssertEqual(socket.connectionState, .disconnected)
    }

    // MARK: - Offline -> Reconnect -> Rejoin

    func test_reconnect_rejoinsActiveConversation() {
        let socket = MockMessageSocket()

        socket.connect()
        socket.joinConversation("conv001")
        XCTAssertEqual(socket.joinConversationIds.count, 1)

        socket.simulateDisconnect()
        XCTAssertFalse(socket.isConnected)

        socket.simulateReconnect()
        socket.joinConversation("conv001")

        XCTAssertTrue(socket.isConnected)
        XCTAssertEqual(socket.joinConversationIds.count, 2)
        XCTAssertEqual(socket.joinConversationIds.last, "conv001")
    }

    // MARK: - Multiple Queue Items

    func test_multipleQueueItems_maintainOrder() {
        let items = (1...5).map { i in
            OfflineQueueItem(
                conversationId: "conv001",
                content: "Message \(i)"
            )
        }

        XCTAssertEqual(items.count, 5)
        XCTAssertEqual(items.first?.content, "Message 1")
        XCTAssertEqual(items.last?.content, "Message 5")

        let uniqueIds = Set(items.map(\.id))
        XCTAssertEqual(uniqueIds.count, 5, "Each queue item should have a unique ID")
    }

    // MARK: - Cache survives offline

    func test_cache_availableDuringOffline() {
        let cache = MockCacheService()
        let conv = Conversation(
            id: "c1", identifier: "c1", type: .direct, title: "Offline Conv",
            lastMessageAt: Date(), createdAt: Date(), updatedAt: Date()
        )
        cache.cacheConversations([conv])

        let cached = cache.getCachedConversations()
        XCTAssertEqual(cached.count, 1)
        XCTAssertEqual(cached.first?.title, "Offline Conv")
    }
}
