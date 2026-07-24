import XCTest
@testable import Meeshy

/// La chasse paginée doit charger EXACTEMENT les pages nécessaires pour
/// atteindre un commentaire notifié hors de la première page — et jamais plus
/// que le cap (fil viral).
final class CommentTargetHunterTests: XCTestCase {

    func test_hunt_targetAlreadyPresent_loadsNothing() async {
        var loads = 0

        let found = await CommentTargetHunter.hunt(
            isPresent: { true },
            hasMore: { true },
            loadNextPage: { loads += 1 }
        )

        XCTAssertTrue(found)
        XCTAssertEqual(loads, 0)
    }

    func test_hunt_targetOnThirdPage_loadsThreePages() async {
        var loads = 0

        let found = await CommentTargetHunter.hunt(
            isPresent: { loads >= 3 },
            hasMore: { true },
            loadNextPage: { loads += 1 }
        )

        XCTAssertTrue(found)
        XCTAssertEqual(loads, 3)
    }

    func test_hunt_stopsAtMaxPagesCap() async {
        var loads = 0

        let found = await CommentTargetHunter.hunt(
            maxPages: 4,
            isPresent: { false },
            hasMore: { true },
            loadNextPage: { loads += 1 }
        )

        XCTAssertFalse(found)
        XCTAssertEqual(loads, 4)
    }

    func test_hunt_stopsWhenNoMorePages() async {
        var loads = 0

        let found = await CommentTargetHunter.hunt(
            isPresent: { false },
            hasMore: { loads < 2 },
            loadNextPage: { loads += 1 }
        )

        XCTAssertFalse(found)
        XCTAssertEqual(loads, 2, "s'arrête quand hasMore devient faux, pas au cap")
    }
}
