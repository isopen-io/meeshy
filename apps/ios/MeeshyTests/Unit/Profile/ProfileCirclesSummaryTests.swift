import XCTest
import MeeshySDK
@testable import Meeshy

/// « Mes cercles » sur ma fiche (#18590) : la rangée compte mes liens par niveau EFFECTIF, dans l'ordre des cercles, et
/// ne montre jamais un nombre que le serveur n'a pas servi.
final class ProfileCirclesSummaryTests: XCTestCase {

    private func link(_ userId: String, _ level: RelationLevel, grantedByMe: RelationLevel? = nil) -> RelationLink {
        RelationLink(userId: userId, effectiveLevel: level, grantedByMe: grantedByMe ?? level)
    }

    func test_make_withoutLinks_isFiveZerosInTheCircleOrder() {
        let summary = ProfileCirclesSummary.make(links: [], pendingCount: 0)

        XCTAssertEqual(summary.entries.map(\.level), [.community, .acquaintance, .friend, .close, .blood])
        XCTAssertEqual(summary.entries.map(\.count), [0, 0, 0, 0, 0])
        XCTAssertEqual(summary.total, 0)
        XCTAssertEqual(summary.pendingCount, 0)
        XCTAssertTrue(summary.isEmpty)
    }

    func test_make_oneLinkPerLevel_countsEachAtItsEffectiveLevel() {
        let summary = ProfileCirclesSummary.make(links: [
            link("a", .community), link("b", .acquaintance), link("c", .friend), link("d", .close), link("e", .blood),
            link("f", .friend, grantedByMe: .blood),
        ], pendingCount: 0)

        XCTAssertEqual(summary.count(of: .community), 1)
        XCTAssertEqual(summary.count(of: .acquaintance), 1)
        XCTAssertEqual(summary.count(of: .friend), 2, "un lien se compte à son niveau EFFECTIF, jamais à mon accord")
        XCTAssertEqual(summary.count(of: .close), 1)
        XCTAssertEqual(summary.count(of: .blood), 1)
        XCTAssertEqual(summary.total, 6)
        XCTAssertFalse(summary.isEmpty)
    }

    func test_make_publicLinks_areNotACircle_andAreNeverCounted() {
        let summary = ProfileCirclesSummary.make(links: [link("a", .public), link("b", .friend)], pendingCount: 0)

        XCTAssertEqual(summary.total, 1)
        XCTAssertEqual(summary.count(of: .public), 0)
    }

    func test_make_aPersonServedTwice_isCountedOnce_atItsLastServedLevel() {
        let summary = ProfileCirclesSummary.make(links: [link("a", .friend), link("a", .close)], pendingCount: 0)

        XCTAssertEqual(summary.total, 1, "une personne n'est jamais comptée deux fois")
        XCTAssertEqual(summary.count(of: .close), 1)
        XCTAssertEqual(summary.count(of: .friend), 0)
    }

    func test_make_pendingCount_isCarried_andANegativeCountIsNeverShown() {
        XCTAssertEqual(ProfileCirclesSummary.make(links: [], pendingCount: 3).pendingCount, 3)
        XCTAssertEqual(ProfileCirclesSummary.make(links: [], pendingCount: -2).pendingCount, 0)
    }

    func test_empty_isTheSummaryOfNothingServed() {
        XCTAssertEqual(ProfileCirclesSummary.empty, ProfileCirclesSummary.make(links: [], pendingCount: 0))
    }
}
