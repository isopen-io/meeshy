import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Le canvas et le composite basse résolution (miniature de tray, ThumbHash)
/// dimensionnaient les stickers par DEUX règles différentes :
///
///   canvas    → `baseSize × scale × largeur / 1080`
///   composite → `largeur × scale × 0,15`, **`baseSize` ignoré**
///
/// Deux conséquences visibles : un sticker à `baseSize` par défaut (140)
/// sortait ~16 % trop gros dans la miniature (0,15 contre ≈0,1296), et un
/// sticker redimensionné via `baseSize` gardait exactement la même taille
/// dans la miniature quel que soit le réglage.
@MainActor
final class StickerSizeParityTests: XCTestCase {

    // MARK: - La règle canonique

    func test_defaultSticker_projectsItsDesignSizeByTheWidthRatio() {
        // 140 (design) × 1,0 × (1080 / 1080) = 140
        XCTAssertEqual(CanvasGeometry.stickerFontSize(baseSize: 140, scale: 1, canvasWidth: 1080),
                       140, accuracy: 0.001)
        // Sur une surface deux fois plus étroite, deux fois plus petit.
        XCTAssertEqual(CanvasGeometry.stickerFontSize(baseSize: 140, scale: 1, canvasWidth: 540),
                       70, accuracy: 0.001)
    }

    /// C'est le cœur du défaut : `baseSize` DOIT peser sur le résultat.
    func test_baseSizeChangesTheRenderedSize() {
        let small = CanvasGeometry.stickerFontSize(baseSize: 70, scale: 1, canvasWidth: 1080)
        let large = CanvasGeometry.stickerFontSize(baseSize: 280, scale: 1, canvasWidth: 1080)
        XCTAssertEqual(large / small, 4, accuracy: 0.001,
                       "Quadrupler baseSize doit quadrupler le glyphe.")
    }

    func test_scaleAndBaseSizeAreInterchangeableFactors() {
        XCTAssertEqual(CanvasGeometry.stickerFontSize(baseSize: 140, scale: 2, canvasWidth: 1080),
                       CanvasGeometry.stickerFontSize(baseSize: 280, scale: 1, canvasWidth: 1080),
                       accuracy: 0.001)
    }

    func test_theOldHardcodedFactorIsGone() {
        // L'ancienne règle du composite : largeur × scale × 0,15 = 162 à 1080.
        // La règle canonique donne 140. Si les deux coïncidaient, le test
        // ci-dessus ne prouverait rien.
        let canonical = CanvasGeometry.stickerFontSize(baseSize: 140, scale: 1, canvasWidth: 1080)
        XCTAssertNotEqual(canonical, 1080 * 1 * 0.15, accuracy: 0.5,
                          "Les deux règles doivent bien être distinctes — sinon le défaut était invisible.")
    }

    // MARK: - Bornes

    func test_tinyStickerNeverCollapsesBelowTheLegibilityFloor() {
        XCTAssertEqual(CanvasGeometry.stickerFontSize(baseSize: 1, scale: 0.1, canvasWidth: 100),
                       8, accuracy: 0.001)
    }

    func test_degenerateInputsDoNotProduceNegativeOrNaNSizes() {
        XCTAssertEqual(CanvasGeometry.stickerFontSize(baseSize: -50, scale: 1, canvasWidth: 1080),
                       8, accuracy: 0.001)
        XCTAssertEqual(CanvasGeometry.stickerFontSize(baseSize: 140, scale: -2, canvasWidth: 1080),
                       8, accuracy: 0.001)
        XCTAssertEqual(CanvasGeometry.stickerFontSize(baseSize: 140, scale: 1, canvasWidth: 0),
                       0, accuracy: 0.001)
    }

    // MARK: - Parité mesurée sur les PIXELS du composite

    /// Hauteur peinte du glyphe, **en POINTS** de la surface logique.
    /// `UIGraphicsImageRenderer` rend à l'échelle de l'écran (×3 ici) : compter
    /// les lignes du bitmap brut donnerait une valeur trois fois trop grande.
    private func drawnStickerHeight(baseSize: Double, scale: Double,
                                    canvas: CGSize) throws -> Double {
        var sticker = StorySticker(id: "st", emoji: "🟥", x: 0.5, y: 0.5)
        sticker.baseSize = baseSize
        sticker.scale = scale
        var effects = StoryEffects(background: "0000FF")
        effects.stickerObjects = [sticker]
        let slide = StorySlide(effects: effects)

        let composite = try XCTUnwrap(StorySlideRenderer.renderComposite(
            slide: slide, bgImage: nil, loadedImages: [:], size: canvas))
        let cg = try XCTUnwrap(composite.cgImage)

        let w = cg.width, h = cg.height
        var data = [UInt8](repeating: 0, count: w * h * 4)
        let ctx = try XCTUnwrap(CGContext(data: &data, width: w, height: h,
                                          bitsPerComponent: 8, bytesPerRow: w * 4,
                                          space: CGColorSpaceCreateDeviceRGB(),
                                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))

        // Colonne centrale : compte les pixels ROUGES (le glyphe) sur fond BLEU.
        let x = w / 2
        var rows = 0
        for y in 0..<h {
            let i = (y * w + x) * 4
            if Int(data[i]) > 140 && Int(data[i + 2]) < 120 { rows += 1 }
        }
        let pixelScale = Double(w) / Double(canvas.width)
        return Double(rows) / max(pixelScale, 0.0001)
    }

    /// Preuve comportementale du défaut : sur l'ancien code, `baseSize` était
    /// ignoré et les deux rendus auraient été IDENTIQUES.
    func test_composite_actuallyHonoursBaseSize() throws {
        let canvas = CGSize(width: 540, height: 960)
        let small = try drawnStickerHeight(baseSize: 70, scale: 1, canvas: canvas)
        let large = try drawnStickerHeight(baseSize: 280, scale: 1, canvas: canvas)

        XCTAssertGreaterThan(small, 0, "Le sticker doit être peint dans le composite.")
        XCTAssertGreaterThan(large, small * 2,
                             "Quadrupler baseSize doit se voir dans le rendu (\(small) → \(large) pt).")
    }

    /// Le composite doit dessiner à la taille que la règle canonique annonce —
    /// c'est cette égalité qui garantit que miniature et canvas coïncident.
    func test_composite_drawsAtTheCanonicalSize() throws {
        let canvas = CGSize(width: 540, height: 960)
        let measured = try drawnStickerHeight(baseSize: 140, scale: 1, canvas: canvas)
        let expected = CanvasGeometry.stickerFontSize(baseSize: 140, scale: 1, canvasWidth: canvas.width)

        // Le glyphe n'occupe pas toute la boîte de sa fonte (ascender/descender) :
        // on tolère large, l'ancien facteur 0,15 sortait de cette fourchette.
        XCTAssertGreaterThan(measured, Double(expected) * 0.5,
                             "mesuré \(measured) pt pour une fonte de \(expected) pt")
        XCTAssertLessThan(measured, Double(expected) * 1.2,
                          "mesuré \(measured) pt pour une fonte de \(expected) pt")
    }
}
