import XCTest
import SwiftUI
import MeeshyUI
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

    // MARK: - Se fermer d'un geste évident (#17258)

    func test_veilBand_leavesAVisibleVeilAboveTheCard_onAPhone() {
        let band = ConversationPeekLayout.veilBand(forHeight: 840)
        XCTAssertEqual(band, 84, accuracy: 0.001)
        XCTAssertGreaterThanOrEqual(band, 44)
    }

    func test_veilBand_staysTouchable_onAShortWindow_andBounded_onATallOne() {
        XCTAssertEqual(ConversationPeekLayout.veilBand(forHeight: 400), ConversationPeekLayout.minimumVeilBand)
        XCTAssertEqual(ConversationPeekLayout.veilBand(forHeight: 3_000), ConversationPeekLayout.maximumVeilBand)
        XCTAssertGreaterThanOrEqual(ConversationPeekLayout.minimumVeilBand, 44)
    }

    func test_pullDown_followsTheFinger_frameByFrame() {
        let half = ConversationPeekPullDown.morphDistance / 2
        XCTAssertEqual(ConversationPeekPullDown.progress(translation: half), 0.5, accuracy: 0.001)
        XCTAssertEqual(ConversationPeekPullDown.progress(translation: -40), 0)
        XCTAssertEqual(ConversationPeekPullDown.progress(translation: 10_000), 1)
    }

    func test_pullDown_staysCancellable_until75to90PercentOfItsCourse() {
        let ratio = ConversationPeekPullDown.dismissDistance / ConversationPeekPullDown.morphDistance
        XCTAssertGreaterThanOrEqual(ratio, 0.75)
        XCTAssertLessThanOrEqual(ratio, 0.90)
    }

    func test_pullDown_releasedBeyondTheThreshold_closesThePeek() {
        let beyond = ConversationPeekPullDown.dismissDistance + 10
        XCTAssertEqual(ConversationPeekPullDown.release(predictedEndTranslation: beyond, isLatched: false), .dismiss)
    }

    func test_pullDown_releasedShortOfTheThreshold_putsTheCardBack() {
        let short = ConversationPeekPullDown.dismissDistance - 10
        XCTAssertEqual(ConversationPeekPullDown.release(predictedEndTranslation: short, isLatched: false), .restore)
    }

    func test_pullDown_broughtBackUpBeforeRelease_isCancelled() {
        XCTAssertEqual(ConversationPeekPullDown.release(predictedEndTranslation: 20, isLatched: false), .restore)
    }

    func test_pullDown_aFlickDown_closesThroughItsProjection() {
        XCTAssertEqual(ConversationPeekPullDown.release(predictedEndTranslation: 320, isLatched: false), .dismiss)
    }

    func test_pullDown_onceTheChipIsLatched_releaseDropsIt() {
        XCTAssertEqual(ConversationPeekPullDown.release(predictedEndTranslation: 0, isLatched: true), .drop)
    }

    @MainActor
    func test_closeAction_isOfferedToVoiceOver_andToTheEscapeKey() throws {
        XCTAssertFalse(ConversationLongPressPeek<EmptyView, EmptyView>.closeLabel.isEmpty)
        let peek = try AppSourceGuard.stripComments(source("Meeshy/Features/Main/Views/ConversationLongPressPeek.swift"))
        XCTAssertTrue(peek.contains(".accessibilityAction(named: Text(Self.closeLabel))"), "VoiceOver : action Fermer")
        XCTAssertTrue(peek.contains(".dismissOnEscape"), "Échap et le geste d'échappement de VoiceOver ferment l'aperçu")
    }

    // MARK: - Les actions du menu se lisent comme actives (#17259)

    private static let accents = [
        "A5B4FC", "FBBF24", "F87171", "9CA3AF", "FFFFFF", "000000", "6366F1",
        "34D399", "E5E7EB", "#818CF8", "22D3EE", "F472B6", "not-a-hex"
    ]

    private func contrast(_ ink: String, isDark: Bool) -> Double {
        let backdrop = ConversationMenuInk.glassBackdropHex(isDark: isDark)
        guard let a = CanvasChromeScheme.relativeLuminance(hex: ink),
              let b = CanvasChromeScheme.relativeLuminance(hex: backdrop) else { return 0 }
        return CanvasChromeScheme.contrastRatio(a, b)
    }

    func test_activeInk_meetsAA_onTheGlass_inLightAndDark_forEveryAccent() {
        for isDark in [false, true] {
            for accent in Self.accents {
                let ink = ConversationMenuInk.hex(base: accent, isDark: isDark, isEnabled: true)
                XCTAssertGreaterThanOrEqual(contrast(ink, isDark: isDark), 4.5, "\(accent) isDark=\(isDark) → \(ink)")
            }
        }
    }

    func test_activeInk_keepsAnAccentThatAlreadyContrasts() {
        XCTAssertEqual(ConversationMenuInk.hex(base: "3730A3", isDark: false, isEnabled: true), "3730A3")
        XCTAssertEqual(ConversationMenuInk.hex(base: "#C7D2FE", isDark: true, isEnabled: true), "C7D2FE")
    }

    func test_activeInk_keepsTheConversationHue() {
        let ink = ConversationMenuInk.hex(base: "A5B4FC", isDark: false, isEnabled: true)
        let rgb = Array(ink).hexPairs.compactMap { Int(String($0), radix: 16) }
        XCTAssertEqual(rgb.count, 3)
        XCTAssertGreaterThan(rgb[2], rgb[0], "le bleu reste dominant : \(ink)")
    }

    func test_disabledInk_isDistinct_andReadsLessThanEveryActiveInk() {
        for isDark in [false, true] {
            for accent in Self.accents {
                let active = ConversationMenuInk.hex(base: accent, isDark: isDark, isEnabled: true)
                let disabled = ConversationMenuInk.hex(base: accent, isDark: isDark, isEnabled: false)
                XCTAssertNotEqual(active, disabled)
                XCTAssertLessThan(contrast(disabled, isDark: isDark), 4.5)
                XCTAssertGreaterThanOrEqual(contrast(disabled, isDark: isDark), 1.8)
            }
        }
    }

    // MARK: - Rien ne passe au-dessus de l'aperçu (#17260)

    func test_concealment_hidesTheFloatingChrome_andLetsNoTouchThrough_whileThePeekIsOpen() {
        XCTAssertEqual(LongPressPeekConcealment.opacity(peekIsOpen: true), 0)
        XCTAssertFalse(LongPressPeekConcealment.admitsTouches(peekIsOpen: true))
        XCTAssertEqual(LongPressPeekConcealment.opacity(peekIsOpen: false), 1)
        XCTAssertTrue(LongPressPeekConcealment.admitsTouches(peekIsOpen: false))
    }

    func test_playerBanner_yieldsToTheOpenPeek_andComesBackAfter() {
        XCTAssertFalse(PlayerBannerPlacement.hosts(routeIsDeep: false, reelsAreOpen: false, peekIsOpen: true))
        XCTAssertTrue(PlayerBannerPlacement.hosts(routeIsDeep: false, reelsAreOpen: false, peekIsOpen: false))
    }

    @MainActor
    func test_presence_followsThePeek() {
        let presence = LongPressPeekPresence()
        XCTAssertFalse(presence.isOpen)
        presence.update(isOpen: true)
        XCTAssertTrue(presence.isOpen)
        presence.update(isOpen: false)
        XCTAssertFalse(presence.isOpen)
    }

    @MainActor
    func test_everyFloatingSurface_isConcealedUnderThePeek() throws {
        let floating = try AppSourceGuard.stripComments(source("Meeshy/Features/Main/Views/RootFloatingChrome.swift"))
        let layers = try AppSourceGuard.stripComments(source("Meeshy/Features/Main/Views/RootLayers/RootViewLayers.swift"))
        XCTAssertTrue(floating.contains("ConcealedUnderLongPressPeek(presence: peekPresence)"), "les bulles flottantes passent sous l'aperçu")
        XCTAssertTrue(layers.contains("ConcealedUnderLongPressPeek(presence: peekPresence)"), "la pastille de synchronisation passe sous l'aperçu")
        XCTAssertTrue(layers.contains("peekIsOpen: peekPresence.isOpen"), "la bannière du joueur cède à l'aperçu")
    }

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(relativePath)
        return try AppSourceGuard.text(at: url)
    }
}

private extension Array where Element == Character {
    var hexPairs: [String] {
        stride(from: 0, to: count, by: 2).map { String(self[$0..<Swift.min($0 + 2, count)]) }
    }
}
