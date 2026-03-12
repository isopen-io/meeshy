import XCTest
import GRDB
@testable import MeeshySDK

final class ParticipantCacheManagerTests: XCTestCase {

    private func makeDatabase() throws -> DatabaseQueue {
        let db = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: db)
        return db
    }

    private func makeParticipant(id: String, userId: String? = nil, username: String? = nil, role: String? = "USER") -> PaginatedParticipant {
        PaginatedParticipant(
            id: id, userId: userId ?? "user-\(id)", username: username ?? "user_\(id)",
            firstName: "First", lastName: "Last",
            displayName: "Display \(id)", avatar: nil,
            conversationRole: role, isOnline: false,
            lastActiveAt: nil, joinedAt: nil, isActive: true
        )
    }

    private func makeResponse(
        participants: [PaginatedParticipant],
        nextCursor: String? = nil,
        hasMore: Bool = false,
        totalCount: Int? = nil
    ) -> PaginatedParticipantsResponse {
        PaginatedParticipantsResponse(
            success: true,
            data: participants,
            pagination: PaginatedParticipantsPagination(
                nextCursor: nextCursor,
                hasMore: hasMore,
                totalCount: totalCount
            )
        )
    }

    private func insertParticipant(_ participant: PaginatedParticipant, conversationId: String, into db: DatabaseQueue) throws {
        let record = DBCachedParticipant.from(participant, conversationId: conversationId)
        try db.write { dbConn in
            var r = record
            try r.insert(dbConn)
        }
    }

    private func insertMetadata(_ meta: DBCacheMetadata, into db: DatabaseQueue) throws {
        try db.write { dbConn in
            var m = meta
            try m.insert(dbConn)
        }
    }

    private func fetchParticipants(for conversationId: String, from db: DatabaseQueue) throws -> [DBCachedParticipant] {
        try db.read {
            try DBCachedParticipant
                .filter(Column("conversationId") == conversationId)
                .fetchAll($0)
        }
    }

    private func fetchMetadata(key: String, from db: DatabaseQueue) throws -> DBCacheMetadata? {
        try db.read {
            try DBCacheMetadata.fetchOne($0, key: key)
        }
    }

    private func fetchParticipantRecord(id: String, from db: DatabaseQueue) throws -> DBCachedParticipant? {
        try db.read {
            try DBCachedParticipant.fetchOne($0, key: id)
        }
    }

    // MARK: - loadFirstPage forceRefresh persists to SQLite

    func test_loadFirstPage_forceRefresh_persistsParticipantsToSQLite() async throws {
        let db = try makeDatabase()
        let api = MockAPIClient()
        let manager = ParticipantCacheManager(databaseWriter: db, apiClient: api)

        let p1 = makeParticipant(id: "p1")
        let p2 = makeParticipant(id: "p2")
        let response = makeResponse(participants: [p1, p2], totalCount: 2)
        api.stub("/conversations/conv1/participants?limit=30", result: response)

        let result = try await manager.loadFirstPage(for: "conv1", forceRefresh: true)
        XCTAssertEqual(result.count, 2)

        let stored = try fetchParticipants(for: "conv1", from: db)
        XCTAssertEqual(stored.count, 2)
        XCTAssertEqual(Set(stored.map(\.id)), Set(["p1", "p2"]))
    }

    // MARK: - cached() reads from SQLite on cold start

    func test_cached_readsFromSQLiteOnColdStart() async throws {
        let db = try makeDatabase()
        let api = MockAPIClient()

        try insertParticipant(makeParticipant(id: "p1", username: "alice"), conversationId: "conv1", into: db)

        let manager = ParticipantCacheManager(databaseWriter: db, apiClient: api)
        let cached = await manager.cached(for: "conv1")

        XCTAssertEqual(cached.count, 1)
        XCTAssertEqual(cached.first?.id, "p1")
        XCTAssertEqual(cached.first?.username, "alice")
        XCTAssertEqual(api.requestCount, 0)
    }

    // MARK: - loadFirstPage with fresh cache does NOT call API

    func test_loadFirstPage_freshCache_doesNotCallAPI() async throws {
        let db = try makeDatabase()
        let api = MockAPIClient()

        try insertParticipant(makeParticipant(id: "p1"), conversationId: "conv1", into: db)
        try insertMetadata(DBCacheMetadata(
            key: "participants:conv1",
            nextCursor: nil,
            hasMore: false,
            totalCount: 1,
            lastFetchedAt: Date()
        ), into: db)

        let manager = ParticipantCacheManager(databaseWriter: db, apiClient: api)
        let result = try await manager.loadFirstPage(for: "conv1")

        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(api.requestCount, 0)
    }

    // MARK: - loadFirstPage with expired cache DOES call API

    func test_loadFirstPage_expiredCache_callsAPI() async throws {
        let db = try makeDatabase()
        let api = MockAPIClient()

        let expired = Date().addingTimeInterval(-90000)
        try insertParticipant(makeParticipant(id: "old"), conversationId: "conv1", into: db)
        try insertMetadata(DBCacheMetadata(
            key: "participants:conv1",
            nextCursor: nil,
            hasMore: false,
            totalCount: 1,
            lastFetchedAt: expired
        ), into: db)

        let freshParticipant = makeParticipant(id: "new")
        let response = makeResponse(participants: [freshParticipant], totalCount: 1)
        api.stub("/conversations/conv1/participants?limit=30", result: response)

        let manager = ParticipantCacheManager(databaseWriter: db, apiClient: api)
        let result = try await manager.loadFirstPage(for: "conv1")

        XCTAssertEqual(api.requestCount, 1)
        XCTAssertEqual(result.count, 1)
        XCTAssertEqual(result.first?.id, "new")
    }

    // MARK: - updateRole persists to SQLite

    func test_updateRole_persistsNewRoleToSQLite() async throws {
        let db = try makeDatabase()
        let api = MockAPIClient()

        let p1 = makeParticipant(id: "p1", userId: "u1", role: "USER")
        let response = makeResponse(participants: [p1], totalCount: 1)
        api.stub("/conversations/conv1/participants?limit=30", result: response)

        let manager = ParticipantCacheManager(databaseWriter: db, apiClient: api)
        _ = try await manager.loadFirstPage(for: "conv1", forceRefresh: true)

        await manager.updateRole(conversationId: "conv1", userId: "u1", newRole: "ADMIN")

        let stored = try fetchParticipantRecord(id: "p1", from: db)
        XCTAssertEqual(stored?.conversationRole, "admin")
    }

    // MARK: - removeParticipant deletes from SQLite and decrements totalCount

    func test_removeParticipant_deletesFromSQLiteAndDecrementsTotalCount() async throws {
        let db = try makeDatabase()
        let api = MockAPIClient()

        let p1 = makeParticipant(id: "p1", userId: "u1")
        let p2 = makeParticipant(id: "p2", userId: "u2")
        let response = makeResponse(participants: [p1, p2], totalCount: 2)
        api.stub("/conversations/conv1/participants?limit=30", result: response)

        let manager = ParticipantCacheManager(databaseWriter: db, apiClient: api)
        _ = try await manager.loadFirstPage(for: "conv1", forceRefresh: true)

        await manager.removeParticipant(conversationId: "conv1", userId: "u1")

        let remaining = try fetchParticipants(for: "conv1", from: db)
        XCTAssertEqual(remaining.count, 1)
        XCTAssertEqual(remaining.first?.id, "p2")

        let meta = try fetchMetadata(key: "participants:conv1", from: db)
        XCTAssertEqual(meta?.totalCount, 1)
    }

    // MARK: - invalidate clears participants AND metadata

    func test_invalidate_clearsParticipantsAndMetadata() async throws {
        let db = try makeDatabase()
        let api = MockAPIClient()

        let p = makeParticipant(id: "p1")
        let response = makeResponse(participants: [p], totalCount: 1)
        api.stub("/conversations/conv1/participants?limit=30", result: response)

        let manager = ParticipantCacheManager(databaseWriter: db, apiClient: api)
        _ = try await manager.loadFirstPage(for: "conv1", forceRefresh: true)

        await manager.invalidate(conversationId: "conv1")

        let participants = try fetchParticipants(for: "conv1", from: db)
        XCTAssertTrue(participants.isEmpty)

        let meta = try fetchMetadata(key: "participants:conv1", from: db)
        XCTAssertNil(meta)
    }

    // MARK: - loadNextPage appends to existing participants

    func test_loadNextPage_appendsToExistingParticipants() async throws {
        let db = try makeDatabase()
        let api = MockAPIClient()

        let p1 = makeParticipant(id: "p1")
        let page1 = makeResponse(
            participants: [p1],
            nextCursor: "cursor1",
            hasMore: true,
            totalCount: 2
        )
        api.stub("/conversations/conv1/participants?limit=30", result: page1)

        let p2 = makeParticipant(id: "p2")
        let page2 = makeResponse(
            participants: [p2],
            hasMore: false,
            totalCount: 2
        )
        api.stub("/conversations/conv1/participants?limit=30&cursor=cursor1", result: page2)

        let manager = ParticipantCacheManager(databaseWriter: db, apiClient: api)
        let firstResult = try await manager.loadNextPage(for: "conv1")
        XCTAssertEqual(firstResult.count, 1)

        let secondResult = try await manager.loadNextPage(for: "conv1")
        XCTAssertEqual(secondResult.count, 2)
        XCTAssertEqual(Set(secondResult.map(\.id)), Set(["p1", "p2"]))
    }

    // MARK: - totalCount reads from metadata

    func test_totalCount_readsFromMetadata() async throws {
        let db = try makeDatabase()
        let api = MockAPIClient()

        try insertMetadata(DBCacheMetadata(
            key: "participants:conv1",
            nextCursor: nil,
            hasMore: false,
            totalCount: 42,
            lastFetchedAt: Date()
        ), into: db)

        let manager = ParticipantCacheManager(databaseWriter: db, apiClient: api)
        let count = await manager.totalCount(for: "conv1")
        XCTAssertEqual(count, 42)
    }

    // MARK: - hasMore defaults to true when no cache

    func test_hasMore_defaultsToTrueWhenNoCacheExists() async throws {
        let db = try makeDatabase()
        let api = MockAPIClient()
        let manager = ParticipantCacheManager(databaseWriter: db, apiClient: api)

        let result = await manager.hasMore(for: "nonexistent")
        XCTAssertTrue(result)
    }
}
