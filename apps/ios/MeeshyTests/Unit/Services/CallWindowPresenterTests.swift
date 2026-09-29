import UIKit
import XCTest
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
        func show(_ manager: CallManager) { shown += 1 }
        func hide() { hidden += 1 }
    }

    private func makeSUT() -> (sut: CallWindowPresenter, hosting: RecordingHosting) {
        let hosting = RecordingHosting()
        return (CallWindowPresenter(hosting: hosting), hosting)
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
    }
}
