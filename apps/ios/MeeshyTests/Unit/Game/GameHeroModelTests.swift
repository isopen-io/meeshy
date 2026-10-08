import XCTest
@testable import Meeshy
import MeeshySDK

/// Le héro de Progression (#5841, #9667) : « Comment gagner » se DÉRIVE du catalogue (ce qu'un geste
/// de chaque famille rapporte AU PLUS, `familyTopPoints`) — régler un poids
/// change ce que le héro énumère, sans toucher une seule chaîne.
@MainActor
final class GameHeroModelTests: XCTestCase {

    func test_theEarnList_hasOneItemPerFamily_sortedByDescendingWeight() {
        let items = GameHero.earnItems()
        XCTAssertEqual(items.map(\.family), [.content, .comment, .social, .conversation, .tool])
        XCTAssertEqual(items.map(\.weight), [300, 40, 7, 5, 4])
    }

    func test_theEarnList_isTheCatalogScale_notACopy() {
        let items = GameHero.earnItems()
        for item in items {
            XCTAssertEqual(item.weight, EngagementCatalog.familyTopPoints[item.family], "\(item.family)")
        }
        XCTAssertEqual(Set(items.map(\.family)), Set(EngagementAxisFamily.allCases))
    }

    func test_settingAWeightChangesTheList_withoutTouchingAString() {
        let retuned = GameHero.earnItems(weights: [.content: 2, .social: 11, .conversation: 5, .comment: 5, .tool: 1])
        // À poids égal (conversation et comment : 5), l'ordre du catalogue décide — comment précède conversation.
        XCTAssertEqual(retuned.map(\.family), [.social, .comment, .conversation, .content, .tool])
        XCTAssertEqual(retuned.first?.weight, 11)
    }

    func test_equalWeights_keepTheCatalogOrder_neverTheOrderOfADictionary() {
        let flat = GameHero.earnItems(weights: [.tool: 4, .social: 4, .content: 4, .comment: 4, .conversation: 4])
        XCTAssertEqual(flat.map(\.family), EngagementAxisFamily.allCases)
    }

    func test_aFamilyTheScaleDoesNotWeigh_isNotListed() {
        let partial = GameHero.earnItems(weights: [.content: 9])
        XCTAssertEqual(partial.map(\.family), [.content])
    }

    func test_theChips_openTheRuleThatSaysHowPointsAreWon_andTheMintOpensTheMintRule() {
        XCTAssertEqual(GameHero.earnRule, 1)
        XCTAssertEqual(GameHero.mintRule, 3)
        let rules = GameGuideCopy.rules
        XCTAssertTrue(rules.contains { $0.index == GameHero.earnRule })
        XCTAssertTrue(rules.contains { $0.index == GameHero.mintRule })
    }

    // MARK: - Mee dans le coin

    private func card(presentation: GuidePresentation, step: GuideCard.Step? = nil) -> GuideCard {
        GuideCard(
            key: "moment.test", speaker: .mee, mood: .calm,
            copy: GuideCopy(what: "what", means: "means", next: "next", short: "la ligne courte", action: "action"),
            action: .seeLevel, presentation: presentation, step: step, photo: false
        )
    }

    func test_theCornerSaysTheShortLine_ofAGuideCardAlreadySeen() {
        XCTAssertEqual(GameHero.cornerLine(for: card(presentation: .short)), "la ligne courte")
    }

    func test_aFirstTimeCardKeepsItsFullCard_theCornerStaysSilent() {
        XCTAssertNil(GameHero.cornerLine(for: card(presentation: .full)))
    }

    func test_anOnboardingStepKeepsItsButtons_theCornerStaysSilent() {
        XCTAssertNil(GameHero.cornerLine(for: card(presentation: .short, step: .init(index: 2, total: 7))))
        XCTAssertNil(GameHero.cornerLine(for: nil))
    }

    func test_tappingMeeOpensTheFullVersionOfTheSameCard() {
        let short = card(presentation: .short)
        let full = short.presenting(.full)
        XCTAssertEqual(full.presentation, .full)
        XCTAssertEqual(full.key, short.key)
        XCTAssertEqual(full.copy, short.copy)
        XCTAssertEqual(full.action, short.action)
    }
}
