import XCTest
@testable import Meeshy
import MeeshySDK
import MeeshyUI

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
            counter("content.text_message", count: 1_100, points: 27_500),
            counter("content.post", count: 3, points: 150),
        ]
        let impact = GameMintBadgeImpact.impact(counters: counters, price: 1_221)
        XCTAssertEqual(impact?.lost, 0, "49 messages repris sur 1 100 : le palier 1 000 tient encore")
    }

    func test_theRoundingIsTheHalfUpOfTheLaw() {
        // 1 221 points sur 2 442 = la moitié exacte de 3 actions = 1,5 → 2 (Math.round).
        let counters = [counter("content.text_message", count: 3, points: 2_442)]
        let impact = GameMintBadgeImpact.impact(counters: counters, price: 1_221)
        XCTAssertEqual(impact, MintBadgeImpact(lost: 0, regain: 0), "3 − 2 = 1 : le palier 1 tient encore")
    }
}

/// L'étagère des badges d'accumulation (#9380) : ce qui se montre, dans quelle matière,
/// et si le badge est allumé ou réduit à son empreinte.
final class GameBadgeShelfTests: XCTestCase {

    private func progress(counters: [APIEngagementProgress.Counter], served: [APIEngagementProgress.Milestone] = []) -> EngagementProgress {
        EngagementProgressResolver.resolve(APIEngagementProgress(
            counters: counters, milestones: served,
            streak: .init(currentStreakDays: 0, longestStreakDays: 0), level: .init(engagementScore: 0)
        ))
    }

    func test_theMaterialSaysTheHeightOfTheTier() {
        XCTAssertEqual(GameBadges.material(forThreshold: 1), .copper)
        XCTAssertEqual(GameBadges.material(forThreshold: 10), .bronze)
        XCTAssertEqual(GameBadges.material(forThreshold: 50), .silver)
        XCTAssertEqual(GameBadges.material(forThreshold: 100), .gold)
        XCTAssertEqual(GameBadges.material(forThreshold: 500), .platinum)
        XCTAssertEqual(GameBadges.material(forThreshold: 1_000), .obsidian)
        XCTAssertEqual(GameBadges.material(forThreshold: 5_000), .prism)
    }

    func test_onlyEarnedTiersAreShown_eachLitWhileTheCounterHoldsThem() {
        let items = GameBadges.items(for: progress(counters: [.init(axisKey: "content.text_message", count: 60)]))
        XCTAssertEqual(items.map(\.threshold), [1, 10, 50])
        XCTAssertEqual(items.map(\.material), [.copper, .bronze, .silver])
        XCTAssertTrue(items.allSatisfy(\.lit))
        XCTAssertTrue(items.allSatisfy { $0.missing == 0 })
    }

    func test_aTierTheCounterNoLongerHolds_isAnImprintThatSaysWhatIsMissing() {
        let served = APIEngagementProgress.Milestone(
            milestoneType: .badge, milestoneKey: EngagementCatalog.badgeMilestoneKey(.textMessage, threshold: 50),
            reachedAt: "2026-09-01T10:00:00.000Z"
        )
        let items = GameBadges.items(for: progress(counters: [.init(axisKey: "content.text_message", count: 13)], served: [served]))
        let silver = items.first { $0.threshold == 50 }
        XCTAssertEqual(silver?.lit, false)
        XCTAssertEqual(silver?.missing, 37)
        XCTAssertEqual(items.first { $0.threshold == 10 }?.lit, true)
    }

    func test_nothingEarned_nothingShown() {
        XCTAssertTrue(GameBadges.items(for: progress(counters: [])).isEmpty)
    }

    // MARK: - Les médailles (#9466)

    func test_theMedalArc_isTheShareOfTheWayToTheNextTier_andAFullArcOnceTheNextOneIsHeld() {
        let items = GameBadges.items(for: progress(counters: [.init(axisKey: "content.text_message", count: 30)]))
        let bronze = items.first { $0.threshold == 10 }
        XCTAssertEqual(bronze?.nextThreshold, 50)
        XCTAssertEqual(bronze?.progress ?? -1, 0.5, accuracy: 0.0001, "(30 − 10) / (50 − 10)")
        XCTAssertEqual(bronze?.aimsAtNext, true)
        let copper = items.first { $0.threshold == 1 }
        XCTAssertEqual(copper?.progress, 1, "le palier suivant (10) est déjà tenu : l'arc est plein")
        XCTAssertEqual(copper?.aimsAtNext, false)
    }

    func test_anImprint_hasNoArc_andAimsAtNothing() {
        let served = APIEngagementProgress.Milestone(
            milestoneType: .badge, milestoneKey: EngagementCatalog.badgeMilestoneKey(.textMessage, threshold: 50),
            reachedAt: "2026-09-01T10:00:00.000Z"
        )
        let items = GameBadges.items(for: progress(counters: [.init(axisKey: "content.text_message", count: 13)], served: [served]))
        let silver = items.first { $0.threshold == 50 }
        XCTAssertEqual(silver?.progress, 0)
        XCTAssertEqual(silver?.aimsAtNext, false)
    }

    func test_theMedalCarriesTheFamilyAndTheGlyphOfItsAxis() {
        let items = GameBadges.items(for: progress(counters: [
            .init(axisKey: "content.text_message", count: 1),
            .init(axisKey: "comment.audio", count: 1),
            .init(axisKey: "social.friendship", count: 1),
        ]))
        func item(_ axis: EngagementAxisKey) -> GameBadgeItem? { items.first { $0.axis == axis } }
        XCTAssertEqual(item(.textMessage)?.family, .content)
        XCTAssertEqual(item(.textMessage)?.glyph, .textMessage)
        XCTAssertEqual(item(.audioComment)?.family, .comment)
        XCTAssertEqual(item(.audioComment)?.glyph, .audioComment)
        XCTAssertEqual(item(.friendship)?.family, .social)
        XCTAssertEqual(item(.friendship)?.glyph, .friendship)
    }

    func test_everyAxisOfTheCatalogHasAGlyph_neverABubble() {
        for axis in EngagementAxisKey.allCases {
            XCTAssertTrue(GameMedalGlyph.allCases.contains(GameMedalGlyph(axis: axis)), "\(axis)")
        }
        XCTAssertEqual(GameMedalGlyph.allCases.count, 9)
    }
}
