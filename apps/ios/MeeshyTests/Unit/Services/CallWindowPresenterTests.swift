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
