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

    // MARK: - Le niveau que la frappe coûte (#10892) : la poche fait le niveau, la frappe le fait baisser

    private func dropping(before: Int, after: Int, ladder: GameMintLadder? = nil) -> GameMintPreview {
        GameMintPreview(number: 1, price: 665, edition: .silver, canMint: true, missingPoints: 0, levelBefore: before,
                        levelAfter: after, levelsLost: max(0, before - after), gloryGained: 1_000, ladder: ladder)
    }

    func test_aMintThatLowersTheLevel_saysThePassage() throws {
        let passage = try XCTUnwrap(GameMintCostCopy.levelPassage(dropping(before: 9, after: 8)))
        XCTAssertEqual(passage.text, GameMintCostCopy.levelPassageText(before: 9, after: 8))
        XCTAssertTrue(passage.text.contains("9 → 8"), passage.text)
        XCTAssertEqual(passage.accessibilityLabel, GameMintCostCopy.levelPassageSpoken(before: 9, after: 8))
        XCTAssertFalse(passage.accessibilityLabel.contains("→"), "VoiceOver lit une phrase, pas une flèche")
    }

    /// Au-delà de 100, les champs d'hier mentent : la lecture ouverte (`ladder`) fait foi.
    func test_thePassage_readsTheOpenedLadder_whenServed() throws {
        let mint = dropping(before: 100, after: 100, ladder: GameMintLadder(levelBefore: 140, levelAfter: 137, levelsLost: 3))
        XCTAssertEqual(try XCTUnwrap(GameMintCostCopy.levelPassage(mint)).text, GameMintCostCopy.levelPassageText(before: 140, after: 137))
    }

    func test_aMintThatCostsNoLevel_saysNoPassage() {
        XCTAssertNil(GameMintCostCopy.levelPassage(dropping(before: 9, after: 9)))
        XCTAssertNil(GameMintCostCopy.levelPassage(dropping(before: 9, after: 10)))
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

    // MARK: - Le refus de la passerelle (ffbc396c92)

    func test_theDebtRefusal_saysTheDebt_withItsAmountWhenKnown() {
        XCTAssertEqual(GameMintCostCopy.mintFailureMessage(code: .mintBlockedByDebt, debt: 250), GameMintCostCopy.debtText(250))
        XCTAssertEqual(GameMintCostCopy.mintFailureMessage(code: .mintBlockedByDebt, debt: nil), GameMintCostCopy.debtText(0))
    }

    /// `blockedBy: 'debt'` sans montant servi : la phrase dit la dette sans inventer de nombre.
    func test_aDebtWithoutAmount_saysItWithoutANumber() {
        XCTAssertFalse(GameMintCostCopy.debtText(0).contains("0"))
        XCTAssertTrue(GameMintCostCopy.debtText(250).contains(GameCopy.formatCount(250)))
    }

    func test_otherRefusals_keepTheirOwnMessage() {
        XCTAssertEqual(GameMintCostCopy.mintFailureMessage(code: .treasuryLocked, debt: nil), GameCopy.errorMessage(for: .treasuryLocked))
        XCTAssertEqual(GameMintCostCopy.mintFailureMessage(code: nil, debt: nil), GameMintCostCopy.genericFailure)
    }

    func test_theViewModel_saysTheRefusal() throws {
        let vm = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/ViewModels/ProgressionViewModel.swift"))
        XCTAssertTrue(vm.contains("GameMintCostCopy.mintFailureMessage(code: refusal"))
    }

    func test_theMintHero_showsTheCostLine_andTheBlocker() throws {
        let hero = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Game/GameMintPreviewView.swift"))
        XCTAssertTrue(hero.contains("GameMintCostCopy.costLine(mint)"))
        XCTAssertTrue(hero.contains("GameMintCostCopy.blockerMessage(mint)"))
        XCTAssertTrue(hero.contains("held: game.level.sparkFacts.pocket"), "la poche paie, jamais le cycle")
    }
}
