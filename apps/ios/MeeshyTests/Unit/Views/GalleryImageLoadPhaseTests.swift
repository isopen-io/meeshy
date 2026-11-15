import XCTest
@testable import Meeshy

/// #8141 — une pièce dont le fichier est introuvable sort de l'état
/// « chargement » vers un état dessiné, et « Réessayer » rejoue la requête.
@MainActor
final class GalleryImageLoadPhaseTests: XCTestCase {

    func test_fail_currentAttempt_leavesLoadingForTheFailedState() {
        var phase = GalleryImageLoadPhase()
        phase.fail(attempt: phase.attempt)
        XCTAssertTrue(phase.isFailed)
    }

    func test_retry_afterFailure_loadsAgainUnderANewAttempt() {
        var phase = GalleryImageLoadPhase()
        phase.fail(attempt: 0)
        phase.retry()
        XCTAssertFalse(phase.isFailed)
        XCTAssertEqual(phase.attempt, 1)
    }

    func test_fail_staleAttemptAfterRetry_isIgnored() {
        var phase = GalleryImageLoadPhase()
        phase.fail(attempt: 0)
        phase.retry()
        phase.fail(attempt: 0)
        XCTAssertFalse(phase.isFailed, "l'échec d'une tentative déjà remplacée ne refait pas échouer la page")
    }

    func test_galleryImagePage_reportsFullImageFailureAndDrawsTheUnavailableState() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/ConversationMediaGalleryView+Pages.swift")
        let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
        XCTAssertTrue(source.contains("onFullImageFailure:"), "la page image doit écouter l'échec du plein format")
        XCTAssertTrue(source.contains("GalleryMediaUnavailableView("), "un échec se dessine, jamais un indicateur infini")
    }
}
