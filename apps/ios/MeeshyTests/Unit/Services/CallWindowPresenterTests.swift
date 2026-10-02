import Combine
import UIKit
import XCTest
import MeeshyUI
@testable import Meeshy

/// #8725 — un appel entrant s'affiche par-dessus TOUT plein écran.
///
/// La vue d'appel était un `.fullScreenCover` de la racine : dès que la racine
/// présentait déjà quelque chose (viewer de story, feuille du flux et ses réels,
/// galerie image / vidéo / audio, composer), UIKit refusait la seconde
/// présentation et l'appel sonnait sans vue. Elle vit désormais dans sa propre
/// fenêtre, que ces témoins gouvernent.
@MainActor
final class CallWindowPresenterTests: XCTestCase {

    private final class RecordingHosting: CallWindowHosting {
        var shown = 0
        var hidden = 0
        var hasForegroundScene = true
        func show(_ manager: CallManager) -> Bool {
            guard hasForegroundScene else { return false }
            shown += 1
            return true
        }
        func hide() { hidden += 1 }
    }

    private final class RecordingViewing: ConversationViewingReporting {
        var callScreen: [Bool] = []
        func conversationOpened(_ conversationId: String) {}
        func conversationClosed(_ conversationId: String) -> Bool { true }
        func setForeground(_ isForeground: Bool) {}
        func screenAppeared(_ conversationId: String) {}
        func screenDisappeared(_ conversationId: String) {}
        func coverBegan() {}
        func coverEnded() {}
        func setCallScreenShown(_ isShown: Bool) { callScreen.append(isShown) }
        func activityOccurred(_ conversationId: String) {}
        func scrollingChanged(_ isScrolling: Bool) {}
        func touched() {}
    }

    private func makeSUT(
        viewing: RecordingViewing = RecordingViewing()
    ) -> (sut: CallWindowPresenter, hosting: RecordingHosting) {
        let hosting = RecordingHosting()
        return (CallWindowPresenter(hosting: hosting, viewing: viewing), hosting)
    }

    // MARK: - L'écran d'appel fait quitter la conversation (#9065)

    func test_apply_callScreenShownThenHidden_tellsTheViewingReporter() {
        let viewing = RecordingViewing()
        let (sut, _) = makeSUT(viewing: viewing)
        let manager = CallManager.shared

        sut.apply(manager: manager, visible: true)
        sut.apply(manager: manager, visible: false)

        XCTAssertEqual(viewing.callScreen, [true, false])
    }

    // MARK: - La règle

    func test_isVisible_incomingRingingInFullScreen_showsTheCallWindow() {
        XCTAssertTrue(CallWindowPresentation.isVisible(callState: .ringing(isOutgoing: false), displayMode: .fullScreen))
    }

    func test_isVisible_everyLiveStateInFullScreen_showsTheCallWindow() {
        let live: [CallState] = [.ringing(isOutgoing: true), .offering, .connecting, .connected, .reconnecting(attempt: 1)]
        for state in live {
            XCTAssertTrue(CallWindowPresentation.isVisible(callState: state, displayMode: .fullScreen), "\(state)")
        }
    }

    func test_isVisible_endedPanelInFullScreen_staysVisible() {
        XCTAssertTrue(CallWindowPresentation.isVisible(callState: .ended(reason: .local), displayMode: .fullScreen))
    }

    func test_isVisible_reducedCall_releasesTheScreenBeneath() {
        XCTAssertFalse(CallWindowPresentation.isVisible(callState: .connected, displayMode: .pip))
        XCTAssertFalse(CallWindowPresentation.isVisible(callState: .connected, displayMode: .bubble))
        XCTAssertFalse(CallWindowPresentation.isVisible(callState: .ringing(isOutgoing: false), displayMode: .pip))
    }

    func test_isVisible_noCall_neverShows() {
        XCTAssertFalse(CallWindowPresentation.isVisible(callState: .idle, displayMode: .fullScreen))
    }

    func test_windowLevel_sitsAboveEveryPresentationOfTheMainWindow_belowSystemAlerts() {
        XCTAssertGreaterThan(CallWindowPresentation.windowLevel, UIWindow.Level.normal)
        XCTAssertLessThan(CallWindowPresentation.windowLevel, UIWindow.Level.alert)
    }

    // MARK: - Le présentateur

    func test_apply_visible_showsTheWindowOnce() {
        let (sut, hosting) = makeSUT()

        sut.apply(manager: CallManager.shared, visible: true)
        sut.apply(manager: CallManager.shared, visible: true)

        XCTAssertEqual(hosting.shown, 1, "Chaque tick de l'appel ne doit pas remonter une fenêtre.")
        XCTAssertTrue(sut.isShowing)
    }

    func test_apply_reduced_hidesTheWindow_andAReopenShowsItAgain() {
        let (sut, hosting) = makeSUT()

        sut.apply(manager: CallManager.shared, visible: true)
        sut.apply(manager: CallManager.shared, visible: false)
        sut.apply(manager: CallManager.shared, visible: true)

        XCTAssertEqual(hosting.shown, 2)
        XCTAssertEqual(hosting.hidden, 1)
    }

    func test_apply_hiddenWithoutWindow_doesNothing() {
        let (sut, hosting) = makeSUT()

        sut.apply(manager: nil, visible: false)

        XCTAssertEqual(hosting.hidden, 0)
        XCTAssertFalse(sut.isShowing)
    }

    func test_apply_callStackGone_hidesTheWindow() {
        let (sut, hosting) = makeSUT()

        sut.apply(manager: CallManager.shared, visible: true)
        sut.apply(manager: nil, visible: true)

        XCTAssertEqual(hosting.hidden, 1)
    }

    func test_apply_withoutForegroundScene_showsTheWindowWhenTheSceneActivates() {
        let (sut, hosting) = makeSUT()
        hosting.hasForegroundScene = false

        sut.apply(manager: CallManager.shared, visible: true)
        XCTAssertFalse(sut.isShowing, "Sans scène au premier plan, aucune fenêtre ne peut se poser.")

        hosting.hasForegroundScene = true
        sut.retryPendingShow()

        XCTAssertTrue(sut.isShowing, "L'appel qui sonnait en arrière-plan se montre au retour de l'app.")
        XCTAssertEqual(hosting.shown, 1)
    }

    func test_retryPendingShow_afterTheCallWasReduced_showsNothing() {
        let (sut, hosting) = makeSUT()
        hosting.hasForegroundScene = false
        sut.apply(manager: CallManager.shared, visible: true)
        sut.apply(manager: CallManager.shared, visible: false)

        hosting.hasForegroundScene = true
        sut.retryPendingShow()

        XCTAssertEqual(hosting.shown, 0)
    }

    // MARK: - Le câblage

    func test_callPresentationLayer_neverPresentsTheCallAsAModalCover() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/RootLayers/CallPresentationLayer.swift"))
        XCTAssertFalse(
            source.contains(".fullScreenCover("),
            "Une couverture modale de la racine ne se pose pas quand la racine présente déjà un plein écran (#8725)."
        )
        XCTAssertTrue(
            source.contains("CallWindowPresenter.shared.bind("),
            "La racine doit brancher la fenêtre d'appel."
        )
        XCTAssertTrue(
            source.contains("CallPlaybackInterruptionBinding.shared.bind("),
            "La racine doit brancher le gel des lecteurs pendant l'appel."
        )
    }

    func test_callWindow_passesTheObservedCallManagerIntoCallView() throws {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/RootLayers/CallWindowPresenter.swift"))
        XCTAssertTrue(
            source.contains("CallView(callManager: manager, mesh: .shared)"),
            "La fenêtre d'appel remet à `CallView` la pile qu'elle observe, jamais un défaut `.shared`."
        )
    }
}

/// #8725 — l'appel gèle les lecteurs à timeline et ne les rend qu'au repos.
@MainActor
final class CallPlaybackInterruptionBindingTests: XCTestCase {

    func test_transition_liveCall_beginsTheInterruption() {
        XCTAssertEqual(CallPlaybackInterruptionRule.transition(for: .ringing(isOutgoing: false)), true)
        XCTAssertEqual(CallPlaybackInterruptionRule.transition(for: .connected), true)
    }

    func test_transition_endedPanel_keepsTheInterruption() {
        XCTAssertNil(CallPlaybackInterruptionRule.transition(for: .ended(reason: .remote)))
    }

    func test_transition_backToIdle_endsTheInterruption() {
        XCTAssertEqual(CallPlaybackInterruptionRule.transition(for: .idle), false)
    }

    func test_bind_followsTheCallFromRingToRest() {
        let states = PassthroughSubject<CallState, Never>()
        let interruption = PlaybackInterruption()
        let sut = CallPlaybackInterruptionBinding()
        sut.bind(states: states.eraseToAnyPublisher(), interruption: interruption)

        states.send(.idle)
        XCTAssertFalse(interruption.isActive)
        states.send(.ringing(isOutgoing: false))
        XCTAssertTrue(interruption.isActive)
        states.send(.ended(reason: .local))
        XCTAssertTrue(interruption.isActive, "Le panneau de fin recouvre encore l'écran.")
        states.send(.idle)
        XCTAssertFalse(interruption.isActive)
    }
}

/// #8739 — un appel réduit reste atteignable par-dessus tout plein écran.
///
/// La pastille et la bulle vivaient dans la racine : un viewer de story, une
/// visionneuse ou le composer (présentations modales de la fenêtre principale)
/// les recouvraient. La bulle vit désormais dans une fenêtre passe-plat que ces
/// témoins gouvernent.
@MainActor
final class CallReturnPointTests: XCTestCase {

    private final class RecordingHosting: CallReturnPointHosting {
        var shown = 0
        var hidden = 0
        var hasForegroundScene = true
        func show(_ manager: CallManager, coverage: CallScreenCoverage) -> Bool {
            guard hasForegroundScene else { return false }
            shown += 1
            return true
        }
        func hide() { hidden += 1 }
    }

    private final class PresentingStub: UIViewController {
        var stubbedPresented: UIViewController?
        override var presentedViewController: UIViewController? { stubbedPresented }
    }

    private func makeSUT(covered: Bool = false) -> (sut: CallReturnPointPresenter, hosting: RecordingHosting) {
        let hosting = RecordingHosting()
        return (CallReturnPointPresenter(hosting: hosting, coverage: CallScreenCoverage(), probe: { covered }), hosting)
    }

    private func makeWindow(interactiveFrame: CGRect) -> CallPassthroughWindow {
        let window = CallPassthroughWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let controller = UIViewController()
        controller.view.backgroundColor = .clear
        window.rootViewController = controller
        window.interactiveFrame = interactiveFrame
        window.isHidden = false
        return window
    }

    // MARK: - La règle

    func test_showsBubble_bubbleMode_showsTheReturnPointOverAnyScreen() {
        XCTAssertTrue(CallReturnPoint.showsBubble(displayMode: .bubble, callState: .connected, isSystemPiPActive: false, isMainScreenCovered: false))
        XCTAssertTrue(CallReturnPoint.showsBubble(displayMode: .bubble, callState: .connected, isSystemPiPActive: false, isMainScreenCovered: true))
    }

    func test_showsBubble_pillUnderAFullScreenCover_raisesTheBubble() {
        XCTAssertTrue(CallReturnPoint.showsBubble(displayMode: .pip, callState: .connected, isSystemPiPActive: false, isMainScreenCovered: true))
        XCTAssertTrue(CallReturnPoint.showsBubble(displayMode: .pip, callState: .ringing(isOutgoing: true), isSystemPiPActive: false, isMainScreenCovered: true))
    }

    func test_showsBubble_pillOnAnUncoveredScreen_leavesTheReturnPointToThePill() {
        XCTAssertFalse(CallReturnPoint.showsBubble(displayMode: .pip, callState: .connected, isSystemPiPActive: false, isMainScreenCovered: false))
    }

    func test_showsBubble_fullScreenSystemPiPOrNoCall_showsNothing() {
        XCTAssertFalse(CallReturnPoint.showsBubble(displayMode: .fullScreen, callState: .connected, isSystemPiPActive: false, isMainScreenCovered: true))
        XCTAssertFalse(CallReturnPoint.showsBubble(displayMode: .bubble, callState: .connected, isSystemPiPActive: true, isMainScreenCovered: true))
        XCTAssertFalse(CallReturnPoint.showsBubble(displayMode: .bubble, callState: .idle, isSystemPiPActive: false, isMainScreenCovered: true))
        XCTAssertFalse(CallReturnPoint.showsBubble(displayMode: .bubble, callState: .ended(reason: .local), isSystemPiPActive: false, isMainScreenCovered: true))
    }

    func test_isWindowNeeded_onlyWhileALiveCallIsReduced() {
        XCTAssertTrue(CallReturnPoint.isWindowNeeded(callState: .connected, displayMode: .pip))
        XCTAssertTrue(CallReturnPoint.isWindowNeeded(callState: .connected, displayMode: .bubble))
        XCTAssertFalse(CallReturnPoint.isWindowNeeded(callState: .connected, displayMode: .fullScreen))
        XCTAssertFalse(CallReturnPoint.isWindowNeeded(callState: .idle, displayMode: .bubble))
    }

    // MARK: - Le recouvrement

    func test_isCovered_rootPresentingAFullScreen_coversThePill() {
        let root = PresentingStub()
        root.stubbedPresented = UIViewController()
        XCTAssertTrue(CallReturnPoint.isCovered(root: root))
    }

    func test_isCovered_nothingPresentedOrAnAlert_leavesThePillVisible() {
        let root = PresentingStub()
        XCTAssertFalse(CallReturnPoint.isCovered(root: root))
        root.stubbedPresented = UIAlertController(title: nil, message: nil, preferredStyle: .alert)
        XCTAssertFalse(CallReturnPoint.isCovered(root: root))
        XCTAssertFalse(CallReturnPoint.isCovered(root: nil))
    }

    // MARK: - La fenêtre passe-plat

    func test_windowLevel_sitsAboveEveryPresentationOfTheMainWindow_belowTheCallScreen() {
        XCTAssertGreaterThan(CallReturnPoint.windowLevel, UIWindow.Level.normal)
        XCTAssertLessThan(CallReturnPoint.windowLevel, CallWindowPresentation.windowLevel)
    }

    func test_hitTest_touchOutsideTheBubble_fallsThroughToTheApp() {
        let window = makeWindow(interactiveFrame: CGRect(x: 300, y: 400, width: 80, height: 80))
        XCTAssertNil(window.hitTest(CGPoint(x: 100, y: 100), with: nil))
        XCTAssertNil(window.hitTest(CGPoint(x: 299, y: 440), with: nil))
    }

    func test_hitTest_touchOnTheBubble_isCaptured() {
        let window = makeWindow(interactiveFrame: CGRect(x: 300, y: 400, width: 80, height: 80))
        XCTAssertNotNil(window.hitTest(CGPoint(x: 340, y: 440), with: nil))
    }

    func test_hitTest_noBubbleShown_capturesNothing() {
        let window = makeWindow(interactiveFrame: .zero)
        XCTAssertNil(window.hitTest(CGPoint(x: 0, y: 0), with: nil))
        XCTAssertNil(window.hitTest(CGPoint(x: 195, y: 422), with: nil))
    }

    func test_canBecomeKey_passthroughWindow_neverStealsTheKeyboard() {
        let window = makeWindow(interactiveFrame: .zero)
        XCTAssertFalse(window.canBecomeKey)
        window.makeKey()
        XCTAssertFalse(window.isKeyWindow)
    }

    func test_reduce_frameKey_keepsTheShownBubbleFrame() {
        var value = CallReturnPointFrameKey.defaultValue
        CallReturnPointFrameKey.reduce(value: &value) { CGRect(x: 10, y: 10, width: 56, height: 56) }
        CallReturnPointFrameKey.reduce(value: &value) { .zero }
        XCTAssertEqual(value, CGRect(x: 10, y: 10, width: 56, height: 56))
    }

    // MARK: - Le présentateur

    func test_apply_reducedCall_showsTheReturnPointWindowOnce() {
        let (sut, hosting) = makeSUT()

        sut.apply(manager: CallManager.shared, needed: true)
        sut.apply(manager: CallManager.shared, needed: true)

        XCTAssertEqual(hosting.shown, 1)
        XCTAssertTrue(sut.isShowing)
    }

    func test_apply_backToFullScreen_hidesTheReturnPointWindow() {
        let (sut, hosting) = makeSUT(covered: true)

        sut.apply(manager: CallManager.shared, needed: true)
        sut.apply(manager: CallManager.shared, needed: false)

        XCTAssertEqual(hosting.hidden, 1)
        XCTAssertFalse(sut.isShowing)
        XCTAssertFalse(sut.coverage.isMainScreenCovered)
    }

    func test_apply_shownOverACover_readsTheCoverageAtOnce() {
        let (sut, _) = makeSUT(covered: true)

        sut.apply(manager: CallManager.shared, needed: true)

        XCTAssertTrue(sut.coverage.isMainScreenCovered, "La bulle se lève sans attendre le premier relevé.")
    }

    func test_apply_coverOpenedWhileReduced_raisesTheBubbleOnTheNextReading() {
        var covered = false
        let hosting = RecordingHosting()
        let sut = CallReturnPointPresenter(hosting: hosting, coverage: CallScreenCoverage(), probe: { covered })
        sut.apply(manager: CallManager.shared, needed: true)
        XCTAssertFalse(sut.coverage.isMainScreenCovered)

        covered = true
        let raised = expectation(description: "relevé périodique")
        let watch = sut.coverage.$isMainScreenCovered.dropFirst().sink { if $0 { raised.fulfill() } }
        wait(for: [raised], timeout: 2)
        watch.cancel()
    }

    func test_apply_withoutForegroundScene_showsTheWindowWhenTheSceneActivates() {
        let (sut, hosting) = makeSUT()
        hosting.hasForegroundScene = false

        sut.apply(manager: CallManager.shared, needed: true)
        XCTAssertFalse(sut.isShowing)

        hosting.hasForegroundScene = true
        sut.retryPendingShow()

        XCTAssertTrue(sut.isShowing)
        XCTAssertEqual(hosting.shown, 1)
    }

    // MARK: - Le câblage

    func test_callPresentationLayer_mountsTheBubbleInThePassthroughWindowOnly() throws {
        let layer = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/RootLayers/CallPresentationLayer.swift"))
        XCTAssertFalse(layer.contains("CallBubbleView("), "Montée dans la racine, la bulle passe sous tout plein écran (#8739).")
        XCTAssertTrue(layer.contains("CallReturnPointPresenter.shared.bind("), "La racine doit brancher la fenêtre du point de retour.")

        let window = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/RootLayers/CallWindowPresenter.swift"))
        XCTAssertTrue(window.contains("CallBubbleView(callManager: callManager"), "La fenêtre remet à la bulle la pile qu'elle observe.")

        let bubble = AppSourceGuard.stripComments(try AppSourceGuard.unit("Meeshy/Features/Main/Views/CallBubbleView.swift"))
        XCTAssertTrue(bubble.contains("CallReturnPoint.showsBubble("), "La bulle se montre selon la règle du point de retour, pastille couverte comprise.")
        XCTAssertTrue(bubble.contains("CallReturnPointFrameKey.self"), "La bulle remonte son cadre touchable à la fenêtre passe-plat.")
    }
}
