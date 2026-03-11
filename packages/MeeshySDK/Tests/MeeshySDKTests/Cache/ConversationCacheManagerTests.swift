import XCTest
import GRDB
@testable import MeeshySDK

final class ConversationCacheManagerTests: XCTestCase {

    private func makeDatabase() throws -> DatabaseQueue {
        let db = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: db)
        return db
    }

    private func makeConversation(id: String, identifier: String? = nil, title: String? = nil) -> MeeshyConversation {
        MeeshyConversation(
            id: id,
            identifier: identifier ?? "conv-\(id)",
            type: .direct,
            title: title ?? "Test Conversation \(id)",
            lastMessageAt: Date(),
            createdAt: Date(),
            updatedAt: Date()
        )
    }

    private func fetchDBConversations(from db: DatabaseQueue) throws -> [DBConversation] {
        try db.read { try DBConversation.fetchAll($0) }
    }

    private func fetchMetadata(key: String, from db: DatabaseQueue) throws -> DBCacheMetadata? {
        try db.read { try DBCacheMetadata.fetchOne($0, key: key) }
    }

    // MARK: - saveConversations persists to SQLite

    func test_saveConversations_persistsToSQLite() async throws {
        let db = try makeDatabase()
        let manager = ConversationCacheManager(databaseWriter: db)

        let c1 = makeConversation(id: "c1")
        let c2 = makeConversation(id: "c2")
        let c3 = makeConversation(id: "c3")

        await manager.saveConversations([c1, c2, c3])

        let stored = try fetchDBConversations(from: db)
        XCTAssertEqual(stored.count, 3)
        XCTAssertEqual(Set(stored.map(\.id)), Set(["c1", "c2", "c3"]))

        let meta = try fetchMetadata(key: "conversations:list", from: db)
        XCTAssertNotNil(meta)
        XCTAssertEqual(meta?.totalCount, 3)
    }

    // MARK: - loadConversations reads from SQLite on cold start

    func test_loadConversations_readsFromSQLiteOnColdStart() async throws {
        let db = try makeDatabase()

        let c1 = makeConversation(id: "c1", title: "Alpha")
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let encoded = try encoder.encode(c1)

        try await db.write { dbConn in
            let record = DBConversation(id: "c1", name: "Alpha", encodedData: encoded, updatedAt: Date())
            try record.save(dbConn)

            let meta = DBCacheMetadata(
                key: "conversations:list",
                nextCursor: nil,
                hasMore: false,
                totalCount: 1,
                lastFetchedAt: Date()
            )
            try meta.save(dbConn)
        }

        let manager = ConversationCacheManager(databaseWriter: db)
        let loaded = await manager.loadConversations()

        XCTAssertEqual(loaded.count, 1)
        XCTAssertEqual(loaded.first?.id, "c1")
        XCTAssertEqual(loaded.first?.title, "Alpha")
    }

    // MARK: - loadConversations with fresh cache returns cached data

    func test_loadConversations_freshCache_returnsCachedData() async throws {
        let db = try makeDatabase()
        let manager = ConversationCacheManager(databaseWriter: db)

        let conversations = [
            makeConversation(id: "c1", title: "Fresh One"),
            makeConversation(id: "c2", title: "Fresh Two"),
        ]
        await manager.saveConversations(conversations)

        let loaded = await manager.loadConversations()
        XCTAssertEqual(loaded.count, 2)
        XCTAssertTrue(loaded.contains { $0.id == "c1" })
        XCTAssertTrue(loaded.contains { $0.id == "c2" })
    }

    // MARK: - loadConversations with expired cache returns empty

    func test_loadConversations_expiredCache_returnsEmpty() async throws {
        let db = try makeDatabase()

        let c1 = makeConversation(id: "c1")
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let encoded = try encoder.encode(c1)

        let expired = Date().addingTimeInterval(-90000) // > 24h ago
        try await db.write { dbConn in
            let record = DBConversation(id: "c1", name: "Old", encodedData: encoded, updatedAt: Date())
            try record.save(dbConn)

            let meta = DBCacheMetadata(
                key: "conversations:list",
                nextCursor: nil,
                hasMore: false,
                totalCount: 1,
                lastFetchedAt: expired
            )
            try meta.save(dbConn)
        }

        let manager = ConversationCacheManager(databaseWriter: db)
        let loaded = await manager.loadConversations()

        XCTAssertTrue(loaded.isEmpty)
    }

    // MARK: - updateConversation upserts single conversation

    func test_updateConversation_upsertsSingleConversation() async throws {
        let db = try makeDatabase()
        let manager = ConversationCacheManager(databaseWriter: db)

        await manager.saveConversations([
            makeConversation(id: "c1", title: "Original"),
            makeConversation(id: "c2", title: "Other"),
        ])

        let updated = makeConversation(id: "c1", title: "Updated Title")
        await manager.updateConversation(updated)

        let stored = try fetchDBConversations(from: db)
        XCTAssertEqual(stored.count, 2)

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let c1Record = stored.first { $0.id == "c1" }!
        let decoded = try decoder.decode(MeeshyConversation.self, from: c1Record.encodedData)
        XCTAssertEqual(decoded.title, "Updated Title")
    }

    // MARK: - removeConversation deletes by id

    func test_removeConversation_deletesById() async throws {
        let db = try makeDatabase()
        let manager = ConversationCacheManager(databaseWriter: db)

        await manager.saveConversations([
            makeConversation(id: "c1"),
            makeConversation(id: "c2"),
            makeConversation(id: "c3"),
        ])

        await manager.removeConversation(id: "c2")

        let stored = try fetchDBConversations(from: db)
        XCTAssertEqual(stored.count, 2)
        XCTAssertFalse(stored.contains { $0.id == "c2" })
    }

    // MARK: - invalidateAll clears conversations and metadata

    func test_invalidateAll_clearsConversationsAndMetadata() async throws {
        let db = try makeDatabase()
        let manager = ConversationCacheManager(databaseWriter: db)

        await manager.saveConversations([
            makeConversation(id: "c1"),
            makeConversation(id: "c2"),
        ])

        await manager.invalidateAll()

        let stored = try fetchDBConversations(from: db)
        XCTAssertTrue(stored.isEmpty)

        let meta = try fetchMetadata(key: "conversations:list", from: db)
        XCTAssertNil(meta)

        let loaded = await manager.loadConversations()
        XCTAssertTrue(loaded.isEmpty)
    }

    // MARK: - isExpired returns true when no metadata

    func test_isExpired_returnsTrueWhenNoMetadata() async throws {
        let db = try makeDatabase()
        let manager = ConversationCacheManager(databaseWriter: db)

        let expired = await manager.isExpired()
        XCTAssertTrue(expired)
    }

    // MARK: - isExpired returns false with fresh cache

    func test_isExpired_returnsFalseWithFreshCache() async throws {
        let db = try makeDatabase()
        let manager = ConversationCacheManager(databaseWriter: db)

        await manager.saveConversations([makeConversation(id: "c1")])

        let expired = await manager.isExpired()
        XCTAssertFalse(expired)
    }

    // MARK: - Memory cache is used on second load

    func test_loadConversations_usesMemoryCacheOnSecondLoad() async throws {
        let db = try makeDatabase()
        let manager = ConversationCacheManager(databaseWriter: db)

        await manager.saveConversations([makeConversation(id: "c1")])

        let first = await manager.loadConversations()
        XCTAssertEqual(first.count, 1)

        // Delete from DB directly — memory cache should still return data
        _ = try await db.write { try DBConversation.deleteAll($0) }

        let second = await manager.loadConversations()
        XCTAssertEqual(second.count, 1)
    }
}
