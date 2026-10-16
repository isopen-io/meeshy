import XCTest
@testable import Meeshy
import MeeshySDK

/// La frappe (#10847, #10848) : l'écran dit le coût EFFECTIF (le prix de base et le facteur du niveau), la réserve
/// fermée par le rang, et le blocage par dette — chacun avec un message clair.
@MainActor
final class GameMintCostCopyTests: XCTestCase {

    private func mint(price: Int = 665, base: Int? = 1_221, factor: Double? = 0.545, level: Int? = 9,
                      missing: Int = 0, locked: GameMintLock? = nil, debt: Int? = nil) -> GameMintPreview {
        GameMintPreview(number: 1, price: price, edition: .silver, canMint: missing == 0 && locked == nil && (debt ?? 0) == 0,
                        missingPoints: missing, levelBefore: 9, levelAfter: 9, levelsLost: 0, gloryGained: 1_000,
                        basePrice: base, costFactor: factor, costLevel: level, locked: locked, sparksDebt: debt)
    }

    func test_aDiscountedCost_namesTheBasePriceAndTheLevelFactor() {
        XCTAssertEqual(GameMintCostCopy.costLine(mint()),
                       GameMintCostCopy.costLineText(base: 1_221, percent: 54.5, level: 9))
    }

    /// Plein tarif (niveau 100 et plus) ou serveur antérieur : rien à expliquer, le prix suffit.
    func test_fullPriceOrOlderServer_saysNothingMore() {
        XCTAssertNil(GameMintCostCopy.costLine(mint(price: 1_221, factor: 1, level: 120)))
        XCTAssertNil(GameMintCostCopy.costLine(mint(base: nil, factor: nil, level: nil)))
    }

    func test_theDebt_isSaidClearly_andComesFirst() {
        let lock = GameMintLock(tier: .coffre, minHeld: 100, requires: .init(rank: .voix, division: 1, division5: 1))
        XCTAssertEqual(GameMintCostCopy.blockerMessage(mint(locked: lock, debt: 300)), GameMintCostCopy.debtText(300))
    }

    func test_aLockedReserve_namesTheReserveAndTheRankItNeeds() {
        let lock = GameMintLock(tier: .coffre, minHeld: 100, requires: .init(rank: .voix, division: 1, division5: 1))
        XCTAssertEqual(GameMintCostCopy.blockerMessage(mint(locked: lock)),
                       GameMintCostCopy.lockedText(reserve: GameCopy.treasuryName(.coffre),
                                                   rank: GameCopy.rankLabel(.voix, division5: .i)))
    }

    /// Les étincelles qui manquent ont déjà leur phrase dans la rangée de dépense : pas de message de plus.
    func test_missingSparks_haveNoExtraMessage() {
        XCTAssertNil(GameMintCostCopy.blockerMessage(mint(missing: 40)))
        XCTAssertNil(GameMintCostCopy.blockerMessage(mint()))
    }

    func test_theMintHero_showsTheCostLine_andTheBlocker() throws {
        let hero = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Game/GameMintPreviewView.swift"))
        XCTAssertTrue(hero.contains("GameMintCostCopy.costLine(mint)"))
        XCTAssertTrue(hero.contains("GameMintCostCopy.blockerMessage(mint)"))
        XCTAssertTrue(hero.contains("held: game.level.sparkFacts.pocket"), "la poche paie, jamais le cycle")
    }
}
