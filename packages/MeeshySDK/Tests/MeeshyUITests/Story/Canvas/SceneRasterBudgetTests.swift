import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **Grandir sans plafond ne veut pas dire rasteriser sans plafond** (#14299).
///
/// Un objet de scène garde sa taille exacte ; seule la RÉSOLUTION de son image
/// est bornée, à 4096 px de côté comme le texte (`StoryTextLayer.maxRasterSide`).
/// Sans elle, un sticker agrandi cent fois demanderait près d'un gigaoctet.
@MainActor
final class SceneRasterBudgetTests: XCTestCase {

    private let ecran = CanvasGeometry(renderSize: CGSize(width: 393, height: 699))

    private func pixelSide(_ image: CGImage?) -> Int {
        max(image?.width ?? 0, image?.height ?? 0)
    }

    private func pixelSide(of layer: CALayer) -> Int {
        guard let contents = layer.contents,
              CFGetTypeID(contents as CFTypeRef) == CGImage.typeID else { return 0 }
        return pixelSide(unsafeBitCast(contents as CFTypeRef, to: CGImage.self))
    }

    func test_leBudget_gardeLEchelleDEcranTantQueLImageTient() {
        XCTAssertEqual(SceneRasterBudget.scale(for: CGSize(width: 1000, height: 400), preferred: 3), 3)
    }

    func test_leBudget_baisseLaResolutionAuDelaDe4096Pixels() {
        let echelle = SceneRasterBudget.scale(for: CGSize(width: 8000, height: 2000), preferred: 3)
        XCTAssertEqual(echelle * 8000, SceneRasterBudget.maxPixelSide, accuracy: 1e-6)
    }

    func test_leBudget_ignoreUneTailleDegeneree() {
        XCTAssertEqual(SceneRasterBudget.scale(for: .zero, preferred: 2), 2)
        XCTAssertEqual(SceneRasterBudget.scale(for: CGSize(width: CGFloat.infinity, height: 1), preferred: 2), 2)
    }

    func test_leTexte_partageLeMemeBudget() {
        XCTAssertEqual(StoryTextLayer.maxRasterSide, SceneRasterBudget.maxPixelSide)
    }

    func test_unGlypheGeant_seRasteriseDansLeBudget() {
        let image = StoryStickerRasterizer.shared.cgImage(for: "🔥", size: 6000)
        XCTAssertGreaterThan(pixelSide(image), 0)
        XCTAssertLessThanOrEqual(pixelSide(image), Int(SceneRasterBudget.maxPixelSide))
    }

    /// La COUCHE garde la taille exacte d'un sticker agrandi cinquante fois :
    /// seule la résolution de son image baisse.
    func test_unStickerAgrandi_garderSaTailleExacte() {
        let sticker = StorySticker(emoji: "🔥", scale: 50, baseSize: 140)
        let layer = StoryStickerLayer()
        layer.configure(with: sticker, geometry: ecran, mode: .edit, renderScale: 3)
        let attendu = CanvasGeometry.stickerFontSize(baseSize: 140, scale: 50, canvasWidth: 393)
        XCTAssertEqual(layer.bounds.width, attendu, accuracy: 0.01)
        XCTAssertGreaterThan(attendu, 2500)
        XCTAssertLessThanOrEqual(pixelSide(of: layer),
                                 Int(SceneRasterBudget.maxPixelSide))
    }

    func test_unGabaritGeant_garderSaBoiteEtBorneSaResolution() throws {
        let metrics = StickerTemplateMetrics.sticker(geometry: ecran, baseSize: 140, scale: 60)
        let slots = [StickerSlotFiller.timeSlot: "21:33"]
        let mesure = try XCTUnwrap(StickerTemplateRenderer.measuredSize(
            templateID: StickerTemplateCatalog.ID.timeRibbon, slots: slots, metrics: metrics))
        let (image, taille) = try XCTUnwrap(StickerTemplateRenderer.image(
            templateID: StickerTemplateCatalog.ID.timeRibbon, slots: slots,
            metrics: metrics, screenScale: 3))
        XCTAssertEqual(taille.width, mesure.width, accuracy: 0.5)
        XCTAssertEqual(taille.height, mesure.height, accuracy: 0.5)
        XCTAssertGreaterThan(pixelSide(image?.cgImage), 0)
        XCTAssertLessThanOrEqual(pixelSide(image?.cgImage), Int(SceneRasterBudget.maxPixelSide) + 1)
    }

    func test_unePastilleSonGeante_garderSaTailleEtBorneSaResolution() {
        var son = StoryAudioPlayerObject(id: "a")
        son.scale = 40
        let layer = StoryAudioChipLayer()
        layer.configure(with: StoryAudioChipItem(audio: son), geometry: ecran, elapsed: 0, renderScale: 3)
        let attendu = StoryAudioChipPainter.placement(for: son, renderSize: ecran.renderSize, elapsed: 0).size
        XCTAssertEqual(layer.bounds.width, attendu.width, accuracy: 0.01)
        XCTAssertLessThanOrEqual(pixelSide(of: layer),
                                 Int(SceneRasterBudget.maxPixelSide) + 1)
    }

    /// **La pastille son ne re-borne plus son échelle à la lecture** : agrandie
    /// quarante fois par l'auteur, elle se lit quarante fois plus grande.
    func test_laPastilleSon_seLitALEchelleStockee() {
        var son = StoryAudioPlayerObject(id: "a")
        son.scale = 40
        let pose = StoryAudioChipPainter.placement(for: son, renderSize: ecran.renderSize, elapsed: 0)
        XCTAssertEqual(pose.unit, 393 / StoryAudioChipPainter.referenceCanvasWidth * 40, accuracy: 1e-9)
        son.scale = 0.05
        let petite = StoryAudioChipPainter.placement(for: son, renderSize: ecran.renderSize, elapsed: 0)
        XCTAssertEqual(petite.unit, 393 / StoryAudioChipPainter.referenceCanvasWidth * 0.05, accuracy: 1e-9)
    }
}
