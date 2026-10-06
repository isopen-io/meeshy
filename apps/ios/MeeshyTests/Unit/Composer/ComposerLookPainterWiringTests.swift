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
        let prises = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureSession+Takes.swift")
        XCTAssertTrue(prises.contains("ComposerLookPainter.renderPhoto("), "la photo peint par le peintre unique")
        XCTAssertTrue(prises.contains("let date = lookDate"), "ce qui part en galerie grave la date de la session")
        let bande = try Self.code("Meeshy/Features/Main/Composer/ComposerLookStrip.swift")
        XCTAssertTrue(bande.contains("date: session.lookDate"), "la bande grave la date de la session")
        for fichier in ["ComposerLookPainter.swift", "ComposerLiveLookSurface.swift", "ComposerLookVideoExporter.swift"] {
            let code = try Self.code("Meeshy/Features/Main/Composer/\(fichier)")
            XCTAssertFalse(code.contains("Date()"), "\(fichier) : aucune date du rendu sur un chemin de rendu")
        }
    }

    /// **Le plein écran est le plein écran** (#9557) : l'aperçu occupe tout ce
    /// qu'on lui donne, et la toile prend SES proportions — plus de 9:16 centré
    /// entre deux bandes noires.
    func test_preview_fillsWhatItIsGiven_andTheCanvasTakesItsProportions() throws {
        let apercu = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureViews.swift")
        XCTAssertFalse(apercu.contains("ComposerCaptureCanvas"), "aucune toile ajustée : l'aperçu remplit son rectangle")
        XCTAssertTrue(apercu.contains("ComposerLookPainter.previewCanvas(aspect:"),
                      "la toile de l'aperçu prend les proportions du viseur")
        XCTAssertTrue(apercu.contains("session.canvasAspect ="), "la session apprend les proportions de ce qu'on voit")
        let surface = try Self.code("Meeshy/Features/Main/Composer/ComposerLiveLookSurface.swift")
        XCTAssertFalse(surface.contains("ComposerLookPainter.designCanvas"),
                       "la vue Metal peint à la toile qu'on lui donne, jamais au 9:16 figé")
    }

    /// Ce qui part a les proportions de ce qu'on voyait : photo, vidéo, galerie.
    func test_everyOutput_isRenderedAtTheViewfinderProportions() throws {
        let prises = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureSession+Takes.swift")
        XCTAssertEqual(prises.components(separatedBy: "aspect: proportions").count - 1, 2,
                       "la photo et la vidéo de la galerie partent aux proportions du viseur")
        let edition = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureSession+Edit.swift")
        XCTAssertEqual(edition.components(separatedBy: "aspect: proportions").count - 1, 2,
                       "la photo et la vidéo retouchées partent aux proportions du viseur")
        XCTAssertFalse(edition.contains("ComposerLookPainter.designCanvas"), "le cadrage se règle sur la toile du viseur")
        let toucher = try Self.code("Meeshy/Features/Main/Composer/ComposerCaptureSession+Tap.swift")
        XCTAssertFalse(toucher.contains("ComposerLookPainter.designCanvas"), "le point visé se lit sur la toile du viseur")
    }

    private static func code(_ relative: String) throws -> String {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        return AppSourceGuard.stripComments(try String(
            contentsOf: racine.appendingPathComponent(relative), encoding: .utf8))
    }
}
