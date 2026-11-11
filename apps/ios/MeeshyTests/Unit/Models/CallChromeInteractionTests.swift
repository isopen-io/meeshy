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

    func test_stow_headerLeavesUpwards_pastTheTopInset() {
        XCTAssertLessThan(CallChromeStow.headerTravel(topInset: 59), -59)
        XCTAssertLessThan(CallChromeStow.headerTravel(topInset: 59), CallChromeStow.headerTravel(topInset: 20))
    }

    func test_stow_pillLeavesDownwards_pastTheBottomInset() {
        XCTAssertGreaterThan(CallChromeStow.pillTravel(bottomInset: 34), CallRailsLayout.pillHeight + 34)
        XCTAssertGreaterThan(CallChromeStow.pillTravel(bottomInset: 34), CallChromeStow.pillTravel(bottomInset: 0))
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
