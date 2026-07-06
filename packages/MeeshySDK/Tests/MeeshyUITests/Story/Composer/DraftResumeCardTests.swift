import XCTest
@testable import MeeshyUI

/// U4 inc.1 — pins du helper pur de fraîcheur de `DraftResumeCard`.
final class DraftResumeCardTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_000_000)

    func test_freshness_nilDate_returnsNil() {
        XCTAssertNil(DraftResumeCard.freshnessLabel(from: nil, now: now))
    }

    func test_freshness_justNow() {
        let label = DraftResumeCard.freshnessLabel(from: now.addingTimeInterval(-30), now: now)
        XCTAssertEqual(label, "modifié à l'instant")
    }

    func test_freshness_minutes_hours_days() {
        XCTAssertEqual(DraftResumeCard.freshnessLabel(from: now.addingTimeInterval(-25 * 60), now: now),
                       "modifié il y a 25 min")
        XCTAssertEqual(DraftResumeCard.freshnessLabel(from: now.addingTimeInterval(-3 * 3600), now: now),
                       "modifié il y a 3 h")
        XCTAssertEqual(DraftResumeCard.freshnessLabel(from: now.addingTimeInterval(-2 * 86_400), now: now),
                       "modifié il y a 2 j")
    }

    func test_freshness_futureDate_clampsToNow() {
        let label = DraftResumeCard.freshnessLabel(from: now.addingTimeInterval(120), now: now)
        XCTAssertEqual(label, "modifié à l'instant", "Horloge dérivante : jamais de « il y a -2 min »")
    }
}
