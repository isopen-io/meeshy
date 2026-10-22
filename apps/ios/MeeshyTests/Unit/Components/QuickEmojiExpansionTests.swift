import XCTest
@testable import Meeshy

/// La bande des emojis rapides s'élargit sous le doigt, le champ garde son micro
/// et le début de son texte d'invite.
final class QuickEmojiExpansionTests: XCTestCase {

    private let resting = QuickEmojiGrid.frameWidth
    /// Champ + bande au repos, ligne de saisie d'un iPhone SE (375 pt) : barre
    /// 2×8, rangée 2×12, porte (+) 44, deux gouttières de 12.
    private let narrow: CGFloat = 375 - 16 - 24 - 44 - 24
    /// Idem sur un Pro Max (440 pt).
    private let wide: CGFloat = 440 - 16 - 24 - 44 - 24

    private func width(_ shared: CGFloat, travel: CGFloat) -> CGFloat {
        QuickEmojiExpansion.bandWidth(sharedWidth: shared, restingWidth: resting, leftwardTravel: travel)
    }

    func test_fieldFloor_keepsAWholeMicTargetAndTheStartOfThePlaceholder() {
        XCTAssertGreaterThanOrEqual(QuickEmojiExpansion.micFloor, 44)
        XCTAssertGreaterThanOrEqual(QuickEmojiExpansion.placeholderFloor, 40)
    }

    func test_bandWidth_atRest_isTheRestingWidth_onNarrowAndWideScreens() {
        XCTAssertEqual(width(narrow, travel: 0), resting)
        XCTAssertEqual(width(wide, travel: 0), resting)
    }

    func test_bandWidth_partialScroll_followsTheFinger_onNarrowAndWideScreens() {
        XCTAssertEqual(width(narrow, travel: 30), resting + 30)
        XCTAssertEqual(width(wide, travel: 30), resting + 30)
    }

    func test_bandWidth_fullScroll_stopsAtTheFieldFloor_onANarrowScreen() {
        let band = width(narrow, travel: 1_000)
        XCTAssertEqual(narrow - band, QuickEmojiExpansion.fieldFloor)
        XCTAssertGreaterThan(band, resting)
    }

    func test_bandWidth_fullScroll_stopsAtTheFieldFloor_onAWideScreen() {
        let band = width(wide, travel: 1_000)
        XCTAssertEqual(wide - band, QuickEmojiExpansion.fieldFloor)
        XCTAssertGreaterThan(band, width(narrow, travel: 1_000))
    }

    func test_bandWidth_fingerComingBackRight_returnsToRest() {
        XCTAssertEqual(width(wide, travel: -40), resting)
    }

    func test_bandWidth_fieldAlreadyAtItsFloor_neverShrinksTheBand() {
        XCTAssertEqual(width(QuickEmojiExpansion.fieldFloor + resting - 10, travel: 50), resting)
    }

    func test_contentOffset_keepsTheEmojisUnderTheFingerWhileTheBandGrows() {
        let band = width(wide, travel: 30)
        let offset = QuickEmojiExpansion.contentOffset(scroll: -30, bandWidth: band, restingWidth: resting)
        let onScreen = -(band - resting) + offset
        XCTAssertEqual(onScreen, -30)
    }

    func test_contentOffset_atRest_isTheScroll() {
        XCTAssertEqual(QuickEmojiExpansion.contentOffset(scroll: -12, bandWidth: resting, restingWidth: resting), -12)
    }
}
