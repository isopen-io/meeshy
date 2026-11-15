import XCTest
import MeeshyUI
@testable import Meeshy

/// **Un toucher applique l'audience et ferme** (#13839, L3) : plus de bouton
/// « Appliquer · PUBLIC », plus de note jargon. « Sauf… » et « Seulement… »
/// ouvrent leur liste.
final class ComposerAudienceTapTests: XCTestCase {

    func test_outcome_aPlainMode_appliesAndCloses() {
        for mode in [PostVisibility.public, .community, .friends, .private] {
            XCTAssertEqual(ComposerAudienceTap.outcome(for: mode), .applyAndClose, "\(mode)")
        }
    }

    func test_outcome_aListMode_opensItsList() {
        XCTAssertEqual(ComposerAudienceTap.outcome(for: .only), .openList)
        XCTAssertEqual(ComposerAudienceTap.outcome(for: .except), .openList)
    }

    func test_sheet_noLongerCarriesAnApplyBarNorTheScopeNote() throws {
        let code = try AppSourceGuard.stripComments(String(contentsOf: Self.sheetURL, encoding: .utf8))
        XCTAssertFalse(code.contains("applyBar"), "« Appliquer » est retiré : le toucher applique")
        XCTAssertFalse(code.contains("scopeNote"), "la note sur la portée de l'audience est retirée")
    }

    private static var sheetURL: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Composer/ComposerAudienceSheet.swift")
    }
}
