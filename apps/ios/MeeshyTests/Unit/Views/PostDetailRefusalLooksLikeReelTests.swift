import Foundation
import XCTest
@testable import Meeshy

/// **Un lien de publication ou de story refusé se présente comme un RÉEL
/// refusé** (#10314, #10318 — décision porteur du 2026-10-12 : « faire le même
/// traitement que pour les réels »).
///
/// Un membre connecté hors audience qui ouvre `/post/<id>` — ou `/story/<id>`,
/// que `StoryDoor` fait retomber sur le détail — voit le MÊME écran qu'un réel
/// refusé : `ReelOpenFailureView`, son noir de média, ses mots, « Retour », et
/// jamais « Réessayer ». Le rendu n'est pas interrogeable sans harnais de
/// snapshot ; le MONTAGE l'est, sur le texte source — c'est la marche qu'une
/// jumelle redessinée à côté manquerait.
@MainActor
final class PostDetailRefusalLooksLikeReelTests: XCTestCase {

    private var absenceStatesSource: String {
        get throws {
            let url = URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()  // Views
                .deletingLastPathComponent()  // Unit
                .deletingLastPathComponent()  // MeeshyTests
                .deletingLastPathComponent()  // ios
                .appendingPathComponent("Meeshy/Features/Main/Views/PostDetailView+AbsenceStates.swift")
            return try String(contentsOf: url, encoding: .utf8)
        }
    }

    private func unavailableStateBody() throws -> String {
        let source = try absenceStatesSource
        let start = try XCTUnwrap(source.range(of: "var unavailableState: some View {"))
        return String(source[start.upperBound...])
    }

    func test_unavailableState_mountsTheReelRefusalView() throws {
        let body = try unavailableStateBody()
        XCTAssertTrue(body.contains("ReelOpenFailureView("), "le refus d'un post doit monter l'écran du réel refusé, pas une jumelle")
        XCTAssertTrue(body.contains("failure: .notFound"), "403 et 404 confondus (D-6) : la cause est une absence")
    }

    func test_reelRefusal_offersNoRetry() {
        XCTAssertFalse(ContentFetchFailure.notFound.offersRetry)
        XCTAssertFalse(ContentFetchFailure.forbidden.offersRetry)
    }

    func test_reelRefusal_saysTheSameWordsForForbiddenAndNotFound() {
        XCTAssertEqual(ContentFetchFailure.forbidden.title, ContentFetchFailure.notFound.title)
        XCTAssertEqual(ContentFetchFailure.forbidden.message, ContentFetchFailure.notFound.message)
    }
}
