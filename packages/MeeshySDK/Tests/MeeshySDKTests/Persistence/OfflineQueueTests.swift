import XCTest
@testable import MeeshySDK

final class OfflineQueueTests: XCTestCase {

    private var queue: OfflineQueue { OfflineQueue.shared }

    override func setUp() async throws {
        await queue.clearAll()
    }

    override func tearDown() async throws {
        await queue.clearAll()
    }

    // MARK: - OfflineQueueItem Model

    func test_item_init_generatesUniqueId() {
        let item1 = OfflineQueueItem(conversationId: "conv-1", content: "Hello")
        let item2 = OfflineQueueItem(conversationId: "conv-1", content: "Hello")

        XCTAssertNotEqual(item1.id, item2.id, "Each item should get a unique ID")
    }

    func test_item_init_setsCreatedAtToNow() {
        let before = Date()
        let item = OfflineQueueItem(conversationId: "conv-1", content: "Hello")
        let after = Date()

        XCTAssertGreaterThanOrEqual(item.createdAt, before)
        XCTAssertLessThanOrEqual(item.createdAt, after)
    }

    func test_item_init_storesAllProperties() {
        let item = OfflineQueueItem(
            conversationId: "conv-123",
            content: "Test message",
            replyToId: "msg-456",
            forwardedFromId: "msg-789",
            forwardedFromConversationId: "conv-abc",
            attachmentIds: ["att-1", "att-2"]
        )

        XCTAssertEqual(item.conversationId, "conv-123")
        XCTAssertEqual(item.content, "Test message")
        XCTAssertEqual(item.replyToId, "msg-456")
        XCTAssertEqual(item.forwardedFromId, "msg-789")
        XCTAssertEqual(item.forwardedFromConversationId, "conv-abc")
        XCTAssertEqual(item.attachmentIds, ["att-1", "att-2"])
    }

    func test_item_init_defaultsOptionalFieldsToNil() {
        let item = OfflineQueueItem(conversationId: "conv-1", content: "Hello")

        XCTAssertNil(item.replyToId)
        XCTAssertNil(item.forwardedFromId)
        XCTAssertNil(item.forwardedFromConversationId)
        XCTAssertNil(item.attachmentIds)
    }

    // MARK: - OfflineQueueItem Codable

    func test_item_codableRoundtrip() throws {
        let item = OfflineQueueItem(
            conversationId: "conv-1",
            content: "Hello world",
            replyToId: "reply-1",
            attachmentIds: ["att-1"]
        )

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(item)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(OfflineQueueItem.self, from: data)

        XCTAssertEqual(decoded.id, item.id)
        XCTAssertEqual(decoded.conversationId, item.conversationId)
        XCTAssertEqual(decoded.content, item.content)
        XCTAssertEqual(decoded.replyToId, item.replyToId)
        XCTAssertEqual(decoded.attachmentIds, item.attachmentIds)
    }

    // MARK: - Queue Operations

    func test_enqueue_addsItem() async {
        let item = OfflineQueueItem(conversationId: "conv-1", content: "Hello")

        await queue.enqueue(item)

        let count = await queue.count
        XCTAssertEqual(count, 1)
    }

    func test_enqueue_multipleItems_incrementsCount() async {
        await queue.enqueue(OfflineQueueItem(conversationId: "conv-1", content: "First"))
        await queue.enqueue(OfflineQueueItem(conversationId: "conv-1", content: "Second"))
        await queue.enqueue(OfflineQueueItem(conversationId: "conv-2", content: "Third"))

        let count = await queue.count
        XCTAssertEqual(count, 3)
    }

    func test_dequeue_removesSpecificItem() async {
        let item1 = OfflineQueueItem(conversationId: "conv-1", content: "First")
        let item2 = OfflineQueueItem(conversationId: "conv-1", content: "Second")

        await queue.enqueue(item1)
        await queue.enqueue(item2)
        await queue.dequeue(item1.id)

        let count = await queue.count
        XCTAssertEqual(count, 1)

        let pending = await queue.pendingItems
        XCTAssertEqual(pending.first?.content, "Second")
    }

    func test_pendingItems_returnsFIFOOrder() async {
        let item1 = OfflineQueueItem(conversationId: "conv-1", content: "First")
        let item2 = OfflineQueueItem(conversationId: "conv-1", content: "Second")
        let item3 = OfflineQueueItem(conversationId: "conv-1", content: "Third")

        await queue.enqueue(item1)
        await queue.enqueue(item2)
        await queue.enqueue(item3)

        let pending = await queue.pendingItems
        XCTAssertEqual(pending.map(\.content), ["First", "Second", "Third"])
    }

    func test_clearAll_removesAllItems() async {
        await queue.enqueue(OfflineQueueItem(conversationId: "conv-1", content: "A"))
        await queue.enqueue(OfflineQueueItem(conversationId: "conv-2", content: "B"))

        await queue.clearAll()

        let isEmpty = await queue.isEmpty
        XCTAssertTrue(isEmpty)
    }

    func test_isEmpty_trueWhenEmpty() async {
        let isEmpty = await queue.isEmpty
        XCTAssertTrue(isEmpty)
    }

    func test_isEmpty_falseWhenItemsExist() async {
        await queue.enqueue(OfflineQueueItem(conversationId: "conv-1", content: "Hello"))

        let isEmpty = await queue.isEmpty
        XCTAssertFalse(isEmpty)
    }

    func test_dequeue_nonExistentId_doesNothing() async {
        let item = OfflineQueueItem(conversationId: "conv-1", content: "Hello")
        await queue.enqueue(item)

        await queue.dequeue("non-existent-id")

        let count = await queue.count
        XCTAssertEqual(count, 1)
    }

    // MARK: - Advanced queue operations (point 47)

    func test_pendingItems_preservesFIFO_afterDequeue() async {
        let item1 = OfflineQueueItem(conversationId: "conv-1", content: "First")
        let item2 = OfflineQueueItem(conversationId: "conv-1", content: "Second")
        let item3 = OfflineQueueItem(conversationId: "conv-1", content: "Third")

        await queue.enqueue(item1)
        await queue.enqueue(item2)
        await queue.enqueue(item3)

        // Dequeue middle item
        await queue.dequeue(item2.id)

        let pending = await queue.pendingItems
        XCTAssertEqual(pending.count, 2)
        XCTAssertEqual(pending[0].content, "First")
        XCTAssertEqual(pending[1].content, "Third")
    }

    func test_pendingItems_preservesAllMetadata() async {
        let item = OfflineQueueItem(
            conversationId: "conv-123",
            content: "Test with metadata",
            replyToId: "reply-1",
            forwardedFromId: "fwd-1",
            forwardedFromConversationId: "fwd-conv-1",
            attachmentIds: ["att-1", "att-2"]
        )

        await queue.enqueue(item)

        let pending = await queue.pendingItems
        XCTAssertEqual(pending.count, 1)
        let retrieved = pending[0]
        XCTAssertEqual(retrieved.id, item.id)
        XCTAssertEqual(retrieved.conversationId, "conv-123")
        XCTAssertEqual(retrieved.content, "Test with metadata")
        XCTAssertEqual(retrieved.replyToId, "reply-1")
        XCTAssertEqual(retrieved.forwardedFromId, "fwd-1")
        XCTAssertEqual(retrieved.forwardedFromConversationId, "fwd-conv-1")
        XCTAssertEqual(retrieved.attachmentIds, ["att-1", "att-2"])
    }

    func test_clearAll_thenEnqueue_worksNormally() async {
        await queue.enqueue(OfflineQueueItem(conversationId: "conv-1", content: "Before clear"))
        await queue.clearAll()

        await queue.enqueue(OfflineQueueItem(conversationId: "conv-2", content: "After clear"))

        let count = await queue.count
        XCTAssertEqual(count, 1)
        let pending = await queue.pendingItems
        XCTAssertEqual(pending.first?.content, "After clear")
    }

    func test_dequeue_allItems_makesQueueEmpty() async {
        let item1 = OfflineQueueItem(conversationId: "conv-1", content: "A")
        let item2 = OfflineQueueItem(conversationId: "conv-1", content: "B")

        await queue.enqueue(item1)
        await queue.enqueue(item2)

        await queue.dequeue(item1.id)
        await queue.dequeue(item2.id)

        let isEmpty = await queue.isEmpty
        XCTAssertTrue(isEmpty)
        let count = await queue.count
        XCTAssertEqual(count, 0)
    }

    func test_enqueue_multipleConversations_preservesOrder() async {
        let items = (1...5).map { i in
            OfflineQueueItem(conversationId: "conv-\(i)", content: "Message \(i)")
        }

        for item in items {
            await queue.enqueue(item)
        }

        let pending = await queue.pendingItems
        XCTAssertEqual(pending.count, 5)
        for (index, item) in pending.enumerated() {
            XCTAssertEqual(item.conversationId, "conv-\(index + 1)")
        }
    }
}
