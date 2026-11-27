import XCTest
import SwiftUI
@testable import Meeshy

/// #8735 — chaque bouton de l'écran d'appel répond au premier toucher, et le
/// chrome qui s'efface répond encore tant qu'on le voit. #8978 — plus aucun
/// masquage minuté : seul le toucher reçu pendant le fondu rallume le chrome.
@MainActor
final class CallChromeInteractionTests: XCTestCase {

    func test_onlyRevive_revealsTheChrome() {
        XCTAssertTrue(CallChromeInteraction.revive.revealsChrome)
        XCTAssertFalse(CallChromeInteraction.touchBegan.revealsChrome)
        XCTAssertFalse(CallChromeInteraction.touchEnded.revealsChrome)
        XCTAssertFalse(CallChromeInteraction.tap.revealsChrome)
    }

    // MARK: - Grâce du fondu

    func test_acceptsTouches_visible_returnsTrue() {
        XCTAssertTrue(CallChromeVisibility.acceptsTouches(isVisible: true, hiddenFor: .infinity))
    }

    func test_acceptsTouches_duringFadeOut_returnsTrue() {
        XCTAssertTrue(CallChromeVisibility.acceptsTouches(isVisible: false, hiddenFor: 0))
        XCTAssertTrue(CallChromeVisibility.acceptsTouches(isVisible: false, hiddenFor: CallChromeVisibility.fadeDuration / 2))
    }

    func test_acceptsTouches_afterFade_returnsFalse() {
        XCTAssertFalse(CallChromeVisibility.acceptsTouches(isVisible: false, hiddenFor: CallChromeVisibility.fadeDuration))
        XCTAssertFalse(CallChromeVisibility.acceptsTouches(isVisible: false, hiddenFor: .infinity))
    }

    func test_acceptsTouches_negativeInterval_refusesInsteadOfProlongingTheGrace() {
        XCTAssertFalse(CallChromeVisibility.acceptsTouches(isVisible: false, hiddenFor: -1))
        XCTAssertFalse(CallChromeVisibility.acceptsTouches(isVisible: false, hiddenFor: -.infinity))
        XCTAssertFalse(CallChromeVisibility.acceptsTouches(isVisible: false, hiddenFor: .nan))
    }

    // MARK: - #20300 la grâce du fondu se mesure sur une horloge monotone

    func test_fadeGraceAcceptsTouches_visible_returnsTrue() {
        XCTAssertTrue(CallChromeFadeGrace.shown.acceptsTouches(isVisible: true, now: 42))
        XCTAssertTrue(CallChromeFadeGrace.hidden(at: 42).acceptsTouches(isVisible: true, now: 1_000))
    }

    func test_fadeGraceAcceptsTouches_hiddenNow_acceptsDuringTheFade() {
        let grace = CallChromeFadeGrace.hidden(at: 100)
        XCTAssertTrue(grace.acceptsTouches(isVisible: false, now: 100))
        XCTAssertTrue(grace.acceptsTouches(isVisible: false, now: 100 + CallChromeVisibility.fadeDuration / 2))
    }

    func test_fadeGraceAcceptsTouches_afterTheFade_returnsFalse() {
        let grace = CallChromeFadeGrace.hidden(at: 100)
        XCTAssertFalse(grace.acceptsTouches(isVisible: false, now: 100 + CallChromeVisibility.fadeDuration + 0.001))
    }

    func test_fadeGraceAcceptsTouches_neverHidden_returnsFalseWhenNotVisible() {
        XCTAssertFalse(CallChromeFadeGrace.shown.acceptsTouches(isVisible: false, now: 0))
    }

    func test_fadeGraceAcceptsTouches_clockGoesBackwards_neverProlongsTheGrace() {
        let grace = CallChromeFadeGrace.hidden(at: 100)
        let rewound = stride(from: 99.999, through: 0, by: -7.5).map { grace.acceptsTouches(isVisible: false, now: $0) }
        XCTAssertFalse(rewound.contains(true))
    }

    func test_fadeGraceShown_forgetsTheHiddenInstant() {
        XCTAssertNil(CallChromeFadeGrace.shown.hiddenAt)
        XCTAssertEqual(CallChromeFadeGrace.hidden(at: 7).hiddenAt, 7)
    }

    func test_chromeVisibilityModifier_neverReadsTheWallClock() throws {
        let source = try String(contentsOf: Self.callControlGlassURL, encoding: .utf8)
        let start = try XCTUnwrap(source.range(of: "private struct CallChromeVisibilityModifier"))
        let end = try XCTUnwrap(source.range(of: "struct CallButtonGlassModifier", range: start.upperBound..<source.endIndex))
        let modifier = source[start.lowerBound..<end.lowerBound]
        XCTAssertFalse(modifier.contains("Date()"))
        XCTAssertFalse(modifier.contains("Date?"))
        XCTAssertFalse(modifier.contains("Date.now"))
        XCTAssertFalse(modifier.contains("timeIntervalSince"))
        XCTAssertTrue(modifier.contains("CallMonotonicClock.seconds()"))
    }

    private static let callControlGlassURL = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("Meeshy/Features/Call/Views/CallControlGlass.swift")

    func test_fadeDuration_isAQuarterSecond() {
        XCTAssertEqual(CallChromeVisibility.fadeDuration, 0.25, accuracy: 0.0001)
        XCTAssertEqual(CallChromeVisibility.fadeDurationNanoseconds, 250_000_000)
    }

    // MARK: - Défilement d'une rangée

    func test_scrollRule_startScrolling_isATouchDown() {
        XCTAssertEqual(CallChromeScrollRule.interaction(wasScrolling: false, isScrolling: true), .touchBegan)
    }

    func test_scrollRule_stopScrolling_isATouchUp() {
        XCTAssertEqual(CallChromeScrollRule.interaction(wasScrolling: true, isScrolling: false), .touchEnded)
    }

    func test_scrollRule_samePhase_reportsNothing() {
        XCTAssertNil(CallChromeScrollRule.interaction(wasScrolling: true, isScrolling: true))
        XCTAssertNil(CallChromeScrollRule.interaction(wasScrolling: false, isScrolling: false))
    }

    // MARK: - Scène de groupe

    func test_tileTap_chromeHidden_reveals() {
        XCTAssertEqual(GroupStageTapRule.outcome(isChromeVisible: false), .revealChrome)
    }

    func test_tileTap_chromeVisible_spotlights() {
        XCTAssertEqual(GroupStageTapRule.outcome(isChromeVisible: true), .spotlight)
    }

    // MARK: - G1.11 · G2.8 — le rangement est un mouvement, pas un fondu sur place

    func test_stow_leavesByItsEdge_onlyWhenHiddenAndMotionIsAllowed() {
        XCTAssertTrue(CallChromeStow.leavesByItsEdge(isVisible: false, reduceMotion: false))
        XCTAssertFalse(CallChromeStow.leavesByItsEdge(isVisible: true, reduceMotion: false))
        XCTAssertFalse(CallChromeStow.leavesByItsEdge(isVisible: false, reduceMotion: true), "Réduire les animations : un fondu, rien ne se déplace")
    }

    func test_stow_animation_reducedMotionIsAShortFade() {
        XCTAssertEqual(CallChromeStow.animation(reduceMotion: false), .easeInOut(duration: CallChromeVisibility.fadeDuration))
        XCTAssertEqual(CallChromeStow.animation(reduceMotion: true), .easeInOut(duration: CallChromeStow.reducedFadeDuration))
        XCTAssertLessThan(CallChromeStow.reducedFadeDuration, CallChromeVisibility.fadeDuration)
    }

    /// La sortie est MESURÉE : l'élément part de toute sa hauteur plus sa marge au bord, si bien
    /// qu'une pilule dépliée (rangées, journal) quitte l'écran aussi entièrement que la pilule nue.
    func test_stow_headerLeavesUpwards_byItsMeasuredHeightAndTopMargin() {
        XCTAssertEqual(CallChromeStow.travel(toward: .top, extent: 44, margin: 59), -103)
    }

    func test_stow_pillLeavesDownwards_byItsMeasuredHeightAndBottomMargin() {
        XCTAssertEqual(CallChromeStow.travel(toward: .bottom, extent: 68, margin: 46), 114)
        XCTAssertEqual(CallChromeStow.travel(toward: .bottom, extent: 440, margin: 46), 486, "Le journal ouvert sort lui aussi tout entier")
    }

    func test_stow_unmeasuredExtent_stillLeavesPastTheMargin() {
        XCTAssertEqual(CallChromeStow.travel(toward: .bottom, extent: 0, margin: 46), 46)
        XCTAssertEqual(CallChromeStow.travel(toward: .bottom, extent: -5, margin: 46), 46)
        XCTAssertEqual(CallChromeStow.travel(toward: .bottom, extent: .nan, margin: 46), 46)
    }

    // MARK: - Enfoncement

    func test_pressFeedback_pressIn_hasNoAnimationDelay() {
        XCTAssertNil(CallPressFeedback.animation(isPressed: true, reduceMotion: false))
    }

    func test_pressFeedback_release_springsBack() {
        XCTAssertNotNil(CallPressFeedback.animation(isPressed: false, reduceMotion: false))
    }

    func test_pressFeedback_reduceMotion_neverAnimatesNorShrinks() {
        XCTAssertNil(CallPressFeedback.animation(isPressed: false, reduceMotion: true))
        XCTAssertEqual(CallPressFeedback.scale(isPressed: true, reduceMotion: true), 1)
    }

    func test_pressFeedback_pressed_shrinksVisibly() {
        XCTAssertEqual(CallPressFeedback.scale(isPressed: true, reduceMotion: false), 0.88, accuracy: 0.0001)
        XCTAssertEqual(CallPressFeedback.scale(isPressed: false, reduceMotion: false), 1)
    }
}
