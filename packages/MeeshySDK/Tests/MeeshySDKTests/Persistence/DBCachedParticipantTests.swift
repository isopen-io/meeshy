import XCTest
import GRDB
@testable import MeeshySDK

final class DBCachedParticipantTests: XCTestCase {

    private func makeDatabase() throws -> DatabaseQueue {
        let db = try DatabaseQueue(configuration: Configuration())
        try AppDatabase.runMigrations(on: db)
        return db
    }

    // MARK: - Insert and Fetch Roundtrip

    func test_insertAndFetch_allFieldsPreserved() throws {
        let db = try makeDatabase()
        let now = Date()

        var record = DBCachedParticipant(
            id: "p1", conversationId: "conv1",
            userId: "u1", username: "alice",
            firstName: "Alice", lastName: "Smith",
            displayName: "Alice S.", avatar: "https://img.test/a.png",
            conversationRole: "ADMIN", isOnline: true,
            lastActiveAt: now, joinedAt: now,
            isActive: true, cachedAt: now
        )

        try db.write { try record.insert($0) }

        let fetched = try db.read { try DBCachedParticipant.fetchOne($0, key: "p1") }
        XCTAssertNotNil(fetched)
        XCTAssertEqual(fetched?.id, "p1")
        XCTAssertEqual(fetched?.conversationId, "conv1")
        XCTAssertEqual(fetched?.userId, "u1")
        XCTAssertEqual(fetched?.username, "alice")
        XCTAssertEqual(fetched?.firstName, "Alice")
        XCTAssertEqual(fetched?.lastName, "Smith")
        XCTAssertEqual(fetched?.displayName, "Alice S.")
        XCTAssertEqual(fetched?.avatar, "https://img.test/a.png")
        XCTAssertEqual(fetched?.conversationRole, "ADMIN")
        XCTAssertEqual(fetched?.isOnline, true)
        XCTAssertEqual(fetched?.isActive, true)
    }

    func test_insertAndFetch_nilOptionalFields() throws {
        let db = try makeDatabase()

        var record = DBCachedParticipant(
            id: "p2", conversationId: "conv1",
            userId: nil, username: nil,
            firstName: nil, lastName: nil,
            displayName: nil, avatar: nil,
            conversationRole: nil, isOnline: nil,
            lastActiveAt: nil, joinedAt: nil,
            isActive: nil, cachedAt: Date()
        )

        try db.write { try record.insert($0) }

        let fetched = try db.read { try DBCachedParticipant.fetchOne($0, key: "p2") }
        XCTAssertNotNil(fetched)
        XCTAssertNil(fetched?.userId)
        XCTAssertNil(fetched?.username)
        XCTAssertNil(fetched?.firstName)
        XCTAssertNil(fetched?.displayName)
        XCTAssertNil(fetched?.isOnline)
        XCTAssertNil(fetched?.lastActiveAt)
        XCTAssertNil(fetched?.joinedAt)
        XCTAssertNil(fetched?.isActive)
    }

    // MARK: - toPaginatedParticipant

    func test_toPaginatedParticipant_convertsCorrectly() throws {
        let record = DBCachedParticipant(
            id: "p1", conversationId: "conv1",
            userId: "u1", username: "bob",
            firstName: "Bob", lastName: "Jones",
            displayName: "Bobby", avatar: "https://img.test/b.png",
            conversationRole: "USER", isOnline: false,
            lastActiveAt: nil, joinedAt: Date(),
            isActive: true, cachedAt: Date()
        )

        let participant = record.toPaginatedParticipant()

        XCTAssertEqual(participant.id, "p1")
        XCTAssertEqual(participant.userId, "u1")
        XCTAssertEqual(participant.username, "bob")
        XCTAssertEqual(participant.firstName, "Bob")
        XCTAssertEqual(participant.lastName, "Jones")
        XCTAssertEqual(participant.displayName, "Bobby")
        XCTAssertEqual(participant.avatar, "https://img.test/b.png")
        XCTAssertEqual(participant.conversationRole, "USER")
        XCTAssertEqual(participant.isOnline, false)
        XCTAssertEqual(participant.isActive, true)
        XCTAssertEqual(participant.name, "Bobby")
    }

    func test_toPaginatedParticipant_nameFallsBackToFirstLastName() throws {
        let record = DBCachedParticipant(
            id: "p1", conversationId: "conv1",
            userId: nil, username: "charlie",
            firstName: "Charlie", lastName: "Brown",
            displayName: nil, avatar: nil,
            conversationRole: nil, isOnline: nil,
            lastActiveAt: nil, joinedAt: nil,
            isActive: nil, cachedAt: Date()
        )

        let participant = record.toPaginatedParticipant()
        XCTAssertEqual(participant.name, "Charlie Brown")
    }

    func test_toPaginatedParticipant_nameFallsBackToUsername() throws {
        let record = DBCachedParticipant(
            id: "p1", conversationId: "conv1",
            userId: nil, username: "delta",
            firstName: nil, lastName: nil,
            displayName: nil, avatar: nil,
            conversationRole: nil, isOnline: nil,
            lastActiveAt: nil, joinedAt: nil,
            isActive: nil, cachedAt: Date()
        )

        let participant = record.toPaginatedParticipant()
        XCTAssertEqual(participant.name, "delta")
    }

    // MARK: - from() Factory

    func test_from_convertsPaginatedParticipantToRecord() throws {
        let participant = PaginatedParticipant(
            id: "p1", userId: "u1", username: "eve",
            firstName: "Eve", lastName: "Adams",
            displayName: "Evie", avatar: "https://img.test/e.png",
            conversationRole: "MODERATOR", isOnline: true,
            lastActiveAt: nil, joinedAt: nil, isActive: true
        )

        let record = DBCachedParticipant.from(participant, conversationId: "conv42")

        XCTAssertEqual(record.id, "p1")
        XCTAssertEqual(record.conversationId, "conv42")
        XCTAssertEqual(record.userId, "u1")
        XCTAssertEqual(record.username, "eve")
        XCTAssertEqual(record.firstName, "Eve")
        XCTAssertEqual(record.lastName, "Adams")
        XCTAssertEqual(record.displayName, "Evie")
        XCTAssertEqual(record.avatar, "https://img.test/e.png")
        XCTAssertEqual(record.conversationRole, "MODERATOR")
        XCTAssertEqual(record.isOnline, true)
        XCTAssertEqual(record.isActive, true)
    }

    func test_from_roundtrip_preservesData() throws {
        let db = try makeDatabase()
        let participant = PaginatedParticipant(
            id: "p5", userId: "u5", username: "frank",
            firstName: "Frank", displayName: "Frankie"
        )

        var record = DBCachedParticipant.from(participant, conversationId: "conv1")
        try db.write { try record.insert($0) }

        let fetched = try db.read { try DBCachedParticipant.fetchOne($0, key: "p5") }
        let restored = fetched!.toPaginatedParticipant()
        XCTAssertEqual(restored.id, "p5")
        XCTAssertEqual(restored.userId, "u5")
        XCTAssertEqual(restored.username, "frank")
        XCTAssertEqual(restored.firstName, "Frank")
        XCTAssertEqual(restored.displayName, "Frankie")
        XCTAssertEqual(restored.name, "Frankie")
    }

    // MARK: - Filter by conversationId

    func test_filterByConversationId_returnsOnlyMatching() throws {
        let db = try makeDatabase()
        let now = Date()

        try db.write { db in
            var r1 = DBCachedParticipant(
                id: "p1", conversationId: "conv1",
                userId: nil, username: "a", firstName: nil, lastName: nil,
                displayName: nil, avatar: nil, conversationRole: nil,
                isOnline: nil, lastActiveAt: nil, joinedAt: nil,
                isActive: nil, cachedAt: now
            )
            var r2 = DBCachedParticipant(
                id: "p2", conversationId: "conv1",
                userId: nil, username: "b", firstName: nil, lastName: nil,
                displayName: nil, avatar: nil, conversationRole: nil,
                isOnline: nil, lastActiveAt: nil, joinedAt: nil,
                isActive: nil, cachedAt: now
            )
            var r3 = DBCachedParticipant(
                id: "p3", conversationId: "conv2",
                userId: nil, username: "c", firstName: nil, lastName: nil,
                displayName: nil, avatar: nil, conversationRole: nil,
                isOnline: nil, lastActiveAt: nil, joinedAt: nil,
                isActive: nil, cachedAt: now
            )
            try r1.insert(db)
            try r2.insert(db)
            try r3.insert(db)
        }

        let conv1Records = try db.read {
            try DBCachedParticipant
                .filter(Column("conversationId") == "conv1")
                .fetchAll($0)
        }
        XCTAssertEqual(conv1Records.count, 2)
        XCTAssertTrue(conv1Records.allSatisfy { $0.conversationId == "conv1" })

        let conv2Records = try db.read {
            try DBCachedParticipant
                .filter(Column("conversationId") == "conv2")
                .fetchAll($0)
        }
        XCTAssertEqual(conv2Records.count, 1)
        XCTAssertEqual(conv2Records.first?.id, "p3")
    }

    // MARK: - Delete by conversationId

    func test_deleteByConversationId_removesAllMatching() throws {
        let db = try makeDatabase()
        let now = Date()

        try db.write { db in
            var r1 = DBCachedParticipant(
                id: "p1", conversationId: "conv1",
                userId: nil, username: "a", firstName: nil, lastName: nil,
                displayName: nil, avatar: nil, conversationRole: nil,
                isOnline: nil, lastActiveAt: nil, joinedAt: nil,
                isActive: nil, cachedAt: now
            )
            var r2 = DBCachedParticipant(
                id: "p2", conversationId: "conv1",
                userId: nil, username: "b", firstName: nil, lastName: nil,
                displayName: nil, avatar: nil, conversationRole: nil,
                isOnline: nil, lastActiveAt: nil, joinedAt: nil,
                isActive: nil, cachedAt: now
            )
            var r3 = DBCachedParticipant(
                id: "p3", conversationId: "conv2",
                userId: nil, username: "c", firstName: nil, lastName: nil,
                displayName: nil, avatar: nil, conversationRole: nil,
                isOnline: nil, lastActiveAt: nil, joinedAt: nil,
                isActive: nil, cachedAt: now
            )
            try r1.insert(db)
            try r2.insert(db)
            try r3.insert(db)
        }

        let deleted = try db.write {
            try DBCachedParticipant
                .filter(Column("conversationId") == "conv1")
                .deleteAll($0)
        }
        XCTAssertEqual(deleted, 2)

        let remaining = try db.read { try DBCachedParticipant.fetchAll($0) }
        XCTAssertEqual(remaining.count, 1)
        XCTAssertEqual(remaining.first?.id, "p3")
    }

    // MARK: - Update conversationRole

    func test_updateConversationRole_persistsInPlace() throws {
        let db = try makeDatabase()

        var record = DBCachedParticipant(
            id: "p1", conversationId: "conv1",
            userId: nil, username: "a", firstName: nil, lastName: nil,
            displayName: nil, avatar: nil, conversationRole: "USER",
            isOnline: nil, lastActiveAt: nil, joinedAt: nil,
            isActive: nil, cachedAt: Date()
        )

        try db.write { try record.insert($0) }

        record.conversationRole = "ADMIN"
        try db.write { try record.update($0) }

        let fetched = try db.read { try DBCachedParticipant.fetchOne($0, key: "p1") }
        XCTAssertEqual(fetched?.conversationRole, "ADMIN")
    }
}
