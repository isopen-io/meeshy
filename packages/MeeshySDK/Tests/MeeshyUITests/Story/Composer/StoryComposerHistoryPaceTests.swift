import XCTest
@testable import MeeshyUI
@testable import MeeshySDK

/// #14208 — les règles pures d'un pas d'historique : ce que les boutons
/// montrent au moment de l'action, la diapo qui garde la main, et ce qu'un pas
/// peut encore ressusciter.
@MainActor
final class StoryComposerHistoryPaceTests: XCTestCase {

    private func slide(_ id: String) -> StorySlide {
        StorySlide(id: id)
    }

    func test_buttons_aDocumentThatDiffers_offersUndo_andForgetsRedo() throws {
        let captured = try XCTUnwrap(StoryComposerHistoryPace.encode([slide("a")]))
        let boutons = StoryComposerHistoryPace.buttons(for: [slide("a"), slide("b")], captured: captured,
                                                       canUndo: false, canRedo: true)
        XCTAssertEqual(boutons, .init(canUndo: true, canRedo: false))
    }

    func test_buttons_theCapturedDocument_keepsTheStackFlags() throws {
        let captured = try XCTUnwrap(StoryComposerHistoryPace.encode([slide("a")]))
        let boutons = StoryComposerHistoryPace.buttons(for: [slide("a")], captured: captured,
                                                       canUndo: false, canRedo: true)
        XCTAssertEqual(boutons, .init(canUndo: false, canRedo: true))
    }

    func test_index_followsTheEditedSlideById_orStaysInBounds() {
        let restored = [slide("c"), slide("a")]
        XCTAssertEqual(StoryComposerHistoryPace.index(of: "a", in: restored, previous: 0), 1)
        XCTAssertEqual(StoryComposerHistoryPace.index(of: "b", in: restored, previous: 5), 1)
        XCTAssertEqual(StoryComposerHistoryPace.index(of: nil, in: restored, previous: -1), 0)
    }

    func test_retained_keepsOnlyWhatAStepStillReferences() {
        let pas = [Data("{\"id\":\"media-1\"}".utf8)]
        let gardes = StoryComposerHistoryPace.retained(["media-1": 1, "media-2": 2], reachableFrom: pas)
        XCTAssertEqual(gardes, ["media-1": 1])
    }

    func test_hold_reportsOnlyTheEndOfAGesture() {
        let pace = StoryComposerHistoryPace()
        XCTAssertFalse(pace.hold(true), "le début d'un geste n'est pas une fin")
        XCTAssertTrue(pace.captureHeld)
        XCTAssertFalse(pace.hold(true), "un second début ne change rien")
        XCTAssertTrue(pace.hold(false))
        XCTAssertFalse(pace.captureHeld)
    }
}
