import XCTest
@testable import Meeshy

/// La loi de l'aperçu d'appui long d'une conversation (#17242) : grande carte
/// et menu compact au repos, menu qu'on tire vers le haut, carte qui se réduit
/// d'autant, cran conclu au lâcher.
final class ConversationPeekLayoutTests: XCTestCase {

    private func makeLayout(
        availableHeight: CGFloat = 800,
        availableWidth: CGFloat = 430,
        compactMenuHeight: CGFloat = 100,
        naturalMenuHeight: CGFloat = 500
    ) -> ConversationPeekLayout {
        ConversationPeekLayout(
            availableHeight: availableHeight,
            availableWidth: availableWidth,
            compactMenuHeight: compactMenuHeight,
            naturalMenuHeight: naturalMenuHeight
        )
    }

    // MARK: - Au repos

    func test_cardHeight_atRest_takesTheLargestShareOfTheScreen() {
        let layout = makeLayout()
        XCTAssertEqual(layout.cardHeight(progress: 0), 800 - ConversationPeekLayout.spacing - 100)
        XCTAssertGreaterThan(layout.cardHeight(progress: 0), layout.menuHeight(progress: 0) * 5)
    }

    func test_cardWidth_isNearlyTheFullWidth_withSideMargins() {
        XCTAssertEqual(makeLayout(availableWidth: 430).cardWidth, 430 - 2 * ConversationPeekLayout.sideMargin)
    }

    func test_cardWidth_isCapped_onAWideWindow() {
        XCTAssertEqual(makeLayout(availableWidth: 1_200).cardWidth, ConversationPeekLayout.maximumWidth)
    }

    // MARK: - Tirer le menu

    func test_menuHeight_atFullProgress_showsAllItsContent() {
        XCTAssertEqual(makeLayout().menuHeight(progress: 1), 500)
    }

    func test_progress_drivesBothHeights_theCardShrinksByWhatTheMenuGains() {
        let layout = makeLayout()
        let total = layout.menuHeight(progress: 0.5) + layout.cardHeight(progress: 0.5)
        XCTAssertEqual(total, 800 - ConversationPeekLayout.spacing, accuracy: 0.001)
        XCTAssertEqual(layout.menuHeight(progress: 0.5), 300, accuracy: 0.001)
    }

    func test_expandedMenu_neverShrinksTheCardUnderAFewMessages_andScrollsBeyond() {
        let layout = makeLayout(availableHeight: 600, naturalMenuHeight: 900)
        XCTAssertEqual(layout.cardHeight(progress: 1), ConversationPeekLayout.minimumCardHeight, accuracy: 0.001)
        XCTAssertTrue(layout.menuOverflows)
        XCTAssertFalse(makeLayout().menuOverflows)
    }

    func test_pullingUp_followsTheFinger_frameByFrame() {
        let layout = makeLayout()
        XCTAssertEqual(layout.progress(from: .compact, translation: -100), 0.25, accuracy: 0.001)
        XCTAssertEqual(layout.progress(from: .compact, translation: -200), 0.5, accuracy: 0.001)
    }

    func test_comingBackBeforeRelease_restoresTheStartingDetent() {
        let layout = makeLayout()
        XCTAssertEqual(layout.progress(from: .compact, translation: 0), 0)
        XCTAssertEqual(layout.progress(from: .expanded, translation: 0), 1)
    }

    func test_progress_isClamped_beyondTheCourse() {
        let layout = makeLayout()
        XCTAssertEqual(layout.progress(from: .compact, translation: -1_000), 1)
        XCTAssertEqual(layout.progress(from: .compact, translation: 300), 0)
        XCTAssertEqual(layout.progress(from: .expanded, translation: -50), 1)
    }

    func test_pullingDown_fromExpanded_closesTheMenuBackToCompact() {
        XCTAssertEqual(makeLayout().progress(from: .expanded, translation: 400), 0)
    }

    // MARK: - Le lâcher conclut

    func test_settle_beyondHalfTheCourse_concludesExpanded() {
        XCTAssertEqual(makeLayout().settle(from: .compact, predictedEndTranslation: -220), .expanded)
    }

    func test_settle_underHalfTheCourse_concludesCompact() {
        XCTAssertEqual(makeLayout().settle(from: .compact, predictedEndTranslation: -150), .compact)
    }

    func test_settle_aFlickUp_concludesExpanded_throughItsProjection() {
        let layout = makeLayout()
        XCTAssertEqual(layout.progress(from: .compact, translation: -60), 0.15, accuracy: 0.001)
        XCTAssertEqual(layout.settle(from: .compact, predictedEndTranslation: -360), .expanded)
    }

    func test_settle_aSmallPullDown_fromExpanded_isCancelled() {
        XCTAssertEqual(makeLayout().settle(from: .expanded, predictedEndTranslation: 120), .expanded)
    }

    func test_settle_withoutCourse_keepsTheStartingDetent() {
        let layout = makeLayout(compactMenuHeight: 120, naturalMenuHeight: 120)
        XCTAssertEqual(layout.travel, 0)
        XCTAssertEqual(layout.settle(from: .compact, predictedEndTranslation: -500), .compact)
        XCTAssertEqual(layout.progress(from: .compact, translation: -500), 0)
    }

    // MARK: - Accessibilité

    func test_openingDetent_isExpanded_whenEveryActionMustBeReachableWithoutTheGesture() {
        XCTAssertEqual(ConversationPeekDetent.opening(prefersAllActions: true), .expanded)
        XCTAssertEqual(ConversationPeekDetent.opening(prefersAllActions: false), .compact)
    }

    func test_toggled_switchesBetweenTheTwoDetents() {
        XCTAssertEqual(ConversationPeekDetent.compact.toggled, .expanded)
        XCTAssertEqual(ConversationPeekDetent.expanded.toggled, .compact)
    }

    // MARK: - Ce qu'un glissement sur la carte pilote

    func test_cardRoute_pullingDownFromCompact_morphsTheCardIntoAChip() {
        XCTAssertEqual(ConversationPeekCardRoute.resolve(startDetent: .compact, translation: 12), .chipMorph)
    }

    func test_cardRoute_pullingUp_orFromExpanded_drivesTheDetent() {
        XCTAssertEqual(ConversationPeekCardRoute.resolve(startDetent: .compact, translation: -12), .detent)
        XCTAssertEqual(ConversationPeekCardRoute.resolve(startDetent: .expanded, translation: 12), .detent)
    }

    // MARK: - Quel menu l'appui long ouvre

    func test_route_iPhone_usesTheCustomPeek_onEveryiOSVersion() {
        XCTAssertEqual(ConversationRowMenuRoute.resolve(supportsMultipleWindows: false, nativeMenuAvailable: true), .custom)
        XCTAssertEqual(ConversationRowMenuRoute.resolve(supportsMultipleWindows: false, nativeMenuAvailable: false), .custom)
    }

    func test_route_iPadOniOS26_keepsTheNativeMenu_andItsSystemDrag() {
        XCTAssertEqual(ConversationRowMenuRoute.resolve(supportsMultipleWindows: true, nativeMenuAvailable: true), .native)
        XCTAssertEqual(ConversationRowMenuRoute.resolve(supportsMultipleWindows: true, nativeMenuAvailable: false), .custom)
    }
}
