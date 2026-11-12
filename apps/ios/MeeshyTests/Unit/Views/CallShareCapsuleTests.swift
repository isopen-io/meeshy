import XCTest
import SwiftUI
import MeeshyUI
@testable import Meeshy

/// #17763 — la capsule de partage d'écran : se contracte depuis l'appel, s'y
/// redéploie, passe au verre rouge, et reste atteignable sous un plein écran.
@MainActor
final class CallShareCapsuleTests: XCTestCase {

    private func source(_ path: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(path))
    }

    // MARK: - S1.7 / S2.1 — la fenêtre d'appel se fond, y compris sous « Réduire les animations »

    func test_windowFade_reduceMotion_isTheShortFade_inBothDirections() {
        XCTAssertEqual(CallShareCapsuleMotion.windowFade(reduceMotion: true, appearing: true), MeeshyGlassPillRecipe.reducedStowDuration)
        XCTAssertEqual(CallShareCapsuleMotion.windowFade(reduceMotion: true, appearing: false), MeeshyGlassPillRecipe.reducedStowDuration)
    }

    func test_windowFade_withMotion_keepsTheCurrentDurations() {
        XCTAssertEqual(CallShareCapsuleMotion.windowFade(reduceMotion: false, appearing: true), 0.22)
        XCTAssertEqual(CallShareCapsuleMotion.windowFade(reduceMotion: false, appearing: false), 0.18)
    }

    func test_presenter_neverShowsNorHidesTheCallWindowWithoutAFade() throws {
        let presenter = try source("Meeshy/Features/Main/Views/RootLayers/CallWindowPresenter.swift")
        XCTAssertTrue(presenter.contains("CallShareCapsuleMotion.windowFade(reduceMotion: UIAccessibility.isReduceMotionEnabled, appearing: true)"))
        XCTAssertTrue(presenter.contains("CallShareCapsuleMotion.windowFade(reduceMotion: UIAccessibility.isReduceMotionEnabled, appearing: false)"))
        XCTAssertFalse(
            presenter.contains("guard !UIAccessibility.isReduceMotionEnabled else { return finish() }"),
            "Retirer la fenêtre d'un coup sous Réduire les animations : un fondu court, pas une disparition."
        )
        XCTAssertFalse(presenter.contains("overlay.alpha = animated ? 0 : 1"))
    }

    // MARK: - S1.7 — le lancement du partage CONTRACTE l'appel vers la capsule

    func test_screenShareDidStart_asksTheCallViewToContract_insteadOfSwitchingDirectly() throws {
        let share = try source("Meeshy/Features/Call/Services/CallManager+ScreenShare.swift")
        XCTAssertFalse(share.contains("displayMode = .pip }"))
        XCTAssertTrue(share.contains("CallPipMorph.begin(on: self)"))
        let view = try source("Meeshy/Features/Call/Views/CallView.swift")
        XCTAssertTrue(view.contains("CallPipMorph.collapseRequests"))
        XCTAssertTrue(view.contains("CallPipMorph.consumePendingCollapse()"))
        let header = try source("Meeshy/Features/Call/Views/CallView+Header.swift")
        XCTAssertTrue(header.contains("CallPipMorph.contract("), "Le glissé et le partage jouent LA MÊME contraction.")
    }

    func test_capsuleSwap_usesTheGlassMorphAnimation_andAFadeOnlyTransitionUnderReduceMotion() throws {
        let pill = try source("Meeshy/Features/Call/Views/FloatingCallPillView.swift")
        XCTAssertTrue(pill.contains("CallShareCapsuleMotion.swapAnimation(reduceMotion: reduceMotion)"))
        XCTAssertTrue(pill.contains("CallShareCapsuleMotion.swapTransition(reduceMotion: reduceMotion)"))
    }

    // MARK: - S1.9 — verre rouge, « Arrêter » blanc

    func test_pill_whileSharing_isRedAdaptiveGlass() throws {
        let pill = try source("Meeshy/Features/Call/Views/FloatingCallPillView.swift")
        XCTAssertTrue(pill.contains("meeshyGlass(in: Rectangle(), tint: MeeshyColors.error)"))
        XCTAssertTrue(pill.contains("callManager.screenShare.isSharing ? Color.clear : TopChromeTint.call.bandColor"))
    }

    func test_stopShareButton_isSharedByThePillAndTheReturnPoint_andIsWhiteOnGlass() throws {
        let button = try source("Meeshy/Features/Call/Views/CallShareStopButton.swift")
        XCTAssertTrue(button.contains("Capsule().fill(Color.white)"))
        XCTAssertTrue(button.contains("MeeshyColors.errorInk"))
        XCTAssertTrue(try source("Meeshy/Features/Call/Views/FloatingCallPillView.swift").contains("CallShareStopButton {"))
        XCTAssertTrue(try source("Meeshy/Features/Call/Views/CallBubbleView.swift").contains("CallShareStopButton {"))
    }

    // MARK: - S1.8 / P18.10 — pendant MON partage, l'appel réduit reste la capsule (comme le web, #17760)

    func test_pill_foldsIntoABubble_onlyWhenIAmNotSharing() {
        XCTAssertTrue(CallReturnPoint.mayCollapseToBubble(isSharing: false))
        XCTAssertFalse(
            CallReturnPoint.mayCollapseToBubble(isSharing: true),
            "P18.10 : si je partage, l'appel réduit est la capsule de S1, celle qui porte « Arrêter »."
        )
    }

    func test_shareStart_contractsFromFullScreen_andBringsABubbleBackToTheCapsule() {
        XCTAssertEqual(CallPipMorph.shareStartStep(from: .fullScreen), .contract)
        XCTAssertEqual(CallPipMorph.shareStartStep(from: .pip), .capsule)
        XCTAssertEqual(
            CallPipMorph.shareStartStep(from: .bubble),
            .capsule,
            "Un appel déjà en bulle quand le partage commence revient à la capsule."
        )
    }

    func test_pill_swipeAndVoiceOverFold_areBothGatedByTheShare() throws {
        let pill = try source("Meeshy/Features/Call/Views/FloatingCallPillView.swift")
        XCTAssertTrue(pill.contains("CallReturnPoint.mayCollapseToBubble(isSharing: callManager.screenShare.isSharing)"))
        XCTAssertTrue(
            pill.contains(".simultaneousGesture(collapseDragGesture, including: mayCollapseToBubble ? .all : .subviews)"),
            "Pendant le partage, le glissé ne replie pas la capsule ; ses boutons restent touchables."
        )
        XCTAssertFalse(
            pill.contains(".accessibilityAction(named: String(localized: \"a11y.call.pill.collapse\""),
            "L'action « Réduire en bulle » n'est offerte que quand elle a un effet."
        )
        let actions = try XCTUnwrap(DeclarationBodyScanner.body(containing: ".accessibilityActions", in: pill))
        XCTAssertTrue(actions.contains("if mayCollapseToBubble {"))
        XCTAssertTrue(actions.contains("collapseToBubble(exitTranslation: 1)"))
        let collapse = try XCTUnwrap(DeclarationBodyScanner.body(containing: "private func collapseToBubble(", in: pill))
        XCTAssertTrue(
            collapse.contains("guard mayCollapseToBubble else"),
            "Un partage lancé pendant la sortie du glissé ne laisse pas l'appel en bulle."
        )
    }

    // MARK: - S1.8 — « Arrêter » atteignable au-dessus d'un plein écran

    func test_returnPoint_showsTheStopOnlyWhileSharing_andNotUnderTheQuickMenu() {
        XCTAssertTrue(CallReturnPoint.showsShareStop(isSharing: true, isMenuRevealed: false))
        XCTAssertFalse(CallReturnPoint.showsShareStop(isSharing: true, isMenuRevealed: true))
        XCTAssertFalse(CallReturnPoint.showsShareStop(isSharing: false, isMenuRevealed: false))
    }

    func test_bubble_carriesTheShareStateToThePassthroughWindow() throws {
        let bubble = try source("Meeshy/Features/Call/Views/CallBubbleView.swift")
        XCTAssertTrue(bubble.contains("CallReturnPoint.showsShareStop("))
        XCTAssertTrue(bubble.contains("callManager.screenShare.isSharing"))
        XCTAssertTrue(
            bubble.contains("shareStopReach"),
            "Le cadre touchable de la fenêtre passe-plat doit s'étendre jusqu'à « Arrêter »."
        )
    }
}
