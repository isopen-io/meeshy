import XCTest
import CoreGraphics
import CoreImage
@testable import Meeshy

/// **Tout part du même peintre, à la date de la session** (#9347).
@MainActor
final class ComposerLookPainterWiringTests: XCTestCase {

    /// La toile prend les proportions du viseur (#9557) : celles de l'écran en
    /// plein écran, le 9:16 exact pour une carte, même mesurée au demi-point.
    func test_canvas_takesTheViewfinderProportions_andACardStaysNineSixteen() {
        let ecran = CGSize(width: 402, height: 874)
        let proportions = ComposerLookPainter.aspect(of: ecran)
        XCTAssertEqual(proportions, 402.0 / 874.0, accuracy: 0.001)
        let apercu = ComposerLookPainter.previewCanvas(aspect: proportions)
        XCTAssertEqual(apercu.width / apercu.height, proportions, accuracy: 0.002)
        XCTAssertLessThanOrEqual(apercu.width, ComposerLookPainter.designCanvas.width)
        XCTAssertEqual(apercu.height, ComposerLookPainter.designCanvas.height)
        XCTAssertEqual(ComposerLookPainter.aspect(of: CGSize(width: 360, height: 640.5)), ComposerLookPainter.designAspect,
                       "une carte 9:16 reste le 9:16 exact")
        XCTAssertEqual(ComposerLookPainter.previewCanvas(aspect: ComposerLookPainter.designAspect),
                       ComposerLookPainter.designCanvas)
        XCTAssertEqual(ComposerLookPainter.aspect(of: .zero), ComposerLookPainter.designAspect)
    }

    /// Ce qui part : le plus grand recadrage de la source aux proportions du
    /// viseur, jamais réduit, aux dimensions paires.
    func test_outputCanvas_isTheLargestCropAtTheViewfinderProportions() {
        let proportions = ComposerLookPainter.aspect(of: CGSize(width: 402, height: 874))
        let photo = ComposerLookPainter.canvas(for: CGSize(width: 3024, height: 4032), aspect: proportions)
        XCTAssertEqual(photo.height, 4032, "la hauteur native est gardée")
        XCTAssertEqual(photo.width / photo.height, proportions, accuracy: 0.001)
        XCTAssertEqual(Int(photo.width) % 2, 0)
        let large = ComposerLookPainter.canvas(for: CGSize(width: 1080, height: 1920), aspect: 1)
        XCTAssertEqual(large, CGSize(width: 1080, height: 1080), "une toile plus large que la source se borne à sa largeur")
    }

    /// À l'écran, la toile du viseur couvre le drawable bord à bord.
    func test_onScreen_coversTheDrawable_whenTheCanvasHasItsProportions() {
        let toile = ComposerLookPainter.previewCanvas(aspect: ComposerLookPainter.aspect(of: CGSize(width: 402, height: 874)))
        let drawable = CGSize(width: 1206, height: 2622)
        let peinte = CIImage(color: .red).cropped(to: CGRect(origin: .zero, size: toile))
        let ecran = ComposerLookPainter.onScreen(peinte, canvas: toile, drawable: drawable).extent
        XCTAssertEqual(ecran.width, drawable.width, accuracy: 0.5)
        XCTAssertEqual(ecran.height, drawable.height, accuracy: 0.5)
        let carte = ComposerLookPainter.onScreen(CIImage(color: .red).cropped(to: CGRect(x: 0, y: 0, width: 1080, height: 1920)),
                                                 canvas: ComposerLookPainter.designCanvas, drawable: drawable).extent
        XCTAssertEqual(carte.width / carte.height, 9.0 / 16.0, accuracy: 0.001, "une toile d'autres proportions s'ajuste, entière")
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
