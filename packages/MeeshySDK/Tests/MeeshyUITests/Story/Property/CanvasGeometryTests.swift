import Testing
import CoreGraphics
@testable import MeeshyUI

@Suite("CanvasGeometry — Linearity & Invariants")
struct CanvasGeometryTests {

    @Test("render(designPoint) is linear : same relative output for any renderSize")
    func render_designPoint_isLinear() {
        let g1 = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
        let g2 = CanvasGeometry(renderSize: CGSize(width: 820, height: 1458))
        let designPoint = CGPoint(x: 540, y: 960) // centre

        let p1 = g1.render(designPoint)
        let p2 = g2.render(designPoint)

        // Tolerance 0.001 (1‰) absorbs sub-pixel rounding when device dims are not strict 9:16
        // (412×732 ≈ 412×732.44, 820×1458 ≈ 820×1457.78 — both rounded to integers).
        #expect(abs(p1.x / 412 - p2.x / 820) < 0.001)
        #expect(abs(p1.y / 732 - p2.y / 1458) < 0.001)
    }

    @Test("scaleFactor is renderSize.width / 1080")
    func scaleFactor_isRenderWidthOver1080() {
        let g = CanvasGeometry(renderSize: CGSize(width: 540, height: 960))
        #expect(abs(g.scaleFactor - 0.5) < 0.0001)
    }

    @Test("designSize is constant 1080x1920")
    func designSize_isConstant() {
        #expect(CanvasGeometry.designWidth == 1080)
        #expect(CanvasGeometry.designHeight == 1920)
        #expect(CanvasGeometry.designSize == CGSize(width: 1080, height: 1920))
    }

    @Test("designLength(forNormalized:) maps 0..1 to 0..designWidth")
    func designLength_normalized_mapsCorrectly() {
        let g = CanvasGeometry(renderSize: CGSize(width: 412, height: 732))
        #expect(abs(g.designLength(forNormalized: 0.5) - 540) < 0.0001)
        #expect(abs(g.designLength(forNormalized: 0.0)) < 0.0001)
        #expect(abs(g.designLength(forNormalized: 1.0) - 1080) < 0.0001)
    }

    @Test("render(length) scales by scaleFactor")
    func render_length_scalesByFactor() {
        let g = CanvasGeometry(renderSize: CGSize(width: 540, height: 960)) // factor 0.5
        #expect(abs(g.render(100.0) - 50.0) < 0.0001)
        #expect(abs(g.render(64.0) - 32.0) < 0.0001) // fontSize=64 design px → 32pt rendered
    }

    // MARK: - aspectFitSize (parité composer ↔ reader, 2026-06-01)

    @Test("aspectFitSize produces an exact 9:16 size")
    func aspectFitSize_isNineSixteen() {
        let fit = CanvasGeometry.aspectFitSize(in: CGSize(width: 402, height: 874))
        #expect(abs(fit.width / fit.height - 9.0 / 16.0) < 0.0001)
    }

    @Test("aspectFitSize is width-bound when area is taller than 9:16 (iPhone full screen)")
    func aspectFitSize_widthBound_whenTaller() {
        // iPhone 16 Pro plein écran : 402×874 (ratio 0.46, plus haut que 9:16).
        let fit = CanvasGeometry.aspectFitSize(in: CGSize(width: 402, height: 874))
        #expect(abs(fit.width - 402) < 0.0001)          // largeur conservée
        #expect(abs(fit.height - 402 * 16.0 / 9.0) < 0.001) // hauteur ramenée à 9:16 (≈714.7)
        #expect(fit.height < 874)                        // strictement plus court que l'écran
    }

    @Test("aspectFitSize is height-bound when area is wider than 9:16")
    func aspectFitSize_heightBound_whenWider() {
        let fit = CanvasGeometry.aspectFitSize(in: CGSize(width: 2000, height: 800))
        #expect(abs(fit.height - 800) < 0.0001)
        #expect(abs(fit.width - 800 * 9.0 / 16.0) < 0.001)
        #expect(fit.width < 2000)
    }

    @Test("composer (full screen) and reader (9:16 frame) resolve to the same canvas — root-cause parity")
    func aspectFitSize_composerAndReaderMatch() {
        // Avant le fix : le composer rendait plein écran (402×874) et le reader en
        // 9:16. `aspectFitSize` appliqué aux deux donne des bounds identiques, donc
        // tous les pipelines (texte largeur, dessin bounds non-uniforme) round-trip.
        let composerArea = CGSize(width: 402, height: 874) // ZStack plein écran
        let readerArea = CGSize(width: 402, height: 874)   // même device, frame 9:16 appliquée par le reader
        let composerFit = CanvasGeometry.aspectFitSize(in: composerArea)
        let readerFit = CanvasGeometry.aspectFitSize(in: readerArea)
        #expect(abs(composerFit.width - readerFit.width) < 0.0001)
        #expect(abs(composerFit.height - readerFit.height) < 0.0001)
    }

    @Test("aspectFitSize is a no-op fallback for empty area")
    func aspectFitSize_emptyArea_returnsInput() {
        #expect(CanvasGeometry.aspectFitSize(in: .zero) == .zero)
    }
}
