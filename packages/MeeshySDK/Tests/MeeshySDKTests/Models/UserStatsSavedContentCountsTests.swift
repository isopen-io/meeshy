import XCTest
@testable import MeeshySDK

/// « Mes contenus » (#19469) : les compteurs de favoris, d'enregistrées et de packs se lisent dès que la passerelle
/// les sert (#19470) ; absents, illisibles ou négatifs, ils restent `nil`, jamais un zéro inventé.
final class UserStatsSavedContentCountsTests: XCTestCase {

    private func decode(_ json: String) throws -> UserStats {
        try JSONDecoder().decode(UserStats.self, from: Data(json.utf8))
    }

    func test_servedCounts_areRead() throws {
        let stats = try decode(#"{"totalMessages":3,"starredMessagesCount":48,"bookmarksCount":112,"packsCount":6}"#)

        XCTAssertEqual(stats.starredMessagesCount, 48)
        XCTAssertEqual(stats.bookmarksCount, 112)
        XCTAssertEqual(stats.packsCount, 6)
        XCTAssertEqual(stats.totalMessages, 3)
    }

    func test_anOldServer_servesNoCounts_soNoneIsInvented() throws {
        let stats = try decode(#"{"totalMessages":3}"#)

        XCTAssertNil(stats.starredMessagesCount)
        XCTAssertNil(stats.bookmarksCount)
        XCTAssertNil(stats.packsCount)
    }

    func test_anUnreadableOrNegativeCount_isAbsent() throws {
        let stats = try decode(#"{"starredMessagesCount":-1,"bookmarksCount":"112","packsCount":null}"#)

        XCTAssertNil(stats.starredMessagesCount)
        XCTAssertNil(stats.bookmarksCount)
        XCTAssertNil(stats.packsCount)
    }

    func test_theCountsSurviveTheCacheRoundTrip() throws {
        let stats = UserStats(starredMessagesCount: 48, bookmarksCount: 112, packsCount: 6)

        let back = try JSONDecoder().decode(UserStats.self, from: JSONEncoder().encode(stats))

        XCTAssertEqual(back.starredMessagesCount, 48)
        XCTAssertEqual(back.bookmarksCount, 112)
        XCTAssertEqual(back.packsCount, 6)
    }
}
