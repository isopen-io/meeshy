import XCTest
import AVFoundation
import CoreMedia
import CoreGraphics
import Metal
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Demande user 2026-07-11 puis 2026-07-26 : l'export intègre un watermark
/// Meeshy ANIMÉ — logo dashes (tracé + respiration) + "meeshy" + "@pseudo",
/// alternant bas-droite / haut-gauche toutes les 5 s avec fondu. Le placement
/// animé et l'alternance sont couverts au pixel par `StoryExporter_WatermarkTests`
/// (export complet). Ce fichier couvre la CONSTRUCTION du watermark et le rendu
/// sans watermark.
@MainActor
final class StoryExportWatermarkTests: XCTestCase {

    // MARK: - Construction

    func test_make_producesNonEmptyTextBlock() throws {
        let watermark = try XCTUnwrap(MeeshyExportWatermark.make())
        XCTAssertGreaterThan(watermark.blockAspect, 1.0,
                             "Le bloc (logo carré + gap + texte) est plus large que haut")
        XCTAssertTrue(Self.hasOpaquePixels(watermark.textImage),
                      "Le bloc texte doit contenir des pixels visibles")
    }

    func test_make_withUsername_addsHandleLine() throws {
        let plain = try XCTUnwrap(MeeshyExportWatermark.make())
        let withHandle = try XCTUnwrap(MeeshyExportWatermark.make(username: "jean_dupont"))

        // "@pseudo" est empilé SOUS "meeshy" → le bloc texte gagne une ligne,
        // donc son image est plus haute qu'avec le seul wordmark.
        XCTAssertGreaterThan(withHandle.textImage.height, plain.textImage.height,
                             "Le pseudo ajoute une seconde ligne au bloc texte")
    }

    // MARK: - Animation du logo

    func test_logoColor_isMeeshyPrimaryIndigo() {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        StoryExportWatermark.logoColor.getRed(&r, green: &g, blue: &b, alpha: &a)
        XCTAssertEqual(r, 99.0 / 255.0, accuracy: 0.02, "Rouge de l'indigo primaire #63")
        XCTAssertEqual(g, 102.0 / 255.0, accuracy: 0.02, "Vert de l'indigo primaire #66")
        XCTAssertEqual(b, 241.0 / 255.0, accuracy: 0.02, "Bleu de l'indigo primaire #F1")
    }

    func test_logoTrace_completesInThreeSeconds() {
        // La dernière barre est pleinement tracée à 3 s…
        XCTAssertEqual(StoryExportWatermark.logoTraceProgress(elapsed: 3.0, barIndex: 2),
                       1.0, accuracy: 0.05, "Le logo doit être complet à t=3s")
        // …mais PAS encore à mi-parcours (1.5 s) — l'animation doit être lente.
        XCTAssertLessThan(StoryExportWatermark.logoTraceProgress(elapsed: 1.5, barIndex: 2),
                          0.9, "À 1.5s la 3e barre ne doit pas encore être complète (tracé sur 3s)")
    }

    // MARK: - Rendu sans watermark

    func test_renderFrame_withoutWatermark_cornerStaysBackground() throws {
        try XCTSkipIf(MTLCreateSystemDefaultDevice() == nil,
                      "renderFrame walks the CALayer pipeline which needs a Metal device")
        let buffer = try Self.makeBuffer(width: 100, height: 100)

        try StoryAVCompositor.renderFrame(slide: Self.makeBlackSlide(),
                                          at: .zero,
                                          renderSize: CGSize(width: 100, height: 100),
                                          into: buffer,
                                          cache: StoryRendererCache(),
                                          backdropCapture: NullBackdropCapture())

        let corner = Self.pixel(in: buffer, x: 80, y: 80)
        XCTAssertLessThan(corner.r, 40, "Sans watermark le coin reste couleur de fond")
    }

    // MARK: - Fixtures

    private static func makeBlackSlide() -> StorySlide {
        var effects = StoryEffects(background: "000000")
        effects.textObjects = []
        return StorySlide(id: "wm-slide", effects: effects, duration: 1.0, order: 0)
    }

    private static func makeBuffer(width: Int, height: Int) throws -> CVPixelBuffer {
        let attrs: [CFString: Any] = [
            kCVPixelBufferIOSurfacePropertiesKey: [:] as CFDictionary
        ]
        var buffer: CVPixelBuffer?
        let status = CVPixelBufferCreate(kCFAllocatorDefault, width, height,
                                         kCVPixelFormatType_32BGRA,
                                         attrs as CFDictionary, &buffer)
        guard status == kCVReturnSuccess, let result = buffer else {
            throw NSError(domain: "StoryExportWatermarkTests", code: Int(status))
        }
        return result
    }

    private static func pixel(in buffer: CVPixelBuffer, x: Int, y: Int) -> (r: UInt8, g: UInt8, b: UInt8) {
        CVPixelBufferLockBaseAddress(buffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
        let bytesPerRow = CVPixelBufferGetBytesPerRow(buffer)
        let base = CVPixelBufferGetBaseAddress(buffer)!
            .assumingMemoryBound(to: UInt8.self)
        let offset = y * bytesPerRow + x * 4
        // BGRA little-endian : [B, G, R, A]
        return (r: base[offset + 2], g: base[offset + 1], b: base[offset])
    }

    private static func hasOpaquePixels(_ image: CGImage) -> Bool {
        let width = image.width, height = image.height
        var data = [UInt8](repeating: 0, count: width * height * 4)
        let space = CGColorSpaceCreateDeviceRGB()
        guard let ctx = CGContext(data: &data, width: width, height: height,
                                  bitsPerComponent: 8, bytesPerRow: width * 4,
                                  space: space,
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
            return false
        }
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        return stride(from: 3, to: data.count, by: 4).contains { data[$0] > 128 }
    }
}

// MARK: - Null backdrop fake

@MainActor
private final class NullBackdropCapture: BackdropCapturing {
    func captureCanvasBackdrop(slide: StorySlide, geometry: CanvasGeometry,
                               time: CMTime, mode: RenderMode,
                               languages: [String]) -> MTLTexture? { nil }
    func cropRegion(_ frame: CGRect) -> MTLTexture? { nil }
    func invalidate() {}
}
