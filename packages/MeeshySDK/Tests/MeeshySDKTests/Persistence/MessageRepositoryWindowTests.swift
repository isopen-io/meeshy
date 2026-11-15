import XCTest
import GRDB
@testable import MeeshySDK

final class MessageRepositoryWindowTests: XCTestCase {

    private func makeRepository(seconds: [TimeInterval], conversationId: String = "c1") throws -> MessageRepository {
        let queue = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: queue)
        try queue.write { db in
            for second in seconds {
                var record = MessageRecordFactory.make(localId: "m\(Int(second))", conversationId: conversationId,
                                                       state: .sent, createdAt: Date(timeIntervalSince1970: second))
                record.serverId = "s\(Int(second))"
                try record.insert(db)
            }
            var stranger = MessageRecordFactory.make(localId: "x", conversationId: "other", state: .sent,
                                                     createdAt: Date(timeIntervalSince1970: 15))
            stranger.serverId = "s15"
            try stranger.insert(db)
        }
        return MessageRepository(persistence: MessagePersistenceActor(dbWriter: queue, currentUserId: "user_me"))
    }

    private func ids(_ records: [MessageRecord]) -> [String] { records.map(\.localId) }

    private func date(_ second: TimeInterval) -> Date { Date(timeIntervalSince1970: second) }

    func test_latestWithoutAnchor_readsTheNewestRowsOldestFirst() throws {
        let repository = try makeRepository(seconds: [10, 20, 30, 40])

        let rows = try repository.messageWindow(conversationId: "c1", mode: .latest, anchor: nil, initialWindowSize: 2)

        XCTAssertEqual(ids(rows), ["m30", "m40"])
    }

    func test_latestAnchored_readsEverythingFromTheAnchor() throws {
        let repository = try makeRepository(seconds: [10, 20, 30, 40])

        let rows = try repository.messageWindow(conversationId: "c1", mode: .latest, anchor: date(20), initialWindowSize: 1)

        XCTAssertEqual(ids(rows), ["m20", "m30", "m40"])
    }

    func test_latestAnchored_withCap_keepsOnlyTheNewestRows() throws {
        let repository = try makeRepository(seconds: [10, 20, 30, 40])

        let rows = try repository.messageWindow(conversationId: "c1", mode: .latest, anchor: date(10),
                                           initialWindowSize: 1, anchoredRowCap: 2)

        XCTAssertEqual(ids(rows), ["m30", "m40"])
    }

    func test_around_halfWindow_takesHalfOnEachSide() throws {
        let repository = try makeRepository(seconds: [10, 20, 30, 40, 50, 60])

        let rows = try repository.messageWindow(conversationId: "c1", mode: .around(date: date(30)), anchor: nil,
                                           initialWindowSize: 4)

        XCTAssertEqual(ids(rows), ["m20", "m30", "m40", "m50"])
    }

    func test_around_throughEdge_stopsAtTheEdgeInclusive() throws {
        let repository = try makeRepository(seconds: [10, 20, 30, 40, 50, 60])

        let rows = try repository.messageWindow(conversationId: "c1", mode: .around(date: date(30)), anchor: nil,
                                           initialWindowSize: 2, newerEdge: .through(date(50)))

        XCTAssertEqual(ids(rows), ["m30", "m40", "m50"])
    }

    func test_around_presentEdge_readsEverythingNewer() throws {
        let repository = try makeRepository(seconds: [10, 20, 30, 40, 50, 60])

        let rows = try repository.messageWindow(conversationId: "c1", mode: .around(date: date(30)), anchor: nil,
                                           initialWindowSize: 2, newerEdge: .present)

        XCTAssertEqual(ids(rows), ["m30", "m40", "m50", "m60"])
    }

    func test_search_readsOnlyTheMatchesOfThisConversation_chronologically_withoutDuplicates() throws {
        let repository = try makeRepository(seconds: [10, 20, 30, 40])

        let rows = try repository.messageWindow(conversationId: "c1", mode: .search(ids: ["s40", "s10", "s15", "s40"]),
                                           anchor: nil, initialWindowSize: 50)

        XCTAssertEqual(ids(rows), ["m10", "m40"])
    }

    func test_search_withoutIds_readsNothing() throws {
        let repository = try makeRepository(seconds: [10])

        let rows = try repository.messageWindow(conversationId: "c1", mode: .search(ids: []), anchor: nil,
                                           initialWindowSize: 50)

        XCTAssertTrue(rows.isEmpty)
    }

    func test_searchIdChunks_overlappingPages_neverRepeatAnId() {
        let chunks = MessageRepository.searchIdChunks(["a", "b", "a", "c", "b"], size: 2)

        XCTAssertEqual(chunks, [["a", "b"], ["c"]])
        XCTAssertEqual(MessageRepository.searchIdChunks([]), [])
        XCTAssertEqual(MessageRepository.searchIdChunks(["a", "b", "a"], size: 0), [["a"], ["b"]])
    }
}
