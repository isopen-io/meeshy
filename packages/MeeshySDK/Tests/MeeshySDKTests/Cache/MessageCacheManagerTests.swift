import XCTest
import GRDB
@testable import MeeshySDK

final class MessageCacheManagerTests: XCTestCase {

    private func makeDatabase() throws -> DatabaseQueue {
        let db = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: db)
        return db
    }

    private func insertConversation(id: String, into db: DatabaseQueue) async throws {
        try await db.write { dbConn in
            let record = DBConversation(
                id: id,
                name: "Test Conversation \(id)",
                encodedData: Data(),
                updatedAt: Date()
            )
            try record.save(dbConn)
        }
    }

    private func makeMessage(
        id: String,
        conversationId: String,
        content: String = "Hello",
        createdAt: Date = Date()
    ) -> MeeshyMessage {
        MeeshyMessage(
            id: id,
            conversationId: conversationId,
            senderId: "sender1",
            content: content,
            createdAt: createdAt,
            updatedAt: createdAt
        )
    }

    private func fetchDBMessages(from db: DatabaseQueue) throws -> [DBMessage] {
        try db.read { try DBMessage.fetchAll($0) }
    }

    private func fetchMetadata(key: String, from db: DatabaseQueue) throws -> DBCacheMetadata? {
        try db.read { try DBCacheMetadata.fetchOne($0, key: key) }
    }

    // MARK: - saveMessages persists to SQLite

    func test_saveMessages_persistsToSQLite() async throws {
        let db = try makeDatabase()
        try await insertConversation(id: "conv1", into: db)
        let manager = MessageCacheManager(databaseWriter: db)

        let messages = [
            makeMessage(id: "m1", conversationId: "conv1", content: "First"),
            makeMessage(id: "m2", conversationId: "conv1", content: "Second"),
            makeMessage(id: "m3", conversationId: "conv1", content: "Third"),
        ]

        await manager.saveMessages(messages, for: "conv1")

        let stored = try fetchDBMessages(from: db)
        XCTAssertEqual(stored.count, 3)
        XCTAssertEqual(Set(stored.map(\.id)), Set(["m1", "m2", "m3"]))

        let meta = try fetchMetadata(key: "messages:conv1", from: db)
        XCTAssertNotNil(meta)
        XCTAssertEqual(meta?.totalCount, 3)
    }

    // MARK: - loadMessages reads from SQLite in chronological order

    func test_loadMessages_readsInChronologicalOrder() async throws {
        let db = try makeDatabase()
        try await insertConversation(id: "conv1", into: db)
        let manager = MessageCacheManager(databaseWriter: db)

        let now = Date()
        let messages = [
            makeMessage(id: "m3", conversationId: "conv1", content: "Third", createdAt: now.addingTimeInterval(20)),
            makeMessage(id: "m1", conversationId: "conv1", content: "First", createdAt: now),
            makeMessage(id: "m2", conversationId: "conv1", content: "Second", createdAt: now.addingTimeInterval(10)),
        ]

        await manager.saveMessages(messages, for: "conv1")

        let freshManager = MessageCacheManager(databaseWriter: db)
        let loaded = await freshManager.loadMessages(for: "conv1")

        XCTAssertEqual(loaded.count, 3)
        XCTAssertEqual(loaded[0].id, "m1")
        XCTAssertEqual(loaded[1].id, "m2")
        XCTAssertEqual(loaded[2].id, "m3")
    }

    // MARK: - loadMessages with fresh cache returns cached data

    func test_loadMessages_freshCache_returnsCachedData() async throws {
        let db = try makeDatabase()
        try await insertConversation(id: "conv1", into: db)
        let manager = MessageCacheManager(databaseWriter: db)

        let messages = [
            makeMessage(id: "m1", conversationId: "conv1", content: "Hello"),
            makeMessage(id: "m2", conversationId: "conv1", content: "World"),
        ]
        await manager.saveMessages(messages, for: "conv1")

        let loaded = await manager.loadMessages(for: "conv1")
        XCTAssertEqual(loaded.count, 2)
        XCTAssertTrue(loaded.contains { $0.id == "m1" })
        XCTAssertTrue(loaded.contains { $0.id == "m2" })
    }

    // MARK: - loadMessages with expired cache returns empty

    func test_loadMessages_expiredCache_returnsEmpty() async throws {
        let db = try makeDatabase()
        try await insertConversation(id: "conv1", into: db)

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let msg = makeMessage(id: "m1", conversationId: "conv1")
        let encoded = try encoder.encode(msg)

        let expired = Date().addingTimeInterval(-90000) // > 24h ago
        try await db.write { dbConn in
            let record = DBMessage(
                id: "m1",
                conversationId: "conv1",
                createdAt: Date(),
                encodedData: encoded
            )
            try record.save(dbConn)

            let meta = DBCacheMetadata(
                key: "messages:conv1",
                nextCursor: nil,
                hasMore: false,
                totalCount: 1,
                lastFetchedAt: expired
            )
            try meta.save(dbConn)
        }

        let manager = MessageCacheManager(databaseWriter: db)
        let loaded = await manager.loadMessages(for: "conv1")

        XCTAssertTrue(loaded.isEmpty)
    }

    // MARK: - saveMessages trims to max 50 per conversation

    func test_saveMessages_trimsToMax50() async throws {
        let db = try makeDatabase()
        try await insertConversation(id: "conv1", into: db)
        let manager = MessageCacheManager(databaseWriter: db)

        let now = Date()
        let messages = (0..<60).map { i in
            makeMessage(
                id: "m\(i)",
                conversationId: "conv1",
                content: "Message \(i)",
                createdAt: now.addingTimeInterval(Double(i))
            )
        }

        await manager.saveMessages(messages, for: "conv1")

        let stored = try fetchDBMessages(from: db)
        XCTAssertEqual(stored.count, 50)

        let freshManager = MessageCacheManager(databaseWriter: db)
        let loaded = await freshManager.loadMessages(for: "conv1")
        XCTAssertEqual(loaded.count, 50)
        XCTAssertEqual(loaded.first?.id, "m10")
        XCTAssertEqual(loaded.last?.id, "m59")
    }

    // MARK: - appendMessage adds a single new message

    func test_appendMessage_addsSingleMessage() async throws {
        let db = try makeDatabase()
        try await insertConversation(id: "conv1", into: db)
        let manager = MessageCacheManager(databaseWriter: db)

        let now = Date()
        await manager.saveMessages([
            makeMessage(id: "m1", conversationId: "conv1", createdAt: now),
        ], for: "conv1")

        let newMsg = makeMessage(id: "m2", conversationId: "conv1", content: "Appended", createdAt: now.addingTimeInterval(10))
        await manager.appendMessage(newMsg, for: "conv1")

        let loaded = await manager.loadMessages(for: "conv1")
        XCTAssertEqual(loaded.count, 2)
        XCTAssertEqual(loaded.last?.id, "m2")
        XCTAssertEqual(loaded.last?.content, "Appended")
    }

    // MARK: - deleteMessage removes from SQLite

    func test_deleteMessage_removesFromSQLite() async throws {
        let db = try makeDatabase()
        try await insertConversation(id: "conv1", into: db)
        let manager = MessageCacheManager(databaseWriter: db)

        await manager.saveMessages([
            makeMessage(id: "m1", conversationId: "conv1"),
            makeMessage(id: "m2", conversationId: "conv1"),
            makeMessage(id: "m3", conversationId: "conv1"),
        ], for: "conv1")

        await manager.deleteMessage(id: "m2", conversationId: "conv1")

        let loaded = await manager.loadMessages(for: "conv1")
        XCTAssertEqual(loaded.count, 2)
        XCTAssertFalse(loaded.contains { $0.id == "m2" })
    }

    // MARK: - invalidate clears messages + metadata for one conversation

    func test_invalidate_clearsMessagesAndMetadata() async throws {
        let db = try makeDatabase()
        try await insertConversation(id: "conv1", into: db)
        let manager = MessageCacheManager(databaseWriter: db)

        await manager.saveMessages([
            makeMessage(id: "m1", conversationId: "conv1"),
            makeMessage(id: "m2", conversationId: "conv1"),
        ], for: "conv1")

        await manager.invalidate(conversationId: "conv1")

        let stored = try fetchDBMessages(from: db)
        XCTAssertTrue(stored.isEmpty)

        let meta = try fetchMetadata(key: "messages:conv1", from: db)
        XCTAssertNil(meta)

        let loaded = await manager.loadMessages(for: "conv1")
        XCTAssertTrue(loaded.isEmpty)
    }

    // MARK: - Messages for different conversations are isolated

    func test_messagesIsolatedBetweenConversations() async throws {
        let db = try makeDatabase()
        try await insertConversation(id: "conv1", into: db)
        try await insertConversation(id: "conv2", into: db)
        let manager = MessageCacheManager(databaseWriter: db)

        await manager.saveMessages([
            makeMessage(id: "m1", conversationId: "conv1", content: "Conv1 msg"),
        ], for: "conv1")

        await manager.saveMessages([
            makeMessage(id: "m2", conversationId: "conv2", content: "Conv2 msg"),
            makeMessage(id: "m3", conversationId: "conv2", content: "Conv2 msg2"),
        ], for: "conv2")

        let loaded1 = await manager.loadMessages(for: "conv1")
        let loaded2 = await manager.loadMessages(for: "conv2")

        XCTAssertEqual(loaded1.count, 1)
        XCTAssertEqual(loaded1.first?.id, "m1")

        XCTAssertEqual(loaded2.count, 2)
        XCTAssertEqual(Set(loaded2.map(\.id)), Set(["m2", "m3"]))
    }

    // MARK: - invalidate does not affect other conversations

    func test_invalidate_doesNotAffectOtherConversations() async throws {
        let db = try makeDatabase()
        try await insertConversation(id: "conv1", into: db)
        try await insertConversation(id: "conv2", into: db)
        let manager = MessageCacheManager(databaseWriter: db)

        await manager.saveMessages([
            makeMessage(id: "m1", conversationId: "conv1"),
        ], for: "conv1")
        await manager.saveMessages([
            makeMessage(id: "m2", conversationId: "conv2"),
        ], for: "conv2")

        await manager.invalidate(conversationId: "conv1")

        let loaded1 = await manager.loadMessages(for: "conv1")
        let loaded2 = await manager.loadMessages(for: "conv2")

        XCTAssertTrue(loaded1.isEmpty)
        XCTAssertEqual(loaded2.count, 1)
        XCTAssertEqual(loaded2.first?.id, "m2")
    }

    // MARK: - Memory cache is used on second load

    func test_loadMessages_usesMemoryCacheOnSecondLoad() async throws {
        let db = try makeDatabase()
        try await insertConversation(id: "conv1", into: db)
        let manager = MessageCacheManager(databaseWriter: db)

        await manager.saveMessages([
            makeMessage(id: "m1", conversationId: "conv1"),
        ], for: "conv1")

        let first = await manager.loadMessages(for: "conv1")
        XCTAssertEqual(first.count, 1)

        // Delete from DB directly — memory cache should still return data
        _ = try await db.write { try DBMessage.deleteAll($0) }

        let second = await manager.loadMessages(for: "conv1")
        XCTAssertEqual(second.count, 1)
    }

    // MARK: - invalidateAll clears all messages

    func test_invalidateAll_clearsAllMessages() async throws {
        let db = try makeDatabase()
        try await insertConversation(id: "conv1", into: db)
        try await insertConversation(id: "conv2", into: db)
        let manager = MessageCacheManager(databaseWriter: db)

        await manager.saveMessages([
            makeMessage(id: "m1", conversationId: "conv1"),
        ], for: "conv1")
        await manager.saveMessages([
            makeMessage(id: "m2", conversationId: "conv2"),
        ], for: "conv2")

        await manager.invalidateAll()

        let loaded1 = await manager.loadMessages(for: "conv1")
        let loaded2 = await manager.loadMessages(for: "conv2")

        XCTAssertTrue(loaded1.isEmpty)
        XCTAssertTrue(loaded2.isEmpty)
    }
}
