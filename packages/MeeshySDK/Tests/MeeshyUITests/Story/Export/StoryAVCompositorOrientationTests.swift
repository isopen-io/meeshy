import XCTest
import AVFoundation
import CoreMedia
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers
import Metal
@testable import MeeshyUI
@testable import MeeshySDK

/// **Un média exporté se lit dans le sens où l'auteur l'a vu** (#8600).
///
/// Le fond vidéo d'une story arrive au compositor dans son orientation de
/// STOCKAGE : un clip tourné téléphone en portrait est encodé en paysage, avec
/// une `preferredTransform` qui le redresse. Le compositor l'appliquait sur une
/// `CIImage` — repère Y vers le HAUT — alors qu'elle est exprimée dans le repère
/// Y vers le BAS de l'image : chaque quart de tour tournait donc à contresens,
/// et le clip portrait sortait retourné de 180°.
///
/// Même famille pour le fond IMAGE : `UIImage.cgImage` rend le bitmap BRUT et
/// jette l'orientation EXIF, alors que les couches du canvas passent déjà par
/// `CanvasImageOrientation.displayCGImage`.
///
/// Motif des témoins : un bitmap de STOCKAGE 40×20 dont seul le quart
/// haut-gauche est ROUGE, le reste BLEU. Un quart de tour horaire l'amène en
/// haut-droite, un anti-horaire en bas-gauche, un demi-tour en bas-droite —
/// trois verdicts que ni l'identité ni le contresens ne peuvent confondre.
@MainActor
final class StoryAVCompositorOrientationTests: XCTestCase {

    private static let storage = CGSize(width: 40, height: 20)
    private static let canvas = CGSize(width: 90, height: 160)

    // MARK: - Fond vidéo

    func test_renderFrame_portraitCameraTransform_paintsRedCornerTopRight() throws {
        let portrait = CGAffineTransform(a: 0, b: 1, c: -1, d: 0, tx: Self.storage.height, ty: 0)

        let pixels = try renderVideoBackground(transform: portrait)

        XCTAssertTrue(pixels.isRed(x: 70, y: 30), "quart de tour horaire : le coin rouge doit finir en haut à droite, trouvé \(pixels.describe(x: 70, y: 30))")
        XCTAssertTrue(pixels.isBlue(x: 20, y: 30), "le haut-gauche doit être bleu, trouvé \(pixels.describe(x: 20, y: 30))")
        XCTAssertTrue(pixels.isBlue(x: 20, y: 130), "le bas-gauche doit être bleu, trouvé \(pixels.describe(x: 20, y: 130))")
    }

    func test_renderFrame_counterClockwiseTransform_paintsRedCornerBottomLeft() throws {
        let counterClockwise = CGAffineTransform(a: 0, b: -1, c: 1, d: 0, tx: 0, ty: Self.storage.width)

        let pixels = try renderVideoBackground(transform: counterClockwise)

        XCTAssertTrue(pixels.isRed(x: 20, y: 130), "quart de tour anti-horaire : le coin rouge doit finir en bas à gauche, trouvé \(pixels.describe(x: 20, y: 130))")
        XCTAssertTrue(pixels.isBlue(x: 70, y: 30), "le haut-droite doit être bleu, trouvé \(pixels.describe(x: 70, y: 30))")
    }

    func test_renderFrame_upsideDownTransform_paintsRedCornerBottomRight() throws {
        let upsideDown = CGAffineTransform(a: -1, b: 0, c: 0, d: -1,
                                           tx: Self.storage.width, ty: Self.storage.height)

        let pixels = try renderVideoBackground(transform: upsideDown)

        XCTAssertTrue(pixels.isRed(x: 70, y: 130), "demi-tour : le coin rouge doit finir en bas à droite, trouvé \(pixels.describe(x: 70, y: 130))")
        XCTAssertTrue(pixels.isBlue(x: 20, y: 30), "le haut-gauche doit être bleu, trouvé \(pixels.describe(x: 20, y: 30))")
    }

    func test_renderFrame_identityTransform_keepsRedCornerTopLeft() throws {
        let pixels = try renderVideoBackground(transform: .identity)

        XCTAssertTrue(pixels.isRed(x: 40, y: 30), "sans transformation le coin rouge reste en haut à gauche, trouvé \(pixels.describe(x: 40, y: 30))")
        XCTAssertTrue(pixels.isBlue(x: 40, y: 130), "le bas doit être bleu, trouvé \(pixels.describe(x: 40, y: 130))")
    }

    // MARK: - Fond image

    func test_renderFrame_backgroundImageWithExifRightOrientation_isPaintedUpright() throws {
        let url = try writeJPEG(orientation: .right)
        defer { try? FileManager.default.removeItem(at: url) }
        let slide = makeSlide(background: StoryMediaObject(
            id: "bg-image", postMediaId: "", mediaURL: url.absoluteString,
            mediaType: StoryMediaKind.image.rawValue, aspectRatio: 0.5,
            volume: 0, isBackground: true, startTime: 0, duration: 1))

        let pixels = try render(slide: slide)

        XCTAssertTrue(pixels.isRed(x: 70, y: 30), "EXIF « right » : le coin rouge doit finir en haut à droite, trouvé \(pixels.describe(x: 70, y: 30))")
        XCTAssertTrue(pixels.isBlue(x: 20, y: 30), "le haut-gauche doit être bleu, trouvé \(pixels.describe(x: 20, y: 30))")
    }

    // MARK: - Fixtures

    private func renderVideoBackground(transform: CGAffineTransform) throws -> RenderedPixels {
        let slide = makeSlide(background: StoryMediaObject(
            id: "bg-video", postMediaId: "", mediaURL: "file:///tmp/bg.mov",
            mediaType: StoryMediaKind.video.rawValue, aspectRatio: 2,
            volume: 0, isBackground: true, startTime: 0, duration: 1))
        let frame = try Self.makeStorageBuffer()
        return try render(slide: slide, videoFrame: frame, transform: transform)
    }

    private func render(slide: StorySlide,
                        videoFrame: CVPixelBuffer? = nil,
                        transform: CGAffineTransform = .identity) throws -> RenderedPixels {
        try XCTSkipIf(MTLCreateSystemDefaultDevice() == nil, "le rendu CALayer exige un device Metal")
        let output = try Self.makeBuffer(size: Self.canvas)
        try StoryAVCompositor.renderFrame(slide: slide,
                                          at: .zero,
                                          renderSize: Self.canvas,
                                          into: output,
                                          backgroundVideoFrame: videoFrame,
                                          backgroundVideoTransform: transform,
                                          cache: StoryRendererCache(),
                                          backdropCapture: InertBackdropCapture())
        return RenderedPixels(buffer: output)
    }

    private func makeSlide(background: StoryMediaObject) -> StorySlide {
        var effects = StoryEffects()
        effects.textObjects = []
        effects.mediaObjects = [background]
        return StorySlide(id: "orientation-\(UUID().uuidString)", effects: effects, duration: 1, order: 0)
    }

    private static func quadrantColor(x: Int, y: Int) -> (r: UInt8, g: UInt8, b: UInt8) {
        let redCorner = x < Int(storage.width) / 2 && y < Int(storage.height) / 2
        return redCorner ? (255, 0, 0) : (0, 0, 255)
    }

    private static func makeStorageBuffer() throws -> CVPixelBuffer {
        let buffer = try makeBuffer(size: storage)
        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
        let base = CVPixelBufferGetBaseAddress(buffer)!.assumingMemoryBound(to: UInt8.self)
        let bytesPerRow = CVPixelBufferGetBytesPerRow(buffer)
        for y in 0..<Int(storage.height) {
            for x in 0..<Int(storage.width) {
                let color = quadrantColor(x: x, y: y)
                let offset = y * bytesPerRow + x * 4
                base[offset] = color.b
                base[offset + 1] = color.g
                base[offset + 2] = color.r
                base[offset + 3] = 255
            }
        }
        return buffer
    }

    private func writeJPEG(orientation: CGImagePropertyOrientation) throws -> URL {
        let width = Int(Self.storage.width)
        let height = Int(Self.storage.height)
        guard let context = CGContext(data: nil, width: width, height: height,
                                      bitsPerComponent: 8, bytesPerRow: 0,
                                      space: CGColorSpaceCreateDeviceRGB(),
                                      bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else {
            throw NSError(domain: "Orientation", code: 1)
        }
        context.setFillColor(CGColor(red: 0, green: 0, blue: 1, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        context.setFillColor(CGColor(red: 1, green: 0, blue: 0, alpha: 1))
        context.fill(CGRect(x: 0, y: height / 2, width: width / 2, height: height / 2))
        guard let image = context.makeImage() else { throw NSError(domain: "Orientation", code: 2) }

        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("orientation-\(UUID().uuidString).jpg")
        guard let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.jpeg.identifier as CFString, 1, nil) else {
            throw NSError(domain: "Orientation", code: 3)
        }
        CGImageDestinationAddImage(destination, image, [
            kCGImagePropertyOrientation: orientation.rawValue,
            kCGImageDestinationLossyCompressionQuality: 1.0
        ] as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { throw NSError(domain: "Orientation", code: 4) }
        return url
    }

    static func makeBuffer(size: CGSize) throws -> CVPixelBuffer {
        let attrs: [CFString: Any] = [kCVPixelBufferIOSurfacePropertiesKey: [:] as CFDictionary]
        var buffer: CVPixelBuffer?
        let status = CVPixelBufferCreate(kCFAllocatorDefault, Int(size.width), Int(size.height),
                                         kCVPixelFormatType_32BGRA, attrs as CFDictionary, &buffer)
        guard status == kCVReturnSuccess, let buffer else {
            throw NSError(domain: "Orientation", code: Int(status))
        }
        return buffer
    }
}

/// Lecture des pixels d'un tampon BGRA rendu par `renderFrame` — rangée 0 =
/// HAUT de l'image, le compositor ayant retourné son contexte en repère UIKit.
struct RenderedPixels {
    let buffer: CVPixelBuffer

    func rgb(x: Int, y: Int) -> (r: Int, g: Int, b: Int) {
        CVPixelBufferLockBaseAddress(buffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
        let base = CVPixelBufferGetBaseAddress(buffer)!.assumingMemoryBound(to: UInt8.self)
        let offset = y * CVPixelBufferGetBytesPerRow(buffer) + x * 4
        return (Int(base[offset + 2]), Int(base[offset + 1]), Int(base[offset]))
    }

    func isRed(x: Int, y: Int) -> Bool {
        let c = rgb(x: x, y: y)
        return c.r > 150 && c.b < 110
    }

    func isBlue(x: Int, y: Int) -> Bool {
        let c = rgb(x: x, y: y)
        return c.b > 150 && c.r < 110
    }

    func describe(x: Int, y: Int) -> String {
        let c = rgb(x: x, y: y)
        return "rgb(\(c.r), \(c.g), \(c.b))"
    }
}

/// Capture de fond inerte : ces témoins ne posent aucun texte « verre ».
@MainActor
final class InertBackdropCapture: BackdropCapturing {
    @discardableResult
    func captureCanvasBackdrop(slide: StorySlide, geometry: CanvasGeometry, time: CMTime,
                               mode: RenderMode, languages: [String]) -> MTLTexture? { nil }
    func cropRegion(_ frame: CGRect) -> MTLTexture? { nil }
    func invalidate() {}
}
