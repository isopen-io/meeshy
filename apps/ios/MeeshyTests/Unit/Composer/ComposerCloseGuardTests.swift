import XCTest
@testable import Meeshy

/// **Fermer un brouillon non vide demande confirmation** (#13839, L3, audit
/// défaut 26) : ✕ fermait sans question.
final class ComposerCloseGuardTests: XCTestCase {

    func test_decide_emptyDraft_closesWithoutAsking() {
        XCTAssertEqual(ComposerCloseGuard.decide(hasContent: false, surfaceIsAutosaved: true, controllerKeeps: true), .closes)
        XCTAssertEqual(ComposerCloseGuard.decide(hasContent: false, surfaceIsAutosaved: false, controllerKeeps: false), .closes)
    }

    func test_decide_nonEmptyDraftThatIsSaved_offersKeepAndDiscard() {
        XCTAssertEqual(ComposerCloseGuard.decide(hasContent: true, surfaceIsAutosaved: true, controllerKeeps: true),
                       .asks(offersKeep: true))
    }

    func test_decide_nonEmptyComposerWhoseDraftIsNotSaved_neverPromisesToKeepIt() {
        XCTAssertEqual(ComposerCloseGuard.decide(hasContent: true, surfaceIsAutosaved: true, controllerKeeps: false),
                       .asks(offersKeep: false))
    }

    /// Une scène ouverte par un média semé, une reprise ou la caméra vidéo est
    /// montée hors du document, que l'autosave n'écrit pas : elle a pourtant de
    /// la matière, et ✕ la perdait sans question.
    func test_decide_nonEmptySceneOutsideTheAutosavedSurface_asksWithoutPromisingToKeep() {
        XCTAssertEqual(ComposerCloseGuard.decide(hasContent: true, surfaceIsAutosaved: false, controllerKeeps: true),
                       .asks(offersKeep: false))
    }

    func test_host_readsTheContentWhateverTheMountedSurface() throws {
        let code = AppSourceGuard.stripComments(try AppSourceGuard.unit(
            "Meeshy/Features/Composer/MeeshyComposerHost+AnchoredSheet.swift"))
            .components(separatedBy: .whitespacesAndNewlines).joined()
        XCTAssertTrue(code.contains("hasContent:composedAutosaveState().hasContent"),
                      "la matière se lit quelle que soit la surface montée, pas par le seul état que l'autosave écrit")
        XCTAssertTrue(code.contains("surfaceIsAutosaved:autosaveState()!=nil"),
                      "« Garder le brouillon » n'est offert que si la surface montée s'écrit vraiment")
    }

    func test_effect_keep_savesThenCloses_discard_purgesThenCloses() {
        XCTAssertEqual(ComposerCloseGuard.effect(.keep), .flushThenClose)
        XCTAssertEqual(ComposerCloseGuard.effect(.discard), .purgeThenClose)
    }

    func test_copy_isLocalizedAndNamesBothChoices() {
        XCTAssertFalse(ComposerCloseGuardCopy.title.isEmpty)
        XCTAssertNotEqual(ComposerCloseGuardCopy.keep, ComposerCloseGuardCopy.discard)
    }
}
