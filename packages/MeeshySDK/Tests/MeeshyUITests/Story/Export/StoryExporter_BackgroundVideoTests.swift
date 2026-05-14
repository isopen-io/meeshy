import XCTest
import AVFoundation
import CoreMedia
import CoreGraphics
@testable import MeeshyUI
@testable import MeeshySDK

/// Tests for the P1 fix `fix/story-export-bg-video-no-loop`:
/// `StoryExporter` previously only honoured background video objects whose
/// `loop` flag was `true`. Non-looped backgrounds (the default when a user
/// drops a video onto the canvas without explicitly enabling loop) fell into
/// the static-only branch — the export pipeline generated an MP4 with the
/// synthetic transparent substrate and no real footage.
///
/// The fix widens the selection predicate to `isBackground && kind == .video`
/// and branches inside the block:
///   - `loop == true`  → repeat the clip until `effectiveSlideDuration()`
///   - `loop == false` → play once, truncating if longer than the slide,
///                       padding with the transparent substrate if shorter
///
/// Image backgrounds (`kind == .image`) are intentionally excluded — they are
/// drawn by `StoryRenderer.render(in:)` each frame on top of the synthetic
/// substrate, so the existing static-only path remains correct for them.
///
/// All export-pipeline tests honour `MEESHY_SKIP_EXPORT_TESTS` so CI can skip
/// the slow paths when Metal / AVFoundation aren't reliable.
final class StoryExporter_BackgroundVideoTests: XCTestCase {

    // MARK: - Loop = true → cover effective slide duration

    @MainActor
    func test_export_loopBackgroundVideo_loopsUntilSlideEnd() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )

        // Video clip 2 s, slide 6 s → 3 repetitions, effective duration = 6 s.
        let bgURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("bgvid_loop_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: bgURL) }
        try await BackgroundVideoFixture.makeVideo(duration: 2.0,
                                                    size: CGSize(width: 540, height: 960),
                                                    at: bgURL)

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("export_loop_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: outputURL) }

        let slide = BackgroundVideoFixture.slide(
            backgroundURL: bgURL,
            videoDurationSec: 2.0,
            slideDuration: 6.0,
            loop: true
        )

        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(slide, to: outputURL)
        }.value

        let asset = AVURLAsset(url: outputURL)
        let exportDuration = try await asset.load(.duration)
        let effectiveDuration = slide.effectiveSlideDuration()
        XCTAssertEqual(CMTimeGetSeconds(exportDuration), effectiveDuration, accuracy: 0.15,
                       "Looped background must cover the full effective slide duration")
        // effective = ceil(6/2) * 2 = 6, but we also verify the value isn't
        // accidentally the bare clip duration (2 s) — which would mean we
        // forgot to repeat.
        XCTAssertGreaterThan(CMTimeGetSeconds(exportDuration), 3.0,
                             "Looped export must be longer than a single clip cycle")
    }

    // MARK: - Loop = false, video shorter than slide → play once + pad

    @MainActor
    func test_export_nonLoopBackgroundVideo_playsOnceAndPads() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )

        let bgURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("bgvid_noloop_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: bgURL) }
        try await BackgroundVideoFixture.makeVideo(duration: 2.0,
                                                    size: CGSize(width: 540, height: 960),
                                                    at: bgURL)

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("export_noloop_pad_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: outputURL) }

        let slideDuration: TimeInterval = 5.0
        let slide = BackgroundVideoFixture.slide(
            backgroundURL: bgURL,
            videoDurationSec: 2.0,
            slideDuration: slideDuration,
            loop: false
        )

        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(slide, to: outputURL)
        }.value

        XCTAssertTrue(FileManager.default.fileExists(atPath: outputURL.path))

        // Non-looped slide: effectiveSlideDuration() == slide.duration.
        // The export must run for the FULL slide duration (5 s), not just the
        // underlying clip (2 s) — that's the regression we're guarding against.
        let asset = AVURLAsset(url: outputURL)
        let exportDuration = try await asset.load(.duration)
        XCTAssertEqual(CMTimeGetSeconds(exportDuration), slideDuration, accuracy: 0.15,
                       "Non-looped background must still produce a file covering the full slide duration (padded tail)")

        // Output must be a real video track (not zero-track audio-only).
        let tracks = try await asset.loadTracks(withMediaType: .video)
        XCTAssertFalse(tracks.isEmpty, "Export must contain a video track")
    }

    @MainActor
    func test_export_nonLoopBackgroundVideo_shorterThanSlide_includesPaddingFrames() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )

        let bgURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("bgvid_pad_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: bgURL) }
        try await BackgroundVideoFixture.makeVideo(duration: 1.5,
                                                    size: CGSize(width: 540, height: 960),
                                                    at: bgURL)

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("export_noloop_padframes_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: outputURL) }

        let slideDuration: TimeInterval = 4.0
        let slide = BackgroundVideoFixture.slide(
            backgroundURL: bgURL,
            videoDurationSec: 1.5,
            slideDuration: slideDuration,
            loop: false
        )

        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(slide, to: outputURL)
        }.value

        // Probe a frame past the end of the underlying video clip (t=3s, clip
        // ends at 1.5s). If the padding wasn't inserted, AVAssetImageGenerator
        // would either fail or return whatever the previous track range
        // contained — both manifest as the export being truncated to 1.5 s.
        let asset = AVURLAsset(url: outputURL)
        let exportDuration = try await asset.load(.duration)
        XCTAssertEqual(CMTimeGetSeconds(exportDuration), slideDuration, accuracy: 0.15,
                       "Export duration must reach slide duration (padded past clip end)")

        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.requestedTimeToleranceBefore = .zero
        generator.requestedTimeToleranceAfter = CMTime(seconds: 0.1, preferredTimescale: 600)
        let probeTime = CMTime(seconds: 3.0, preferredTimescale: 600)
        let (image, _) = try await generator.image(at: probeTime)
        XCTAssertGreaterThan(image.width, 0,
                             "Should extract a real frame at t=3s (past underlying clip end) — padding tail must be present")
        XCTAssertGreaterThan(image.height, 0,
                             "Padding tail frame must have non-zero height")
    }

    // MARK: - Loop = false, video longer than slide → truncate

    @MainActor
    func test_export_nonLoopBackgroundVideo_longerThanSlide_truncates() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )

        let bgURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("bgvid_long_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: bgURL) }
        try await BackgroundVideoFixture.makeVideo(duration: 6.0,
                                                    size: CGSize(width: 540, height: 960),
                                                    at: bgURL)

        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("export_noloop_trunc_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: outputURL) }

        let slideDuration: TimeInterval = 2.5
        let slide = BackgroundVideoFixture.slide(
            backgroundURL: bgURL,
            videoDurationSec: 6.0,
            slideDuration: slideDuration,
            loop: false
        )

        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(slide, to: outputURL)
        }.value

        let asset = AVURLAsset(url: outputURL)
        let exportDuration = try await asset.load(.duration)
        // Must land on slide duration, not the bare clip's 6 s.
        XCTAssertEqual(CMTimeGetSeconds(exportDuration), slideDuration, accuracy: 0.15,
                       "Non-looped background longer than slide must be truncated to slide duration")
    }

    // MARK: - Image background preserves existing behaviour

    @MainActor
    func test_export_imageBackground_unchanged() async throws {
        try XCTSkipIf(
            ProcessInfo.processInfo.environment["MEESHY_SKIP_EXPORT_TESTS"] != nil,
            "Export tests skipped via MEESHY_SKIP_EXPORT_TESTS env var"
        )

        // Image backgrounds must continue to flow through `ensureVideoTrack`
        // (synthetic substrate) — they are drawn by `StoryRenderer.render` on
        // top of the substrate each frame. If the predicate accidentally
        // includes image kinds, we'd try to insert an image URL as a video
        // track and throw `backgroundAssetVideoTrackMissing`.
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("export_imgbg_\(UUID().uuidString).mp4")
        defer { try? FileManager.default.removeItem(at: outputURL) }

        let slide = BackgroundVideoFixture.imageBackgroundSlide(slideDuration: 2.0)

        try await Task.detached(priority: .userInitiated) {
            try await StoryExporter.export(slide, to: outputURL)
        }.value

        XCTAssertTrue(FileManager.default.fileExists(atPath: outputURL.path),
                      "Image-background slide must still export through the synthetic substrate path")

        let asset = AVURLAsset(url: outputURL)
        let tracks = try await asset.loadTracks(withMediaType: .video)
        XCTAssertFalse(tracks.isEmpty,
                       "Image-background export must produce a synthetic video track")
        let exportDuration = try await asset.load(.duration)
        XCTAssertEqual(CMTimeGetSeconds(exportDuration), 2.0, accuracy: 0.15,
                       "Image-background export duration matches slide duration")
    }
}

// MARK: - Fixture

private enum BackgroundVideoFixture {

    /// Generates a deterministic black H.264 MP4 of the given duration & size
    /// at `url`. Mirrors `ExportFixture.makeBlackBackgroundVideo` from the
    /// equivalence tests — duplicated here so this test file is self-contained
    /// (the equivalence file's fixture is `private`).
    static func makeVideo(duration: TimeInterval,
                          size: CGSize,
                          at url: URL) async throws {
        if FileManager.default.fileExists(atPath: url.path) {
            try FileManager.default.removeItem(at: url)
        }

        let writer = try AVAssetWriter(url: url, fileType: .mp4)
        let videoSettings: [String: Any] = [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: Int(size.width),
            AVVideoHeightKey: Int(size.height)
        ]
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: videoSettings)
        input.expectsMediaDataInRealTime = false

        let bufferAttributes: [String: Any] = [
            kCVPixelBufferPixelFormatTypeKey as String: Int(kCVPixelFormatType_32BGRA),
            kCVPixelBufferWidthKey as String: Int(size.width),
            kCVPixelBufferHeightKey as String: Int(size.height)
        ]
        let adaptor = AVAssetWriterInputPixelBufferAdaptor(
            assetWriterInput: input,
            sourcePixelBufferAttributes: bufferAttributes
        )

        guard writer.canAdd(input) else {
            throw NSError(domain: "BackgroundVideoFixture", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "Cannot add writer input"])
        }
        writer.add(input)

        guard writer.startWriting() else {
            throw writer.error ?? NSError(domain: "BackgroundVideoFixture", code: 2,
                                            userInfo: [NSLocalizedDescriptionKey: "startWriting failed"])
        }
        writer.startSession(atSourceTime: .zero)

        let fps: Int32 = 30
        let total = max(1, Int(duration * Double(fps)))

        for i in 0..<total {
            while !input.isReadyForMoreMediaData {
                try await Task.sleep(nanoseconds: 1_000_000)
            }
            guard let pool = adaptor.pixelBufferPool else {
                throw NSError(domain: "BackgroundVideoFixture", code: 3,
                              userInfo: [NSLocalizedDescriptionKey: "No pixel buffer pool"])
            }
            var pb: CVPixelBuffer?
            CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &pb)
            guard let pixelBuffer = pb else {
                throw NSError(domain: "BackgroundVideoFixture", code: 4,
                              userInfo: [NSLocalizedDescriptionKey: "Pixel buffer alloc failed"])
            }
            CVPixelBufferLockBaseAddress(pixelBuffer, [])
            if let base = CVPixelBufferGetBaseAddress(pixelBuffer) {
                let bytesPerRow = CVPixelBufferGetBytesPerRow(pixelBuffer)
                let height = CVPixelBufferGetHeight(pixelBuffer)
                memset(base, 0, bytesPerRow * height)
            }
            CVPixelBufferUnlockBaseAddress(pixelBuffer, [])

            let time = CMTime(value: CMTimeValue(i), timescale: fps)
            adaptor.append(pixelBuffer, withPresentationTime: time)
        }

        input.markAsFinished()
        await writer.finishWriting()

        if writer.status != .completed {
            throw writer.error ?? NSError(domain: "BackgroundVideoFixture", code: 5,
                                            userInfo: [NSLocalizedDescriptionKey: "Writer did not complete"])
        }
    }

    /// Builds a `StorySlide` whose background is the provided video URL, with
    /// the requested loop flag and slide duration.
    static func slide(backgroundURL: URL,
                      videoDurationSec: Double,
                      slideDuration: Double,
                      loop: Bool) -> StorySlide {
        let video = StoryMediaObject(
            id: UUID().uuidString,
            postMediaId: UUID().uuidString,
            mediaURL: backgroundURL.absoluteString,
            mediaType: "video",
            placement: "media",
            aspectRatio: 9.0 / 16.0,
            isBackground: true,
            loop: loop,
            startTime: 0.0,
            duration: videoDurationSec
        )

        let text = StoryTextObject(
            id: UUID().uuidString,
            text: "Hello",
            x: 0.5, y: 0.5,
            fontSize: 64.0,
            startTime: 0.0,
            duration: slideDuration
        )

        var effects = StoryEffects()
        effects.mediaObjects = [video]
        effects.textObjects = [text]

        return StorySlide(id: UUID().uuidString,
                          effects: effects,
                          duration: slideDuration,
                          order: 0)
    }

    /// Builds a `StorySlide` whose background is an IMAGE (not a video).
    /// `mediaType: "image"` is the path we must keep flowing through the
    /// synthetic substrate branch.
    static func imageBackgroundSlide(slideDuration: Double) -> StorySlide {
        let image = StoryMediaObject(
            id: UUID().uuidString,
            postMediaId: UUID().uuidString,
            mediaURL: "fixture://image-bg",
            mediaType: "image",
            placement: "media",
            aspectRatio: 9.0 / 16.0,
            isBackground: true,
            loop: false,
            startTime: 0.0,
            duration: slideDuration
        )

        let text = StoryTextObject(
            id: UUID().uuidString,
            text: "Image background",
            x: 0.5, y: 0.5,
            fontSize: 64.0,
            startTime: 0.0,
            duration: slideDuration
        )

        var effects = StoryEffects()
        effects.mediaObjects = [image]
        effects.textObjects = [text]

        return StorySlide(id: UUID().uuidString,
                          effects: effects,
                          duration: slideDuration,
                          order: 0)
    }
}
