import XCTest
import GRDB
@testable import MeeshySDK

final class OfflineQueueTests: XCTestCase {

    private var queue: OfflineQueue { OfflineQueue.shared }

    override func setUp() async throws {
        // Wave 1 Task 3.6 — every enqueue path on `OfflineQueue` requires a
        // configured pool. Wiring a fresh in-memory `DatabaseQueue` per test
        // case keeps the legacy tests green while the unified outbox path is
        // exercised. The migrations need to run so the `outbox` table exists.
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        await OfflineQueue.shared.configure(pool: pool)
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

    func test_enqueue_addsItem() async throws {
        let item = OfflineQueueItem(conversationId: "conv-1", content: "Hello")

        try await queue.enqueue(item)

        let count = await queue.count
        XCTAssertEqual(count, 1)
    }

    func test_enqueue_multipleItems_incrementsCount() async throws {
        try await queue.enqueue(OfflineQueueItem(conversationId: "conv-1", content: "First"))
        try await queue.enqueue(OfflineQueueItem(conversationId: "conv-1", content: "Second"))
        try await queue.enqueue(OfflineQueueItem(conversationId: "conv-2", content: "Third"))

        let count = await queue.count
        XCTAssertEqual(count, 3)
    }

    func test_dequeue_removesSpecificItem() async throws {
        let item1 = OfflineQueueItem(conversationId: "conv-1", content: "First")
        let item2 = OfflineQueueItem(conversationId: "conv-1", content: "Second")

        try await queue.enqueue(item1)
        try await queue.enqueue(item2)
        await queue.dequeue(item1.id)

        let count = await queue.count
        XCTAssertEqual(count, 1)

        let pending = await queue.pendingItems
        XCTAssertEqual(pending.first?.content, "Second")
    }

    func test_pendingItems_returnsFIFOOrder() async throws {
        let item1 = OfflineQueueItem(conversationId: "conv-1", content: "First")
        let item2 = OfflineQueueItem(conversationId: "conv-1", content: "Second")
        let item3 = OfflineQueueItem(conversationId: "conv-1", content: "Third")

        try await queue.enqueue(item1)
        try await queue.enqueue(item2)
        try await queue.enqueue(item3)

        let pending = await queue.pendingItems
        XCTAssertEqual(pending.map(\.content), ["First", "Second", "Third"])
    }

    func test_clearAll_removesAllItems() async throws {
        try await queue.enqueue(OfflineQueueItem(conversationId: "conv-1", content: "A"))
        try await queue.enqueue(OfflineQueueItem(conversationId: "conv-2", content: "B"))

        await queue.clearAll()

        let isEmpty = await queue.isEmpty
        XCTAssertTrue(isEmpty)
    }

    func test_isEmpty_trueWhenEmpty() async {
        let isEmpty = await queue.isEmpty
        XCTAssertTrue(isEmpty)
    }

    func test_isEmpty_falseWhenItemsExist() async throws {
        try await queue.enqueue(OfflineQueueItem(conversationId: "conv-1", content: "Hello"))

        let isEmpty = await queue.isEmpty
        XCTAssertFalse(isEmpty)
    }

    func test_dequeue_nonExistentId_doesNothing() async throws {
        let item = OfflineQueueItem(conversationId: "conv-1", content: "Hello")
        try await queue.enqueue(item)

        await queue.dequeue("non-existent-id")

        let count = await queue.count
        XCTAssertEqual(count, 1)
    }

    // MARK: - Advanced queue operations (point 47)

    func test_pendingItems_preservesFIFO_afterDequeue() async throws {
        let item1 = OfflineQueueItem(conversationId: "conv-1", content: "First")
        let item2 = OfflineQueueItem(conversationId: "conv-1", content: "Second")
        let item3 = OfflineQueueItem(conversationId: "conv-1", content: "Third")

        try await queue.enqueue(item1)
        try await queue.enqueue(item2)
        try await queue.enqueue(item3)

        // Dequeue middle item
        await queue.dequeue(item2.id)

        let pending = await queue.pendingItems
        XCTAssertEqual(pending.count, 2)
        XCTAssertEqual(pending[0].content, "First")
        XCTAssertEqual(pending[1].content, "Third")
    }

    func test_pendingItems_preservesAllMetadata() async throws {
        let item = OfflineQueueItem(
            conversationId: "conv-123",
            content: "Test with metadata",
            replyToId: "reply-1",
            forwardedFromId: "fwd-1",
            forwardedFromConversationId: "fwd-conv-1",
            attachmentIds: ["att-1", "att-2"]
        )

        try await queue.enqueue(item)

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

    func test_clearAll_thenEnqueue_worksNormally() async throws {
        try await queue.enqueue(OfflineQueueItem(conversationId: "conv-1", content: "Before clear"))
        await queue.clearAll()

        try await queue.enqueue(OfflineQueueItem(conversationId: "conv-2", content: "After clear"))

        let count = await queue.count
        XCTAssertEqual(count, 1)
        let pending = await queue.pendingItems
        XCTAssertEqual(pending.first?.content, "After clear")
    }

    func test_dequeue_allItems_makesQueueEmpty() async throws {
        let item1 = OfflineQueueItem(conversationId: "conv-1", content: "A")
        let item2 = OfflineQueueItem(conversationId: "conv-1", content: "B")

        try await queue.enqueue(item1)
        try await queue.enqueue(item2)

        await queue.dequeue(item1.id)
        await queue.dequeue(item2.id)

        let isEmpty = await queue.isEmpty
        XCTAssertTrue(isEmpty)
        let count = await queue.count
        XCTAssertEqual(count, 0)
    }

    func test_enqueue_multipleConversations_preservesOrder() async throws {
        let items = (1...5).map { i in
            OfflineQueueItem(conversationId: "conv-\(i)", content: "Message \(i)")
        }

        for item in items {
            try await queue.enqueue(item)
        }

        let pending = await queue.pendingItems
        XCTAssertEqual(pending.count, 5)
        for (index, item) in pending.enumerated() {
            XCTAssertEqual(item.conversationId, "conv-\(index + 1)")
        }
    }

    // MARK: - Audio enqueue (A3 — multi-track + single wrapper)

    /// Writes a throwaway `.m4a` payload into `tmp/` and returns its URL.
    /// Mirrors the volatile recording path the audio composer hands to the
    /// queue at enqueue time.
    private func makeTempAudioFile() throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("rec_\(UUID().uuidString).m4a")
        try Data(repeating: 0xAB, count: 16).write(to: url)
        return url
    }

    /// Reads back the single persisted `OfflineQueueItem` for a given
    /// `clientMessageId` by decoding the matching `OutboxRecord` payloads.
    private func readBackItems(forClientMessageId cmid: String) async throws -> [OfflineQueueItem] {
        let maybePool = await queue.outboxPoolForTesting
        let pool = try XCTUnwrap(maybePool)
        let records: [OutboxRecord] = try await pool.read { db in
            try OutboxRecord
                .filter(Column("clientMessageId") == cmid)
                .fetchAll(db)
        }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try records.map { try decoder.decode(OfflineQueueItem.self, from: $0.payload) }
    }

    func test_enqueueAudios_persistsAllPaths_inSingleRecord() async throws {
        let cid = "cid_\(UUID().uuidString.lowercased())"
        let url1 = try makeTempAudioFile()
        let url2 = try makeTempAudioFile()

        let result = try await queue.enqueueAudios(
            sourceAudioURLs: [url1, url2],
            conversationId: "conv-1",
            content: nil,
            clientMessageId: cid,
            originalLanguage: "fr"
        )

        XCTAssertEqual(result.localAudioPaths.count, 2)
        for path in result.localAudioPaths {
            XCTAssertTrue(path.contains(cid), "Each stored path must live under the per-message subdir")
            XCTAssertTrue(FileManager.default.fileExists(
                atPath: OfflineQueue.absoluteAudioPath(forStored: path)),
                "Each audio file must have been copied to disk")
        }

        let items = try await readBackItems(forClientMessageId: cid)
        XCTAssertEqual(items.count, 1, "Multi-track audio persists as exactly ONE OutboxRecord")
        let item = try XCTUnwrap(items.first)
        XCTAssertEqual(item.localAudioPaths?.count, 2)
        XCTAssertNil(item.localAudioPath)
        XCTAssertNil(item.attachmentIds)
        XCTAssertEqual(item.attachmentKinds, ["audio", "audio"])
        for path in try XCTUnwrap(item.localAudioPaths) {
            XCTAssertTrue(path.contains(cid))
        }
    }

    func test_enqueueAudio_single_stillWorks_viaWrapper() async throws {
        let cid = "cid_\(UUID().uuidString.lowercased())"
        let url = try makeTempAudioFile()

        let result = try await queue.enqueueAudio(
            sourceAudioURL: url,
            conversationId: "conv-1",
            content: nil,
            clientMessageId: cid,
            originalLanguage: "fr"
        )

        XCTAssertFalse(result.localAudioPath.isEmpty)
        XCTAssertTrue(result.localAudioPath.contains(cid))
        XCTAssertTrue(FileManager.default.fileExists(
            atPath: OfflineQueue.absoluteAudioPath(forStored: result.localAudioPath)))

        let items = try await readBackItems(forClientMessageId: cid)
        XCTAssertEqual(items.count, 1)
        let item = try XCTUnwrap(items.first)
        XCTAssertEqual(item.localAudioPaths?.count, 1)
        XCTAssertEqual(item.localAudioPaths?.first, result.localAudioPath)
    }

    func test_item_backwardCompatible_decodesWithoutLocalAudioPaths() throws {
        // Legacy persisted payloads predate `localAudioPaths` — they must still
        // decode (the key is absent) with the new field defaulting to nil.
        let legacyJSON = """
        {"id":"x","clientMessageId":"cid_legacy","conversationId":"c1",
         "content":"hi","createdAt":"2026-05-30T00:00:00Z"}
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let item = try decoder.decode(OfflineQueueItem.self, from: Data(legacyJSON.utf8))
        XCTAssertNil(item.localAudioPaths)
        XCTAssertNil(item.localAudioPath)
        XCTAssertEqual(item.content, "hi")
    }
}
