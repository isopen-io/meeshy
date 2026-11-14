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

    // MARK: - P18.4 · P18.8 — la fenêtre d'appel se contracte VERS l'appel réduit et se redéploie DEPUIS lui
    // Mêmes vecteurs qu'Android `CallShareCapsuleMotion.window` (#18449).

    func test_window_towardTheBanner_contractsToATenthAnchoredTopCenter() {
        XCTAssertEqual(
            CallShareCapsuleMotion.window(reduceMotion: false, capsuleLive: true),
            CallWindowMotion(scale: 0.1, pivotX: 0.5, pivotY: 0)
        )
    }

    func test_window_expansionStartsFromTheSamePointAsTheContraction() {
        XCTAssertEqual(
            CallShareCapsuleMotion.window(reduceMotion: false, capsuleLive: true),
            CallShareCapsuleMotion.window(reduceMotion: false, capsuleLive: true)
        )
        XCTAssertEqual(CallShareCapsuleMotion.window(reduceMotion: false, capsuleLive: true).anchor, .top)
    }

    func test_window_reduceMotion_isAFadeOnly_neitherScaleNorShift() {
        for capsuleLive in [true, false] {
            XCTAssertEqual(CallShareCapsuleMotion.window(reduceMotion: true, capsuleLive: capsuleLive).scale, 1)
        }
        XCTAssertEqual(
            CallShareCapsuleMotion.window(reduceMotion: true, bubbleCenter: CGPoint(x: 351, y: 422), in: CGSize(width: 390, height: 844)).scale,
            1
        )
    }

    func test_window_withoutCapsule_keepsItsShortCenteredScale() {
        XCTAssertEqual(
            CallShareCapsuleMotion.window(reduceMotion: false, capsuleLive: false),
            CallWindowMotion(scale: 0.92, pivotX: 0.5, pivotY: 0.5)
        )
    }

    /// P18.4 — depuis la bulle, l'appel part de là où elle flotte : bord de fin, mi-hauteur…
    func test_window_fromTheBubble_anchorsWhereItFloats() {
        XCTAssertEqual(
            CallShareCapsuleMotion.window(reduceMotion: false, bubbleCenter: CGPoint(x: 351, y: 422), in: CGSize(width: 390, height: 844)),
            CallWindowMotion(scale: 0.1, pivotX: 0.9, pivotY: 0.5)
        )
    }

    /// …ou bord de début (droite à gauche compris : la place mesurée fait foi), et jamais hors de l'écran.
    func test_window_fromTheBubble_isClampedToTheScreen() {
        XCTAssertEqual(
            CallShareCapsuleMotion.window(reduceMotion: false, bubbleCenter: CGPoint(x: -20, y: 900), in: CGSize(width: 400, height: 800)),
            CallWindowMotion(scale: 0.1, pivotX: 0, pivotY: 1)
        )
        XCTAssertEqual(
            CallShareCapsuleMotion.window(reduceMotion: false, bubbleCenter: CGPoint(x: 40, y: 200), in: CGSize(width: 400, height: 800)),
            CallWindowMotion(scale: 0.1, pivotX: 0.1, pivotY: 0.25)
        )
    }

    func test_window_fromTheBubble_withoutMeasure_fallsBackToTheBanner() {
        XCTAssertEqual(
            CallShareCapsuleMotion.window(reduceMotion: false, bubbleCenter: CGPoint(x: 10, y: 10), in: .zero),
            CallShareCapsuleMotion.window(reduceMotion: false, capsuleLive: true)
        )
    }

    func test_windowMotion_scaleFollowsTheProgress() {
        let motion = CallShareCapsuleMotion.window(reduceMotion: false, capsuleLive: true)
        XCTAssertEqual(motion.scale(at: 0), 1)
        XCTAssertEqual(motion.scale(at: 1), 0.1, accuracy: 0.0001)
        XCTAssertEqual(motion.scale(at: 0.5), 0.55, accuracy: 0.0001)
    }

    /// P18.8 — transformation et opacité seulement : plus de rayon de coins animé ; la
    /// découpe est une découpe droite, constante, posée AVANT l'échelle.
    func test_callView_morphsByTransformAndOpacityOnly_towardTheRecordedPoint() throws {
        let view = try source("Meeshy/Features/Call/Views/CallView.swift")
        XCTAssertFalse(view.contains("cornerRadius: pipMorphProgress"), "aucun rayon de coins animé")
        XCTAssertTrue(view.contains(".modifier(CallPipMorphEffect(target: pipMorphTarget, progress: $pipMorphProgress))"))
        XCTAssertTrue(view.contains("CallPipMorph.playExpansion(from: callManager.consumePendingPipExpansion(), reduceMotion: reduceMotion, target: $pipMorphTarget, progress: $pipMorphProgress)"))
        let morph = try source("Meeshy/Features/Call/Models/CallPipMorph.swift")
        let effect = try XCTUnwrap(DeclarationBodyScanner.body(containing: "func body(content: Content)", in: morph))
        XCTAssertTrue(effect.contains(".clipped()\n            .scaleEffect(target.scale(at: progress), anchor: target.anchor)\n            .opacity(1 - 0.55 * Double(progress))"))
        XCTAssertFalse(effect.contains("clipShape"), "une découpe droite et constante, jamais un rayon qui s'anime")
        let play = try XCTUnwrap(DeclarationBodyScanner.body(containing: "static func playExpansion(", in: morph))
        XCTAssertTrue(play.contains("guard let origin, !reduceMotion else { return }"))
        XCTAssertTrue(play.contains("target.wrappedValue = origin"))
        let header = try source("Meeshy/Features/Call/Views/CallView+Header.swift")
        let collapse = try XCTUnwrap(DeclarationBodyScanner.body(containing: "func collapseIntoPip()", in: header))
        XCTAssertTrue(collapse.contains("pipMorphTarget = CallShareCapsuleMotion.window(reduceMotion: reduceMotion, capsuleLive: true)"))
    }

    /// P18.4 — la bannière et la bulle rouvrent l'appel par LE MÊME déploiement, chacune depuis sa place.
    func test_banner_andBubble_expandFromWhereTheyFloat() throws {
        let pill = try source("Meeshy/Features/Call/Views/FloatingCallPillView.swift")
        XCTAssertTrue(pill.contains("CallPipMorph.expand(callManager, from: CallShareCapsuleMotion.window(reduceMotion: reduceMotion, capsuleLive: true), reduceMotion: reduceMotion)"))
        let bubble = try source("Meeshy/Features/Call/Views/CallBubbleView.swift")
        XCTAssertTrue(bubble.contains("CallShareCapsuleMotion.window(reduceMotion: reduceMotion, bubbleCenter: center, in: geometry.size)"))
        XCTAssertTrue(bubble.contains("CallPipMorph.expand(callManager, from: origin, reduceMotion: reduceMotion)"))
        XCTAssertFalse(bubble.contains("callManager.displayMode = .fullScreen"), "plus de bascule sans déploiement, toucher comme VoiceOver")
        let morph = try source("Meeshy/Features/Call/Models/CallPipMorph.swift")
        let expand = try XCTUnwrap(DeclarationBodyScanner.body(containing: "static func expand(", in: morph))
        XCTAssertTrue(expand.contains("guard !reduceMotion else"), "Réduire les animations : la fenêtre se fond, rien ne s'étire")
        XCTAssertTrue(expand.contains("manager.requestPipExpansionMorph(from: origin)"))
        XCTAssertTrue(expand.contains("disablesAnimations = true"), "le déploiement EST la transition, pas l'animation système")
    }

    /// P18.8 — interruptible : toucher l'appel pendant qu'il se contracte le rend au plein écran.
    func test_contraction_isInterruptible_byATouchOnTheShrinkingCall() throws {
        let morph = try source("Meeshy/Features/Call/Models/CallPipMorph.swift")
        let contract = try XCTUnwrap(DeclarationBodyScanner.body(containing: "static func contract(", in: morph))
        XCTAssertTrue(contract.contains("contraction = Task"))
        XCTAssertTrue(contract.contains("guard await cancellableSleep(for: .milliseconds(300)), !Task.isCancelled else { return }"))
        let interrupt = try XCTUnwrap(DeclarationBodyScanner.body(containing: "static func interruptContraction(", in: morph))
        XCTAssertTrue(interrupt.contains("pending.cancel()"))
        XCTAssertTrue(interrupt.contains("progress.wrappedValue = 0"))
        let effect = try XCTUnwrap(DeclarationBodyScanner.body(containing: "func body(content: Content)", in: morph))
        XCTAssertTrue(effect.contains(".overlay { contractionCatcher }\n            .clipped()"), "le toucher suit l'appel qui rétrécit : posé avant l'échelle")
        let catcher = try XCTUnwrap(DeclarationBodyScanner.body(containing: "private var contractionCatcher", in: morph))
        XCTAssertTrue(catcher.contains("if progress > 0 {"), "il ne vit que pendant la contraction")
        XCTAssertTrue(catcher.contains("CallPipMorph.interruptContraction(progress: $progress)"))
        XCTAssertTrue(catcher.contains(".accessibilityHidden(true)"))
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

    // MARK: - S2.3 — « Arrêter » du bandeau « Vous partagez votre écran » : la capsule blanche à encre rouge

    func test_shareBanner_stopIsTheSharedWhiteCapsuleWithRedInk_notBareText() throws {
        let controls = try source("Meeshy/Features/Call/Views/CallScreenShareControls.swift")
        let banner = try XCTUnwrap(DeclarationBodyScanner.body(containing: "private func banner(", in: controls))
        XCTAssertTrue(
            banner.contains("CallShareStopButton(stop: onStop)"),
            "« Arrêter » du bandeau est le bouton partagé de la capsule (blanc, encre rouge), comme Android et le web."
        )
        XCTAssertFalse(
            banner.contains("CallScreenShareCopy.stopCaption"),
            "Plus de texte blanc nu : la légende vit dans CallShareStopButton, une seule fois."
        )
        let stop = try source("Meeshy/Features/Call/Views/CallShareStopButton.swift")
        XCTAssertTrue(stop.contains("MeeshyColors.errorInk"))
        XCTAssertTrue(stop.contains("Capsule().fill(Color.white)"))
        XCTAssertTrue(stop.contains(".frame(minHeight: 44)"), "Cible de 44 pt")
        XCTAssertTrue(stop.contains(".accessibilityLabel(CallScreenShareCopy.label(isSharing: true))"))
    }

    func test_shareBanner_keepsItsRedGlassAndHeightReporter() throws {
        let controls = try source("Meeshy/Features/Call/Views/CallScreenShareControls.swift")
        let banner = try XCTUnwrap(DeclarationBodyScanner.body(containing: "private func banner(", in: controls))
        XCTAssertTrue(banner.contains(".adaptiveLiquidGlass(in: Capsule(), tint: MeeshyColors.error.opacity(MeeshyOpacity.medium)"))
        XCTAssertTrue(banner.contains("CallTopBannerHeightReporter(banner: .screenShare)"))
    }
}
