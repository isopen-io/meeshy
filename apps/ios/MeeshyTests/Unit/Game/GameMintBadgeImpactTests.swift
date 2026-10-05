import XCTest
@testable import Meeshy
import MeeshySDK

/// Ce qu'une frappe éteint (#9383, #9379) — le plan de débit de la loi, compté en badges
/// et en actions à refaire. « Inconnu » ne se dit jamais « aucun ».
final class GameMintBadgeImpactTests: XCTestCase {

    private func counter(_ axis: String, count: Int, points: Int?) -> APIEngagementProgress.Counter {
        .init(axisKey: axis, count: count, points: points)
    }

    func test_whenTheServerDoesNotServeThePointsPerAxis_theImpactIsUnknown_notZero() {
        let counters = [counter("content.text_message", count: 60, points: nil)]
        XCTAssertNil(GameMintBadgeImpact.impact(counters: counters, price: 1_294))
    }

    func test_oneAxisWithoutPoints_makesTheWholeCalculationUnknown() {
        let counters = [counter("content.text_message", count: 60, points: 1_500), counter("content.post", count: 3, points: nil)]
        XCTAssertNil(GameMintBadgeImpact.impact(counters: counters, price: 1_294))
    }

    func test_notEnoughDebitablePoints_extinguishesNothing() {
        let counters = [counter("content.text_message", count: 60, points: 400)]
        XCTAssertEqual(GameMintBadgeImpact.impact(counters: counters, price: 1_294), MintBadgeImpact(lost: 0, regain: 0))
    }

    func test_theMostRenewableAxisIsDebitedFirst_andItsBadgesGoDown() {
        // 60 messages à 25 points : 1 294 points = 52 messages repris, il en reste 8 → les paliers 10 et 50 tombent.
        let counters = [counter("content.text_message", count: 60, points: 1_500)]
        XCTAssertEqual(GameMintBadgeImpact.impact(counters: counters, price: 1_294), MintBadgeImpact(lost: 2, regain: 2))
    }

    func test_theDebitSpillsOverToTheNextAxis_andTheNearestBadgeIsTheOneThatIsPromised() {
        let counters = [
            counter("content.text_message", count: 100, points: 500),
            counter("content.post", count: 20, points: 900),
        ]
        // Messages : 500 points = 100 actions → tout tombe (1, 10, 50, 100), il faut 1 action pour revenir à 1.
        // Posts : 500 points sur 900 = 11 actions sur 20 → il en reste 9, le palier 10 tombe, 1 action pour y revenir.
        XCTAssertEqual(GameMintBadgeImpact.impact(counters: counters, price: 1_000), MintBadgeImpact(lost: 5, regain: 1))
    }

    func test_theConversationsAreDebitedInPointsButNeverInActions() {
        let counters = [counter("conversation.private", count: 40, points: 1_300)]
        XCTAssertEqual(GameMintBadgeImpact.impact(counters: counters, price: 1_221), MintBadgeImpact(lost: 0, regain: 0),
                       "le compteur d'une conversation ne bouge pas : son badge reste vrai")
    }

    func test_anAxisTheClientDoesNotKnow_isIgnored() {
        let counters = [counter("axe.futur", count: 9, points: 5_000), counter("content.text_message", count: 60, points: 1_500)]
        XCTAssertEqual(GameMintBadgeImpact.impact(counters: counters, price: 1_294), MintBadgeImpact(lost: 2, regain: 2))
    }

    func test_nothingIsDebitedOnceThePriceIsPaid() {
        let counters = [
            counter("content.text_message", count: 1_000, points: 25_000),
            counter("content.post", count: 3, points: 150),
        ]
        let impact = GameMintBadgeImpact.impact(counters: counters, price: 1_221)
        XCTAssertEqual(impact?.lost, 0, "49 messages repris sur 1 000 : aucun palier ne tombe")
    }

    func test_theRoundingIsTheHalfUpOfTheLaw() {
        // 1 221 points sur 2 442 = la moitié exacte de 3 actions = 1,5 → 2 (Math.round).
        let counters = [counter("content.text_message", count: 3, points: 2_442)]
        let impact = GameMintBadgeImpact.impact(counters: counters, price: 1_221)
        XCTAssertEqual(impact, MintBadgeImpact(lost: 0, regain: 0), "3 − 2 = 1 : le palier 1 tient encore")
    }
}
