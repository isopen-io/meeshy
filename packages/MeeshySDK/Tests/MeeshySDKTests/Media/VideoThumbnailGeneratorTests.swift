import AVFoundation
import UIKit
import XCTest
@testable import MeeshySDK

/// **#11844 — les vignettes vidéo passent par UN générateur du SDK, en lot et
/// en cache borné.** Neuf sites réécrivaient chacun `AVAssetImageGenerator`,
/// une image à la fois, avec leurs propres réglages et sans cache commun.
final class VideoThumbnailGeneratorTests: XCTestCase {

    // MARK: - La loi des instants

    func test_evenlySpaced_takesTheMiddleOfEqualSlices() {
        XCTAssertEqual(
            VideoThumbnailInstants.seconds(for: .evenlySpaced(count: 4, atMostOnePerSecond: false), duration: 10),
            [1.25, 3.75, 6.25, 8.75])
    }

    func test_evenlySpaced_atMostOnePerSecond_capsTheCount() {
        XCTAssertEqual(
            VideoThumbnailInstants.seconds(for: .evenlySpaced(count: 10, atMostOnePerSecond: true), duration: 2),
            [0.5, 1.5])
    }

    func test_evenlySpaced_withoutADuration_isNothing() {
        XCTAssertEqual(VideoThumbnailInstants.seconds(for: .evenlySpaced(count: 3, atMostOnePerSecond: false), duration: nil), [])
        XCTAssertEqual(VideoThumbnailInstants.seconds(for: .evenlySpaced(count: 3, atMostOnePerSecond: false), duration: 0), [])
    }

    func test_start_isZero_orTheInstantBoundedByTheDuration() {
        XCTAssertEqual(VideoThumbnailInstants.seconds(for: .start(atMost: 0), duration: nil), [0])
        XCTAssertEqual(VideoThumbnailInstants.seconds(for: .start(atMost: 0.1), duration: 5), [0.1])
        XCTAssertEqual(VideoThumbnailInstants.seconds(for: .start(atMost: 0.1), duration: 0.04), [0.04])
        XCTAssertEqual(VideoThumbnailInstants.seconds(for: .start(atMost: 0.1), duration: nil), [],
                       "un instant borné par une durée illisible ne s'invente pas")
    }

    func test_onlyABoundedInstant_needsTheDuration() {
        XCTAssertFalse(VideoThumbnailInstants.needsDuration(.start(atMost: 0)))
        XCTAssertTrue(VideoThumbnailInstants.needsDuration(.start(atMost: 0.1)))
        XCTAssertTrue(VideoThumbnailInstants.needsDuration(.evenlySpaced(count: 2, atMostOnePerSecond: false)))
    }

    // MARK: - Le générateur

    func test_images_evenlySpaced_returnsOneImagePerInstant_inOrder_boundedAndUpright() async throws {
        let movie = try await Self.makePortraitMovie()
        defer { try? FileManager.default.removeItem(at: movie) }
        let generator = VideoThumbnailGenerator()

        let images = await generator.images(for: VideoThumbnailRequest(
            url: movie, instants: .evenlySpaced(count: 3, atMostOnePerSecond: false),
            maximumSize: CGSize(width: 80, height: 80), tolerance: .seconds(0.5)))

        XCTAssertEqual(images.count, 3)
        for image in images {
            let pixels = image.size.applying(CGAffineTransform(scaleX: image.scale, y: image.scale))
            XCTAssertLessThanOrEqual(max(pixels.width, pixels.height), 80)
            XCTAssertGreaterThan(pixels.height, pixels.width, "la transformation de la piste est appliquée")
        }
    }

    func test_image_firstFrame_exact() async throws {
        let movie = try await Self.makePortraitMovie()
        defer { try? FileManager.default.removeItem(at: movie) }

        let image = await VideoThumbnailGenerator().image(for: .firstFrame(of: movie, maxDimension: 64, tolerance: .exact))

        XCTAssertNotNil(image)
    }

    func test_aSecondRequest_isServedByTheCache() async throws {
        let movie = try await Self.makePortraitMovie()
        defer { try? FileManager.default.removeItem(at: movie) }
        let generator = VideoThumbnailGenerator()
        let request = VideoThumbnailRequest.firstFrame(of: movie, maxDimension: 64)

        let first = await generator.image(for: request)
        try FileManager.default.removeItem(at: movie)
        let second = await generator.image(for: request)

        XCTAssertNotNil(first)
        XCTAssertTrue(first === second, "la même vignette, sans relire le fichier")
    }

    func test_aRequestThatAsksNotToCache_isDecodedAgain() async throws {
        let movie = try await Self.makePortraitMovie()
        defer { try? FileManager.default.removeItem(at: movie) }
        let generator = VideoThumbnailGenerator()
        let request = VideoThumbnailRequest.firstFrame(of: movie, maxDimension: 64, cachesResult: false)

        _ = await generator.image(for: request)
        try FileManager.default.removeItem(at: movie)
        let second = await generator.image(for: request)

        XCTAssertNil(second)
    }

    func test_aFileThatIsNotAMovie_yieldsNothing() async throws {
        let url = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("vignette-\(UUID().uuidString).mov")
        try Data("pas une vidéo".utf8).write(to: url)
        defer { try? FileManager.default.removeItem(at: url) }

        let images = await VideoThumbnailGenerator().images(for: VideoThumbnailRequest(
            url: url, instants: .evenlySpaced(count: 3, atMostOnePerSecond: false)))

        XCTAssertTrue(images.isEmpty)
    }

    // MARK: - Fixture : 2 s, 320×160 encodé, affiché en portrait

    private static func makePortraitMovie() async throws -> URL {
        let url = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("vignette-\(UUID().uuidString).mp4")
        let width = 320, height = 160
        let writer = try AVAssetWriter(url: url, fileType: .mp4)
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: width, AVVideoHeightKey: height,
        ])
        input.expectsMediaDataInRealTime = false
        input.transform = CGAffineTransform(a: 0, b: 1, c: -1, d: 0, tx: CGFloat(height), ty: 0)
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA),
            kCVPixelBufferWidthKey as String: width, kCVPixelBufferHeightKey as String: height,
        ])
        writer.add(input)
        guard writer.startWriting() else { throw writer.error ?? NSError(domain: "Vignette", code: 1) }
        writer.startSession(atSourceTime: .zero)
        for frame in 0..<60 {
            while !input.isReadyForMoreMediaData { await Task.yield() }
            guard let pool = adaptor.pixelBufferPool else { throw NSError(domain: "Vignette", code: 2) }
            var created: CVPixelBuffer?
            CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &created)
            guard let buffer = created else { throw NSError(domain: "Vignette", code: 3) }
            CVPixelBufferLockBaseAddress(buffer, [])
            if let base = CVPixelBufferGetBaseAddress(buffer) {
                memset(base, Int32(frame * 4), CVPixelBufferGetDataSize(buffer))
            }
            CVPixelBufferUnlockBaseAddress(buffer, [])
            adaptor.append(buffer, withPresentationTime: CMTime(value: CMTimeValue(frame), timescale: 30))
        }
        input.markAsFinished()
        await writer.finishWriting()
        guard writer.status == .completed else { throw writer.error ?? NSError(domain: "Vignette", code: 4) }
        return url
    }
}
