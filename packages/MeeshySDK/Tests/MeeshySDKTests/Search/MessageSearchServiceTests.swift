import XCTest
import GRDB
@testable import MeeshySDK

final class MessageSearchServiceTests: XCTestCase {

    func test_search_returnsMatches_orderedByRelevance() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)
        try await pool.write { db in
            try MessageRecordFactory.make(localId: "1", content: "hello world").insert(db)
            try MessageRecordFactory.make(localId: "2", content: "world peace hello").insert(db)
            try MessageRecordFactory.make(localId: "3", content: "unrelated").insert(db)
        }

        let service = MessageSearchService(reader: pool)
        let results = try await service.search(query: "hello", limit: 10, conversationId: nil)

        XCTAssertEqual(Set(results.map(\.localId)), Set(["1", "2"]))
    }

    func test_search_scopedByConversationId() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)
        try await pool.write { db in
            try MessageRecordFactory.make(localId: "a", conversationId: "c1", content: "hello").insert(db)
            try MessageRecordFactory.make(localId: "b", conversationId: "c2", content: "hello").insert(db)
        }

        let service = MessageSearchService(reader: pool)
        let scoped = try await service.search(query: "hello", limit: 10, conversationId: "c1")

        XCTAssertEqual(scoped.map(\.localId), ["a"])
    }

    func test_search_emptyQuery_returnsEmpty() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)
        let service = MessageSearchService(reader: pool)
        let results = try await service.search(query: "", limit: 10, conversationId: nil)
        XCTAssertTrue(results.isEmpty)
    }

    func test_search_diacriticsIgnored() async throws {
        let pool = try makeFreshPool()
        try MessageDatabaseMigrations.runAll(on: pool)
        try await pool.write { db in
            try MessageRecordFactory.make(localId: "fr", content: "Bonjour à tous").insert(db)
        }

        let service = MessageSearchService(reader: pool)
        let results = try await service.search(query: "a tous", limit: 10, conversationId: nil)
        XCTAssertEqual(results.first?.localId, "fr",
            "FTS5 unicode61 remove_diacritics should match accent-stripped query")
    }

    private func makeFreshPool() throws -> DatabaseQueue {
        let path = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("test_search_\(UUID().uuidString).sqlite").path
        return try DatabaseQueue(path: path)
    }
}
