import XCTest
@testable import MeeshyUI

/// La décision de DÉCOUPE (#4657) — éprouvée sans fichier, parce que c'est une
/// règle et non une opération.
final class AudioSegmentExporterTests: XCTestCase {

    func test_uneSelectionQuiCouvreToutNeDecoupePAS() {
        XCTAssertFalse(AudioSegmentExporter.needsExport(range: 0...30, fullDuration: 30))
    }

    /// **La tolérance n'est pas une commodité.** Une poignée posée à la main ne
    /// tombe jamais sur la milliseconde ; sans elle, TOUTE ouverture de la
    /// feuille ré-encoderait la piste pour n'en retirer que quelques centièmes.
    func test_uneBorneAQuelquesCentiemesDuBout_neDecoupePas() {
        XCTAssertFalse(AudioSegmentExporter.needsExport(range: 0.02...29.98, fullDuration: 30))
    }

    func test_unDebutRogneDecoupe() {
        XCTAssertTrue(AudioSegmentExporter.needsExport(range: 3...30, fullDuration: 30))
    }

    func test_uneFinRogneeDecoupe() {
        XCTAssertTrue(AudioSegmentExporter.needsExport(range: 0...12, fullDuration: 30))
    }

    /// Une durée inconnue ne fabrique pas une découpe : découper sur une durée
    /// nulle produirait un intervalle vide, donc un fichier muet.
    func test_uneDureeNulleNeDecoupeJamais() {
        XCTAssertFalse(AudioSegmentExporter.needsExport(range: 0...0, fullDuration: 0))
    }
}
