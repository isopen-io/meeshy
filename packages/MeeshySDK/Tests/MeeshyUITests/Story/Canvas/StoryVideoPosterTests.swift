import XCTest
import AVFoundation
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// #13864 — **une vidéo posée qui n'est pas encore jouable montre la PREMIÈRE
/// image de sa fenêtre coupée**, jamais un flou ThumbHash ni un cadre vide, et
/// cette affiche reste tant que le player n'a peint aucune image.
@MainActor
final class StoryVideoPosterTests: XCTestCase {

    private static let geometry = CanvasGeometry(renderSize: CGSize(width: 390, height: 693))
    private static let thumbHash = "3OcRJYB4d3h/iIeHeEh3eIhw+j3A"

    private func clip(url: URL, sourceStart: Double? = nil, thumbHash: String? = nil) -> StoryMediaObject {
        StoryMediaObject(id: "clip-\(UUID().uuidString.prefix(6))", mediaURL: url.absoluteString, kind: .video,
                         aspectRatio: 1, thumbHash: thumbHash, sourceStart: sourceStart)
    }

    private func emptyFile() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("poster-vide-\(UUID().uuidString).mp4")
        try Data().write(to: url)
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        return url
    }

    private func redThenBlue() async throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("poster-\(UUID().uuidString).mp4")
        addTeardownBlock { try? FileManager.default.removeItem(at: url) }
        try await PosterFixture.write(to: url, segments: [(seconds: 1, bgra: (0, 0, 255, 255)),
                                                          (seconds: 2, bgra: (255, 0, 0, 255))])
        return url
    }

    // MARK: - L'image de l'affiche

    func test_theCutWindowStart_isThePoster() async throws {
        let url = try await redThenBlue()
        let image = await StoryVideoPoster.frame(of: clip(url: url, sourceStart: 1.5), at: url,
                                                 maximumSize: CGSize(width: 64, height: 64))
        XCTAssertEqual(try PosterFixture.dominant(image), .blue,
                       "la vidéo coupée à 1,5 s s'affiche par l'image de 1,5 s, jamais par celle du fichier")
    }

    func test_anUncutVideo_isPostedByItsFirstImage() async throws {
        let url = try await redThenBlue()
        let image = await StoryVideoPoster.frame(of: clip(url: url), at: url,
                                                 maximumSize: CGSize(width: 64, height: 64))
        XCTAssertEqual(try PosterFixture.dominant(image), .red)
    }

    // MARK: - La couche de la scène

    func test_aPlacedLocalVideo_paintsThePosterOfItsCutWindow() async throws {
        let url = try await redThenBlue()
        let layer = StoryMediaLayer()
        layer.configure(with: clip(url: url, sourceStart: 1.5), geometry: Self.geometry, mode: .edit)

        await layer._posterTaskForTesting()?.value

        XCTAssertEqual(try PosterFixture.dominant(layer.posterImage), .blue,
                       "la scène montre où la lecture commencera")
        layer.tearDownPlayback()
    }

    func test_aVideoThePlayerCannotPaintYet_keepsItsPlaceholder() throws {
        let layer = StoryMediaLayer()
        layer.configure(with: clip(url: try emptyFile(), thumbHash: Self.thumbHash),
                        geometry: Self.geometry, mode: .edit)

        let attente = try XCTUnwrap(layer.placeholderLayer,
                                    "un fichier local que le player n'a pas encore peint a un voile d'attente")
        XCTAssertEqual(attente.opacity, 1, "le voile ne s'efface pas avant la première image du player")
        layer.tearDownPlayback()
        XCTAssertNil(layer.placeholderLayer)
    }
}

/// Une vidéo H.264 faite de plages unies successives.
enum PosterFixture {

    enum Tint: Equatable { case red, blue, other }

    static func write(to url: URL, segments: [(seconds: Double, bgra: (UInt8, UInt8, UInt8, UInt8))]) async throws {
        let size = CGSize(width: 64, height: 64)
        let writer = try AVAssetWriter(url: url, fileType: .mp4)
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: Int(size.width),
            AVVideoHeightKey: Int(size.height),
        ])
        input.expectsMediaDataInRealTime = false
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA),
            kCVPixelBufferWidthKey as String: Int(size.width),
            kCVPixelBufferHeightKey as String: Int(size.height),
        ])
        writer.add(input)
        XCTAssertTrue(writer.startWriting())
        writer.startSession(atSourceTime: .zero)
        let fps: Int32 = 30
        let frames = segments.flatMap { segment in
            Array(repeating: segment.bgra, count: Int(segment.seconds * Double(fps)))
        }
        for (index, bgra) in frames.enumerated() {
            while !input.isReadyForMoreMediaData { try await Task.sleep(nanoseconds: 1_000_000) }
            let buffer = try XCTUnwrap(pixelBuffer(pool: adaptor.pixelBufferPool, bgra: bgra))
            adaptor.append(buffer, withPresentationTime: CMTime(value: CMTimeValue(index), timescale: fps))
        }
        input.markAsFinished()
        await writer.finishWriting()
        XCTAssertEqual(writer.status, .completed)
    }

    private static func pixelBuffer(pool: CVPixelBufferPool?, bgra: (UInt8, UInt8, UInt8, UInt8)) -> CVPixelBuffer? {
        guard let pool else { return nil }
        var created: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &created)
        guard let buffer = created else { return nil }
        CVPixelBufferLockBaseAddress(buffer, [])
        defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
        guard let base = CVPixelBufferGetBaseAddress(buffer) else { return nil }
        let row = CVPixelBufferGetBytesPerRow(buffer)
        let pixels = base.assumingMemoryBound(to: UInt8.self)
        for y in 0..<CVPixelBufferGetHeight(buffer) {
            for x in 0..<CVPixelBufferGetWidth(buffer) {
                let o = y * row + x * 4
                pixels[o] = bgra.0; pixels[o + 1] = bgra.1; pixels[o + 2] = bgra.2; pixels[o + 3] = bgra.3
            }
        }
        return buffer
    }

    static func dominant(_ image: CGImage?) throws -> Tint {
        let image = try XCTUnwrap(image, "aucune affiche")
        var pixel = [UInt8](repeating: 0, count: 4)
        let context = try XCTUnwrap(CGContext(data: &pixel, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                                              space: CGColorSpaceCreateDeviceRGB(),
                                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        context.draw(image, in: CGRect(x: 0, y: 0, width: 1, height: 1))
        let (r, b) = (Int(pixel[0]), Int(pixel[2]))
        if r > 150 && b < 100 { return .red }
        if b > 150 && r < 100 { return .blue }
        return .other
    }
}
