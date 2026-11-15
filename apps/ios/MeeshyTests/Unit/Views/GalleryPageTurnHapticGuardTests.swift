import XCTest
@testable import Meeshy

/// #16324 — **feuilleter le plein écran ne vibre pas.**
///
/// Recette porteur du 2026-11-05 : le passage d'un média au suivant portait un
/// retour haptique inutile. Il tombait à la POSE de la page, après la course du
/// doigt — un choc en retard sur le geste —, et doublait celui de la vignette
/// touchée dans la pellicule. Un glissement est sa propre réponse ; seuls les
/// TOUCHERS (vignette, flèche, bouton) gardent leur retour.
///
/// Aucun XCTest n'observe un retour haptique : la garde de source est ici la
/// seule mesure possible, et elle lit le CORPS de `handlePageChange`, pas le
/// fichier entier — les boutons du plateau gardent leurs vibrations.
final class GalleryPageTurnHapticGuardTests: XCTestCase {

    private func body(of function: String, in source: String) throws -> String {
        let start = try XCTUnwrap(source.range(of: "func \(function)("), "\(function) introuvable")
        let rest = source[start.upperBound...]
        let end = rest.range(of: "\n    }\n")?.lowerBound ?? rest.endIndex
        return String(rest[..<end])
    }

    func test_handlePageChange_turningAPage_doesNotVibrate() throws {
        let source = try MyStoriesSourceCorpus.text(of: "Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift")
        let pageChange = try body(of: "handlePageChange", in: source)

        XCTAssertFalse(pageChange.contains("HapticFeedback"),
                       "un média atteint au glissement ne déclenche aucun retour haptique")
    }
}
