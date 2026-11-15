import XCTest
import MeeshySDK
@testable import Meeshy

/// Ce que la ligne d'un lien DIT de sa progression (#13938) : « il manque un message
/// audio », « 3 semaines sur 4 », « tu peux demander Proche », ou rien. Le client ne
/// décide d'aucun niveau : il ne fait que lire ce que le serveur sert.
final class CircleProgressSummaryTests: XCTestCase {

    private func link(
        _ level: RelationLevel,
        weeks: Int = 0,
        needed: Int? = nil,
        missing: [String] = [],
        eligibleFor: RelationLevel? = nil
    ) -> RelationLink {
        RelationLink(
            userId: "u1", effectiveLevel: level, grantedByMe: level,
            progress: RelationProgress(activeWeeks: weeks, needed: needed, missing: missing), eligibleFor: eligibleFor
        )
    }

    func test_whatIsMissing_isSaidFirst() {
        XCTAssertEqual(
            CircleProgressSummary.make(link(.acquaintance, missing: ["audio", "postView"])),
            .missing([.audio, .postView])
        )
    }

    func test_anUnknownMissingKey_isNotInvented() {
        XCTAssertEqual(CircleProgressSummary.make(link(.friend, missing: ["teleport"])), .missing([.other]))
    }

    func test_anAvailableRung_saysTheTarget() {
        XCTAssertEqual(CircleProgressSummary.make(link(.acquaintance)), .eligible(.friend))
        XCTAssertEqual(CircleProgressSummary.make(link(.friend, weeks: 4, needed: 4, eligibleFor: .close)), .eligible(.close))
    }

    func test_aLockedRung_saysTheWeeksDoneOverNeeded() {
        XCTAssertEqual(CircleProgressSummary.make(link(.friend, weeks: 3, needed: 4)), .weeks(done: 3, needed: 4))
    }

    func test_weeksNeverExceedTheNeededCount() {
        XCTAssertEqual(CircleProgressSummary.make(link(.close, weeks: 14, needed: 12, eligibleFor: .close)), .weeks(done: 12, needed: 12))
    }

    func test_atTheTopOfTheLadder_saysNothing() {
        XCTAssertEqual(CircleProgressSummary.make(link(.blood)), .none)
    }

    func test_aLockedRungWithoutAServedCount_saysNothing() {
        XCTAssertEqual(CircleProgressSummary.make(link(.friend)), .none)
    }
}
