import XCTest
import GRDB
@testable import MeeshySDK

final class SearchIndexTests: XCTestCase {

    // MARK: - Indexing

    func test_indexConversations_persistsRecords() async throws {
        let pool = try makePool()
        let index = SearchIndex(pool: pool)

        let convs = [
            makeConversation(id: "c1", title: "Project Phoenix", identifier: "project-phoenix"),
            makeConversation(id: "c2", title: "Marketing", identifier: "marketing")
        ]
        await index.indexConversations(convs)

        let count = try await pool.read { db in
            try Int.fetchOne(db, sql: "SELECT count(*) FROM conversations_fts") ?? 0
        }
        XCTAssertEqual(count, 2)
    }

    func test_indexUsers_persistsRecords() async throws {
        let pool = try makePool()
        let index = SearchIndex(pool: pool)

        let users = [
            makeUser(id: "u1", username: "atabeth", displayName: "Atabeth"),
            makeUser(id: "u2", username: "jcharlesnm", displayName: "J. Charles")
        ]
        await index.indexUsers(users)

        let count = try await pool.read { db in
            try Int.fetchOne(db, sql: "SELECT count(*) FROM users_fts") ?? 0
        }
        XCTAssertEqual(count, 2)
    }

    // MARK: - Search

    func test_searchConversations_returnsMatches() async throws {
        let pool = try makePool()
        let index = SearchIndex(pool: pool)

        await index.indexConversations([
            makeConversation(id: "c1", title: "Project Phoenix"),
            makeConversation(id: "c2", title: "Marketing", description: "Phoenix campaign launch")
        ])

        let ids = try await index.searchConversations(query: "phoenix", limit: 10)
        XCTAssertEqual(Set(ids), Set(["c1", "c2"]))
    }

    func test_searchConversations_byParticipantUsername() async throws {
        let pool = try makePool()
        let index = SearchIndex(pool: pool)

        await index.indexConversations([
            makeConversation(id: "c1", title: nil, participantUsername: "marie"),
            makeConversation(id: "c2", title: "Random group")
        ])

        let ids = try await index.searchConversations(query: "marie", limit: 10)
        XCTAssertEqual(ids, ["c1"])
    }

    func test_searchUsers_byUsername() async throws {
        let pool = try makePool()
        let index = SearchIndex(pool: pool)

        await index.indexUsers([
            makeUser(id: "u1", username: "atabeth"),
            makeUser(id: "u2", username: "jcharlesnm")
        ])

        let ids = try await index.searchUsers(query: "ata", limit: 10)
        XCTAssertEqual(ids, ["u1"])
    }

    func test_searchUsers_byDisplayName() async throws {
        let pool = try makePool()
        let index = SearchIndex(pool: pool)

        await index.indexUsers([
            makeUser(id: "u1", username: "user_a", displayName: "Marie Dupont"),
            makeUser(id: "u2", username: "user_b", displayName: "Pierre Martin")
        ])

        let ids = try await index.searchUsers(query: "Marie", limit: 10)
        XCTAssertEqual(ids, ["u1"])
    }

    func test_searchUsers_diacriticsIgnored() async throws {
        let pool = try makePool()
        let index = SearchIndex(pool: pool)

        await index.indexUsers([
            makeUser(id: "u1", username: "andre", displayName: "André Martin")
        ])

        let ids = try await index.searchUsers(query: "andré", limit: 10)
        XCTAssertEqual(ids, ["u1"], "unicode61 remove_diacritics 2 should fold accents")
    }

    func test_searchConversations_emptyQuery_returnsEmpty() async throws {
        let pool = try makePool()
        let index = SearchIndex(pool: pool)
        let ids = try await index.searchConversations(query: "", limit: 10)
        XCTAssertTrue(ids.isEmpty)
    }

    // MARK: - Update / Remove

    func test_indexConversations_isIdempotent() async throws {
        let pool = try makePool()
        let index = SearchIndex(pool: pool)
        let conv = makeConversation(id: "c1", title: "First Title")

        await index.indexConversations([conv])
        await index.indexConversations([conv])

        let count = try await pool.read { db in
            try Int.fetchOne(db, sql: "SELECT count(*) FROM conversations_fts WHERE id = 'c1'") ?? 0
        }
        XCTAssertEqual(count, 1, "Re-indexing the same id should not create a duplicate row")
    }

    func test_indexConversations_overwritesPreviousValue() async throws {
        let pool = try makePool()
        let index = SearchIndex(pool: pool)

        await index.indexConversations([makeConversation(id: "c1", title: "Old")])
        await index.indexConversations([makeConversation(id: "c1", title: "New")])

        let oldHits = try await index.searchConversations(query: "Old", limit: 10)
        let newHits = try await index.searchConversations(query: "New", limit: 10)
        XCTAssertTrue(oldHits.isEmpty, "Old title should no longer match after re-index")
        XCTAssertEqual(newHits, ["c1"], "New title should match")
    }

    func test_removeConversation_dropsFromIndex() async throws {
        let pool = try makePool()
        let index = SearchIndex(pool: pool)

        await index.indexConversations([makeConversation(id: "c1", title: "Phoenix")])
        await index.removeConversation(id: "c1")

        let ids = try await index.searchConversations(query: "Phoenix", limit: 10)
        XCTAssertTrue(ids.isEmpty)
    }

    func test_clearAll_resetsBothIndexes() async throws {
        let pool = try makePool()
        let index = SearchIndex(pool: pool)

        await index.indexConversations([makeConversation(id: "c1", title: "Phoenix")])
        await index.indexUsers([makeUser(id: "u1", username: "andre")])
        await index.clearAll()

        let convCount = try await pool.read { db in
            try Int.fetchOne(db, sql: "SELECT count(*) FROM conversations_fts") ?? 0
        }
        let userCount = try await pool.read { db in
            try Int.fetchOne(db, sql: "SELECT count(*) FROM users_fts") ?? 0
        }
        XCTAssertEqual(convCount, 0)
        XCTAssertEqual(userCount, 0)
    }

    // MARK: - Helpers

    private func makePool() throws -> DatabaseQueue {
        let path = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("test_searchindex_\(UUID().uuidString).sqlite").path
        let queue = try DatabaseQueue(path: path)
        try SearchIndexMigrations.runAll(on: queue)
        return queue
    }

    private func makeConversation(
        id: String,
        title: String? = nil,
        description: String? = nil,
        identifier: String = "",
        lastMessagePreview: String? = nil,
        participantUsername: String? = nil
    ) -> MeeshyConversation {
        var conv = MeeshyConversation(
            id: id,
            identifier: identifier.isEmpty ? id : identifier,
            type: .direct,
            title: title,
            description: description
        )
        conv.lastMessagePreview = lastMessagePreview
        conv.participantUsername = participantUsername
        return conv
    }

    private func makeUser(
        id: String,
        username: String,
        displayName: String? = nil,
        firstName: String? = nil,
        lastName: String? = nil,
        bio: String? = nil
    ) -> MeeshyUser {
        MeeshyUser(
            id: id,
            username: username,
            firstName: firstName,
            lastName: lastName,
            displayName: displayName,
            bio: bio
        )
    }
}
