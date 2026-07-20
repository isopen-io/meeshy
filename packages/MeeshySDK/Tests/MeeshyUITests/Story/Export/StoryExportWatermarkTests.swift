import XCTest
import AVFoundation
import CoreMedia
import CoreGraphics
import Metal
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// Demande user 2026-07-11 : « L'export créé doit intégrer le watermark
/// Meeshy ». Le watermark est un paramètre OPAQUE du pipeline d'export
/// (image fournie par l'appelant, placement bas-droite) dessiné par-dessus
/// chaque frame par `StoryAVCompositor.renderFrame`. La variante produit
/// (logo dashes + wordmark) vient de `MeeshyExportWatermark.make()`.
@MainActor
final class StoryExportWatermarkTests: XCTestCase {

    // MARK: - Géométrie (pure)

    func test_frame_bottomTrailing_respectsWidthAndMargin() {
        let watermark = StoryExportWatermark(image: Self.makeWhiteSquare(side: 8),
                                             widthFraction: 0.3,
                                             marginFraction: 0.05,
                                             opacity: 1.0)

        let frame = watermark.frame(in: CGSize(width: 100, height: 200))

        XCTAssertEqual(frame.width, 30, accuracy: 0.001)
        XCTAssertEqual(frame.height, 30, accuracy: 0.001, "Image carrée → hauteur = largeur")
        XCTAssertEqual(frame.maxX, 95, accuracy: 0.001, "Marge droite = 5% de la largeur de rendu")
        XCTAssertEqual(frame.maxY, 195, accuracy: 0.001, "Ancré en bas (coordonnées top-down)")
    }

    // MARK: - Rendu frame

    func test_renderFrame_withWatermark_paintsBottomTrailingCorner() throws {
        try XCTSkipIf(MTLCreateSystemDefaultDevice() == nil,
                      "renderFrame walks the CALayer pipeline which needs a Metal device")
        let buffer = try Self.makeBuffer(width: 100, height: 100)
        let watermark = StoryExportWatermark(image: Self.makeWhiteSquare(side: 8),
                                             widthFraction: 0.3,
                                             marginFraction: 0.05,
                                             opacity: 1.0)

        try StoryAVCompositor.renderFrame(slide: Self.makeBlackSlide(),
                                          at: .zero,
                                          renderSize: CGSize(width: 100, height: 100),
                                          into: buffer,
                                          cache: StoryRendererCache(),
                                          backdropCapture: NullBackdropCapture(),
                                          watermark: watermark)

        // Rect attendu : 30×30 avec marge 5 → x∈[65,95], y∈[65,95] (top-down).
        let corner = Self.pixel(in: buffer, x: 80, y: 80)
        XCTAssertGreaterThan(corner.r, 200, "Le centre du watermark doit être blanc")
        XCTAssertGreaterThan(corner.g, 200)
        XCTAssertGreaterThan(corner.b, 200)
        let center = Self.pixel(in: buffer, x: 30, y: 30)
        XCTAssertLessThan(center.r, 40, "Hors watermark, le fond noir de la slide reste intact")
    }

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

    // MARK: - Variante produit

    func test_meeshyWatermark_isHorizontalAndNonEmpty() throws {
        let watermark = try XCTUnwrap(MeeshyExportWatermark.make())

        let image = watermark.image
        XCTAssertGreaterThan(CGFloat(image.width) / CGFloat(image.height), 2.0,
                             "Logo + wordmark = bandeau horizontal")
        XCTAssertTrue(Self.hasOpaquePixels(image),
                      "Le watermark doit contenir des pixels visibles")
    }

    // MARK: - Fixtures

    private static func makeBlackSlide() -> StorySlide {
        var effects = StoryEffects(background: "000000")
        effects.textObjects = []
        return StorySlide(id: "wm-slide", effects: effects, duration: 1.0, order: 0)
    }

    private static func makeWhiteSquare(side: Int) -> CGImage {
        let space = CGColorSpaceCreateDeviceRGB()
        let ctx = CGContext(data: nil, width: side, height: side,
                            bitsPerComponent: 8, bytesPerRow: 0,
                            space: space,
                            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        ctx.setFillColor(UIColor.white.cgColor)
        ctx.fill(CGRect(x: 0, y: 0, width: side, height: side))
        return ctx.makeImage()!
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
