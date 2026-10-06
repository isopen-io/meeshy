import XCTest
import CoreGraphics
@testable import Meeshy

/// **Tout part du même peintre, à la date de la session** (#9347).
@MainActor
final class ComposerLookPainterWiringTests: XCTestCase {

    func test_fitted_isNineSixteenCenteredInsideTheBounds() {
        let ecran = CGRect(x: 0, y: 0, width: 390, height: 844)
        let toile = ComposerCaptureCanvas.fitted(in: ecran)
        XCTAssertEqual(toile.width / toile.height, 9.0 / 16.0, accuracy: 0.001)
        XCTAssertEqual(toile.width, 390, accuracy: 0.001)
        XCTAssertEqual(toile.midY, ecran.midY, accuracy: 0.001)
    }

    func test_caption_isWrittenAtTheGivenDate() {
        let date = Date(timeIntervalSince1970: 1_790_000_000)
        XCTAssertEqual(ComposerPhotoLookSource.caption(at: date).subtitle,
                       date.formatted(date: .abbreviated, time: .shortened))
    }

    func test_consumers_paintThroughThePainter_andTheSessionDate() throws {
        let surface = try Self.code("Meeshy/Features/Main/Composer/ComposerLiveLookSurface.swift")
        XCTAssertTrue(surface.contains("ComposerLookPainter.paint("), "l'aperçu peint par le peintre unique")
        XCTAssertTrue(surface.contains("ComposerLookPainter.onScreen("), "une seule transformation d'ajustement")
        XCTAssertFalse(surface.contains("CallLiveFrameRule.paintSize("), "la scène se cuit au canevas canonique")
        let export = try Self.code("Meeshy/Features/Main/Composer/ComposerLookVideoExporter.swift")
        XCTAssertTrue(export.contains("ComposerLookPainter.paint("), "la vidéo peint par le peintre unique")
        let session = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureSession.swift")
        XCTAssertTrue(session.contains("ComposerLookPainter.renderPhoto("), "la photo peint par le peintre unique")
        XCTAssertTrue(session.contains("date: lookDate"), "la vidéo grave la date de la session")
        let bande = try Self.code("Meeshy/Features/Main/Composer/ComposerLookStrip.swift")
        XCTAssertTrue(bande.contains("date: session.lookDate"), "la bande grave la date de la session")
        for fichier in ["ComposerLookPainter.swift", "ComposerLiveLookSurface.swift", "ComposerLookVideoExporter.swift"] {
            let code = try Self.code("Meeshy/Features/Main/Composer/\(fichier)")
            XCTAssertFalse(code.contains("Date()"), "\(fichier) : aucune date du rendu sur un chemin de rendu")
        }
        let apercu = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertTrue(apercu.contains("ComposerCaptureCanvas.fitted("), "l'aperçu montre le canevas 9:16, pas l'écran entier")
    }

    private static func code(_ relative: String) throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return AppSourceGuard.stripComments(try String(
            contentsOf: racine.appendingPathComponent(relative), encoding: .utf8))
    }
}
