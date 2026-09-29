import XCTest
import SwiftUI
@testable import Meeshy

/// #8735 — chaque bouton de l'écran d'appel répond au premier toucher. Le
/// masquage automatique repart à chaque interaction, ne tombe jamais sous un
/// doigt posé, et le chrome qui s'efface répond encore tant qu'on le voit.
@MainActor
final class CallChromeInteractionTests: XCTestCase {

    private func touches(_ interactions: [CallChromeInteraction]) -> CallChromeTouches {
        interactions.reduce(CallChromeTouches()) { $0.noting($1) }
    }

    private func mayAutoHide(isTouching: Bool, isPanelOpen: Bool = false) -> Bool {
        CallChromeVisibility.mayAutoHide(
            isVideoStage: true, isPanelOpen: isPanelOpen, isOnMac: false,
            isVoiceOverRunning: false, isTouching: isTouching
        )
    }

    // MARK: - Masquage automatique

    func test_mayAutoHide_whileTouching_returnsFalse() {
        XCTAssertFalse(mayAutoHide(isTouching: true))
    }

    func test_mayAutoHide_fingerLifted_followsTheSceneRule() {
        XCTAssertTrue(mayAutoHide(isTouching: false))
        XCTAssertFalse(mayAutoHide(isTouching: false, isPanelOpen: true))
    }

    func test_autoHideKey_changesOnEveryInteraction() {
        let interactions: [CallChromeInteraction] = [.touchBegan, .touchEnded, .tap, .revive]
        let keys = interactions.indices.map { index in
            AutoHideKey(isVisible: true, layer: .menu, interactionRevision: touches(Array(interactions.prefix(index + 1))).revision)
        }
        let initial = AutoHideKey(isVisible: true, layer: .menu, interactionRevision: CallChromeTouches().revision)
        XCTAssertEqual(Set(([initial] + keys).map(\.interactionRevision)).count, interactions.count + 1)
    }

    func test_rowInteraction_rearmsAutoHide_withTheMenuStillAllowedToHide() {
        let before = AutoHideKey(isVisible: true, layer: .menu, interactionRevision: CallChromeTouches().revision)
        let after = AutoHideKey(isVisible: true, layer: .menu, interactionRevision: touches([.touchBegan, .touchEnded]).revision)
        XCTAssertNotEqual(before, after, "Défiler une rangée du (…) relance le compte à rebours")
        XCTAssertTrue(CallScreenLayer.menu.mayAutoHide, "Le (…) ouvert se masque toujours, 4 s après la dernière interaction")
    }

    // MARK: - Doigts posés

    func test_touches_pressAndRelease_isNoLongerTouching() {
        XCTAssertTrue(touches([.touchBegan]).isTouching)
        XCTAssertFalse(touches([.touchBegan, .touchEnded]).isTouching)
    }

    func test_touches_scrollAndPressTogether_staysTouchingUntilBothLift() {
        XCTAssertTrue(touches([.touchBegan, .touchBegan, .touchEnded]).isTouching)
        XCTAssertFalse(touches([.touchBegan, .touchBegan, .touchEnded, .touchEnded]).isTouching)
    }

    func test_touches_unmatchedRelease_neverGoesNegative() {
        let state = touches([.touchEnded, .touchEnded, .touchBegan])
        XCTAssertTrue(state.isTouching)
        XCTAssertEqual(state.activeCount, 1)
    }

    func test_touches_tapAndRevive_doNotHoldAFingerDown() {
        XCTAssertFalse(touches([.tap, .revive]).isTouching)
    }

    func test_released_dropsEveryFinger_andStillRearms() {
        let held = touches([.touchBegan, .touchBegan])
        let released = held.released()
        XCTAssertFalse(released.isTouching)
        XCTAssertNotEqual(released.revision, held.revision)
    }

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
